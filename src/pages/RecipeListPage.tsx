import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncStatus, Recipe } from '@/types';
import { listRecipes } from '@/api';
import { usePreviewState } from '@/hooks/usePreviewState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink, EmptyState, ErrorMessage, Input } from '@/components/ui';
import { RecipeCard, RecipeCardSkeleton } from '@/components/recipe';
import recipeStyles from '@/components/recipe/recipe.module.css';
import styles from './pages.module.css';

export function RecipeListPage() {
  const preview = usePreviewState();
  const [query, setQuery] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [status, setStatus] = useState<AsyncStatus>('loading');

  const inflight = useRef<AbortController>();

  // 새 요청을 보내면 이전 요청은 취소해서, 늦게 도착한 옛 검색 결과가 화면을 덮어쓰지 않게 한다
  const load = useCallback((q: string) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setStatus('loading');
    listRecipes(q, { signal: controller.signal })
      .then((data) => {
        setRecipes(data);
        setStatus('success');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
  }, []);

  // 검색어 입력 후 250ms 디바운스
  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  useEffect(() => () => inflight.current?.abort(), []);

  const viewStatus: AsyncStatus = preview === 'loading' ? 'loading' : preview === 'error' ? 'error' : status;
  const items = preview === 'empty' ? [] : recipes;

  return (
    <>
      <PageHeader
        title="내 레시피"
        description="유튜브에서 모은 레시피를 한곳에서 꺼내 보세요."
        actions={
          <ButtonLink to="/add" icon="plus">
            유튜브로 추가
          </ButtonLink>
        }
      />

      <div className={styles.toolbar} role="search">
        <Input
          fieldClassName={styles.search}
          type="search"
          icon="search"
          label="레시피 검색"
          hideLabel
          placeholder="요리 이름, 재료, 태그로 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {viewStatus === 'success' && <span className={styles.resultCount}>{items.length}개</span>}
      </div>

      {viewStatus === 'loading' && (
        <div className={recipeStyles.grid} aria-busy="true" aria-label="레시피 불러오는 중">
          {Array.from({ length: 6 }, (_, i) => (
            <RecipeCardSkeleton key={i} />
          ))}
        </div>
      )}

      {viewStatus === 'error' && (
        <ErrorMessage title="레시피를 불러오지 못했어요" onRetry={() => load(query)}>
          네트워크 상태를 확인하고 다시 시도해 주세요.
        </ErrorMessage>
      )}

      {viewStatus === 'success' &&
        (items.length ? (
          <div className={recipeStyles.grid}>
            {items.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        ) : query ? (
          <EmptyState
            icon="search"
            title={`'${query}' 검색 결과가 없어요`}
            description="다른 요리 이름이나 재료로 검색해 보세요."
          />
        ) : (
          <EmptyState
            title="아직 저장한 레시피가 없어요"
            description="유튜브 요리 영상 링크만 붙여넣으면 재료와 조리 순서를 정리해 드려요."
            action={
              <ButtonLink to="/add" icon="plus">
                첫 레시피 추가하기
              </ButtonLink>
            }
          />
        ))}
    </>
  );
}
