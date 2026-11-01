import type { Recipe, RecipeDraft } from '@/types';
import { canonicalIngredient, compactText } from '@/lib/ingredients';
import { normalizeDraft, randomId } from '@/lib/normalizeDraft';
import { db, emitRecipesChanged } from './db';

/** 제목·태그·재료명(원문 + 대표 이름)을 공백 없이 이어 붙인 검색 대상 */
function searchText(recipe: RecipeDraft): string {
  const parts = [
    recipe.title,
    ...recipe.tags,
    ...recipe.ingredients.flatMap((i) => [i.name, canonicalIngredient(i.name)]),
  ];
  return parts.map(compactText).join('\n');
}

/** 최신순 목록. query 는 제목·태그·재료 검색어 (공백 무시, 재료 동의어 포함) */
export async function listRecipes(query?: string): Promise<Recipe[]> {
  const recipes = await db.recipes.orderBy('createdAt').reverse().toArray();
  const q = query ? compactText(query) : '';
  if (!q) return recipes;
  const canonical = canonicalIngredient(query!);
  return recipes.filter((r) => {
    const text = searchText(r);
    return text.includes(q) || text.includes(canonical);
  });
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  return (await db.recipes.get(id)) ?? null;
}

export async function insertRecipe(input: RecipeDraft): Promise<Recipe> {
  const recipe: Recipe = { ...normalizeDraft(input), id: randomId(6), createdAt: new Date().toISOString() };
  await db.recipes.add(recipe);
  emitRecipesChanged('local');
  return recipe;
}

export async function updateRecipe(id: string, input: RecipeDraft): Promise<Recipe> {
  const draft = normalizeDraft(input);
  const recipe = await db.transaction('rw', db.recipes, async () => {
    const current = await db.recipes.get(id);
    if (!current) throw new Error('레시피를 찾을 수 없어요.');
    const next: Recipe = { ...draft, id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
    await db.recipes.put(next);
    return next;
  });
  emitRecipesChanged('local');
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.transaction('rw', db.recipes, db.tombstones, async () => {
    await db.recipes.delete(id);
    await db.tombstones.put({ id, deletedAt: new Date().toISOString() });
  });
  emitRecipesChanged('local');
}
