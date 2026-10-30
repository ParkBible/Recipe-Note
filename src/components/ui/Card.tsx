import type { ElementType, HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import styles from './Card.module.css';

const padClass = { none: styles.padNone, sm: styles.padSm, md: styles.padMd, lg: styles.padLg } as const;

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: keyof typeof padClass;
  /** hover 시 떠오르는 효과 (클릭 가능한 카드) */
  interactive?: boolean;
  muted?: boolean;
}

export function Card({ as: Tag = 'div', padding = 'md', interactive, muted, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(styles.card, padClass[padding], interactive && styles.interactive, muted && styles.muted, className)}
      {...rest}
    />
  );
}
