import type { Recipe } from '@/types';
import { db, emitRecipesChanged, onRecipesChanged, versionOf, type Tombstone } from '@/data/db';
import {
  AuthRequiredError,
  deleteDriveFile,
  downloadSyncFile,
  listImageFiles,
  uploadImageFile,
  uploadSyncFile,
  type SyncFile,
} from './drive';

/**
 * 이 기기 IndexedDB ↔ 드라이브 파일 동기화. 매번 양쪽을 레시피 단위로 합친다.
 * - 같은 레시피는 updatedAt(없으면 createdAt)이 늦은 쪽이 이긴다.
 * - 삭제 기록(tombstone)이 그 레시피의 마지막 수정보다 늦으면 삭제가 이긴다.
 * 파일 전체를 덮어쓰는 방식보다 두 기기에서 서로 다른 레시피를 고쳐도 둘 다 남는다.
 */

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'auth';

const LOCAL_DEBOUNCE_MS = 2_000;
const FOCUS_THROTTLE_MS = 30_000;
/** 삭제 기록은 이 기간이 지나면 정리한다. 그동안 한 번도 동기화 안 한 기기의 레시피는 되살아날 수 있다 */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function merge(local: SyncFile, remote: SyncFile): SyncFile {
  const tombstones = new Map<string, Tombstone>();
  for (const t of [...local.tombstones, ...remote.tombstones]) {
    const prev = tombstones.get(t.id);
    if (!prev || t.deletedAt > prev.deletedAt) tombstones.set(t.id, t);
  }

  const recipes = new Map<string, Recipe>();
  for (const r of [...local.recipes, ...remote.recipes]) {
    const prev = recipes.get(r.id);
    if (!prev || versionOf(r) > versionOf(prev)) recipes.set(r.id, r);
  }

  for (const [id, recipe] of recipes) {
    const t = tombstones.get(id);
    if (!t) continue;
    if (t.deletedAt >= versionOf(recipe)) recipes.delete(id);
    else tombstones.delete(id); // 삭제 뒤에 다른 기기에서 다시 고친 레시피는 살린다
  }

  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
  return {
    version: 1,
    recipes: [...recipes.values()],
    tombstones: [...tombstones.values()].filter((t) => t.deletedAt >= cutoff),
  };
}

const EMPTY: SyncFile = { version: 1, recipes: [], tombstones: [] };

const readLocal = async (): Promise<SyncFile> => ({
  version: 1,
  recipes: await db.recipes.toArray(),
  tombstones: await db.tombstones.toArray(),
});

const sortById = (f: SyncFile) => ({
  recipes: [...f.recipes].sort((a, b) => a.id.localeCompare(b.id)),
  tombstones: [...f.tombstones].sort((a, b) => a.id.localeCompare(b.id)),
});

const sameContent = (a: SyncFile, b: SyncFile) => JSON.stringify(sortById(a)) === JSON.stringify(sortById(b));

/** 원격을 이 기기와 합쳐 반영하고, 합친 결과(= 올릴 내용)를 돌려준다. 한 트랜잭션이라 그 사이 저장된 레시피도 잃지 않는다 */
async function mergeIntoLocal(remote: SyncFile): Promise<{ merged: SyncFile; changed: boolean }> {
  return db.transaction('rw', db.recipes, db.tombstones, async () => {
    const current = await readLocal();
    const merged = merge(current, remote);
    const changed = !sameContent(merged, current);
    if (changed) {
      await db.recipes.clear();
      await db.recipes.bulkPut(merged.recipes);
      await db.tombstones.clear();
      await db.tombstones.bulkPut(merged.tombstones);
    }
    return { merged, changed };
  });
}

/**
 * 어느 레시피에도 안 붙은 사진도 이 시간 동안은 지우지 않는다.
 * 편집 중 고른 사진(아직 저장 전)과, 다른 기기가 JSON 을 올린 직후 아직 이 기기가 못 받은 사진을 지키기 위해서다.
 */
const ORPHAN_IMAGE_GRACE_MS = 24 * 60 * 60 * 1000;

/** 레시피 JSON 을 올린 뒤에 호출한다. 이 기기에만 있는 사진을 올리고, 레시피에서 빠진 사진은 양쪽에서 정리한다 */
async function syncImages(merged: SyncFile, isCurrent: () => boolean) {
  const referenced = new Set(merged.recipes.map((r) => r.imageId).filter((id): id is string => !!id));
  const cutoff = new Date(Date.now() - ORPHAN_IMAGE_GRACE_MS).toISOString();
  const remote = await listImageFiles();
  const remoteIds = new Set(remote.map((f) => f.imageId));

  const localImages = await db.images.toArray();
  for (const image of localImages) {
    if (!isCurrent()) return;
    if (referenced.has(image.id) && !remoteIds.has(image.id)) await uploadImageFile(image.id, image.blob);
  }
  for (const file of remote) {
    if (!isCurrent()) return;
    if (!referenced.has(file.imageId) && file.modifiedTime < cutoff) await deleteDriveFile(file.fileId);
  }
  const staleLocal = localImages.filter((image) => !referenced.has(image.id) && image.createdAt < cutoff).map((image) => image.id);
  if (staleLocal.length) await db.images.bulkDelete(staleLocal);
}

const OWNER_KEY = 'recipe-note:sync-owner';

/**
 * 로그인한 계정과 이 기기 데이터의 주인이 다르면 로컬을 비운다. 다른 계정의 레시피가 이 계정 드라이브로 섞여 올라가지 않게.
 * 처음 로그인하는 기기(주인 기록 없음)는 로그인 전에 저장한 레시피를 그대로 이 계정으로 올린다.
 */
export async function claimLocalData(email: string) {
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER_KEY);
  } catch {
    /* 저장소 접근 불가면 주인 확인 없이 진행 */
  }
  if (owner && owner !== email) {
    await db.transaction('rw', db.recipes, db.tombstones, async () => {
      await db.recipes.clear();
      await db.tombstones.clear();
    });
    emitRecipesChanged('remote');
  }
  try {
    localStorage.setItem(OWNER_KEY, email);
  } catch {
    /* noop */
  }
}

// ── 실행 관리 ────────────────────────────────────────────────

let status: SyncStatus = 'off';
let lastSyncedAt: Date | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let lastAttempt = 0;
/** startSync·stopSync 마다 올린다. 로그아웃 전에 시작한 동기화가 끝나며 상태를 덮어쓰지 않게 */
let generation = 0;
const statusListeners = new Set<() => void>();

const setStatus = (next: SyncStatus) => {
  status = next;
  statusListeners.forEach((l) => l());
};

export const getSyncState = () => ({ status, lastSyncedAt });

export function onSyncStateChanged(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

async function runOnce() {
  const gen = generation;
  const settle = (next: SyncStatus) => gen === generation && setStatus(next);
  lastAttempt = Date.now();
  setStatus('syncing');
  try {
    const remote = await downloadSyncFile();
    if (gen !== generation) return;
    const { merged, changed } = await mergeIntoLocal(remote?.data ?? EMPTY);
    if (changed) emitRecipesChanged('remote');
    // 원격과 내용이 같으면 올리지 않는다
    if (!remote || !sameContent(merged, remote.data)) {
      if (gen !== generation) return;
      await uploadSyncFile(merged, remote?.fileId ?? null);
    }
    await syncImages(merged, () => gen === generation);
    if (gen === generation) lastSyncedAt = new Date();
    settle('idle');
  } catch (e) {
    console.error('[sync]', e);
    settle(e instanceof AuthRequiredError ? 'auth' : 'error');
  }
}

/** 지금 동기화. 이미 도는 중이면 끝난 뒤 한 번 더 돌린다 */
export function syncNow(): Promise<void> {
  if (status === 'off') return Promise.resolve();
  clearTimeout(debounce);
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    do {
      rerun = false;
      await runOnce();
    } while (rerun && status === 'idle');
    running = null;
  })();
  return running;
}

let detach: (() => void) | undefined;

/** 로그인 확인 후 호출. 시작 시 한 번, 이 기기에서 바꾼 뒤 2초, 창으로 돌아올 때(30초 간격) 동기화한다 */
export function startSync() {
  if (detach) return;
  generation++;
  setStatus('idle');
  const offChange = onRecipesChanged((source) => {
    if (source !== 'local') return;
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, LOCAL_DEBOUNCE_MS);
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastAttempt > FOCUS_THROTTLE_MS) void syncNow();
  };
  document.addEventListener('visibilitychange', onVisible);
  detach = () => {
    offChange();
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(debounce);
  };
  void syncNow();
}

export function stopSync() {
  detach?.();
  detach = undefined;
  generation++;
  rerun = false;
  setStatus('off');
}
