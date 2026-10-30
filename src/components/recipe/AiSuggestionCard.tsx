import { useId, useState } from 'react';
import type { AiSuggestion } from '@/types';
import { Button, Card, Chip, ErrorMessage, Skeleton, SkeletonText } from '@/components/ui';
import { MatchGroups, MatchMeter } from './RecommendationCard';
import { RecipeMeta } from './RecipeMeta';
import { StepList } from './StepList';
import styles from './recipe.module.css';

interface AiSuggestionCardProps {
  suggestion: AiSuggestion;
  /** 내 레시피로 저장. 성공하면 보통 상세 화면으로 이동한다 */
  onSave: (suggestion: AiSuggestion) => Promise<void>;
}

/** AI 가 제안한 저장 안 된 요리. 영상이 없으므로 썸네일 대신 조리 순서를 펼쳐 볼 수 있게 한다 */
export function AiSuggestionCard({ suggestion, onSave }: AiSuggestionCardProps) {
  const { draft, matchRate, matchedIngredients, missingIngredients } = suggestion;
  const [showSteps, setShowSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const stepsId = useId();

  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await onSave(suggestion);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  };

  return (
    <Card as="article" padding="none">
      <div className={styles.recBody}>
        <div className={styles.recTitleRow}>
          <div className={styles.aiTitleRow}>
            <h3 className={styles.recTitle}>{draft.title}</h3>
            <Chip size="sm" tone="primary" icon="sparkle">
              AI 제안
            </Chip>
          </div>
          <RecipeMeta recipe={draft} />
          {draft.description && <p className={styles.aiDescription}>{draft.description}</p>}
        </div>

        <MatchMeter rate={matchRate} />
        <MatchGroups matched={matchedIngredients} missing={missingIngredients} />

        {showSteps && (
          <div id={stepsId}>
            <StepList steps={draft.steps} />
          </div>
        )}

        {saveError && <ErrorMessage title="레시피를 저장하지 못했어요">{saveError}</ErrorMessage>}

        <div className={styles.aiActions}>
          <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)} aria-expanded={showSteps} aria-controls={stepsId}>
            {showSteps ? '조리 순서 접기' : `조리 순서 보기 (${draft.steps.length}단계)`}
          </Button>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => void save()} loading={saving}>
            내 레시피로 저장
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function AiSuggestionCardSkeleton() {
  return (
    <Card padding="none" aria-hidden>
      <div className={styles.recBody}>
        <Skeleton height={22} width="45%" />
        <SkeletonText lines={2} lineHeight={10} />
        <div className={styles.chipRow}>
          {[44, 52, 40, 60].map((w) => (
            <Skeleton key={w} width={w} height={24} radius={999} />
          ))}
        </div>
      </div>
    </Card>
  );
}
