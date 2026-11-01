import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { app as api } from './app';
import { authEnabled, missingAuthEnv } from './auth';
import { hasLlmKey } from './llm';

/**
 * 로컬 실행용 Node 서버. 개발 중엔 API 만 띄우고 Vite 가 /api 를 여기로 넘긴다.
 * dist/ 가 있으면(npm run build 후 npm start) 화면도 함께 내보내 서버 하나로 동작한다.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const server = new Hono();
server.route('/', api);
if (existsSync('dist/index.html')) {
  server.use('/*', serveStatic({ root: './dist' }));
  // 클라이언트 라우팅(/recipes/:id 등)은 index.html 로
  server.get('*', serveStatic({ path: './dist/index.html' }));
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);
serve({ fetch: server.fetch, port }, () => {
  console.log(`[api] http://localhost:${port}/api`);
  if (!hasLlmKey()) {
    console.warn('[api] ANTHROPIC_API_KEY / DEEPSEEK_API_KEY 가 없어요. 유튜브 추출·AI 추천을 쓰려면 .env 에 키를 넣고 다시 시작하세요.');
  }
  if (!authEnabled()) {
    console.warn('[api] GOOGLE_CLIENT_ID 가 없어 로그인·드라이브 동기화가 꺼져 있어요. (로컬에서는 AI API 가 로그인 없이 열려 있어요)');
  } else if (missingAuthEnv().length) {
    console.warn(`[api] 로그인 설정이 덜 됐어요: ${missingAuthEnv().join(', ')}`);
  }
});
