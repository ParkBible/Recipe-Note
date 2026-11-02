import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Chip, Icon } from '@/components/ui';
import { cx } from '@/lib/cx';
import styles from './FridgeBoard.module.css';

export interface FridgeBoardProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** 꼭 넣을 재료. 넘기면 선반 위 재료를 눌러 별표로 켜고 끈다 */
  mustUse?: string[];
  onToggleMustUse?: (name: string) => void;
}

/**
 * 냉장고 모양 재료 입력판.
 * - 위: 냉동칸(초록 블록) + 둥근 2D 음식 일러스트 (hover 시 하나씩 흔들림)
 * - 가운데: 선반 위에 놓인 재료. 이름을 누르면 꼭 넣을 재료(★)로 표시, X 로 삭제
 * - 아래: 야채칸 모양의 넓은 입력 영역. Enter·쉼표·"넣기" 버튼으로 추가, 쉼표로 여러 개 한 번에.
 * 중복·공백만 거른다. 재료명 정규화("계란"="달걀")는 서버/추천 로직 몫.
 */
export function FridgeBoard({ value, onChange, mustUse = [], onToggleMustUse }: FridgeBoardProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const add = (raw: string) => {
    const names = [...new Set(raw.split(',').map((s) => s.trim()))].filter((s) => s && !value.includes(s));
    if (names.length) onChange([...value, ...names]);
    setDraft('');
  };
  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    add(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // 한글 조합 중 입력 무시
    if (e.key === ',') {
      e.preventDefault();
      add(draft);
    }
  };

  return (
    <section className={styles.fridge} aria-label="내 냉장고">
      <div className={styles.freezer}>
        <div className={styles.freezerHead}>
          <span className={styles.freezerTitle}>
            <Icon name="fridge" size={18} />내 냉장고
          </span>
          <span className={styles.count}>재료 {value.length}개</span>
        </div>
        <FridgeIllustration className={styles.illustration} />
      </div>

      {onToggleMustUse && value.length > 0 && (
        <p className={styles.mustHint}>
          <Icon name="star" size={14} />
          {mustUse.length
            ? `꼭 넣을 재료 ${mustUse.length}개 · 고른 재료가 전부 들어간 요리만 추천해요`
            : '재료를 누르면 꼭 넣을 재료로 고를 수 있어요'}
        </p>
      )}

      <div className={styles.compartment}>
        {value.length ? (
          <ul className={styles.shelves} aria-label="냉장고에 있는 재료">
            {value.map((name) =>
              onToggleMustUse ? (
                <li key={name}>
                  <ShelfItem
                    name={name}
                    on={mustUse.includes(name)}
                    onToggle={() => onToggleMustUse(name)}
                    onRemove={() => remove(name)}
                  />
                </li>
              ) : (
                <li key={name}>
                  <Chip tone="primary" size="lg" onRemove={() => remove(name)}>
                    {name}
                  </Chip>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className={styles.emptyShelf}>냉장고가 비어 있어요. 아래에서 재료를 넣어 주세요.</p>
        )}
        <span className={styles.handle} aria-hidden />
      </div>

      <form className={styles.drawer} onSubmit={onSubmit}>
        <label htmlFor={inputId} className={styles.drawerLabel}>
          재료 넣기
        </label>
        <div className={styles.drawerRow}>
          <input
            id={inputId}
            className={styles.drawerInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="예: 계란, 대파, 양파"
            enterKeyHint="done"
            autoComplete="off"
            aria-describedby={hintId}
          />
          <Button type="submit" size="lg" icon="plus" disabled={!draft.trim()}>
            넣기
          </Button>
        </div>
        <p id={hintId} className={styles.drawerHint}>
          쉼표로 여러 개를 한 번에 넣을 수 있어요.
        </p>
      </form>
    </section>
  );
}

/** 선반 위 재료 하나. 이름(별표) 부분은 꼭 넣을 재료 토글, X 는 삭제 — 버튼을 둘로 나눠 서로 안 겹치게 */
function ShelfItem({ name, on, onToggle, onRemove }: { name: string; on: boolean; onToggle: () => void; onRemove: () => void }) {
  return (
    <span className={cx(styles.item, on && styles.itemOn)}>
      <button
        type="button"
        className={styles.itemToggle}
        onClick={onToggle}
        aria-pressed={on}
        title={on ? '꼭 넣을 재료에서 빼기' : '꼭 넣을 재료로 고르기'}
      >
        <Icon name="star" size={14} className={styles.star} />
        <span className={styles.itemLabel}>{name}</span>
      </button>
      <button type="button" className={styles.itemRemove} onClick={onRemove} aria-label={`${name} 삭제`}>
        <Icon name="x" size={14} />
      </button>
    </span>
  );
}

/** 음식 하나. 바깥 g 는 hover 흔들림(CSS), 안쪽 g 는 고정 기울기(SVG transform) — 둘이 충돌하지 않게 나눈다 */
function Food({ tilt = 0, x, delay, children }: { tilt?: number; x: number; delay: number; children: ReactNode }) {
  return (
    <g className={styles.food} style={{ animationDelay: `${delay}ms` }}>
      <g transform={`rotate(${tilt} ${x} 104)`}>{children}</g>
    </g>
  );
}

/** 냉동칸 선반 위 음식들. 둥근 단색 면 + 작은 하이라이트. 색은 --color-illo-* 토큰 (FridgeBoard.module.css) */
function FridgeIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 360 112" aria-hidden focusable="false">
      {/* 선반 */}
      <rect className={styles.illoShelf} x="0" y="104" width="360" height="8" rx="4" />

      {/* 우유팩 */}
      <Food x={40} tilt={-5} delay={0}>
        <rect className={styles.illoRed} x="35" y="20" width="10" height="9" rx="3" />
        <path className={styles.illoYellow} d="M20 50 L27 32 Q29 27 34 27 L46 27 Q51 27 53 32 L60 50 Z" />
        <rect className={styles.illoCream} x="20" y="46" width="40" height="58" rx="7" />
        <rect className={styles.illoLeaf} x="20" y="62" width="40" height="17" />
        <circle className={styles.illoCream} cx="40" cy="70.5" r="4.5" />
      </Food>

      {/* 토마토 */}
      <Food x={102} tilt={4} delay={60}>
        <circle className={styles.illoRed} cx="102" cy="81" r="23" />
        <ellipse className={styles.illoCream} cx="92" cy="72" rx="5" ry="3.2" transform="rotate(-35 92 72)" />
        <rect className={styles.illoLeaf} x="100" y="49" width="4" height="10" rx="2" />
        <path className={styles.illoLeaf} d="M102 59 Q92 52 85 60 Q94 64 102 61 Q110 64 119 60 Q112 52 102 59 Z" />
      </Food>

      {/* 달걀 판 */}
      <Food x={180} delay={120}>
        <ellipse className={styles.illoCream} cx="158" cy="80" rx="11" ry="14" transform="rotate(-8 158 80)" />
        <ellipse className={styles.illoCream} cx="180" cy="76" rx="11" ry="14" />
        <ellipse className={styles.illoCream} cx="202" cy="80" rx="11" ry="14" transform="rotate(8 202 80)" />
        <rect className={styles.illoYellow} x="138" y="88" width="84" height="16" rx="8" />
        <circle className={styles.illoOrange} cx="158" cy="96" r="2.5" />
        <circle className={styles.illoOrange} cx="180" cy="96" r="2.5" />
        <circle className={styles.illoOrange} cx="202" cy="96" r="2.5" />
      </Food>

      {/* 당근 */}
      <Food x={247} tilt={-8} delay={180}>
        <path className={styles.illoLeaf} d="M247 52 Q238 42 234 30 Q245 34 247 52 Z" />
        <path className={styles.illoLeaf} d="M247 52 Q246 36 251 24 Q257 38 247 52 Z" />
        <path className={styles.illoLeaf} d="M247 52 Q255 42 265 38 Q261 50 247 52 Z" />
        <path className={styles.illoOrange} d="M235 56 Q235 50 247 50 Q259 50 259 56 Q255 82 249 102 Q247 106 245 102 Q239 82 235 56 Z" />
        <rect className={styles.illoRed} x="241" y="64" width="7" height="2.6" rx="1.3" />
        <rect className={styles.illoRed} x="246" y="78" width="6" height="2.6" rx="1.3" />
      </Food>

      {/* 치즈 */}
      <Food x={290} tilt={3} delay={240}>
        <path className={styles.illoYellow} d="M266 104 L266 84 Q266 76 274 78 L310 88 Q316 90 316 96 L316 104 Z" />
        <circle className={styles.illoOrange} cx="281" cy="92" r="4.5" />
        <circle className={styles.illoOrange} cx="300" cy="98" r="3" />
        <circle className={styles.illoOrange} cx="292" cy="88" r="2" />
      </Food>

      {/* 브로콜리 */}
      <Food x={338} tilt={-4} delay={300}>
        <path className={styles.illoLeaf} d="M332 104 Q334 92 331 84 L345 84 Q342 92 344 104 Z" />
        <circle className={styles.illoLeaf} cx="327" cy="76" r="11" />
        <circle className={styles.illoLeaf} cx="349" cy="76" r="11" />
        <circle className={styles.illoLeaf} cx="338" cy="64" r="12.5" />
        <circle className={styles.illoLeaf} cx="338" cy="80" r="9" />
        <circle className={styles.illoCream} cx="333" cy="60" r="2.4" />
      </Food>
    </svg>
  );
}
