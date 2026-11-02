/**
 * 도메인 타입. 화면·목업·API 스텁이 모두 이 타입만 바라본다.
 * 백엔드 응답 스키마가 정해지면 여기부터 맞추고, 컴파일 에러를 따라 화면을 고친다.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Ingredient {
  id: string;
  /** 정규화된 재료명. 냉장고 추천 매칭의 키로 쓴다 (예: "대파") */
  name: string;
  /** 사람이 읽는 분량 문자열 (예: "1/2대", "2큰술"). 파싱 실패 시 비워 둔다 */
  amount?: string;
  /** 선택 재료 여부. 추천 매칭률 계산에서 제외할 수 있다 */
  optional?: boolean;
}

export interface RecipeStep {
  id: string;
  /** 1부터 시작 */
  order: number;
  description: string;
  /** 해당 단계가 나오는 영상 위치(초). 자막 타임스탬프에서 추출 */
  timestampSec?: number;
}

export interface YoutubeSource {
  type: 'youtube';
  url: string;
  videoId: string;
  videoTitle?: string;
  channelName?: string;
  /** 없으면 UI가 videoId 로 기본 썸네일을 만들거나 플레이스홀더를 보여준다 */
  thumbnailUrl?: string;
}

export type RecipeSource = YoutubeSource;

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  servings?: number;
  cookTimeMinutes?: number;
  difficulty?: Difficulty;
  tags: string[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
  source?: RecipeSource;
  /** 직접 올린 대표 사진. 이미지 본문은 IndexedDB images 테이블과 드라이브 별도 파일에 있다 (data/images.ts) */
  imageId?: string;
  /** ISO 8601 */
  createdAt: string;
  updatedAt?: string;
}

/** 저장 전(추출 결과 미리보기·수정 단계)의 레시피. id/생성일은 서버가 붙인다 */
export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;

/** 유튜브 링크 → 레시피 추출 결과 */
export interface ExtractionResult {
  draft: RecipeDraft;
  /** 어디서 추출했는지. UI에 출처 배지로 노출 */
  extractedFrom: Array<'description' | 'captions' | 'comments' | 'text'>;
  /** 사용자가 확인해야 할 점 (예: "분량이 표기되지 않은 재료가 있어요") */
  warnings: string[];
}

/** 냉장고 재료 기반 추천 결과 한 건 */
export interface Recommendation {
  recipe: Recipe;
  /** 0~1. UI는 % 로 반올림해 보여준다 */
  matchRate: number;
  /** 냉장고에 있는 재료 (레시피 재료명 기준) */
  matchedIngredients: string[];
  /** 부족한 재료 */
  missingIngredients: string[];
}

/** 냉장고 재료로 AI 가 제안한, 아직 저장하지 않은 요리 한 건. 매칭 값은 Recommendation 과 같은 규칙으로 서버가 계산한다 */
export interface AiSuggestion extends Omit<Recommendation, 'recipe'> {
  /** 그대로 saveRecipe 에 넘겨 내 레시피로 저장할 수 있다 (영상 출처 없음) */
  draft: RecipeDraft;
}

/** 화면 비동기 상태 공통 표기 */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
