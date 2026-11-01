import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { HttpError } from './errors.js';
import { parseWithDeepSeek } from './deepseek.js';

/**
 * 추출·AI 추천이 함께 쓰는 LLM 호출. 결과는 zod 스키마 모양의 객체로 돌려준다.
 * 키는 서버 환경변수에서만 읽는다. ANTHROPIC_API_KEY 가 있으면 Claude, 없으면 DEEPSEEK_API_KEY 로 DeepSeek 를 쓴다.
 */

const CLAUDE_MODEL = 'claude-opus-5-5';

export const hasLlmKey = () => !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim());

interface StructuredOptions {
  /** 모델이 요청을 거절했을 때 사용자에게 보여줄 문구 */
  refusalMessage: string;
}

export async function generateStructured<T extends z.ZodType>(
  schema: T,
  system: string,
  user: string,
  { refusalMessage }: StructuredOptions,
): Promise<z.infer<T>> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) return generateWithClaude(anthropicKey, schema, system, user, refusalMessage);
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) return parseWithDeepSeek(deepseekKey, schema, system, user);
  throw new HttpError(
    503,
    '서버에 ANTHROPIC_API_KEY 또는 DEEPSEEK_API_KEY 가 설정되지 않아 AI 기능을 쓸 수 없어요. 서버 환경변수(로컬은 .env, 배포는 Vercel 환경변수)에 키를 넣어 주세요.',
  );
}

let anthropic: Anthropic | undefined;
async function generateWithClaude<T extends z.ZodType>(
  apiKey: string,
  schema: T,
  system: string,
  user: string,
  refusalMessage: string,
): Promise<z.infer<T>> {
  anthropic ??= new Anthropic({ apiKey });
  try {
    const response = await anthropic.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') throw new HttpError(422, refusalMessage);
    if (response.stop_reason === 'max_tokens') {
      throw new HttpError(502, '결과가 너무 길어 끝까지 정리하지 못했어요. 다시 시도해 주세요.');
    }
    if (response.parsed_output == null) {
      throw new HttpError(502, 'AI 응답을 해석하지 못했어요. 다시 시도해 주세요.');
    }
    return response.parsed_output as z.infer<T>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof Anthropic.AuthenticationError) {
      throw new HttpError(503, '서버의 ANTHROPIC_API_KEY 가 올바르지 않아요. 환경변수를 확인해 주세요.');
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new HttpError(503, 'Claude API 요청 한도를 넘었어요. 잠시 후 다시 시도해 주세요.');
    }
    if (e instanceof Anthropic.APIError) {
      console.error('[llm] Claude API error', e.status, e.message);
      throw new HttpError(502, 'Claude API 호출에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
    throw e;
  }
}
