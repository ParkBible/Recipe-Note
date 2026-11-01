import type { Recipe } from '@/types';
import { db, emitRecipesChanged, onRecipesChanged, versionOf, type Tombstone } from '@/data/db';
import { AuthRequiredError, downloadSyncFile, uploadSyncFile, type SyncFile } from './drive';

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

/** 합친 결과를 이 기기에 반영. 동기화 중에 새로 저장된 레시피가 있으면 그것까지 다시 합쳐 잃지 않는다 */
async function applyLocally(merged: SyncFile): Promise<boolean> {
  return db.transaction('rw', db.recipes, db.tombstones, async () => {
    const current: SyncFile = {
      version: 1,
      recipes: await db.recipes.toArray(),
      tombstones: await db.tombstones.toArray(),
    };
    const next = merge(current, merged);
    const changed = JSON.stringify(sortById(next)) !== JSON.stringify(sortById(current));
    if (changed) {
      await db.recipes.clear();
      await db.recipes.bulkPut(next.recipes);
      await db.tombstones.clear();
      await db.tombstones.bulkPut(next.tombstones);
    }
    return changed;
  });
}

const sortById = (f: SyncFile) => ({
  recipes: [...f.recipes].sort((a, b) => a.id.localeCompare(b.id)),
  tombstones: [...f.tombstones].sort((a, b) => a.id.localeCompare(b.id)),
});

// ── 실행 관리 ────────────────────────────────────────────────

let status: SyncStatus = 'off';
let lastSyncedAt: Date | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let lastAttempt = 0;
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
  lastAttempt = Date.now();
  setStatus('syncing');
  try {
    const remote = await downloadSyncFile();
    const local: SyncFile = {
      version: 1,
      recipes: await db.recipes.toArray(),
      tombstones: await db.tombstones.toArray(),
    };
    const merged = remote ? merge(local, remote.data) : local;
    if (await applyLocally(merged)) emitRecipesChanged('remote');
    // 원격과 내용이 같으면 올리지 않는다
    if (!remote || JSON.stringify(sortById(merged)) !== JSON.stringify(sortById(remote.data))) {
      await uploadSyncFile(merged, remote?.fileId ?? null);
    }
    lastSyncedAt = new Date();
    setStatus('idle');
  } catch (e) {
    console.error('[sync]', e);
    setStatus(e instanceof AuthRequiredError ? 'auth' : 'error');
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
  setStatus('off');
}
