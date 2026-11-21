'use client';
// 팬 마크·해시태그 복사 버튼. 누르면 글자만 "복사됨"(1.5초)·"복사 실패"(4초, 다시 시도할 시간을 준다)로 바뀐다.
// 결과 알림은 button 밖 role=status에 둔다. button 자식은 presentational이라 일부 스크린 리더가 그 안의 live 영역을 읽지 않는다.
import { useEffect, useState } from 'react';
import styles from './page.module.css';

type Result = { state: 'idle' | 'done' | 'fail'; n: number };

export default function CopyButton({ text, label, idleText }: { text: string; label: string; idleText: string }) {
  // n은 누를 때마다 늘린다. 같은 결과가 연달아 나와도 타이머가 다시 시작되고 알림 문구가 바뀌어 다시 읽힌다
  const [{ state, n }, setResult] = useState<Result>({ state: 'idle', n: 0 });

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setResult((r) => ({ ...r, state: 'idle' })), state === 'fail' ? 4000 : 1500);
    return () => clearTimeout(t);
  }, [state, n]);

  async function copy() {
    let next: Result['state'] = 'done';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = 'fail';
    }
    setResult((r) => ({ state: next, n: r.n + 1 }));
  }

  const message = state === 'done' ? `${label} 복사됨` : state === 'fail' ? '복사하지 못했어요' : '';
  return (
    <>
      <button type="button" className={styles.copy} onClick={copy} aria-label={`${label} 복사`} data-state={state}>
        <span aria-hidden="true">{state === 'done' ? '복사됨' : state === 'fail' ? '복사 실패' : idleText}</span>
      </button>
      {/* 홀짝마다 끝에 보이지 않는 공백을 붙여 같은 문구라도 내용이 바뀐 것으로 알린다 */}
      <span role="status" className={styles.srOnly}>
        {message && (n % 2 ? `${message} ` : message)}
      </span>
    </>
  );
}
