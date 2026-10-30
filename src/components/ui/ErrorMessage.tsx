import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './ErrorMessage.module.css';

export interface ErrorMessageProps {
  title?: ReactNode;
  children?: ReactNode;
  /** 넘기면 '다시 시도' 버튼 노출 */
  onRetry?: () => void;
  retryLabel?: string;
  /** warning: 막히진 않았지만 확인이 필요한 안내 (추출 결과 경고 등) */
  tone?: 'error' | 'warning';
  className?: string;
}

export function ErrorMessage({ title = '문제가 발생했어요', children, onRetry, retryLabel = '다시 시도', tone = 'error', className }: ErrorMessageProps) {
  return (
    <div className={cx(styles.error, tone === 'warning' && styles.warning, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name="alert" size={20} className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <div className={styles.message}>{children}</div>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry} className={styles.action}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** 경고 목록용 ul 스타일을 페이지에서 재사용할 수 있게 노출 */
export const errorListClass = styles.list;
