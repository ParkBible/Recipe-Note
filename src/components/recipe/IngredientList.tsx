import type { Ingredient } from '@/types';
import { Chip } from '@/components/ui';
import styles from './recipe.module.css';

export function IngredientList({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <ul className={styles.ingredientList}>
      {ingredients.map((i) => (
        <li key={i.id}>
          <span className={styles.ingredientName}>
            {i.name}
            {i.optional && (
              <Chip size="sm" tone="outline">
                선택
              </Chip>
            )}
          </span>
          <span className={styles.ingredientAmount}>{i.amount ?? '적당량'}</span>
        </li>
      ))}
    </ul>
  );
}
