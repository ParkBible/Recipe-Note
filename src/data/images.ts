import { useEffect, useState } from 'react';
import { randomId } from '@/lib/normalizeDraft';
import { downloadImageFile } from '@/sync/drive';
import { useSyncState } from '@/sync/session';
import { getSyncState } from '@/sync/sync';
import { db } from './db';

/**
 * 레시피 대표 사진. 올릴 때 줄여서 이 기기 IndexedDB 에 저장하고, 드라이브에는 동기화 때 별도 파일로 올라간다(sync.ts).
 * 다른 기기에서 만든 사진은 처음 볼 때 드라이브에서 받아 이 기기에 저장해 둔다.
 */

// 썸네일·상세 상단(16:9) 용도라 긴 변 960px 이면 충분하다. 장당 대략 50~120KB
const MAX_EDGE_PX = 960;
const QUALITY = 0.82;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('사진을 읽지 못했어요. 다른 사진으로 시도해 주세요.'));
    };
    img.src = url;
  });
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

async function compressImage(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 사진을 줄일 수 없어요.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // WebP 인코딩을 지원하지 않는 브라우저(구형 사파리)는 PNG 를 돌려주므로 그때는 JPEG 로 다시 만든다
  const webp = await canvasToBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg');
  if (!jpeg) throw new Error('사진을 저장하지 못했어요.');
  return jpeg;
}

/** 사진을 줄여 저장하고 imageId 를 돌려준다. 레시피에 붙이지 않으면 하루 뒤 동기화 때 정리된다 */
export async function saveImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('사진 파일만 올릴 수 있어요.');
  const blob = await compressImage(file);
  const id = randomId(9);
  await db.images.put({ id, blob, createdAt: new Date().toISOString() });
  return id;
}

// 드라이브에 아직 없던 사진은 이 시간 동안 다시 찾지 않는다. 카드마다 동기화 때마다 조회하지 않게
const MISSING_RETRY_MS = 5 * 60 * 1000;
const missingUntil = new Map<string, number>();
// 같은 사진을 여러 카드·화면이 쓰므로 주소를 한 번만 만들어 재사용한다. 사진이 작아 페이지가 살아 있는 동안 들고 있어도 된다
const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

async function resolveImageUrl(imageId: string): Promise<string | null> {
  const local = await db.images.get(imageId);
  let blob = local?.blob ?? null;
  if (!blob && getSyncState().status !== 'off' && (missingUntil.get(imageId) ?? 0) < Date.now()) {
    blob = await downloadImageFile(imageId).catch((e) => {
      console.warn('[images] download failed', e);
      return null;
    });
    if (blob) await db.images.put({ id: imageId, blob, createdAt: new Date().toISOString() });
    else missingUntil.set(imageId, Date.now() + MISSING_RETRY_MS);
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(imageId, url);
  return url;
}

function getImageUrl(imageId: string): Promise<string | null> {
  let pending = inflight.get(imageId);
  if (!pending) {
    pending = resolveImageUrl(imageId).finally(() => inflight.delete(imageId));
    inflight.set(imageId, pending);
  }
  return pending;
}

/**
 * imageId 의 사진 주소(object URL). 찾는 중이면 undefined, 없으면 null.
 * 못 찾은 사진은 로그인이 확인되거나 동기화가 끝날 때 다시 시도한다 (다른 기기가 사진을 아직 안 올렸을 수 있다)
 */
export function useRecipeImage(imageId: string | undefined): string | null | undefined {
  const [resolved, setResolved] = useState<{ imageId: string; url: string | null }>();
  const { status, lastSyncedAt } = useSyncState();
  const retryKey = status === 'off' ? -1 : (lastSyncedAt?.getTime() ?? 0);

  useEffect(() => {
    if (!imageId || urlCache.has(imageId)) return;
    let cancelled = false;
    void getImageUrl(imageId).then((url) => {
      if (!cancelled) setResolved({ imageId, url });
    });
    return () => {
      cancelled = true;
    };
  }, [imageId, retryKey]);

  if (!imageId) return null;
  const cached = urlCache.get(imageId);
  if (cached) return cached;
  return resolved?.imageId === imageId ? resolved.url : undefined;
}
