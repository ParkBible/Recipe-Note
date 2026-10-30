import type { AiSuggestion, ExtractionResult, Recipe, RecipeDraft, Recommendation } from '@/types';

/**
 * 화면이 호출하는 데이터 경계. 모두 같은 출처의 /api 를 호출한다 (개발 중엔 Vite 프록시 → server/).
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
export function listRecipes(query?: string, { signal }: RequestOptions = {}): Promise<Recipe[]> {
  const q = query?.trim();
  return request(`/recipes${q ? `?q=${encodeURIComponent(q)}` : ''}`, { signal });
}

/** 레시피 단건. 없으면 null */
export async function getRecipe(id: string, { signal }: RequestOptions = {}): Promise<Recipe | null> {
  try {
    return await request<Recipe>(`/recipes/${encodeURIComponent(id)}`, { signal });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
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
  return request('/recipes', json('POST', draft));
}

/** 저장된 레시피 수정 */
export function updateRecipe(id: string, draft: RecipeDraft): Promise<Recipe> {
  return request(`/recipes/${encodeURIComponent(id)}`, json('PUT', draft));
}

/** 레시피 삭제 */
export function deleteRecipe(id: string): Promise<void> {
  return request(`/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 냉장고 재료 → 만들 수 있는 레시피 추천 (매칭률 내림차순). mustUse 를 고르면 그 재료가 전부 들어간 레시피만 */
export function recommendRecipes(ingredients: string[], mustUse: string[]): Promise<Recommendation[]> {
  return request('/recommendations', json('POST', { ingredients, mustUse }));
}

/** 냉장고 재료 → AI 가 제안하는 저장 안 된 요리. LLM 을 호출하므로 사용자가 요청할 때만 부른다 */
export function suggestRecipesWithAi(
  ingredients: string[],
  mustUse: string[],
  { signal }: RequestOptions = {},
): Promise<AiSuggestion[]> {
  return request('/recommendations/ai', { ...json('POST', { ingredients, mustUse }), signal });
}
