import { z } from 'zod';
import type { HealthReview, HealthScore, Ingredient } from '../types/recipe.js';

export type IngredientLike = Pick<Ingredient, 'name' | 'amount' | 'optional'>;

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

const storedScoreSchema = z.object({ score: z.number().finite().transform(clampScore), reason: z.string() });

const storedHealthSchema = z.object({
  bloodSugar: storedScoreSchema,
  diet: storedScoreSchema,
  basis: z.string(),
  evaluatedAt: z.string(),
});

/** 저장·동기화된 평가를 검사한다. 깨졌으면 평가만 버리도록 undefined 를 돌려준다 */
export function parseHealthReview(value: unknown): HealthReview | undefined {
  const parsed = storedHealthSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export type ScoreLevel = 'good' | 'fair' | 'poor';

export const scoreLevel = ({ score }: HealthScore): ScoreLevel => (score >= 7 ? 'good' : score >= 4 ? 'fair' : 'poor');
