import { Hono } from 'hono';
import { z } from 'zod';
import { parseYoutubeVideoId } from '../src/lib/youtube.js';
import { authEnabled, authRoutes, requireUser } from './auth.js';
import { HttpError } from './errors.js';
import { suggestRecipes } from './aiRecommend.js';
import { MAX_TEXT_LENGTH, extractRecipe, extractRecipeFromText } from './extract.js';
import { hasLlmKey } from './llm.js';
import { evaluateHealth } from './health.js';

/**
 * API 라우트. 레시피 저장·검색·추천은 브라우저(IndexedDB)가 하고, 서버는 LLM 키가 필요한 일과 구글 로그인만 맡는다.
 * 로컬은 server/index.ts 가, Vercel 은 api/index.ts 가 이 앱을 띄운다.
 */
export const app = new Hono().basePath('/api');

const readJson = async (c: { req: { json: () => Promise<unknown> } }) => {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, '요청 본문이 올바른 JSON 이 아니에요.');
  }
};

app.get('/health', (c) => c.json({ ok: true, hasLlmKey: hasLlmKey(), authEnabled: authEnabled() }));

app.route('/auth', authRoutes);

// 아래는 모두 서버의 LLM 키를 쓰므로 허용한 계정만 부를 수 있다
app.use('/extract/*', requireUser);
app.use('/extract', requireUser);
app.use('/recommendations/*', requireUser);
app.use('/health-review', requireUser);

app.post('/health-review', async (c) => {
  const body = z
    .object({
      title: z.string(),
      servings: z.number().int().positive().optional(),
      ingredients: z.array(z.object({ name: z.string(), amount: z.string().optional(), optional: z.boolean().optional() })),
      steps: z.array(z.string()),
    })
    .catch({ title: '', ingredients: [], steps: [] })
    .parse(await readJson(c));
  const ingredients = body.ingredients
    .map((i) => ({ name: i.name.trim(), amount: i.amount?.trim() || undefined, optional: i.optional }))
    .filter((i) => i.name);
  if (!ingredients.length) throw new HttpError(400, '재료가 있어야 평가할 수 있어요.');
  // LLM 비용을 묶기 위해 입력 크기를 제한한다
  if (ingredients.length > 80 || body.steps.length > 60 || ingredients.some((i) => i.name.length > 50 || (i.amount?.length ?? 0) > 50)) {
    throw new HttpError(400, '재료·단계가 너무 많거나 길어요.');
  }
  const steps = body.steps.map((s) => s.trim().slice(0, 500)).filter(Boolean);
  return c.json(await evaluateHealth({ title: body.title.trim().slice(0, 100), servings: body.servings, ingredients, steps }));
});

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

const cleanList = (list: string[]) => {
  const out = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  if (out.length > 60 || out.some((s) => s.length > 30)) {
    throw new HttpError(400, '재료는 60개까지, 각 30자 이내로 입력해 주세요.');
  }
  return out;
};

// LLM 을 호출하므로 버튼을 눌렀을 때만 부른다. 입력 크기도 제한해 비용을 묶어 둔다.
// savedTitles 는 이미 저장한 요리 이름으로, 같은 요리를 다시 제안하지 않게 브라우저가 보내 준다
app.post('/recommendations/ai', async (c) => {
  const body = z
    .object({
      ingredients: z.array(z.string()),
      mustUse: z.array(z.string()).optional(),
      savedTitles: z.array(z.string()).optional(),
    })
    .catch({ ingredients: [] })
    .parse(await readJson(c));
  const fridge = cleanList(body.ingredients);
  const mustUse = cleanList(body.mustUse ?? []);
  // 중복 제외용 참고 자료라 거절하지 않고 잘라 쓴다 (최신 1000개, 제목 100자)
  const savedTitles = [...new Set((body.savedTitles ?? []).map((t) => t.trim().slice(0, 100)).filter(Boolean))].slice(0, 1000);
  if (!fridge.length) throw new HttpError(400, '냉장고 재료를 1개 이상 입력해 주세요.');
  return c.json(await suggestRecipes(fridge, mustUse, savedTitles));
});

app.notFound((c) => c.json({ error: '없는 API 경로예요.' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: '서버에서 문제가 발생했어요. 잠시 후 다시 시도해 주세요.' }, 500);
});
