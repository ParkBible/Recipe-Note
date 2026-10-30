import { useState } from 'react';
import type { RecipeSource } from '@/types';
import { youtubeEmbedUrl } from '@/lib/youtube';
import { RecipeThumbnail } from './RecipeThumbnail';
import styles from './recipe.module.css';

/**
 * 클릭 전에는 썸네일만 보여주고(가벼움), 클릭하면 youtube-nocookie iframe 으로 교체한다.
 * source 가 없으면 플레이스홀더만.
 */
export function YoutubeEmbed({ source, title }: { source?: RecipeSource; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (!source) {
    return (
      <div className={styles.embed}>
        <RecipeThumbnail title={title} large className={styles.embedThumb} />
      </div>
    );
  }

  return (
    <div className={styles.embed}>
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(source.videoId)}
          title={source.videoTitle ?? title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button type="button" className={styles.embedButton} onClick={() => setPlaying(true)} aria-label={`${title} 영상 재생`}>
          <RecipeThumbnail source={source} title={title} showPlay large className={styles.embedThumb} />
        </button>
      )}
    </div>
  );
}
