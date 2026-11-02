import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AsyncStatus, Recipe, RecipeDraft } from '@/types';
import { deleteRecipe, evaluateRecipeHealth, getRecipe, updateRecipe } from '@/api';
import { onRecipesChanged } from '@/data/db';
import { validateDraft } from '@/lib/recipeDraft';
import { usePreviewState } from '@/hooks/usePreviewState';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonAnchor, Button, ButtonLink, Card, Chip, EmptyState, ErrorMessage, Icon, Skeleton, SkeletonText } from '@/components/ui';
import { HealthPanel, IngredientList, RecipeEditor, RecipeMeta, StepList, YoutubeEmbed } from '@/components/recipe';
import recipeStyles from '@/components/recipe/recipe.module.css';
import styles from './pages.module.css';

export function RecipeDetailPage() {
  const { id = '' } = useParams();
  const preview = usePreviewState();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState<AsyncStatus>('loading');

  const navigate = useNavigate();
  // 수정 중인 사본. 있으면 상세 대신 편집 폼을 보여준다
  const [editDraft, setEditDraft] = useState<RecipeDraft>();
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [evaluating, setEvaluating] = useState(false);
  const [healthError, setHealthError] = useState<string>();

  const load = useCallback(() => {
    const controller = new AbortController();
    setStatus('loading');
    getRecipe(id, { signal: controller.signal })
      .then((r) => {
        setRecipe(r);
        setStatus('success');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [id]);

  useEffect(load, [load]);

  // 다른 기기에서 고친 내용이 동기화로 들어오면 다시 읽는다. 수정 중일 때는 입력을 덮지 않도록 건너뛴다
  useEffect(() => onRecipesChanged((source) => source === 'remote' && !editDraft && load()), [editDraft, load]);

  const handleEdit = () => {
    if (!recipe) return;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = recipe;
    setEditDraft(structuredClone(draft));
    setEditError(undefined);
    setConfirmingDelete(false);
  };

  const handleEditSave = async () => {
    if (!editDraft || saving) return;
    const invalid = validateDraft(editDraft);
    if (invalid) {
      setEditError(invalid);
      return;
    }
    setSaving(true);
    setEditError(undefined);
    try {
      setRecipe(await updateRecipe(id, editDraft));
      setEditDraft(undefined);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleEvaluate = async () => {
    if (!recipe || evaluating) return;
    setEvaluating(true);
    setHealthError(undefined);
    try {
      const health = await evaluateRecipeHealth(recipe);
      // 평가하는 동안 동기화로 바뀌었을 수 있어 최신 레시피에 평가만 붙인다
      const latest = (await getRecipe(id)) ?? recipe;
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = latest;
      setRecipe(await updateRecipe(id, { ...draft, health }));
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : '평가하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleDelete = () => {
    setDeleteError(undefined);
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteRecipe(id);
      navigate('/', { replace: true });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '삭제하지 못했어요. 다시 시도해 주세요.');
      setDeleting(false);
    }
  };

  const viewStatus: AsyncStatus = preview === 'loading' ? 'loading' : preview === 'error' ? 'error' : status;
  const back = (
    <Link to="/" className={styles.back}>
      <Icon name="arrowLeft" size={16} />
      목록으로
    </Link>
  );

  if (viewStatus === 'loading') return <>{back}<DetailSkeleton /></>;

  if (viewStatus === 'error') {
    return (
      <>
        {back}
        <ErrorMessage title="레시피를 불러오지 못했어요" onRetry={load} />
      </>
    );
  }

  if (!recipe || preview === 'empty') {
    return (
      <>
        {back}
        <EmptyState
          icon="search"
          title="레시피를 찾을 수 없어요"
          description="삭제되었거나 주소가 잘못되었을 수 있어요."
          action={<ButtonLink to="/" variant="secondary">목록으로 돌아가기</ButtonLink>}
        />
      </>
    );
  }

  const { source } = recipe;

  if (editDraft) {
    return (
      <div className={styles.narrow}>
        {back}
        <PageHeader title="레시피 수정" />
        <Card padding="lg">
          <RecipeEditor value={editDraft} onChange={setEditDraft} />
        </Card>
        {editError && (
          <ErrorMessage title="수정한 내용을 저장하지 못했어요" className={styles.formError}>
            {editError}
          </ErrorMessage>
        )}
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>수정을 마쳤다면 저장하세요.</span>
          <div className={styles.saveBarActions}>
            <Button variant="ghost" onClick={() => setEditDraft(undefined)} disabled={saving}>
              취소
            </Button>
            <Button icon="check" onClick={() => void handleEditSave()} loading={saving}>
              저장
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <article>
      {back}
      <div className={styles.detailHero}>
        <YoutubeEmbed source={source} imageId={recipe.imageId} title={recipe.title} />
        <div className={styles.detailInfo}>
          <h1 className={styles.detailTitle}>{recipe.title}</h1>
          <RecipeMeta recipe={recipe} />
          {recipe.description && <p className={styles.detailDescription}>{recipe.description}</p>}
          {recipe.tags.length > 0 && (
            <div className={styles.chips}>
              {recipe.tags.map((t) => (
                <Chip key={t} tone="primary" size="sm">
                  #{t}
                </Chip>
              ))}
            </div>
          )}
          {source && (
            <div className={styles.sourceBox}>
              <span className={styles.sourceLabel}>원본 영상</span>
              <div>
                <p className={styles.sourceTitle}>{source.videoTitle ?? '유튜브 영상'}</p>
                {source.channelName && <p className={styles.sourceChannel}>{source.channelName}</p>}
              </div>
              <ButtonAnchor href={source.url} variant="secondary" size="sm" icon="external">
                유튜브에서 보기
              </ButtonAnchor>
            </div>
          )}
          {confirmingDelete ? (
            <ErrorMessage tone="warning" title="이 레시피를 삭제할까요?">
              <p>삭제하면 되돌릴 수 없어요.</p>
              {deleteError && <p>{deleteError}</p>}
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  취소
                </Button>
                <Button variant="danger" size="sm" icon="trash" onClick={() => void confirmDelete()} loading={deleting}>
                  삭제하기
                </Button>
              </div>
            </ErrorMessage>
          ) : (
            <div className={styles.actions}>
              <Button variant="secondary" size="sm" icon="edit" onClick={handleEdit}>
                수정
              </Button>
              <Button variant="danger" size="sm" icon="trash" onClick={handleDelete}>
                삭제
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.detailBody}>
        <Card as="section" padding="lg" className={styles.sticky} aria-labelledby="ingredients-title">
          <h2 id="ingredients-title" className={recipeStyles.sectionTitle}>
            재료
            <span className={recipeStyles.sectionCount}>
              {recipe.servings ? `${recipe.servings}인분 · ` : ''}
              {recipe.ingredients.length}개
            </span>
          </h2>
          <IngredientList ingredients={recipe.ingredients} />
        </Card>
        <section aria-labelledby="steps-title">
          <h2 id="steps-title" className={recipeStyles.sectionTitle}>
            조리 순서
            <span className={recipeStyles.sectionCount}>{recipe.steps.length}단계</span>
          </h2>
          <StepList steps={recipe.steps} videoId={source?.videoId} />
        </section>
      </div>

      <Card padding="lg" className={styles.healthCard}>
        <HealthPanel
          health={recipe.health}
          ingredients={recipe.ingredients}
          onEvaluate={() => void handleEvaluate()}
          evaluating={evaluating}
          error={healthError}
        />
      </Card>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="레시피 불러오는 중">
      <div className={styles.detailHero}>
        <Skeleton height="auto" radius="var(--radius-lg)" style={{ aspectRatio: '16 / 9' }} />
        <div className={styles.detailInfo}>
          <Skeleton height={36} width="80%" />
          <Skeleton height={16} width="40%" />
          <SkeletonText lines={3} lineHeight={16} />
        </div>
      </div>
      <div className={styles.detailBody}>
        <Card padding="lg">
          <SkeletonText lines={6} lineHeight={18} />
        </Card>
        <SkeletonText lines={5} lineHeight={18} />
      </div>
    </div>
  );
}
