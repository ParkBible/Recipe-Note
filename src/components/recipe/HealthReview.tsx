import type { HealthReview, HealthScore, Ingredient } from '@/types';
import { isHealthStale, scoreLevel, type ScoreLevel } from '@/lib/health';
import { cx } from '@/lib/cx';
import { Button, Chip } from '@/components/ui';
import type { ChipTone } from '@/components/ui/Chip';
import styles from './HealthReview.module.css';

const ASPECTS = [
  { key: 'bloodSugar', label: '혈당', short: '혈당' },
  { key: 'diet', label: '다이어트', short: '다이어트' },
] as const;

const CHIP_TONE: Record<ScoreLevel, ChipTone> = { good: 'success', fair: 'neutral', poor: 'warning' };

/** 목록 카드용 작은 점수 배지 */
export function HealthBadges({ health }: { health?: HealthReview }) {
  if (!health) return null;
  return (
    <>
      {ASPECTS.map(({ key, short }) => (
        <Chip key={key} size="sm" tone={CHIP_TONE[scoreLevel(health[key])]}>
          {short} {health[key].score}
        </Chip>
      ))}
    </>
  );
}

export interface HealthPanelProps {
  health?: HealthReview;
  ingredients: Ingredient[];
  /** 주면 평가하기/다시 평가 버튼을 보여준다 */
  onEvaluate?: () => void;
  evaluating?: boolean;
  error?: string;
  className?: string;
}

export function HealthPanel({ health, ingredients, onEvaluate, evaluating, error, className }: HealthPanelProps) {
  const stale = health ? isHealthStale(health, ingredients) : false;

  return (
    <section className={cx(styles.panel, className)} aria-labelledby="health-title">
      <div className={styles.head}>
        <h2 id="health-title" className={styles.title}>
          건강 평가
        </h2>
        {onEvaluate && (
          <Button variant="secondary" size="sm" icon="sparkle" loading={evaluating} onClick={onEvaluate}>
            {health ? '다시 평가' : '평가하기'}
          </Button>
        )}
      </div>

      {health ? (
        <ul className={styles.list}>
          {ASPECTS.map(({ key, label }) => (
            <ScoreRow key={key} label={label} value={health[key]} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>아직 평가하지 않았어요.</p>
      )}

      {stale && <p className={styles.notice}>평가한 뒤 재료가 바뀌었어요. 다시 평가해 보세요.</p>}
      {error && <p className={styles.error}>{error}</p>}
      <p className={styles.disclaimer}>AI 가 재료로 추정한 1인분 기준 참고용 점수예요.</p>
    </section>
  );
}

function ScoreRow({ label, value }: { label: string; value: HealthScore }) {
  const level = scoreLevel(value);
  return (
    <li className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.label}>{label}</span>
        <span className={cx(styles.score, styles[level])}>
          {value.score}
          <span className={styles.outOf}>/10</span>
        </span>
      </div>
      <div className={styles.bar} aria-hidden>
        <span className={cx(styles.fill, styles[level])} style={{ width: `${value.score * 10}%` }} />
      </div>
      <p className={styles.reason}>{value.reason}</p>
    </li>
  );
}
