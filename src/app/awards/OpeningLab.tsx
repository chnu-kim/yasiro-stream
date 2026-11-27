'use client';

// TEMP(오프닝 결정 비교): 개발 중에만 보이는 조작판. 오프닝 방향을 localStorage(stage-open)에 넣고
// 첫 방문 연출을 처음부터 다시 튼다. createStage가 모듈을 읽을 때 이 값을 보므로 새로고침으로 다시 튼다. 결정 뒤 이 파일과 사용처를 지운다
import { useState } from 'react';

const GROUPS = [
  { key: 'stage-open', label: '오프닝', options: [['now', '지금 안'], ['ring', '링이 무대를 연다'], ['title', '제목 먼저']] },
] as const;

const read = (key: string, fallback: string) => {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export default function OpeningLab() {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(GROUPS.map((g) => [g.key, read(g.key, g.options[0][0])])),
  );
  const replay = () => {
    try {
      for (const [k, v] of Object.entries(values)) window.localStorage.setItem(k, v);
      window.localStorage.removeItem('stage-t');
      window.localStorage.removeItem('stage-slow');
      window.localStorage.removeItem('yasiro-awards-intro-seen');
    } catch {
      // 저장소가 막혀 있으면 기본값으로 튼다
    }
    window.location.reload();
  };
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: 12,
        bottom: 56,
        zIndex: 1000,
        display: 'grid',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(7,7,10,0.82)',
        border: '1px solid rgba(200,169,107,0.45)',
        color: '#E9E2D2',
        font: '12px/1.4 "Noto Sans KR", sans-serif',
      }}
    >
      <strong style={{ color: '#C8A96B' }}>오프닝 비교(개발용)</strong>
      {GROUPS.map((g) => (
        <label key={g.key} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          {g.label}
          <select
            value={values[g.key]}
            onChange={(e) => setValues((v) => ({ ...v, [g.key]: e.target.value }))}
            style={{ background: '#101015', color: '#E9E2D2', border: '1px solid #2A2620', borderRadius: 4, padding: '2px 4px' }}
          >
            {g.options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button
        type="button"
        onClick={replay}
        style={{ marginTop: 2, background: 'transparent', color: '#C8A96B', border: '1px solid #C8A96B', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}
      >
        처음부터 재생
      </button>
    </div>
  );
}
