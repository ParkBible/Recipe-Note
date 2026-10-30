import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';
import styles from './Chip.module.css';

export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'outline';

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  /** 넘기면 X 버튼이 붙는다 (재료 칩 삭제) */
  onRemove?: () => void;
  /** 넘기면 칩 전체가 버튼이 된다 (빠른 추가 등) */
  onClick?: () => void;
  /** onClick 칩을 켜고 끄는 토글로 쓸 때 현재 상태 (aria-pressed) */
  pressed?: boolean;
  removeLabel?: string;
  className?: string;
}

export function Chip({ children, tone = 'neutral', size = 'md', icon, onRemove, onClick, pressed, removeLabel, className }: ChipProps) {
  const iconSize = size === 'sm' ? 12 : 14;
  const classes = cx(
    styles.chip,
    styles[tone],
    size !== 'md' && styles[size],
    onClick && styles.interactive,
    onRemove && styles.removable,
    className,
  );
  const content = (
    <>
      {icon && <Icon name={icon} size={iconSize} />}
      <span className={styles.label}>{children}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-pressed={pressed}>
        {content}
      </button>
    );
  }

  return (
    <span className={classes}>
      {content}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={removeLabel ?? `${typeof children === 'string' ? children : ''} 삭제`}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </span>
  );
}
