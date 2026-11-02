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

const inflight = new Map<string, Promise<Blob | null>>();

async function fetchImageBlob(imageId: string): Promise<Blob | null> {
  const local = await db.images.get(imageId);
  if (local) return local.blob;
  if (getSyncState().status === 'off') return null;
  const blob = await downloadImageFile(imageId).catch((e) => {
    console.warn('[images] download failed', e);
    return null;
  });
  if (blob) await db.images.put({ id: imageId, blob, createdAt: new Date().toISOString() });
  return blob;
}

function getImageBlob(imageId: string): Promise<Blob | null> {
  let pending = inflight.get(imageId);
  if (!pending) {
    pending = fetchImageBlob(imageId).finally(() => inflight.delete(imageId));
    inflight.set(imageId, pending);
  }
  return pending;
}

/**
 * imageId 의 사진 주소(object URL). 없거나 아직 못 받았으면 undefined.
 * 못 받은 사진은 로그인이 확인되거나 동기화가 끝날 때마다 다시 시도한다 (다른 기기가 사진을 아직 안 올렸을 수 있다)
 */
export function useRecipeImage(imageId: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<{ imageId: string; url: string }>();
  const { status, lastSyncedAt } = useSyncState();
  const retryKey = status === 'off' ? -1 : (lastSyncedAt?.getTime() ?? 0);
  const loadedId = loaded?.imageId;

  useEffect(() => {
    if (!imageId || loadedId === imageId) return;
    let cancelled = false;
    void getImageBlob(imageId).then((blob) => {
      if (!cancelled && blob) setLoaded({ imageId, url: URL.createObjectURL(blob) });
    });
    return () => {
      cancelled = true;
    };
  }, [imageId, loadedId, retryKey]);

  const loadedUrl = loaded?.url;
  useEffect(
    () => () => {
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    },
    [loadedUrl],
  );

  return loaded && loaded.imageId === imageId ? loaded.url : undefined;
}
