import type { Difficulty, Recipe } from '@/types';
import { Icon } from '@/components/ui';
import styles from './recipe.module.css';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };

/** 조리시간 · 인분 · 난이도 한 줄 */
export function RecipeMeta({ recipe }: { recipe: Pick<Recipe, 'cookTimeMinutes' | 'servings' | 'difficulty'> }) {
  const { cookTimeMinutes, servings, difficulty } = recipe;
  if (!cookTimeMinutes && !servings && !difficulty) return null;
  return (
    <ul className={styles.meta}>
      {cookTimeMinutes != null && (
        <li>
          <Icon name="clock" size={16} />
          {cookTimeMinutes}분
        </li>
      )}
      {servings != null && (
        <li>
          <Icon name="users" size={16} />
          {servings}인분
        </li>
      )}
      {difficulty && (
        <li>
          <Icon name="chef" size={16} />
          {DIFFICULTY_LABEL[difficulty]}
        </li>
      )}
    </ul>
  );
}
