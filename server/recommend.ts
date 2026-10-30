import type { Ingredient, Recipe, Recommendation } from '../src/types/recipe';
import { seasonings } from '../src/lib/ingredients';
import { canonicalIngredient } from './ingredients';

/**
 * 냉장고 재료 → 추천. 매칭률 = 냉장고에 있는 필수 재료 수 / 필수 재료 수.
 * optional 재료와 양념(seasonings)은 분모·분자 모두에서 뺀다 (양념은 있다고 친다).
 * 빼고 나서 남는 재료가 없으면 양념을 뺀 전체 → 그것도 없으면 레시피 전체로 계산한다.
 * 대표 이름이 완전히 같을 때만 일치로 본다. 부분 일치는 "고추"⊂"고추장" 같은 오탐이 많아 쓰지 않는다.
 *
 * 꼭 넣을 재료(mustUse)를 고르면 그 재료가 전부 들어간 레시피만 남긴다.
 */
export type IngredientMatch = Omit<Recommendation, 'recipe'>;

const SEASONINGS = new Set(seasonings.map(canonicalIngredient));

export const ingredientSet = (names: string[]) => new Set(names.map(canonicalIngredient).filter(Boolean));

/** 레시피 재료와 냉장고 재료의 일치 정도. 저장 레시피 추천과 AI 추천이 같은 규칙을 쓴다 */
export function matchIngredients(ingredients: Ingredient[], have: Set<string>): IngredientMatch {
  const base = ingredients.filter((i) => !SEASONINGS.has(canonicalIngredient(i.name)));
  const required = base.filter((i) => !i.optional);
  const counted = required.length ? required : base.length ? base : ingredients;
  const matched = counted.filter((i) => have.has(canonicalIngredient(i.name)));
  const missing = counted.filter((i) => !have.has(canonicalIngredient(i.name)));
  return {
    matchRate: counted.length ? matched.length / counted.length : 0,
    matchedIngredients: matched.map((i) => i.name),
    missingIngredients: missing.map((i) => i.name),
  };
}

/** 레시피에 꼭 넣을 재료가 전부 들어 있는지. optional 재료로 들어 있어도 인정한다 */
export function usesAll(ingredients: Ingredient[], mustUse: Set<string>): boolean {
  const names = new Set(ingredients.map((i) => canonicalIngredient(i.name)));
  return [...mustUse].every((m) => names.has(m));
}

export function recommend(recipes: Recipe[], fridge: string[], mustUse: string[] = []): Recommendation[] {
  const have = ingredientSet(fridge);
  const must = ingredientSet(mustUse);

  return recipes
    .filter((recipe) => usesAll(recipe.ingredients, must))
    .map((recipe) => ({ recipe, ...matchIngredients(recipe.ingredients, have) }))
    .filter((r) => r.matchedIngredients.length > 0 || must.size > 0)
    .sort(
      (a, b) =>
        b.matchRate - a.matchRate ||
        b.matchedIngredients.length - a.matchedIngredients.length ||
        b.recipe.createdAt.localeCompare(a.recipe.createdAt),
    );
}
