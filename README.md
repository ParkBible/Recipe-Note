# 레시피 노트 (recipe-site)

유튜브 요리 영상에서 레시피를 뽑아 저장하고, 냉장고 재료로 만들 수 있는 요리를 추천하는 웹사이트.

## 실행

Node **22.13 이상** 필요 (내장 `node:sqlite` 사용. 개발은 Node 24 에서 확인).

```bash
cp .env.example .env   # ANTHROPIC_API_KEY 또는 DEEPSEEK_API_KEY 를 직접 채운다
npm install
npm run dev            # 프론트 http://localhost:5173 + API 서버 :8787 을 함께 띄운다
npm run build          # 프론트·서버 타입체크 + vite build
npm run typecheck      # 타입체크만
```

- `npm run dev` 는 `concurrently` 로 Vite(`web`)와 API 서버(`api`, `tsx watch`)를 같이 실행한다. 프론트는 `/api` 만 호출하고 Vite proxy 가 `API_PORT` 로 넘긴다.
- 따로 띄우려면 `npm run dev:web` / `npm run dev:api`. 서버만 실행은 `npm start`.
- 첫 실행 시 `data/recipes.db` 가 생기고 레시피는 비어 있다(목업 시드 없음). 초기화하려면 서버를 끄고 `data/` 를 지운다.
- 서버 시작 시 `ExperimentalWarning: SQLite is an experimental feature` 가 한 줄 찍히는데 정상이다.

### 환경변수 (`.env`, 서버만 읽음 · git 제외)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (없음) | 유튜브 레시피 추출·AI 추천에 쓰는 Claude API 키. **서버에서만 읽고 프론트로 보내지 않는다.** DEEPSEEK_API_KEY 와 둘 다 없으면 추출·AI 추천 API 가 503 과 안내 문구를 돌려주고, 저장·조회·추천은 그대로 동작한다. 바꾼 뒤에는 서버를 재시작한다. |
| `DEEPSEEK_API_KEY` | (없음) | Claude 키 대신 쓸 수 있는 DeepSeek API 키. `ANTHROPIC_API_KEY` 가 비어 있을 때만 쓴다. 역시 서버에서만 읽는다. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 사용 시 모델 이름 |
| `API_PORT` | `8787` | API 서버 포트. Vite proxy 도 이 값을 읽는다. |
| `DB_PATH` | `data/recipes.db` | SQLite 파일 경로 |

스택: Vite 5 + React 18 + TypeScript + react-router-dom 6 / 서버: Node + Hono + `node:sqlite` + Anthropic TypeScript SDK + youtubei.js

### 백엔드 스택을 이렇게 고른 이유
- **Hono** — 라우트 몇 개짜리 JSON API 에 맞는 가벼운 프레임워크. 타입이 좋고, 같은 앱을 나중에 Cloudflare Workers·Bun 등으로 옮기기도 쉽다.
- **SQLite (`node:sqlite`)** — 개인용 레시피 저장소라 단일 파일 DB 로 충분하다. Node 내장 모듈이라 Windows 에서 `better-sqlite3` 같은 네이티브 빌드가 필요 없다. 레시피는 JSON 문서로 저장하고 검색용 텍스트 컬럼만 따로 둔다.
- **tsx** — 서버 TS 를 빌드 없이 바로 실행·감시. 프론트와 `src/types` 를 그대로 공유한다.
- **youtubei.js** — API 키 없이 영상 제목·채널·설명·자막 트랙을 가져온다(유튜브 웹 클라이언트 내부 API).
- **Claude API (`claude-opus-5-5`)** — 구조화 출력(`output_config.format` + zod 스키마)으로 `RecipeDraft` 모양 JSON 을 강제한다. 거절 시 `fallbacks: "default"` 로 서버 측 대체 모델이 이어 받는다.
- **DeepSeek (대안)** — `ANTHROPIC_API_KEY` 가 없고 `DEEPSEEK_API_KEY` 가 있으면 OpenAI 호환 Chat Completions 를 fetch 로 호출한다(추가 패키지 없음). JSON 모드는 스키마를 강제하지 않으므로 프롬프트에 같은 zod 스키마의 JSON Schema 를 붙이고, 응답을 zod 로 다시 검증해 어긋나면 502 를 돌려준다.

## API 엔드포인트

모든 오류는 `{ "error": "사람이 읽을 메시지" }` 형태다. 화면(`src/api/index.ts`)은 이 메시지를 그대로 에러 UI 에 보여준다.

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| `GET /api/health` | | `{ ok, hasLlmKey }` |
| `GET /api/recipes?q=` | `q`: 제목·태그·재료 검색어 (공백 무시, 재료 동의어 포함) | `Recipe[]` 최신순 |
| `GET /api/recipes/:id` | | `Recipe` / 404 |
| `POST /api/recipes` | `RecipeDraft` | 201 `Recipe`. 제목·재료 1개 이상 필수(400). 빈 재료·단계는 버리고 id·단계 순서는 서버가 다시 매긴다 |
| `PUT /api/recipes/:id` | `RecipeDraft` | `Recipe` (`updatedAt` 갱신) / 404 |
| `DELETE /api/recipes/:id` | | 204 / 404 |
| `POST /api/extract` | `{ url }` | `ExtractionResult`. 400 잘못된 링크 · 404 볼 수 없는 영상 · 422 설명·자막 없음/레시피 아님 · 503 API 키 없음 · 502 유튜브·LLM 호출 실패 |
| `POST /api/extract/text` | `{ text }` | 자유 형식으로 적은 레시피 글 → 같은 형식의 `ExtractionResult` (`extractedFrom: ['text']`, `source` 없음). 400 10자 미만·20,000자 초과 · 422 레시피 아님 · 503/502 위와 같음 |
| `POST /api/recommendations` | `{ ingredients: string[], mustUse?: string[] }` | `Recommendation[]` 매칭률 내림차순, 매칭 0 제외 |
| `POST /api/recommendations/ai` | `{ ingredients: string[], mustUse?: string[] }` | `AiSuggestion[]` 저장 안 된 요리 최대 3개. LLM 호출. 400 재료 없음·60개/30자 초과 · 503 키 없음·잔액 부족 · 502 LLM 실패 |

### 유튜브 추출 흐름 (`server/youtube.ts`, `server/extract.ts`)
1. youtubei.js 로 제목·채널·길이·설명란과 자막 트랙 목록을 가져온다.
2. 자막은 한국어 수동 → 한국어 자동 생성 → 다른 언어 수동 → 다른 언어 자동 순으로 고른다.
3. 설명란과 `[m:ss] 자막` 을 Claude(또는 DeepSeek)에 넘겨 재료명 정규화·분량 문자열·단계별 `timestampSec` 을 받는다. 영상 길이를 넘는 시점은 버린다.
4. 설명란도 자막도 없으면 422, 모델이 레시피가 아니라고 판단하면 422 로 사람이 읽을 메시지를 돌려준다.
5. `extractedFrom` 은 모델이 실제로 근거로 쓴 자료, `warnings` 는 모델 경고 + 서버 경고(자막 못 가져옴, 자동 생성 자막 사용).

### 추천 규칙 (`server/recommend.ts`, `server/ingredients.ts`)
- 재료명은 비교할 때만 정규화한다: 괄호 설명·공백 제거, 소문자, 동의어 묶음(`계란=달걀`, `대파=파`, `밥=햇반`, `마늘=다진마늘` …). 저장된 이름은 원문 그대로 보여준다.
- 매칭률 = 냉장고에 있는 필수 재료 / 필수 재료. `optional` 재료는 계산에서 뺀다(모두 optional 이면 전체를 필수로 본다).
- **양념은 사용자에게 모두 있다고 본다.** `src/lib/ingredients.ts` 의 `seasonings`(물·소금·후추·설탕·식용유·간장·참기름·들기름·깨·깨소금·고춧가루·고추장·된장·식초·맛술·굴소스·물엿)는 매칭률 계산에서 빼고 부족한 재료로도 표시하지 않는다. 입력받지 않으며, 냉장고 화면에 안내 문구로만 보여준다. 재료가 전부 양념인 레시피는 전체로 계산한다.
- **꼭 넣을 재료**: 냉장고 재료 칩 중 고른 것(`mustUse`)이 **전부** 들어간 레시피만 추천한다(optional 로 들어가도 인정). 고르지 않으면 매칭 1개 이상인 레시피를 모두 보여준다. AI 추천에도 같은 조건을 프롬프트로 주고, 서버에서 한 번 더 거른다.
- 냉장고 재료 목록은 `useStoredList('fridge')` 로 이 브라우저 localStorage 에 기억한다. 꼭 넣을 재료 선택은 매번 새로 고른다.
- 대표 이름이 정확히 같을 때만 일치로 본다. 부분 일치는 `고추` ⊂ `고추장` 같은 오탐 때문에 쓰지 않는다.
- 정렬: 매칭률 → 일치 재료 수 → 최신순. 매칭 0 은 제외.

### AI 추천 (`server/aiRecommend.ts`, `server/llm.ts`)
- 냉장고 화면의 **AI에게 추천받기** 버튼을 눌렀을 때만 호출한다(자동 호출 없음, 비용 때문). 한 번에 3개, 이미 저장한 요리 제목은 프롬프트로 빼고 서버에서도 한 번 더 거른다.
- 모델이 재료·분량·조리 단계까지 돌려주고, 매칭률·있는/부족한 재료는 모델 말 대신 저장 레시피 추천과 같은 `matchIngredients` 규칙으로 서버가 계산한다. 매칭 0 은 뺀다.
- **내 레시피로 저장**을 누르면 그 draft 를 그대로 `POST /api/recipes` 로 저장하고 상세로 이동한다. 영상 출처가 없고 `AI추천` 태그가 붙는다.
- `server/llm.ts` 가 추출과 AI 추천의 LLM 호출을 맡는다: `ANTHROPIC_API_KEY` 가 있으면 Claude 구조화 출력, 없으면 DeepSeek JSON 모드 + zod 검증.

## 스타일 방식

**CSS Modules + 전역 CSS 변수(디자인 토큰)**. Tailwind 등 추가 의존성 없음.

- `src/styles/tokens.css` — 색·타이포·간격·radius·그림자·모션·레이아웃 토큰. 컴포넌트는 **이 변수만** 참조한다.
- **플랫(단색) 스타일**: 그라데이션·그림자·반투명·블러를 쓰지 않는다(`--shadow-*` 는 모두 `none`). 영상 썸네일이 없으면 `RecipeThumbnail` 이 영상 id 해시로 고른 단색 블록(초록·진초록·먹색·앰버) 위에 재료 알약 무늬를 그린다.
- 팔레트 "Fresh Neutral": 초록 기운이 살짝 도는 쿨 뉴트럴 바탕 + 강조색 허브 그린(`--color-primary` #12804f / 다크 #3ccb85) 하나. 본문·버튼 글자 대비는 라이트·다크 모두 WCAG AA(4.5:1) 이상이고, 포커스 링은 단색이다.
- 일러스트 전용 색 `--color-illo-*`(크림·빨강·주황·노랑·잎): 냉장고 일러스트에만 쓰고 UI 에는 쓰지 않는다.
- 서체: Pretendard Variable (`index.html` 에서 jsDelivr CDN 으로 로드, 실패 시 시스템 한글 서체).
- 디자인 시스템 문서(색·타이포·컴포넌트 사용 규칙과 미리보기): https://claude.ai/artifact/Tfu7utcNq7cfjZJQYQowVw — 토큰 이름이 CSS 변수 이름과 같다. 값의 원본은 이 코드의 `tokens.css` 이므로, 바꿀 땐 코드부터 바꾸고 문서를 맞춘다.
- `src/styles/global.css` — 리셋, 기본 요소 스타일, `.visually-hidden`, reduced-motion 처리.
- 컴포넌트별 `*.module.css`. 레시피 도메인 컴포넌트는 `recipe.module.css`(표시용)·`form.module.css`(입력용) 두 파일을 공유한다.
- 페이지 레이아웃은 `src/pages/pages.module.css` 한 파일.

### 다크 모드
- `<html data-theme="light|dark">` 로 강제, 속성이 없으면 OS 설정(`prefers-color-scheme`)을 따른다.
- 헤더 우측 버튼이 라이트 → 다크 → 시스템 순으로 순환 (`src/hooks/useTheme.ts`, localStorage `theme` 키).
- `index.html` 의 인라인 스크립트가 첫 페인트 전에 저장된 테마를 적용해 깜빡임을 막는다.

### 반응형
브레이크포인트 640 / 768 / 1024px. 767px 이하에서 상단 nav 가 **하단 탭바**로 바뀌고, 상세 페이지 2단 → 1단, 냉장고 페이지 좌우 → 상하로 바뀐다. 375px 폭에서 모든 화면·상태에 가로 스크롤이 없음을 확인했다.

## 화면 & 라우트

| 경로 | 페이지 | 내용 |
|---|---|---|
| `/` | `RecipeListPage` | 카드 그리드, 검색(250ms 디바운스, 이전 요청은 AbortController 로 취소), 로딩 스켈레톤, 빈 상태, 에러 |
| `/recipes/:id` | `RecipeDetailPage` | 유튜브 썸네일 → 클릭 시 iframe 임베드, 메타·태그, 원본 링크, 재료(데스크톱 sticky), 조리 단계(타임스탬프 → 영상 해당 시점 링크), 수정(같은 자리에서 `RecipeEditor` + 저장 바)·삭제(경고 박스로 한 번 더 확인 → 목록으로 이동) |
| `/add` | `AddRecipePage` | 3단계 스테퍼: URL 입력(유튜브 형식 검증) → 추출 중(진행 문구 + 스켈레톤) → 결과 미리보기·수정(`RecipeEditor`) + 하단 고정 저장 바(제목·재료 1개 이상 검사 → 저장 중 로딩 → 상세로 이동, 실패 시 저장 바 위 에러) |
| `/fridge` | `FridgePage` | 냉장고 모양 재료판 `FridgeBoard`(냉동칸의 둥근 2D 음식 일러스트 — hover 시 흔들림, 선반 위 재료 칩, 아래 야채칸의 넓은 입력: Enter·쉼표·넣기 버튼으로 추가, 쉼표로 여러 개, X·Backspace 삭제), 자주 쓰는 재료 빠른 추가, 꼭 넣을 재료 선택 칩, 양념 안내, 추천 카드(매칭률 바, 있는 재료/부족한 재료 칩), AI 추천 카드(`AiSuggestionCard`: 조리 순서 펼쳐 보기, 내 레시피로 저장) |
| `*` | `NotFoundPage` | 404 |

**상태 미리보기:** 어느 페이지든 URL 에 `?state=loading` / `?state=error` / `?state=empty` 를 붙이면 해당 상태 UI 를 강제로 볼 수 있다 (`src/hooks/usePreviewState.ts`). 필요 없어지면 각 페이지의 `usePreviewState()` 호출만 지우면 된다.

## 폴더 구조

```
server/              API 서버 (tsx 로 실행, server/tsconfig.json 으로 타입체크)
├─ index.ts          Hono 라우트, .env 로드, 에러 → { error } 변환
├─ db.ts             node:sqlite 저장소 (recipes 테이블: JSON 문서 + 검색 텍스트)
├─ validate.ts       RecipeDraft 검증·정리 (zod)
├─ youtube.ts        영상 정보·설명·자막 수집 (youtubei.js)
├─ llm.ts            LLM 호출 공통 (Claude 구조화 출력 / DeepSeek 중 키로 선택)
├─ deepseek.ts       DeepSeek JSON 모드 호출 + zod 검증
├─ extract.ts        영상 → 레시피 파싱
├─ recommend.ts      냉장고 추천 매칭 (저장 레시피)
├─ aiRecommend.ts    냉장고 재료 → AI 요리 제안
├─ ingredients.ts    재료명 정규화·동의어
└─ errors.ts         HttpError (화면에 보여줄 메시지 + 상태 코드)
data/recipes.db      SQLite 파일 (git 제외, 첫 실행 시 생성)

src/
├─ types/            도메인 타입 (Recipe, Ingredient, RecipeStep, RecipeDraft, ExtractionResult, Recommendation, AsyncStatus)
├─ api/index.ts      ★ 데이터 경계. 화면은 여기 함수만 호출한다. /api fetch + ApiError
├─ lib/              youtube.ts (videoId 파싱·썸네일/임베드/시점 URL·타임스탬프 포맷. 서버도 import),
│                    recipeDraft.ts (저장 전 필수값 검사), ingredients.ts (자주 쓰는 재료), cx.ts
├─ hooks/            useTheme, usePreviewState
├─ styles/           tokens.css, global.css
├─ components/
│  ├─ ui/            범용: Button(+ButtonLink, ButtonAnchor), Input, Textarea, Chip, Card,
│  │                 EmptyState, Skeleton, SkeletonText, Spinner, ErrorMessage, Icon
│  ├─ layout/        AppLayout(헤더·nav·하단 탭바·테마 토글), PageHeader
│  └─ recipe/        도메인: RecipeCard(+Skeleton), RecipeThumbnail, RecipeMeta, YoutubeEmbed,
│                    IngredientList, StepList, RecipeEditor, FridgeBoard,
│                    RecommendationCard(+Skeleton), MatchMeter
└─ pages/            라우트별 화면 4개 + NotFound
```

경로 별칭: `@/` → `src/` (tsconfig `paths` + vite `resolve.alias`).

### 타입 요약 (`src/types/recipe.ts`)
- `Recipe` — id, title, description?, servings?, cookTimeMinutes?, difficulty?, tags, ingredients, steps, source?, createdAt
- `Ingredient` — id, name(정규화된 재료명, 추천 매칭 키), amount?(문자열), optional?
- `RecipeStep` — id, order(1부터), description, timestampSec?
- `YoutubeSource` — url, videoId, videoTitle?, channelName?, thumbnailUrl?
- `RecipeDraft` = `Recipe` 에서 id/createdAt/updatedAt 제외 (저장 전 편집용)
- `ExtractionResult` — draft, extractedFrom(`description|captions|comments`[]), warnings
- `Recommendation` — recipe, matchRate(0~1), matchedIngredients, missingIngredients
- `AiSuggestion` — draft(`RecipeDraft`), matchRate, matchedIngredients, missingIngredients

## 남은 TODO

- **자막 수집이 대부분 실패한다.** 자막 트랙 목록은 받아오지만, 2026-10 현재 유튜브가 자막 본문 요청(timedtext)에 PO 토큰을 요구해 빈 응답을 준다. 이 경우 설명란만으로 추출하고 경고를 띄운다. 설명란에 레시피가 없는 영상은 정확도가 떨어진다. 해결하려면 공식 YouTube Data API(captions.download 는 영상 소유자만 가능)나 별도 자막 서비스 등 정식 경로를 검토할 것. 봇 검사 우회는 하지 않는다.
- **추출 진행 표시**는 아직 연출용 타이머다(`AddRecipePage` 의 `ExtractingCard`). 실제로는 영상 수집 수 초 + Claude 호출 수십 초가 걸린다. 서버가 SSE 로 단계를 보내면 그 값으로 바꾼다.
- **추천 동의어 사전**(`server/ingredients.ts`)은 손으로 쓴 최소 목록이다. 많이 쓰는 재료부터 늘리거나, 저장 시 Claude 로 대표 이름을 붙이는 방법이 있다.
- **수정 화면 이탈 경고 없음.** 수정 중 다른 페이지로 가면 변경 내용이 사라진다.
- **로그인·다중 사용자 없음.** 단일 사용자 로컬 앱 기준이다. 배포하려면 인증과 `/api/extract` 사용량 제한(Claude 비용)이 먼저 필요하다.
- **배포 빌드 미정.** `npm run build` 는 프론트 정적 파일만 만든다. 운영에서는 `npm start` 로 API 서버를 띄우고 `dist/` 를 같은 출처에서 서빙(또는 리버스 프록시로 `/api` 연결)해야 한다.
- 상태 미리보기(`?state=`)는 개발용으로 남겨 뒀다. 필요 없어지면 각 페이지의 `usePreviewState()` 호출을 지운다.
