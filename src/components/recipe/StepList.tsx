import type { RecipeStep } from '@/types';
import { formatTimestamp, youtubeWatchUrl } from '@/lib/youtube';
import { Icon } from '@/components/ui';
import styles from './recipe.module.css';

/** 조리 단계. videoId 를 넘기면 타임스탬프가 해당 시점 링크가 된다 */
export function StepList({ steps, videoId }: { steps: RecipeStep[]; videoId?: string }) {
  return (
    <ol className={styles.stepList}>
      {steps.map((step) => (
        <li key={step.id} className={styles.step}>
          <span className={styles.stepNumber} aria-hidden>
            {step.order}
          </span>
          <div className={styles.stepBody}>
            <p>
              <span className="visually-hidden">{step.order}단계: </span>
              {step.description}
            </p>
            {step.timestampSec != null &&
              (videoId ? (
                <a
                  className={styles.timestamp}
                  href={youtubeWatchUrl(videoId, step.timestampSec)}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`영상 ${formatTimestamp(step.timestampSec)} 지점 보기`}
                >
                  <Icon name="play" size={10} />
                  {formatTimestamp(step.timestampSec)}
                </a>
              ) : (
                <span className={styles.timestamp}>{formatTimestamp(step.timestampSec)}</span>
              ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
