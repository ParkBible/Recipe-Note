import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiSuggestion, AsyncStatus, Recommendation } from '@/types';
import { recommendRecipes, saveRecipe, suggestRecipesWithAi } from '@/api';
import { seasonings } from '@/lib/ingredients';
import { useStoredList } from '@/hooks/useStoredList';
import { usePreviewState } from '@/hooks/usePreviewState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, EmptyState, ErrorMessage } from '@/components/ui';
import {
  AiSuggestionCard,
  AiSuggestionCardSkeleton,
  FridgeBoard,
  RecommendationCard,
  RecommendationCardSkeleton,
} from '@/components/recipe';
import styles from './pages.module.css';

export function FridgePage() {
  const preview = usePreviewState();
  // 냉장고에는 있는 재료를 모두 넣어 두고, 이 브라우저에 기억한다
  const [ingredients, setIngredients] = useStoredList('fridge', ['계란', '대파', '토마토', '김치', '밥']);
  // 꼭 넣을 재료. 냉장고에서 빠진 재료는 자동으로 빠진다
  const [mustUseRaw, setMustUse] = useState<string[]>([]);
  const mustUse = mustUseRaw.filter((name) => ingredients.includes(name));
  const toggleMustUse = (name: string) =>
    setMustUse((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  const [results, setResults] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const navigate = useNavigate();


  // AI 추천은 API 비용이 들어서 버튼을 눌렀을 때만 부른다
  const [aiResults, setAiResults] = useState<AiSuggestion[]>([]);
  const [aiStatus, setAiStatus] = useState<AsyncStatus>('idle');
  const [aiError, setAiError] = useState<string>();
  const aiInflight = useRef<AbortController>();
  useEffect(() => () => aiInflight.current?.abort(), []);

  const suggestWithAi = async () => {
    aiInflight.current?.abort();
    const controller = new AbortController();
    aiInflight.current = controller;
    setAiStatus('loading');
    setAiError(undefined);
    try {
      setAiResults(await suggestRecipesWithAi(ingredients, mustUse, { signal: controller.signal }));
      setAiStatus('success');
    } catch (e) {
      if (controller.signal.aborted) return;
      setAiError(e instanceof Error ? e.message : undefined);
      setAiStatus('error');
    }
  };

  const saveSuggestion = async ({ draft }: AiSuggestion) => {
    const saved = await saveRecipe(draft);
    navigate(`/recipes/${saved.id}`);
  };

  const recommend = async () => {
    setStatus('loading');
    try {
      setResults(await recommendRecipes(ingredients, mustUse));
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const viewStatus: AsyncStatus = preview === 'loading' ? 'loading' : preview === 'error' ? 'error' : status;
  const items = preview === 'empty' ? [] : results;

  return (
    <>
      <PageHeader title="냉장고 추천" description="지금 있는 재료로 만들 수 있는 요리를 찾아드려요." />

      <div className={styles.fridgeLayout}>
        <div className={styles.fridgePanel}>
          <FridgeBoard value={ingredients} onChange={setIngredients} mustUse={mustUse} onToggleMustUse={toggleMustUse} />
          <p className={styles.resultCount}>양념({seasonings.join('·')})은 있다고 치고 계산에서 빼요.</p>
          <Button
            size="lg"
            icon="sparkle"
            block
            onClick={() => void recommend()}
            loading={viewStatus === 'loading'}
            disabled={!ingredients.length}
          >
            {viewStatus === 'success' ? '다시 추천받기' : '요리 추천받기'}
          </Button>
          {ingredients.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setIngredients([])}>
              냉장고 비우기
            </Button>
          )}
        </div>

        <section className={styles.results} aria-labelledby="results-title" aria-busy={viewStatus === 'loading'}>
          <div className={styles.resultsHead}>
            <h2 id="results-title" className={styles.resultsTitle}>
              추천 요리
            </h2>
            {viewStatus === 'success' && <span className={styles.resultCount}>매칭률 높은 순 · {items.length}개</span>}
          </div>

          {viewStatus === 'idle' && (
            <EmptyState
              icon="fridge"
              title="냉장고 속 재료를 알려주세요"
              description="재료를 입력하고 '요리 추천받기'를 누르면 저장한 레시피 중 만들 수 있는 요리를 보여드려요."
            />
          )}

          {viewStatus === 'loading' && Array.from({ length: 3 }, (_, i) => <RecommendationCardSkeleton key={i} />)}

          {viewStatus === 'error' && (
            <ErrorMessage title="추천을 불러오지 못했어요" onRetry={() => void recommend()}>
              잠시 후 다시 시도해 주세요.
            </ErrorMessage>
          )}

          {viewStatus === 'success' &&
            (items.length ? (
              items.map((rec) => <RecommendationCard key={rec.recipe.id} recommendation={rec} />)
            ) : (
              <EmptyState
                icon="search"
                title="만들 수 있는 요리를 찾지 못했어요"
                description="재료를 더 추가하거나 레시피를 더 저장해 보세요."
              />
            ))}

          <div className={styles.resultsHead}>
            <h2 id="ai-results-title" className={styles.resultsTitle}>
              AI 추천 요리
            </h2>
            {aiStatus === 'success' && <span className={styles.resultCount}>저장하지 않은 새 요리 · {aiResults.length}개</span>}
          </div>

          <div className={styles.results} aria-labelledby="ai-results-title" aria-busy={aiStatus === 'loading'}>
            {aiStatus === 'idle' && (
              <EmptyState
                compact
                icon="sparkle"
                title="저장 안 된 요리도 찾아볼까요?"
                description="AI가 지금 재료로 만들 만한 요리 3개를 제안해요. 누를 때마다 AI를 한 번 호출해요."
                action={
                  <Button variant="secondary" icon="sparkle" onClick={() => void suggestWithAi()} disabled={!ingredients.length}>
                    AI에게 추천받기
                  </Button>
                }
              />
            )}

            {aiStatus === 'loading' && Array.from({ length: 2 }, (_, i) => <AiSuggestionCardSkeleton key={i} />)}

            {aiStatus === 'error' && (
              <ErrorMessage title="AI 추천을 받지 못했어요" onRetry={() => void suggestWithAi()}>
                {aiError ?? '잠시 후 다시 시도해 주세요.'}
              </ErrorMessage>
            )}

            {aiStatus === 'success' && (
              <>
                {aiResults.length ? (
                  aiResults.map((s) => <AiSuggestionCard key={s.draft.title} suggestion={s} onSave={saveSuggestion} />)
                ) : (
                  <EmptyState
                    compact
                    icon="search"
                    title="AI가 알맞은 요리를 찾지 못했어요"
                    description="재료를 바꾸거나 더 추가해서 다시 시도해 보세요."
                  />
                )}
                <Button variant="ghost" icon="refresh" onClick={() => void suggestWithAi()} disabled={!ingredients.length}>
                  다른 요리 제안받기
                </Button>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
