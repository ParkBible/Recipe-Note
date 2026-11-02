import { Link } from 'react-router-dom';
import type { Recipe } from '@/types';
import { Card, Chip, Skeleton, SkeletonText } from '@/components/ui';
import { HealthBadges } from './HealthReview';
import { RecipeMeta } from './RecipeMeta';
import { RecipeThumbnail } from './RecipeThumbnail';
import styles from './recipe.module.css';

const MAX_INGREDIENT_CHIPS = 4;

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const shown = recipe.ingredients.slice(0, MAX_INGREDIENT_CHIPS);
  const rest = recipe.ingredients.length - shown.length;
  const created = new Date(recipe.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

  return (
    <Card as="article" padding="none" interactive>
      <Link to={`/recipes/${recipe.id}`} className={styles.cardLink}>
        <RecipeThumbnail source={recipe.source} imageId={recipe.imageId} title={recipe.title} showPlay />
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{recipe.title}</h3>
          <RecipeMeta recipe={recipe} />
          {recipe.health && (
            <div className={styles.chipRow} aria-label="건강 평가 (10점 만점)">
              <HealthBadges health={recipe.health} />
            </div>
          )}
          {recipe.description && <p className={styles.cardDescription}>{recipe.description}</p>}
          <div className={styles.chipRow} aria-label="주요 재료">
            {shown.map((i) => (
              <Chip key={i.id} size="sm">
                {i.name}
              </Chip>
            ))}
            {rest > 0 && (
              <Chip size="sm" tone="outline">
                +{rest}
              </Chip>
            )}
          </div>
          <div className={styles.cardFooter}>
            <span className={styles.channel}>{recipe.source?.channelName ?? '직접 입력'}</span>
            <time dateTime={recipe.createdAt}>{created}</time>
          </div>
        </div>
      </Link>
    </Card>
  );
}

export function RecipeCardSkeleton() {
  return (
    <Card padding="none" aria-hidden>
      <Skeleton height="auto" radius={0} style={{ aspectRatio: '16 / 9' }} />
      <div className={styles.cardBody}>
        <Skeleton height={22} width="75%" />
        <Skeleton height={14} width="45%" />
        <SkeletonText lines={2} />
        <div className={styles.chipRow}>
          {[48, 56, 40].map((w) => (
            <Skeleton key={w} width={w} height={24} radius={999} />
          ))}
        </div>
      </div>
    </Card>
  );
}
