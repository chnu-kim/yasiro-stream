-- 다시보기(유튜브 VOD)별 하이라이트 시작 시각(초). NULL = 없음.
-- /awards 대결 카드가 이 시각부터 재생한다(src/lib/awards/media.ts cardMedia). 관리자가 /games 수정 폼·games:edit로 넣는다.
-- 범위는 schema.ts HIGHLIGHT_MAX(86399, 24시간 미만)와 같다.
-- SQLite에는 ADD COLUMN IF NOT EXISTS가 없다. 다시 실행 방지는 wrangler 마이그레이션 추적(d1_migrations)에만 기댄다.
-- 이 파일을 손으로 두 번 실행하면 "duplicate column name"으로 실패하고 아무것도 바뀌지 않는다(문장 하나).
ALTER TABLE game_vods ADD COLUMN highlight_start INTEGER
  CHECK (highlight_start IS NULL OR (typeof(highlight_start) = 'integer' AND highlight_start BETWEEN 0 AND 86399));
