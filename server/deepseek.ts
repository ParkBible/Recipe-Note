import { z } from 'zod';
import { HttpError } from './errors.js';

/**
 * DeepSeek Chat Completions(OpenAI 호환) 호출. JSON 모드는 스키마를 강제하지 않으므로
 * 프롬프트에 JSON 스키마를 붙이고, 응답은 zod 로 다시 검증한다.
 * API 키는 서버 환경변수 DEEPSEEK_API_KEY 에서만 읽는다.
 */

const BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

export async function parseWithDeepSeek<T extends z.ZodType>(
  apiKey: string,
  schema: T,
  system: string,
  user: string,
): Promise<z.infer<T>> {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\n\n응답은 아래 JSON 스키마를 따르는 JSON 객체 하나만 출력한다.\n${jsonSchema}` },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[llm] DeepSeek API error', res.status, detail.slice(0, 300));
    if (res.status === 401) throw new HttpError(503, 'DEEPSEEK_API_KEY 가 올바르지 않아요. .env 의 키를 확인해 주세요.');
    if (res.status === 402) throw new HttpError(503, 'DeepSeek 계정 잔액이 부족해요. 충전 후 다시 시도해 주세요.');
    if (res.status === 429) throw new HttpError(503, 'DeepSeek API 요청 한도를 넘었어요. 잠시 후 다시 시도해 주세요.');
    throw new HttpError(502, 'DeepSeek API 호출에 실패했어요. 잠시 후 다시 시도해 주세요.');
  }

  const data = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string | null } }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new HttpError(502, '결과가 너무 길어 끝까지 정리하지 못했어요. 다시 시도해 주세요.');
  }

  let json: unknown;
  try {
    json = JSON.parse(choice?.message?.content ?? '');
  } catch {
    throw new HttpError(502, 'AI 응답을 해석하지 못했어요. 다시 시도해 주세요.');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error('[llm] DeepSeek output did not match schema', parsed.error.issues.slice(0, 5));
    throw new HttpError(502, 'AI 응답을 해석하지 못했어요. 다시 시도해 주세요.');
  }
  return parsed.data;
}
