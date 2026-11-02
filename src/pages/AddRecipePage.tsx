import { useEffect, useState, type FormEvent } from 'react';
import type { ExtractionResult, RecipeDraft } from '@/types';
import { useNavigate } from 'react-router-dom';
import { extractRecipeFromText, extractRecipeFromYoutube, saveRecipe } from '@/api';
import { parseYoutubeVideoId } from '@/lib/youtube';
import { validateDraft } from '@/lib/recipeDraft';
import { usePreviewState } from '@/hooks/usePreviewState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Chip, ErrorMessage, Icon, Input, Skeleton, SkeletonText, Spinner, Textarea, errorListClass } from '@/components/ui';
import { HealthPanel, RecipeEditor, RecipeThumbnail } from '@/components/recipe';
import styles from './pages.module.css';

type Phase = 'input' | 'extracting' | 'review' | 'error';
/** 레시피를 넣는 방법. 유튜브 링크, 또는 자유 형식으로 적은 글 */
type Mode = 'youtube' | 'text';

const MODES: { key: Mode; label: string; icon: 'play' | 'edit' }[] = [
  { key: 'youtube', label: '유튜브 링크', icon: 'play' },
  { key: 'text', label: '글로 입력', icon: 'edit' },
];

const STEPPER = [
  { key: 'input', label: { youtube: '1. 링크 입력', text: '1. 레시피 입력' } },
  { key: 'extracting', label: { youtube: '2. 레시피 추출', text: '2. 형식 정리' } },
  { key: 'review', label: { youtube: '3. 확인 · 저장', text: '3. 확인 · 저장' } },
] as const;

/** 추출 중 안내 문구. 실제 서버 진행 이벤트(SSE 등)가 생기면 그 값으로 바꾼다 */
const PROGRESS_STEPS: Record<Mode, string[]> = {
  youtube: ['영상 정보 가져오는 중', '설명란 · 자막 읽는 중', '재료와 조리 순서 정리 중'],
  text: ['글 읽는 중', '재료와 분량 찾는 중', '조리 순서 정리 중'],
};

/** 서버(server/extract.ts MAX_TEXT_LENGTH)와 같은 값 */
const TEXT_MAX = 20000;
const TEXT_PLACEHOLDER = `예) 김치볶음밥 2인분
김치 한 컵 정도 송송 썰고 대파 반 대도 썰어둔다. 팬에 식용유 두르고 파 볶다가 김치 넣고 3분 볶고, 고춧가루 1큰술 설탕 조금. 밥 두 공기 넣고 잘 섞은 뒤 참기름 둘러 마무리. 계란 프라이 올리면 끝.`;

const SOURCE_LABEL: Record<ExtractionResult['extractedFrom'][number], string> = {
  description: '영상 설명',
  captions: '자막',
  comments: '고정 댓글',
  text: '입력한 글',
};

export function AddRecipePage() {
  const preview = usePreviewState();
  const [mode, setMode] = useState<Mode>('youtube');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string>();
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string>();
  const [phase, setPhase] = useState<Phase>('input');
  const [result, setResult] = useState<ExtractionResult>();
  const [draft, setDraft] = useState<RecipeDraft>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const navigate = useNavigate();

  const viewPhase: Phase = preview === 'loading' ? 'extracting' : preview === 'error' ? 'error' : phase;

  const extract = async () => {
    setPhase('extracting');
    setErrorMessage(undefined);
    setSaveError(undefined);
    try {
      const res = mode === 'youtube' ? await extractRecipeFromYoutube(url) : await extractRecipeFromText(text);
      setResult(res);
      setDraft(res.draft);
      setPhase('review');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : undefined);
      setPhase('error');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!parseYoutubeVideoId(url)) {
      setUrlError('유튜브 영상 링크를 확인해 주세요. (youtube.com/watch?v=… 또는 youtu.be/…)');
      return;
    }
    setUrlError(undefined);
    void extract();
  };

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 10) {
      setTextError('재료와 만드는 방법을 조금 더 자세히 적어 주세요.');
      return;
    }
    setTextError(undefined);
    void extract();
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setPhase('input');
    setErrorMessage(undefined);
  };

  const handleSave = async () => {
    if (!draft || saving) return;
    const invalid = validateDraft(draft);
    if (invalid) {
      setSaveError(invalid);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      const saved = await saveRecipe(draft);
      navigate(`/recipes/${saved.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  };

  const reset = () => {
    setPhase('input');
    setResult(undefined);
    setDraft(undefined);
    setSaveError(undefined);
  };

  const stepIndex = viewPhase === 'error' ? 1 : STEPPER.findIndex((s) => s.key === viewPhase);
  const showInput = viewPhase === 'input' || viewPhase === 'error';

  return (
    <div className={styles.narrow}>
      <PageHeader
        title="레시피 추가"
        description="요리 영상 링크나 자유롭게 적은 레시피 글을 넣으면 재료와 조리 순서를 정해진 형식으로 정리해요."
      />

      <ol className={styles.stepper} aria-label="진행 단계">
        {STEPPER.map((s, i) => (
          <li
            key={s.key}
            className={styles.stepperItem}
            data-state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            {s.label[mode]}
          </li>
        ))}
      </ol>

      {showInput && (
        <div className={styles.modeTabs} role="radiogroup" aria-label="레시피 넣는 방법">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={mode === m.key}
              className={styles.modeTab}
              onClick={() => changeMode(m.key)}
            >
              <Icon name={m.icon} size={16} />
              {m.label}
            </button>
          ))}
        </div>
      )}

      {showInput && mode === 'youtube' && (
        <Card padding="lg">
          <form className={styles.urlForm} onSubmit={handleSubmit} noValidate>
            <Input
              label="유튜브 링크"
              icon="link"
              inputSize="lg"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={urlError}
              autoFocus
            />
            <Button type="submit" size="lg" icon="sparkle" className={styles.urlSubmit}>
              레시피 추출
            </Button>
          </form>
          {viewPhase === 'error' ? (
            <ErrorMessage title="레시피를 추출하지 못했어요" onRetry={() => void extract()} className={styles.formError}>
              {errorMessage ?? '자막이나 설명란에 레시피 정보가 없는 영상일 수 있어요. 다른 영상으로 시도해 보세요.'}
            </ErrorMessage>
          ) : (
            <ul className={styles.helpList}>
              <li>
                <Icon name="check" size={16} />
                영상 설명란과 자막에서 재료 · 분량 · 조리 순서를 찾아요.
              </li>
              <li>
                <Icon name="check" size={16} />
                저장 전에 결과를 직접 확인하고 고칠 수 있어요.
              </li>
              <li>
                <Icon name="check" size={16} />
                쇼츠(shorts) 링크도 지원해요.
              </li>
            </ul>
          )}
        </Card>
      )}

      {showInput && mode === 'text' && (
        <Card padding="lg">
          <form className={styles.textForm} onSubmit={handleTextSubmit} noValidate>
            <Textarea
              label="레시피 글"
              rows={9}
              placeholder={TEXT_PLACEHOLDER}
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={textError}
              hint={`메모, 블로그 글, 말하듯 쓴 설명 모두 괜찮아요. (${text.length.toLocaleString()} / ${TEXT_MAX.toLocaleString()}자)`}
              maxLength={TEXT_MAX}
              autoFocus
            />
            <Button type="submit" size="lg" icon="sparkle" className={styles.textSubmit}>
              형식에 맞게 정리
            </Button>
          </form>
          {viewPhase === 'error' ? (
            <ErrorMessage title="레시피를 정리하지 못했어요" onRetry={() => void extract()} className={styles.formError}>
              {errorMessage ?? '재료와 만드는 방법이 들어 있는지 확인하고 다시 시도해 주세요.'}
            </ErrorMessage>
          ) : (
            <ul className={styles.helpList}>
              <li>
                <Icon name="check" size={16} />
                요리 이름 · 재료와 분량 · 조리 순서로 나눠서 정리해요.
              </li>
              <li>
                <Icon name="check" size={16} />
                문장 속에 섞인 재료(&quot;김치 한 줌 넣고&quot;)도 재료 목록으로 빼내요.
              </li>
              <li>
                <Icon name="check" size={16} />
                저장 전에 결과를 직접 확인하고 고칠 수 있어요.
              </li>
            </ul>
          )}
        </Card>
      )}

      {viewPhase === 'extracting' && <ExtractingCard steps={PROGRESS_STEPS[mode]} />}

      {viewPhase === 'review' && result && draft && (
        <>
          <Card padding="lg">
            <div className={styles.reviewHead}>
              {draft.source && (
                <RecipeThumbnail source={draft.source} title={draft.title} showPlay className={styles.reviewThumb} />
              )}
              <div className={styles.reviewSource}>
                {draft.source && <p className={styles.reviewSourceTitle}>{draft.source.videoTitle ?? url}</p>}
                {draft.source?.channelName && <p className={styles.resultCount}>{draft.source.channelName}</p>}
                <div className={styles.chips}>
                  {result.extractedFrom.map((src) => (
                    <Chip key={src} size="sm" icon="sparkle" tone="primary">
                      {SOURCE_LABEL[src]}에서 추출
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <ErrorMessage tone="warning" title="확인이 필요한 부분이 있어요" className={styles.previewWarnings}>
                <ul className={errorListClass}>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </ErrorMessage>
            )}

            {draft.health && (
              <HealthPanel health={draft.health} ingredients={draft.ingredients} className={styles.previewWarnings} />
            )}

            <div>
              <RecipeEditor value={draft} onChange={setDraft} />
            </div>
          </Card>

          {saveError && (
            <ErrorMessage title="레시피를 저장하지 못했어요" className={styles.formError}>
              {saveError}
            </ErrorMessage>
          )}

          <div className={styles.saveBar}>
            <span className={styles.saveBarText}>내용을 확인했다면 저장하세요.</span>
            <div className={styles.saveBarActions}>
              <Button variant="ghost" onClick={reset} disabled={saving}>
                {mode === 'youtube' ? '다른 링크' : '다시 입력'}
              </Button>
              <Button icon="check" onClick={() => void handleSave()} loading={saving}>
                레시피 저장
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExtractingCard({ steps }: { steps: string[] }) {
  const [current, setCurrent] = useState(0);

  // 순수 연출용 타이머. 실제 진행 상황과 무관
  useEffect(() => {
    const t = setInterval(() => setCurrent((c) => Math.min(c + 1, steps.length - 1)), 800);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <Card padding="lg" aria-busy="true">
      <div className={styles.progress}>
        <Spinner size={40} label="레시피 정리 중" />
        <h2 className={styles.progressTitle}>레시피를 정리하고 있어요</h2>
        <ul className={styles.progressSteps} aria-live="polite">
          {steps.map((label, i) => (
            <li key={label} className={styles.progressStep} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}>
              {i < current ? <Icon name="check" size={16} /> : <span className={styles.dot} />}
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.previewSkeleton} aria-hidden>
        <Skeleton height={28} width="50%" />
        <SkeletonText lines={2} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} width="80%" />
      </div>
    </Card>
  );
}
