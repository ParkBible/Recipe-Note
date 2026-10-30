import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Recipe, RecipeDraft } from '../src/types/recipe';
import { canonicalIngredient, compactText } from './ingredients';

/**
 * 저장소. 레시피 한 건을 JSON 문서(data)로 저장하고, 검색용 텍스트만 별도 컬럼에 둔다.
 * 재료·단계는 항상 레시피와 함께 읽고 쓰므로 정규화 테이블로 쪼개지 않았다.
 */

const DB_PATH = resolve(process.env.DB_PATH ?? 'data/recipes.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    search_text TEXT NOT NULL,
    data        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS recipes_created_at ON recipes (created_at DESC);
`);

const newId = () => randomBytes(6).toString('base64url');

/** 제목·태그·재료명(원문 + 대표 이름)을 공백 없이 이어 붙인 검색 대상 */
function searchText(recipe: RecipeDraft): string {
  const parts = [
    recipe.title,
    ...recipe.tags,
    ...recipe.ingredients.flatMap((i) => [i.name, canonicalIngredient(i.name)]),
  ];
  return parts.map(compactText).join('\n');
}

const rowToRecipe = (row: Record<string, unknown>) => JSON.parse(String(row.data)) as Recipe;

export function listRecipes(query?: string): Recipe[] {
  const q = query ? compactText(query) : '';
  if (!q) {
    return db.prepare('SELECT data FROM recipes ORDER BY created_at DESC').all().map(rowToRecipe);
  }
  // instr 은 LIKE 와 달리 %·_ 를 특수문자로 보지 않는다
  return db
    .prepare('SELECT data FROM recipes WHERE instr(search_text, ?) > 0 OR instr(search_text, ?) > 0 ORDER BY created_at DESC')
    .all(q, canonicalIngredient(query!))
    .map(rowToRecipe);
}

export function getRecipe(id: string): Recipe | null {
  const row = db.prepare('SELECT data FROM recipes WHERE id = ?').get(id);
  return row ? rowToRecipe(row) : null;
}

export function insertRecipe(draft: RecipeDraft): Recipe {
  const recipe: Recipe = { ...draft, id: newId(), createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO recipes (id, title, search_text, data, created_at) VALUES (?, ?, ?, ?, ?)').run(
    recipe.id,
    recipe.title,
    searchText(recipe),
    JSON.stringify(recipe),
    recipe.createdAt,
  );
  return recipe;
}

export function updateRecipe(id: string, draft: RecipeDraft): Recipe | null {
  const current = getRecipe(id);
  if (!current) return null;
  const recipe: Recipe = { ...draft, id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  db.prepare('UPDATE recipes SET title = ?, search_text = ?, data = ?, updated_at = ? WHERE id = ?').run(
    recipe.title,
    searchText(recipe),
    JSON.stringify(recipe),
    recipe.updatedAt!,
    id,
  );
  return recipe;
}

export function deleteRecipe(id: string): boolean {
  return Number(db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes) > 0;
}
