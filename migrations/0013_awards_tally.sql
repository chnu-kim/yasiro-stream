-- /awards 결과 집계(PR3). 대진은 서버가 뽑아 서명 토큰으로 건네고(D1에 쓰지 않음), 끝까지 마친 판만 제출받아 여기에 쌓는다.
-- 익명 규칙: 세 테이블 모두 제출자(관리자 channel_id·채널 이름)를 담지 않는다. IP 원문도 담지 않는다.
-- game_id에는 games 외래 키를 걸지 않는다. 순위를 읽을 때 games와 JOIN해서 hidden = 0인 게임만 보인다.

-- 제출된 판 하나. draw_id UNIQUE로 같은 대진 재제출을 막는다(위반하면 batch 전체가 롤백된다)
CREATE TABLE IF NOT EXISTS award_runs (
  draw_id      TEXT    NOT NULL UNIQUE CHECK (length(draw_id) = 36),
  division     TEXT    NOT NULL CHECK (division IN ('alltime', '2026')),
  -- SIZE_LADDER(src/lib/awards/options.ts)와 같은 값. 사다리를 바꾸려면 새 마이그레이션으로 이 CHECK를 바꾼다
  size         INTEGER NOT NULL CHECK (size IN (4, 16, 32, 64, 128, 256, 512, 1024)),
  third_place  INTEGER NOT NULL CHECK (third_place IN (0, 1)),
  champion_id  TEXT    NOT NULL,
  -- 서명된 Bracket JSON({size, slots}). 나중에 다시 계산(재집계)할 수 있게 둔다
  bracket_json TEXT    NOT NULL,
  -- picks(string[]) JSON
  picks_json   TEXT    NOT NULL,
  -- 토큰 발급 시각(unix seconds)
  issued_at    INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS award_runs_division ON award_runs (division);

-- 부문별 게임 누계. 승·패는 실제로 치른 판만 센다(부전승 제외, 3·4위전 포함: tournament.ts tally와 같은 정의)
CREATE TABLE IF NOT EXISTS award_tally (
  division      TEXT    NOT NULL CHECK (division IN ('alltime', '2026')),
  game_id       TEXT    NOT NULL,
  -- 이 게임이 대진에 뽑혀 나온 판 수
  appearances   INTEGER NOT NULL DEFAULT 0 CHECK (appearances >= 0),
  championships INTEGER NOT NULL DEFAULT 0 CHECK (championships >= 0),
  wins          INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses        INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (division, game_id)
);

-- 제출 횟수 제한. key_hash = HMAC(제한 키, "<day>|<IP 버킷>") hex. 원문 IP는 담지 않는다.
-- day = KST 날짜 번호(floor((unix + 32400) / 86400)). 쓰기 때마다 전날보다 오래된 행을 지운다("잠깐 보관")
CREATE TABLE IF NOT EXISTS award_limits (
  day      INTEGER NOT NULL,
  key_hash TEXT    NOT NULL CHECK (length(key_hash) = 64),
  division TEXT    NOT NULL CHECK (division IN ('alltime', '2026')),
  count    INTEGER NOT NULL CHECK (count >= 1),
  PRIMARY KEY (day, key_hash, division)
);
