import { z } from 'zod';
import type { AiSuggestion, Recipe } from '../src/types/recipe';
import { seasonings } from '../src/lib/ingredients';
import { compactText } from './ingredients';
import { generateStructured } from './llm';
import { ingredientSet, matchIngredients, usesAll } from './recommend';

/**
 * 냉장고 재료 → AI 가 제안하는 (저장되지 않은) 요리. 비용을 아끼려고 한 번에 3개만 받고,
 * 이미 저장한 요리는 제외한다. 꼭 넣을 재료(mustUse)를 고르면 전부 쓴 요리만 남긴다. 매칭률은 모델 말을 믿지 않고 저장 레시피와 같은 규칙으로 서버가 다시 계산한다.
 */

const SUGGESTION_COUNT = 3;
export const AI_TAG = 'AI추천';

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().describe('요리 이름'),
      description: z.string().describe('요리 한 줄 소개'),
      servings: z.number().int().nullable(),
      cookTimeMinutes: z.number().int().nullable(),
      difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
      tags: z.array(z.string()).describe('1~3개. 예: 한식, 볶음, 자취요리'),
      ingredients: z.array(
        z.object({
          name: z.string().describe('정규화된 재료명'),
          amount: z.string().nullable().describe('예: 2큰술, 1/2개, 약간'),
          optional: z.boolean().describe('생략 가능·취향껏·토핑 재료면 true'),
        }),
      ),
      steps: z.array(z.string()).describe('따라 할 수 있는 동작 단위 조리 단계'),
    }),
  ),
});

const SYSTEM_PROMPT = `너는 냉장고에 있는 재료로 집에서 만들 수 있는 요리를 제안하는 도우미다.

- 정확히 ${SUGGESTION_COUNT}개를 제안한다. 서로 다른 종류의 요리로 고른다.
- 냉장고 재료를 주재료로 쓰고, 냉장고에 없는 재료는 가능한 한 적게 쓴다. 양념(${seasonings.join(', ')})은 집에 있다고 보고 자유롭게 써도 된다.
- <must_use> 에 재료가 있으면 모든 요리에 그 재료를 빠짐없이 전부 넣는다. 재료명도 그대로 쓴다.
- 실제로 있는 평범한 가정식 위주로, 1~2인분 기준으로 쓴다.
- 재료명은 비교에 쓰이므로 일반적인 이름으로 정규화한다 (예: "다진 마늘" → "다진마늘", "청양고추 2개" → 이름 "청양고추"). 냉장고 재료와 같은 재료면 냉장고에 적힌 이름을 그대로 쓴다.
- 조리 단계는 존댓말 없는 평서문("~한다")으로, 3~8단계로 쓴다.
- <saved> 에 있는 요리는 이미 저장된 것이니 제안하지 않는다.`;

export async function suggestRecipes(fridge: string[], mustUse: string[], saved: Recipe[]): Promise<AiSuggestion[]> {
  const user = [
    `<fridge>${fridge.join(', ')}</fridge>`,
    `<must_use>${mustUse.join(', ')}</must_use>`,
    `<saved>${saved.map((r) => r.title).join(', ')}</saved>`,
    '',
    '이 재료로 만들 만한 요리를 제안해 줘.',
  ].join('\n');

  const out = await generateStructured(suggestionSchema, SYSTEM_PROMPT, user, {
    refusalMessage: '이 재료로는 요리를 제안할 수 없어요. 재료를 바꿔 다시 시도해 주세요.',
  });

  const have = ingredientSet(fridge);
  const must = ingredientSet(mustUse);
  const savedTitles = new Set(saved.map((r) => compactText(r.title)));

  return out.suggestions
    .filter((s) => s.title.trim() && s.ingredients.length && s.steps.length && !savedTitles.has(compactText(s.title)))
    .slice(0, SUGGESTION_COUNT)
    .map((s): AiSuggestion => {
      const ingredients = s.ingredients
        .filter((i) => i.name.trim())
        .map((i, idx) => ({
          id: `ing-${idx + 1}`,
          name: i.name.trim(),
          amount: i.amount?.trim() || undefined,
          optional: i.optional || undefined,
        }));
      return {
        draft: {
          title: s.title.trim(),
          description: s.description.trim() || undefined,
          servings: s.servings && s.servings > 0 ? s.servings : undefined,
          cookTimeMinutes: s.cookTimeMinutes && s.cookTimeMinutes > 0 ? s.cookTimeMinutes : undefined,
          difficulty: s.difficulty ?? undefined,
          tags: [...new Set([AI_TAG, ...s.tags.map((t) => t.trim()).filter(Boolean)])],
          ingredients,
          steps: s.steps
            .map((d) => d.trim())
            .filter(Boolean)
            .map((description, idx) => ({ id: `step-${idx + 1}`, order: idx + 1, description })),
        },
        ...matchIngredients(ingredients, have),
      };
    })
    .filter((s) => s.matchedIngredients.length > 0 && usesAll(s.draft.ingredients, must))
    .sort((a, b) => b.matchRate - a.matchRate || b.matchedIngredients.length - a.matchedIngredients.length);
}
