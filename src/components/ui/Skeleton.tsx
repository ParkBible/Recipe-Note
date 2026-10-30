import type { CSSProperties } from 'react';
import { cx } from '@/lib/cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  circle?: boolean;
  radius?: CSSProperties['borderRadius'];
  className?: string;
  style?: CSSProperties;
}

/** 로딩 자리표시 블록. 스크린리더용 상태 안내는 감싸는 영역에서 aria-busy 로 한다 */
export function Skeleton({ width = '100%', height = 16, circle, radius, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cx(styles.skeleton, circle && styles.circle, className)}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** 여러 줄 텍스트 자리표시. 마지막 줄은 짧게 */
export function SkeletonText({ lines = 3, lineHeight = 14, className }: { lines?: number; lineHeight?: number; className?: string }) {
  return (
    <span className={cx(styles.lines, className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}

export function Spinner({ size = 28, label = '불러오는 중' }: { size?: number; label?: string }) {
  return (
    <span role="status" style={{ display: 'inline-flex' }}>
      <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
