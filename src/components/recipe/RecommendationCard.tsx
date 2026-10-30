import { Link } from 'react-router-dom';
import type { Recommendation } from '@/types';
import { cx } from '@/lib/cx';
import { Card, Chip, Icon, Skeleton, SkeletonText } from '@/components/ui';
import { RecipeMeta } from './RecipeMeta';
import { RecipeThumbnail } from './RecipeThumbnail';
import styles from './recipe.module.css';

export function MatchMeter({ rate }: { rate: number }) {
  const percent = Math.round(rate * 100);
  const tone = rate >= 0.8 ? styles.matchHigh : rate >= 0.5 ? styles.matchMid : styles.matchLow;
  return (
    <div className={cx(styles.match, tone)}>
      <div className={styles.matchHead}>
        <span>재료 매칭률</span>
        <span className={styles.matchValue}>{percent}%</span>
      </div>
      <div
        className={styles.matchTrack}
        role="meter"
        aria-label="재료 매칭률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={styles.matchFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** 있는 재료 / 부족한 재료 칩 묶음. 저장 레시피 추천과 AI 추천 카드가 함께 쓴다 */
export function MatchGroups({ matched, missing }: { matched: string[]; missing: string[] }) {
  return (
    <div className={styles.recGroups}>
      <div>
        <p className={styles.recGroupLabel}>
          <Icon name="check" size={14} />
          있는 재료 {matched.length}
        </p>
        <div className={styles.chipRow}>
          {matched.map((name) => (
            <Chip key={name} size="sm" tone="success">
              {name}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className={styles.recGroupLabel}>
          <Icon name="alert" size={14} />
          부족한 재료 {missing.length}
        </p>
        {missing.length ? (
          <div className={styles.chipRow}>
            {missing.map((name) => (
              <Chip key={name} size="sm" tone="outline">
                {name}
              </Chip>
            ))}
          </div>
        ) : (
          <p className={styles.recComplete}>바로 만들 수 있어요!</p>
        )}
      </div>
    </div>
  );
}

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const { recipe, matchRate, matchedIngredients, missingIngredients } = recommendation;
  const href = `/recipes/${recipe.id}`;

  return (
    <Card as="article" padding="none" className={styles.recCard}>
      <Link to={href} className={styles.recThumbLink} tabIndex={-1} aria-hidden>
        <RecipeThumbnail source={recipe.source} title={recipe.title} className={styles.recThumb} />
      </Link>
      <div className={styles.recBody}>
        <div className={styles.recTitleRow}>
          <h3 className={styles.recTitle}>
            <Link to={href}>{recipe.title}</Link>
          </h3>
          <RecipeMeta recipe={recipe} />
        </div>

        <MatchMeter rate={matchRate} />

        <MatchGroups matched={matchedIngredients} missing={missingIngredients} />
      </div>
    </Card>
  );
}

export function RecommendationCardSkeleton() {
  return (
    <Card padding="none" className={styles.recCard} aria-hidden>
      <Skeleton height="100%" radius={0} className={styles.recThumb} />
      <div className={styles.recBody}>
        <Skeleton height={22} width="55%" />
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
