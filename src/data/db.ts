import Dexie, { type EntityTable } from 'dexie';
import type { Recipe } from '@/types';

/**
 * 브라우저 저장소(IndexedDB). 레시피 원본은 이 기기에 있고, 구글 드라이브는 기기 간 동기화·백업용이다.
 * 삭제는 tombstones 에 남겨 두어, 다른 기기와 합칠 때 지운 레시피가 되살아나지 않게 한다.
 */

export interface Tombstone {
  id: string;
  /** ISO 8601 */
  deletedAt: string;
}

export const db = new Dexie('recipe-note') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>;
  tombstones: EntityTable<Tombstone, 'id'>;
};

db.version(1).stores({
  recipes: 'id, createdAt',
  tombstones: 'id',
});

/** 동기화 병합에서 어느 쪽이 최신인지 비교하는 시각 */
export const versionOf = (recipe: Recipe) => recipe.updatedAt ?? recipe.createdAt;

type ChangeSource = 'local' | 'remote';
const listeners = new Set<(source: ChangeSource) => void>();

/** 레시피가 바뀌면 알림. local = 이 기기에서 저장·수정·삭제, remote = 동기화로 다른 기기 변경이 들어옴 */
export function onRecipesChanged(listener: (source: ChangeSource) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRecipesChanged(source: ChangeSource) {
  listeners.forEach((l) => l(source));
}
