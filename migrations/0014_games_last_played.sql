-- 관리자가 넣은 "마지막으로 플레이한 날" 보정값. NULL = 보정 없음(백필하지 않는다).
-- 실제 마지막 플레이는 저장하지 않고 src/lib/games/played.ts lastPlayedOf가 계산한다:
--   max(first_played, 그 게임 다시보기 date들, last_played). SQL에서 max(date)를 따로 계산하지 않는다.
-- 방문자(/games 비관리자·홈·/awards)에는 내보내지 않는다(rows.ts toPublicGame). 형식 검사는 first_played(0007)와 같은 모양(YYYY-MM-DD GLOB).
-- "첫 플레이보다 이르면 안 됨"은 schema.ts validateCandidate가 본다(DB CHECK에는 넣지 않는다).
-- SQLite에는 ADD COLUMN IF NOT EXISTS가 없다. 다시 실행 방지는 wrangler 마이그레이션 추적(d1_migrations)에만 기댄다.
-- 이 파일을 손으로 두 번 실행하면 "duplicate column name"으로 실패하고 아무것도 바뀌지 않는다(문장 하나).
ALTER TABLE games ADD COLUMN last_played TEXT
  CHECK (last_played IS NULL OR (typeof(last_played) = 'text' AND last_played GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'));
