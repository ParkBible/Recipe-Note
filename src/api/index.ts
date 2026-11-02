import type { AiSuggestion, ExtractionResult, HealthReview, Recipe, RecipeDraft, Recommendation } from '@/types';
import * as store from '@/data/recipes';
import { recommend } from '@/lib/recommend';

/**
 * 화면이 호출하는 데이터 경계.
 * - 레시피 저장·조회·검색·추천은 이 기기의 IndexedDB(data/recipes.ts)에서 처리한다. 드라이브 동기화는 sync/ 가 뒤에서 한다.
 * - LLM 이 필요한 추출·AI 추천만 같은 출처의 /api 를 호출한다 (개발 중엔 Vite 프록시 → server/). 로그인 쿠키가 같이 간다.
 * 서버는 실패 시 { error: "사람이 읽을 메시지" } 를 돌려주고, 여기서 그 메시지로 Error 를 던진다.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  signal?: AbortSignal;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, '서버에 연결하지 못했어요. 네트워크 상태를 확인해 주세요.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `요청에 실패했어요. (${res.status})`);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

/** 레시피 목록. query 는 제목·재료·태그 검색어 */
export function listRecipes(query?: string, _options: RequestOptions = {}): Promise<Recipe[]> {
  return store.listRecipes(query?.trim());
}

/** 레시피 단건. 없으면 null */
export function getRecipe(id: string, _options: RequestOptions = {}): Promise<Recipe | null> {
  return store.getRecipe(id);
}

/** 유튜브 링크 → 서버에서 영상 설명/자막 수집 → LLM(Claude 또는 DeepSeek)으로 레시피 파싱 */
export function extractRecipeFromYoutube(url: string): Promise<ExtractionResult> {
  return request('/extract', json('POST', { url }));
}

/** 자유 형식으로 적은 레시피 글 → LLM 으로 재료·분량·조리 단계를 정리한 정형 레시피 */
export function extractRecipeFromText(text: string): Promise<ExtractionResult> {
  return request('/extract/text', json('POST', { text }));
}

/** 추출·수정한 레시피 저장. 저장된 레시피(id 포함)를 돌려준다 */
export function saveRecipe(draft: RecipeDraft): Promise<Recipe> {
  return store.insertRecipe(draft);
}

/** 저장된 레시피 수정 */
export function updateRecipe(id: string, draft: RecipeDraft): Promise<Recipe> {
  return store.updateRecipe(id, draft);
}

/** 레시피를 혈당·다이어트 관점에서 AI 로 평가. LLM 을 호출하므로 사용자가 요청할 때만 부른다 */
export function evaluateRecipeHealth(recipe: RecipeDraft): Promise<HealthReview> {
  return request(
    '/health-review',
    json('POST', {
      title: recipe.title,
      servings: recipe.servings,
      ingredients: recipe.ingredients.map(({ name, amount, optional }) => ({ name, amount, optional })),
      steps: recipe.steps.map((s) => s.description),
    }),
  );
}

/** 레시피 삭제 */
export function deleteRecipe(id: string): Promise<void> {
  return store.deleteRecipe(id);
}

/** 냉장고 재료 → 만들 수 있는 레시피 추천 (매칭률 내림차순). mustUse 를 고르면 그 재료가 전부 들어간 레시피만 */
export async function recommendRecipes(ingredients: string[], mustUse: string[]): Promise<Recommendation[]> {
  return recommend(await store.listRecipes(), ingredients, mustUse);
}

/** 냉장고 재료 → AI 가 제안하는 저장 안 된 요리. LLM 을 호출하므로 사용자가 요청할 때만 부른다 */
export async function suggestRecipesWithAi(
  ingredients: string[],
  mustUse: string[],
  { signal }: RequestOptions = {},
): Promise<AiSuggestion[]> {
  // 이미 저장한 요리는 다시 제안하지 않도록 제목만 같이 보낸다
  const savedTitles = (await store.listRecipes()).slice(0, 1000).map((r) => r.title.slice(0, 100));
  return request('/recommendations/ai', { ...json('POST', { ingredients, mustUse, savedTitles }), signal });
}
