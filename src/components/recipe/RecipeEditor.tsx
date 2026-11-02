import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import type { Difficulty, Ingredient, RecipeDraft, RecipeStep } from '@/types';
import { Button, Input, Textarea } from '@/components/ui';
import { saveImage } from '@/data/images';
import { parseYoutubeVideoId } from '@/lib/youtube';
import { DIFFICULTY_LABEL } from './RecipeMeta';
import { RecipeThumbnail } from './RecipeThumbnail';
import styles from './form.module.css';

export interface RecipeEditorProps {
  value: RecipeDraft;
  onChange: (next: RecipeDraft) => void;
}

// 임시 클라이언트 id. 저장 시 서버 id 로 대체된다 (randomUUID 는 http LAN 접속에서 없을 수 있어 사용 안 함)
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const toNumber = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));

/**
 * 추출 결과 미리보기·수정 폼 (제어 컴포넌트).
 * 검증 규칙(필수값 등)은 저장 로직과 함께 다음 단계에서 정한다.
 */
export function RecipeEditor({ value, onChange }: RecipeEditorProps) {
  const difficultyId = useId();
  const set = <K extends keyof RecipeDraft>(key: K, v: RecipeDraft[K]) => onChange({ ...value, [key]: v });

  const updateIngredient = (id: string, patch: Partial<Ingredient>) =>
    set('ingredients', value.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeIngredient = (id: string) => set('ingredients', value.ingredients.filter((i) => i.id !== id));
  const addIngredient = () => set('ingredients', [...value.ingredients, { id: newId('ing'), name: '' }]);

  const renumber = (steps: RecipeStep[]) => steps.map((s, i) => ({ ...s, order: i + 1 }));
  const updateStep = (id: string, description: string) =>
    set('steps', value.steps.map((s) => (s.id === id ? { ...s, description } : s)));
  const removeStep = (id: string) => set('steps', renumber(value.steps.filter((s) => s.id !== id)));
  const addStep = () =>
    set('steps', [...value.steps, { id: newId('step'), order: value.steps.length + 1, description: '' }]);

  return (
    <div className={styles.editor}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>기본 정보</h3>
        <Input label="요리 이름" value={value.title} onChange={(e) => set('title', e.target.value)} />
        <Textarea
          label="한 줄 소개"
          rows={2}
          value={value.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
        />
        <div className={styles.row2}>
          <Input
            label="인분"
            type="number"
            inputMode="numeric"
            min={1}
            value={value.servings ?? ''}
            onChange={(e) => set('servings', toNumber(e.target.value))}
          />
          <Input
            label="조리 시간(분)"
            type="number"
            inputMode="numeric"
            min={1}
            value={value.cookTimeMinutes ?? ''}
            onChange={(e) => set('cookTimeMinutes', toNumber(e.target.value))}
          />
          <div className={styles.selectField}>
            <label htmlFor={difficultyId} className={styles.label}>
              난이도
            </label>
            <select
              id={difficultyId}
              className={styles.select}
              value={value.difficulty ?? ''}
              onChange={(e) => set('difficulty', (e.target.value || undefined) as Difficulty | undefined)}
            >
              <option value="">선택 안 함</option>
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <MediaFields value={value} onChange={onChange} />
        <Input
          label="태그"
          hint="쉼표로 구분"
          value={value.tags.join(', ')}
          onChange={(e) =>
            set(
              'tags',
              e.target.value.split(',').map((t) => t.trimStart()),
            )
          }
          onBlur={() => set('tags', value.tags.map((t) => t.trim()).filter(Boolean))}
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>재료 {value.ingredients.length}</h3>
          <Button variant="secondary" size="sm" icon="plus" onClick={addIngredient}>
            재료 추가
          </Button>
        </div>
        <div className={styles.rows}>
          {value.ingredients.map((ing, idx) => (
            <div key={ing.id} className={styles.ingredientRow}>
              <Input
                inputSize="sm"
                label={`재료 ${idx + 1} 이름`}
                hideLabel
                placeholder="재료명"
                value={ing.name}
                onChange={(e) => updateIngredient(ing.id, { name: e.target.value })}
              />
              <Input
                inputSize="sm"
                label={`재료 ${idx + 1} 분량`}
                hideLabel
                placeholder="분량"
                value={ing.amount ?? ''}
                onChange={(e) => updateIngredient(ing.id, { amount: e.target.value || undefined })}
              />
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={!!ing.optional}
                  onChange={(e) => updateIngredient(ing.id, { optional: e.target.checked || undefined })}
                />
                선택
              </label>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon="trash"
                aria-label={`${ing.name || `재료 ${idx + 1}`} 삭제`}
                onClick={() => removeIngredient(ing.id)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>조리 단계 {value.steps.length}</h3>
          <Button variant="secondary" size="sm" icon="plus" onClick={addStep}>
            단계 추가
          </Button>
        </div>
        <div className={styles.rows}>
          {value.steps.map((step) => (
            <div key={step.id} className={styles.stepRow}>
              <span className={styles.stepIndex} aria-hidden>
                {step.order}
              </span>
              <Textarea
                label={`${step.order}단계 설명`}
                hideLabel
                rows={2}
                className={styles.stepTextarea}
                value={step.description}
                onChange={(e) => updateStep(step.id, e.target.value)}
              />
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon="trash"
                className={styles.stepRemove}
                aria-label={`${step.order}단계 삭제`}
                onClick={() => removeStep(step.id)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MediaFields({ value, onChange }: RecipeEditorProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const [linkText, setLinkText] = useState(value.source?.url ?? '');

  const sourceUrl = value.source?.url;
  useEffect(() => {
    if (sourceUrl !== undefined) setLinkText(sourceUrl);
  }, [sourceUrl]);

  const linkError = linkText.trim() && !parseYoutubeVideoId(linkText) ? '유튜브 영상 링크를 확인해 주세요.' : undefined;

  const changeLink = (text: string) => {
    setLinkText(text);
    const videoId = parseYoutubeVideoId(text);
    if (!videoId) {
      onChange({ ...value, source: undefined });
      return;
    }
    const keep = value.source?.videoId === videoId ? value.source : undefined;
    onChange({ ...value, source: { ...keep, type: 'youtube', url: text.trim(), videoId } });
  };

  const pickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setImageError(undefined);
    try {
      onChange({ ...value, imageId: await saveImage(file) });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '사진을 저장하지 못했어요.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.media}>
      <div className={styles.mediaPreview}>
        <RecipeThumbnail source={value.source} imageId={value.imageId} title={value.title} />
      </div>
      <div className={styles.mediaFields}>
        <div className={styles.mediaActions}>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void pickImage(e)} />
          <Button variant="secondary" size="sm" icon="plus" loading={uploading} onClick={() => fileInput.current?.click()}>
            {value.imageId ? '사진 바꾸기' : '사진 추가'}
          </Button>
          {value.imageId && (
            <Button variant="ghost" size="sm" icon="trash" onClick={() => onChange({ ...value, imageId: undefined })}>
              사진 빼기
            </Button>
          )}
        </div>
        {imageError && <p className={styles.mediaError}>{imageError}</p>}
        <Input
          label="유튜브 링크"
          icon="link"
          placeholder="https://youtu.be/..."
          hint={value.imageId ? '사진이 있으면 사진을 썸네일로 써요.' : '사진이 없으면 영상 썸네일을 써요.'}
          error={linkError}
          value={linkText}
          onChange={(e) => changeLink(e.target.value)}
        />
      </div>
    </div>
  );
}
