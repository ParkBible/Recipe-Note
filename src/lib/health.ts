import type { HealthReview, HealthScore, Ingredient } from '../types/recipe.js';

type IngredientLike = Pick<Ingredient, 'name' | 'amount' | 'optional'>;

const normalize = (text: string | undefined) => (text ?? '').trim().replace(/\s+/g, ' ');

/** 평가 근거가 되는 재료 구성. 순서·id·공백 차이는 무시한다 */
export function ingredientBasis(ingredients: IngredientLike[]): string {
  return ingredients
    .map((i) => `${normalize(i.name)}|${normalize(i.amount)}|${i.optional ? 1 : 0}`)
    .filter((line) => !line.startsWith('|'))
    .sort()
    .join('\n');
}

export const isHealthStale = (health: HealthReview, ingredients: IngredientLike[]) =>
  health.basis !== ingredientBasis(ingredients);

export const clampScore = (score: number) => Math.min(10, Math.max(1, Math.round(score)));

export type ScoreLevel = 'good' | 'fair' | 'poor';

export const scoreLevel = ({ score }: HealthScore): ScoreLevel => (score >= 7 ? 'good' : score >= 4 ? 'fair' : 'poor');
