import type { RecipeDraft } from '@/types';

/** 저장 전 필수값 검사. 문제가 없으면 undefined. 서버(server/validate.ts)도 같은 규칙으로 한 번 더 검사한다 */
export function validateDraft(draft: RecipeDraft): string | undefined {
  if (!draft.title.trim()) return '요리 이름을 입력해 주세요.';
  if (!draft.ingredients.some((i) => i.name.trim())) return '재료를 1개 이상 입력해 주세요.';
  return undefined;
}
