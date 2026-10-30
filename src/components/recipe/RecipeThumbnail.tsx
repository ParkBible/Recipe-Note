import { useState } from 'react';
import type { RecipeSource } from '@/types';
import { cx } from '@/lib/cx';
import { youtubeThumbnailUrl } from '@/lib/youtube';
import { Icon } from '@/components/ui';
import styles from './RecipeThumbnail.module.css';

/** 표지(디자인 시스템 커버)의 블록 색. 레시피마다 하나가 고정으로 정해진다 */
const TONES = [styles.toneBrand, styles.toneDeep, styles.toneInk, styles.toneAmber];

function pickTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export interface RecipeThumbnailProps {
  source?: RecipeSource;
  title: string;
  /** 재생 버튼 오버레이 표시 */
  showPlay?: boolean;
  large?: boolean;
  className?: string;
}

/** 16:9 썸네일. 이미지가 없거나 로드 실패하면 단색 블록 + 재료 알약 무늬 플레이스홀더 */
export function RecipeThumbnail({ source, title, showPlay, large, className }: RecipeThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const src = source?.thumbnailUrl ?? (source ? youtubeThumbnailUrl(source.videoId) : undefined);
  // 편집 중 제목이 바뀌어도 색이 튀지 않게 videoId 를 우선 쓴다
  const tone = pickTone(source?.videoId ?? title);

  return (
    <div className={cx(styles.thumb, className)}>
      {src && !failed ? (
        <img
          className={styles.image}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          // 존재하지 않는 영상이면 유튜브가 404 대신 120x90 회색 기본 이미지를 준다
          onLoad={(e) => e.currentTarget.naturalWidth <= 120 && setFailed(true)}
        />
      ) : (
        <div className={cx(styles.placeholder, tone)}>
          <span className={styles.pills} aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </span>
          {!(showPlay && source) && (
            <span className={styles.placeholderLabel}>
              <Icon name="chef" size={large ? 40 : 28} />
            </span>
          )}
        </div>
      )}
      {showPlay && source && (
        <span className={cx(styles.play, large && styles.playLarge)}>
          <span className={styles.playIcon}>
            <Icon name="play" size={large ? 28 : 22} />
          </span>
        </span>
      )}
    </div>
  );
}
