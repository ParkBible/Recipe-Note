import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  /** 보통 Button / ButtonLink */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon = 'book', title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, compact && styles.compact, className)}>
      <div className={styles.iconWrap}>
        <Icon name={icon} size={26} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
