import { useEffect, useState } from 'react';
import type { RecipeSource } from '@/types';
import { useRecipeImage } from '@/data/images';
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
  /** 직접 올린 사진. 있으면 영상 썸네일보다 먼저 쓴다 */
  imageId?: string;
  title: string;
  /** 재생 버튼 오버레이 표시 */
  showPlay?: boolean;
  large?: boolean;
  className?: string;
}

/** 16:9 썸네일. 이미지가 없거나 로드 실패하면 단색 블록 + 재료 알약 무늬 플레이스홀더 */
export function RecipeThumbnail({ source, imageId, title, showPlay, large, className }: RecipeThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const imageUrl = useRecipeImage(imageId);
  const videoThumbUrl = source?.thumbnailUrl ?? (source ? youtubeThumbnailUrl(source.videoId) : undefined);
  // 사진을 찾는 중에는 영상 썸네일을 먼저 띄웠다가 바꾸지 않게 비워 둔다
  const imagePending = imageUrl === undefined;
  const src = imageUrl ?? videoThumbUrl;
  useEffect(() => setFailed(false), [src]);
  // 편집 중 제목이 바뀌어도 색이 튀지 않게 videoId 를 우선 쓴다
  const tone = pickTone(source?.videoId ?? title);

  return (
    <div className={cx(styles.thumb, className)}>
      {imagePending ? null : src && !failed ? (
        <img
          className={styles.image}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          // 존재하지 않는 영상이면 유튜브가 404 대신 120x90 회색 기본 이미지를 준다
          onLoad={(e) => !imageUrl && e.currentTarget.naturalWidth <= 120 && setFailed(true)}
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
