import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseYoutubeVideoId } from '../src/lib/youtube';
import * as db from './db';
import { HttpError } from './errors';
import { suggestRecipes } from './aiRecommend';
import { MAX_TEXT_LENGTH, extractRecipe, extractRecipeFromText } from './extract';
import { hasLlmKey } from './llm';
import { recommend } from './recommend';
import { parseDraft } from './validate';

if (existsSync('.env')) process.loadEnvFile('.env');

const app = new Hono().basePath('/api');

const readJson = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, '요청 본문이 올바른 JSON 이 아니에요.');
  }
};

app.get('/health', (c) => c.json({ ok: true, hasLlmKey: hasLlmKey() }));

app.get('/recipes', (c) => c.json(db.listRecipes(c.req.query('q'))));

app.get('/recipes/:id', (c) => {
  const recipe = db.getRecipe(c.req.param('id'));
  return recipe ? c.json(recipe) : c.json({ error: '레시피를 찾을 수 없어요.' }, 404);
});

app.post('/recipes', async (c) => c.json(db.insertRecipe(parseDraft(await readJson(c))), 201));

app.put('/recipes/:id', async (c) => {
  const recipe = db.updateRecipe(c.req.param('id'), parseDraft(await readJson(c)));
  return recipe ? c.json(recipe) : c.json({ error: '레시피를 찾을 수 없어요.' }, 404);
});

app.delete('/recipes/:id', (c) =>
  db.deleteRecipe(c.req.param('id')) ? c.body(null, 204) : c.json({ error: '레시피를 찾을 수 없어요.' }, 404),
);

app.post('/extract', async (c) => {
  const { url } = z.object({ url: z.string() }).catch({ url: '' }).parse(await readJson(c));
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) throw new HttpError(400, '유튜브 영상 링크를 확인해 주세요.');
  return c.json(await extractRecipe(videoId));
});

// 자유 형식 글 → 정형 레시피. 길이를 묶어 LLM 비용을 제한한다
app.post('/extract/text', async (c) => {
  const { text } = z.object({ text: z.string() }).catch({ text: '' }).parse(await readJson(c));
  const trimmed = text.trim();
  if (trimmed.length < 10) throw new HttpError(400, '레시피 내용을 조금 더 자세히 적어 주세요.');
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new HttpError(400, `글이 너무 길어요. ${MAX_TEXT_LENGTH.toLocaleString()}자 이내로 줄여 주세요.`);
  }
  return c.json(await extractRecipeFromText(trimmed));
});

const cleanList =(list: string[]) => {
  const out = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  if (out.length > 60 || out.some((s) => s.length > 30)) {
    throw new HttpError(400, '재료는 60개까지, 각 30자 이내로 입력해 주세요.');
  }
  return out;
};

/** { ingredients, mustUse? }. mustUse 는 꼭 넣을 재료로, 전부 들어간 요리만 추천한다 */
const readFridge = async (c: Parameters<typeof readJson>[0]) => {
  const body = z
    .object({ ingredients: z.array(z.string()), mustUse: z.array(z.string()).optional() })
    .catch({ ingredients: [] })
    .parse(await readJson(c));
  return { fridge: cleanList(body.ingredients), mustUse: cleanList(body.mustUse ?? []) };
};

app.post('/recommendations', async (c) => {
  const { fridge, mustUse } = await readFridge(c);
  return c.json(recommend(db.listRecipes(), fridge, mustUse));
});

// LLM 을 호출하므로 버튼을 눌렀을 때만 부른다. 입력 크기도 제한해 비용을 묶어 둔다
app.post('/recommendations/ai', async (c) => {
  const { fridge, mustUse } = await readFridge(c);
  if (!fridge.length) throw new HttpError(400, '냉장고 재료를 1개 이상 입력해 주세요.');
  return c.json(await suggestRecipes(fridge, mustUse, db.listRecipes()));
});

app.notFound((c) => c.json({ error: '없는 API 경로예요.' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '서버에서 문제가 발생했어요. 잠시 후 다시 시도해 주세요.' }, 500);
});

const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[api] http://localhost:${port}/api`);
  if (!hasLlmKey()) {
    console.warn('[api] ANTHROPIC_API_KEY / DEEPSEEK_API_KEY 가 없어요. 유튜브 추출·AI 추천을 쓰려면 .env 에 키를 넣고 다시 시작하세요.');
  }
});
