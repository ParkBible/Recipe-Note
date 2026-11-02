import type { Recipe } from '@/types';
import type { Tombstone } from '@/data/db';

/**
 * 구글 드라이브 appDataFolder 의 동기화 파일 하나를 읽고 쓴다. appDataFolder 는 이 앱만 보는 숨김 폴더라
 * 사용자의 다른 드라이브 파일에는 접근하지 않는다. access token 은 서버(/api/auth/token)가 발급한다.
 */

const FILE_NAME = 'recipe-note-data.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export interface SyncFile {
  version: 1;
  recipes: Recipe[];
  tombstones: Tombstone[];
}

export class AuthRequiredError extends Error {}

let cached: { token: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const res = await fetch('/api/auth/token', { method: 'POST' });
  if (res.status === 401) throw new AuthRequiredError('다시 로그인해 주세요.');
  if (!res.ok) throw new Error('드라이브 인증에 실패했어요.');
  const { accessToken: token, expiresIn } = (await res.json()) as { accessToken: string; expiresIn: number };
  cached = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export const forgetAccessToken = () => {
  cached = undefined;
};

async function driveFetch(url: string, init: RequestInit = {}, acceptStatuses: number[] = []): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers },
  });
  if (res.status === 401) {
    forgetAccessToken();
    throw new AuthRequiredError('드라이브 인증이 만료됐어요. 다시 로그인해 주세요.');
  }
  if (!res.ok && !acceptStatuses.includes(res.status)) throw new Error(`드라이브 요청에 실패했어요. (${res.status})`);
  return res;
}

async function findFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await driveFetch(`${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id)&orderBy=modifiedTime desc`);
  const { files } = (await res.json()) as { files?: { id: string }[] };
  return files?.[0]?.id ?? null;
}

/** 드라이브의 동기화 파일. 아직 없으면 null */
export async function downloadSyncFile(): Promise<{ fileId: string; data: SyncFile } | null> {
  const fileId = await findFileId();
  if (!fileId) return null;
  const res = await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`);
  const data = (await res.json()) as Partial<SyncFile> | null;
  // 깨졌거나 예전 형식인 항목은 건너뛴다. 그대로 넣으면 목록에서 빠지거나 검색·추천이 터진다
  return {
    fileId,
    data: {
      version: 1,
      recipes: Array.isArray(data?.recipes) ? data.recipes.filter(isRecipe).map(dropInvalidImageId) : [],
      tombstones: Array.isArray(data?.tombstones) ? data.tombstones.filter(isTombstone) : [],
    },
  };
}

const isRecipe = (r: unknown): r is Recipe => {
  const v = r as Partial<Recipe> | null;
  return (
    typeof v?.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.createdAt === 'string' &&
    Array.isArray(v.tags) &&
    Array.isArray(v.steps) &&
    Array.isArray(v.ingredients) &&
    v.ingredients.every((i) => typeof i?.name === 'string')
  );
};

export const isValidImageId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);

// imageId 만 깨진 레시피는 버리지 않고 사진만 뗀다. 깨진 값이 남으면 진짜 사진을 고아로 보고 지울 수 있다
const dropInvalidImageId = (recipe: Recipe): Recipe => {
  if (recipe.imageId === undefined || isValidImageId(recipe.imageId)) return recipe;
  const { imageId: _invalid, ...rest } = recipe;
  return rest;
};

const isTombstone =(t: unknown): t is Tombstone => {
  const v = t as Partial<Tombstone> | null;
  return typeof v?.id === 'string' && typeof v.deletedAt === 'string';
};

async function createAppDataFile(name: string, content: Blob): Promise<void> {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }));
  form.append('file', content);
  await driveFetch(`${UPLOAD_API}/files?uploadType=multipart`, { method: 'POST', body: form });
}

/** fileId 가 있으면 덮어쓰고, 없으면 appDataFolder 에 새로 만든다 */
export async function uploadSyncFile(data: SyncFile, fileId: string | null): Promise<void> {
  const body = JSON.stringify(data);
  if (fileId) {
    await driveFetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return;
  }
  await createAppDataFile(FILE_NAME, new Blob([body], { type: 'application/json' }));
}

// 사진은 동기화 JSON 에 넣지 않고 사진마다 별도 파일로 둔다. JSON 을 매번 통째로 주고받으므로 사진이 들어가면 동기화가 무거워진다
const IMAGE_PREFIX = 'recipe-note-image-';
const imageFileName = (imageId: string) => `${IMAGE_PREFIX}${imageId}`;

export interface DriveImageFile {
  fileId: string;
  imageId: string;
  modifiedTime: string;
}

export async function listImageFiles(): Promise<DriveImageFile[]> {
  const files: DriveImageFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name contains '${IMAGE_PREFIX}'`,
      fields: 'nextPageToken,files(id,name,modifiedTime)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(`${DRIVE_API}/files?${params}`);
    const page = (await res.json()) as { files?: { id: string; name: string; modifiedTime: string }[]; nextPageToken?: string };
    for (const file of page.files ?? []) {
      if (file.name.startsWith(IMAGE_PREFIX)) {
        files.push({ fileId: file.id, imageId: file.name.slice(IMAGE_PREFIX.length), modifiedTime: file.modifiedTime });
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

export const uploadImageFile = (imageId: string, blob: Blob) => createAppDataFile(imageFileName(imageId), blob);

/** 드라이브에 없으면 null */
export async function downloadImageFile(imageId: string): Promise<Blob | null> {
  if (!isValidImageId(imageId)) return null;
  const q = encodeURIComponent(`name='${imageFileName(imageId)}'`);
  const res = await driveFetch(`${DRIVE_API}/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
  const { files } = (await res.json()) as { files?: { id: string }[] };
  const fileId = files?.[0]?.id;
  if (!fileId) return null;
  return (await driveFetch(`${DRIVE_API}/files/${fileId}?alt=media`)).blob();
}

/** 다른 기기가 먼저 지워 404 가 나도 성공으로 본다 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' }, [404]);
}
