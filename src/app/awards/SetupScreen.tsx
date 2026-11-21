import type { Ref } from 'react';
import Button from '@/components/Button';
import SectionLabel from '@/components/SectionLabel';
import { DIVISIONS, DIVISION_LABEL, divisionAvailable } from '@/lib/awards/entries';
import { fitText, PAGE_TITLE, sizeLabel, thirdPlaceNote } from '@/lib/awards/labels';
import { sizeOptions, thirdPlaceAvailable } from '@/lib/awards/options';
import type { Division, SizeChoice } from '@/lib/awards/types';
import styles from './awards.module.css';

// 설정 화면: 부문 · 대진 · 3·4위전. 모두 네이티브 라디오·체크박스(키보드 그대로).
export default function SetupScreen({
  division,
  counts,
  sizeChoice,
  thirdRequested,
  headingRef,
  onDivision,
  onSize,
  onThird,
  onStart,
}: {
  division: Division;
  counts: Record<Division, number>;
  sizeChoice: SizeChoice | null;
  thirdRequested: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onDivision: (d: Division) => void;
  onSize: (c: SizeChoice) => void;
  onThird: (on: boolean) => void;
  onStart: () => void;
}) {
  const n = counts[division];
  const options = sizeOptions(n);
  // 보이는 강이 없으면(후보 3개 미만) selected는 없고 시작 버튼이 막힌다
  const selected = options.find((o) => o.size === sizeChoice);
  const note = selected === undefined ? null : thirdPlaceNote(selected.size, n);
  const canThird = selected !== undefined && thirdPlaceAvailable(selected.size, n);
  const canStart = divisionAvailable(n) && selected !== undefined;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <SectionLabel>GAME AWARDS 2026</SectionLabel>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {PAGE_TITLE}
        </h1>
        <p className={styles.lead}>플레이한 게임으로 하는 토너먼트예요. 두 게임 중 하나를 골라 끝까지 올라가요.</p>
      </header>

      <form
        className={styles.sheet}
        onSubmit={(e) => {
          e.preventDefault();
          if (canStart) onStart();
        }}
      >
        <fieldset className={styles.row}>
          <legend className={styles.legend}>부문</legend>
          <div className={styles.choices}>
            {DIVISIONS.map((d) => {
              const available = divisionAvailable(counts[d]);
              return (
                <label key={d} className={styles.choice}>
                  <input
                    type="radio"
                    name="division"
                    value={d}
                    checked={division === d}
                    disabled={!available}
                    aria-describedby={available ? undefined : 'division-note'}
                    onChange={() => onDivision(d)}
                  />
                  <span className={styles.choiceText}>{DIVISION_LABEL[d]}</span>
                  <span className={styles.count}>
                    <span className={styles.num}>{counts[d]}</span>개
                  </span>
                </label>
              );
            })}
          </div>
          {DIVISIONS.some((d) => !divisionAvailable(counts[d])) && (
            <p id="division-note" className={styles.note}>
              후보가 3개 이상이어야 해요.
            </p>
          )}
        </fieldset>

        <fieldset className={styles.row}>
          <legend className={styles.legend}>대진</legend>
          <div className={styles.choices}>
            {options.map((o) => (
              <label key={o.size} className={styles.choice}>
                <input
                  type="radio"
                  name="size"
                  value={String(o.size)}
                  checked={sizeChoice === o.size}
                  aria-describedby="size-fit"
                  onChange={() => onSize(o.size)}
                />
                <span className={styles.choiceText}>{sizeLabel(o)}</span>
              </label>
            ))}
          </div>
          {selected !== undefined && (
            <p id="size-fit" className={styles.note} aria-live="polite">
              {fitText(selected, n)}
            </p>
          )}
        </fieldset>

        <div className={styles.row}>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={thirdRequested && canThird}
              disabled={!canThird}
              aria-describedby={note === null ? undefined : 'third-note'}
              onChange={(e) => onThird(e.target.checked)}
            />
            <span className={styles.choiceText}>3·4위전 하기</span>
          </label>
          {note !== null && (
            <p id="third-note" className={styles.note}>
              {note}
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="lg" disabled={!canStart}>
            시작하기
          </Button>
        </div>
      </form>
    </div>
  );
}
