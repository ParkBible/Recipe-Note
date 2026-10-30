import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { RecipeDraft } from '../src/types/recipe';
import { HttpError } from './errors';

const optionalText = z.string().trim().optional().transform((v) => v || undefined);
const optionalPositive = z.number().int().positive().optional().nullable().transform((v) => v ?? undefined);

const draftSchema = z.object({
  title: z.string().trim(),
  description: optionalText,
  servings: optionalPositive,
  cookTimeMinutes: optionalPositive,
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().nullable().transform((v) => v ?? undefined),
  tags: z.array(z.string()).default([]),
  ingredients: z.array(
    z.object({ name: z.string(), amount: optionalText, optional: z.boolean().optional() }),
  ),
  steps: z.array(
    z.object({ description: z.string(), timestampSec: z.number().int().nonnegative().optional().nullable() }),
  ),
  source: z
    .object({
      type: z.literal('youtube'),
      url: z.string().url(),
      videoId: z.string(),
      videoTitle: optionalText,
      channelName: optionalText,
      thumbnailUrl: optionalText,
    })
    .optional(),
});

const localId = (prefix: string) => `${prefix}-${randomBytes(4).toString('hex')}`;

/**
 * 저장·수정 요청 본문 검증. 빈 재료·단계는 버리고, 재료·단계 id 와 단계 순서를 서버에서 다시 매긴다.
 * 제목과 재료 1개 이상은 필수.
 */
export function parseDraft(body: unknown): RecipeDraft {
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, '레시피 형식이 올바르지 않아요.');
  const d = parsed.data;

  const ingredients = d.ingredients
    .map((i) => ({ ...i, name: i.name.trim().replace(/\s+/g, ' ') }))
    .filter((i) => i.name)
    .map((i) => ({ id: localId('ing'), name: i.name, amount: i.amount, optional: i.optional || undefined }));
  const steps = d.steps
    .map((s) => ({ ...s, description: s.description.trim() }))
    .filter((s) => s.description)
    .map((s, idx) => ({ id: localId('step'), order: idx + 1, description: s.description, timestampSec: s.timestampSec ?? undefined }));
  const tags = [...new Set(d.tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];

  if (!d.title) throw new HttpError(400, '요리 이름을 입력해 주세요.');
  if (!ingredients.length) throw new HttpError(400, '재료를 1개 이상 입력해 주세요.');

  return { ...d, tags, ingredients, steps };
}
