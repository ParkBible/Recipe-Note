import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // .env 의 API_PORT 만 읽는다 (VITE_ 접두사가 없어 클라이언트 번들에는 들어가지 않는다)
  const apiPort = loadEnv(mode, process.cwd(), '').API_PORT || '8787';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // 프론트는 /api 만 호출하고, 개발 중에는 Vite 가 API 서버(server/index.ts)로 넘긴다
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  };
});
