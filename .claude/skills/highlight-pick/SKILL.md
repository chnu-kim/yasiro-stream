---
name: highlight-pick
description: yasiro-stream /awards(어워즈) 대결 카드의 '하이라이트 시작 시각'을 고르거나 고칠 때 쓴다. "하이라이트 다시 골라 줘", "다음 묶음 진행해", "이 게임 하이라이트 장면 바꾸자", "재밌는 장면 찾아 줘", "하이라이트 후보 보여 줘" 같은 요청이 해당한다. 치지직 클립·받아쓰기로 후보를 뽑아 결과 페이지로 보여 주고, 확정된 값을 games-edit용 ops로 넘긴다. 사용자가 시각을 이미 정해 준 한두 건을 운영에 넣기만 하는 일은 games-edit를 쓴다.
---

# /awards 하이라이트 시작 시각 고르기

/awards 대결 카드는 다시보기의 `highlight_start`(초)부터 영상을 튼다. 이 스킬은 그 시각을 **고르는 일**을 맡는다: 후보 뽑기 → 결과 페이지로 보여 주기 → 사용자 확정 → ops 파일. **운영 반영은 `games-edit` 스킬**이 맡고, 실행은 사용자가 한다.

도구는 이 스킬의 `scripts/`에 있다(레포에 들어 있음). 데이터·오디오·모델·가상환경은 git이 무시하는 `work/`에 있다.

## 어기면 안 되는 것

지난 작업(2026-11-24)에서 사용자가 강하게 지적한 순서다.

1. **모든 답은 한국어.** 도구 출력을 연달아 본 직후의 진행 보고, 표가 많은 긴 보고에서 영어로 새기 쉽다. 보내기 전에 첫 문장을 확인한다.
2. **작업 파일은 `work/` 하위에만.** 가상환경 `work/venv`, 모델 `work/models/hf`·`work/models/torch`, 오디오 `work/audio`. C 드라이브 루트나 홈 폴더에 폴더·모델·캐시를 만들지 않는다. 안내문의 예시 경로를 그대로 쓰지 않는다.
3. **다운로드는 확인 먼저.** 받기 전에 크기 합계를 사용자에게 알리고(`fetch_audio.sh sizes`), 하나씩 받고, 시작 30초 안에 속도를 보고한다. 오래 걸릴 작업은 시작 전에 예상 시간을 말한다.
4. **링크와 시각은 계산으로.** 페이지·ops는 `build_page.py`가 만든다. `t=초`나 "핵심까지 N초"를 손으로 쓰지 않는다. 올리기 전에 `check_links.py`를 통과시킨다. 통과하지 못하면 올리지 않는다.
5. **운영 D1에 쓰지 않는다.** `games:edit … --apply`와 원격 마이그레이션은 Claude가 실행하지 않는다. ops 파일과 명령만 만든다. 운영 SELECT 조회도 이번 대화에서 사용자가 허락했을 때만 한다.
6. **사용자가 직접 정한 시각은 덮어쓰지 않는다.** 목록은 `protected.json`(고독방송:심 3:30:30, 컵헤드 3:21:22, 후즈 앳 더 도어 4:03:48, 고독방송 6:22:40). 사용자가 새로 직접 정하면 여기에 추가한다.
7. **강한 후보를 내 취향으로 빼지 않는다.** 클립 조회가 압도적인 장면은 선정적이어 보여도 '선정적일 수 있음' 표시(`flags`)를 달아 보여 주고 사용자가 정하게 한다.
8. `%LOCALAPPDATA%\VOD 클립 다운로더` 안의 `credentials.json`·`session.json`, 레포의 `.dev.vars`는 열지 않는다. 관리자 채널 ID는 어디에도 쓰지 않는다.

## 고르는 기준

그 게임의 재미가 드러나는 **재밌는 장면**을 고른다. 기준은 장르마다 다르다. 웃음 하나로 고르지 않는다.

| 장르 | 찾는 장면 |
|---|---|
| 공포 | 깜짝 놀라는 장면(비명, "깜짝이야") |
| 퍼즐 | 막혔다가 풀리는 장면, 삽질 |
| 경쟁·멀티 | 화내거나 신나거나 웃긴 장면 |
| 액션 | 보스전, 억울한 죽음 |
| 스토리 | 명대사, 감정이 실린 반응 |
| 그 밖 | 그 게임다운 순간(게임마다 장르를 먼저 정하고 판정한다) |

장르와 상관없는 조건:

- **게임 안에서 일어난 일만.** 원인이 게임 대사·상황·실수·연출이어야 한다. 잡담, 채팅 읽기, 후원 읽기 반응은 안 된다.
- **시작부터 핵심 순간(펀치라인·비명·승리)까지 30초~1분.** 그보다 긴 빌드업이 필요한 장면은 뺀다.
- **시작 시각은 원인이 되는 대사의 4초 전.** 클립이 있으면 클립 시작점도 시작 후보다.
- **엔딩·결말 내용은 피한다.** 보스전·반전 직전의 긴장은 괜찮다.
- 영상 앞뒤 맥락 없이도 이해되는 장면을 앞에 둔다.

신호를 믿는 순서:

1. **치지직 클립**(시청자가 직접 딴 장면)이 가장 강하다. 오디오 맞추기 결과가 상관 0.9 이상·두 번째 봉우리 대비 1.5배 이상(`strong`)이면 초 단위로 믿는다. `ok`지만 0.9 미만이면 `peek.py`로 대사를 보고 확인한다. `ok`가 아니면 위치를 쓰지 않는다. '만든 시각'만으로 추정한 위치는 단정하지 않는다(9초 틀린 적이 있다).
2. 받아쓰기(WhisperX)의 반응 말과 흐름. 비명·웃음소리는 받아쓰기에 잡히지 않는다. 그런 후보는 "영상으로 확인해야 해요"라고 적는다.
3. 음량 봉우리, PANNs 웃음(강한 봉우리만 정확), 유튜브 자막 태그는 보조다.

## 절차

명령은 레포 루트(`work/`가 있는 메인 체크아웃)에서 Bash 도구로 실행한다. worktree에는 `work/`가 없으니 `HL_WORK=<메인 체크아웃>/work`를 준다. **pnpm은 Git Bash에서 node를 못 찾으므로 PowerShell 도구로** 실행하고, 사용자에게 줄 때는 "Claude Code 밖 PowerShell 창"이라고 적는다.

```bash
S=.claude/skills/highlight-pick/scripts
PY="work/venv/Scripts/python.exe -X utf8 -I"
```

### 0. 준비 확인

`work/venv`, `work/ext/panns/Cnn14_DecisionLevelMax.pth`, `work/data/chzzk-clips.json`, `ffmpeg`가 있는지 본다. 없으면 `reference/setup.md`를 따른다(설치·모델 받기 전에 3번 규칙). 클립 목록이 오래됐으면 `$PY $S/fetch_clips.py work/data/chzzk-clips.json`(수 초)으로 새로 받는다.

### 1. 운영 원본 조회

게임 id·영상 id·지금 값은 **운영 조회가 기준**이다. 넘겨받은 목록이나 예전 파일의 id를 믿지 않는다(실제로 달랐다). 조회 파일이 없거나, 운영이 그 뒤 바뀌었으면(ops 적용 등) 새로 조회한다. 사용자 허락을 받고 PowerShell로 실행하거나, 사용자에게 실행해 달라고 한다.

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # 한글 게임 id가 깨지지 않게
pnpm wrangler d1 execute yasiro-db --remote --json --command "SELECT v.game_id, v.video_id, v.date, v.highlight_start FROM game_vods v JOIN games g ON g.id = v.game_id WHERE g.hidden = 0 ORDER BY v.game_id, v.date, v.position" | Out-File -Encoding utf8 work\ops\prod-vods-YYYYMMDD.json
```

읽기 전용 SELECT다. 받은 뒤 2번의 `--list`가 게임 수를 제대로 세는지로 파일을 확인한다(한글이 깨졌으면 도구가 멈춘다). 2026-11-24 조회는 `work/ops/prod-highlights-20261124.json`(하이라이트가 있는 196행만 담긴 형식, 도구는 두 형식 모두 읽는다). 이 조회문은 스키마로만 확인했고 운영에서 아직 돌려 보지 않았다. 처음 쓸 때 결과 모양을 본다.

### 2. 묶음 정하기

```bash
$PY $S/make_batch.py work work/ops/<운영 조회>.json --list 40        # 남은 게임, 클립 많은 순
$PY $S/make_batch.py work work/ops/<운영 조회>.json <gameId> ... > work/trial/batchN.tsv
```

- 사용자 지정 게임과 이미 확정한 게임(`work/ops/ops-batch*.json`)은 목록에서 빠진다. 클립이 있는 게임부터 한다.
- 게임 구간은 `work/hl/final.json`에서 온다(넘겨받은 1차 값이라 몇 분 어긋날 수 있다. 후보의 첫 대사가 다른 게임이거나 후보가 구간 끝에 몰리면 구간부터 다시 본다). '구간 없음'·새로 추가된 게임은 `$PY $S/timeline.py work 300 <vid>`로 자막 흐름을 보고 구간을 찾아 TSV에 손으로 넣는다(`vid`, `gameId`, 시작, 끝, 방송 날짜를 탭으로).
- `final.json`의 `fixed: true`는 1차 선정 때 에이전트가 낸 시각을 Claude가 고쳐 넣었다는 표시다(1차 결과에만 있는 필드, 사용자 확인 2026-11-24). 1차 시각이 한 번 틀렸던 게임이라는 뜻일 뿐 보호 값이 아니니, 다른 게임처럼 묶음에 넣어도 된다. 1차 시각을 참고할 때만 '고친 값'임을 감안한다.
- 묶음과 예상 시간(도구가 stderr로 알려 준다)을 사용자에게 말하고 시작한다. 한 묶음은 8~10편이 적당하다.

### 3. 오디오 받기

```bash
bash $S/fetch_audio.sh sizes work/trial/batchN.tsv     # 크기만 묻는다 → 합계를 사용자에게 알린다
bash $S/fetch_audio.sh get work/trial/batchN.tsv       # 백그라운드로. 하나씩 받는다
```

`get`을 띄우고 30초쯤 뒤 `tail -c 300 work/trial/dl_<vid>.log`로 속도를 읽어 사용자에게 알린다. 1MB/s 아래면 멈추고 보고한다. 구간만 받기(`--download-sections`)는 재생 속도 수준으로 느려서 쓰지 않는다. 전체 오디오는 한 편에 300~600MB다.

### 4. 묶음 처리 (GPU)

```bash
bash $S/run_batch.sh work/trial/batchN.tsv > work/trial/batchN.log 2>&1     # 백그라운드로
```

- 시작 전에 사용자에게 **VOD 클립 다운로더 앱을 닫아 달라고** 한다(열려 있으면 chzzk-cli가 종료 코드 5). 막히면 GPU 단계만 계속하고 끝에 `클립 미처리` 줄이 나온다. 앱을 닫은 뒤 같은 명령을 다시 돌리면 이어서 한다.
- 오디오를 받는 중이면 그 영상이 올 때까지 기다리므로 3번의 `get`과 함께 돌려도 된다.
- 감시는 **끝날 때 한 번만** 알리게 한다(백그라운드 실행의 종료 알림). 30분마다 깨는 감시를 켜지 않는다. 끝나면 로그의 `FAILED`·`끝내지 못함`·`클립 미처리` 줄을 본다.
- 오래 걸리면 절전을 막는다: `powershell -ExecutionPolicy Bypass -File .claude\skills\highlight-pick\scripts\keep_awake.ps1`(백그라운드, 묶음이 끝나면 스스로 풀린다. 전원 설정은 바꾸지 않는다).
- 걸리는 시간: 받아쓰기는 게임 1시간에 약 5분(RTX 3060). 1차 묶음 9편(게임 구간 약 32시간)이 3시간 16분이었다.
- 결과: `work/trial/packets/<key>.v2.txt`(판정용 후보 묶음), `work/trial/clips/<key>.json`(클립 위치), `work/trial/asr/<key>.json`(받아쓰기). `key`는 보통 영상 id이고, 한 영상에 게임이 둘이면 `<vid>.<gameId>`다.

### 5. 판정

게임마다 `work/trial/packets/<key>.v2.txt`를 읽는다. 후보 묶음마다 점수, 신호, 겹치는 클립(제목·조회수), 앞 40초 대사가 있다.

1. 장르를 정한다.
2. 클립이 겹치는 묶음부터 본다. 조회수를 적어 둔다.
3. 후보 2~4개를 고르고 순위를 매긴다. 후보마다 초 단위로 확인한다: `$PY $S/peek.py work <key> <h:mm:ss> <h:mm:ss>`.
4. 시작 시각을 정한다(원인 대사 4초 전 또는 `strong` 클립의 시작).
5. 기준에 맞는지 다시 본다: 게임 안 장면인가, 핵심까지 60초 안인가, 엔딩이 아닌가.
6. 뺀 강한 후보가 있으면 빼지 말고 `flags`를 달아 넣는다.

결과를 `work/picks/batchN.json`에 쓴다. 형식은 `reference/picks-format.md`. **`decision`은 비워 둔다**(사용자가 정한다). 장면 설명은 "A/B", "튜토리얼 장면" 같은 이름이 아니라 언제·무슨 상황·무슨 대사인지 풀어 쓴다.

### 6. 결과 페이지

```bash
$PY $S/build_page.py work/picks/batchN.json --prod work/ops/<운영 조회>.json --page work/pages/highlight-batchN.html
$PY $S/check_links.py work/pages/highlight-batchN.html
```

- `주의` 줄(핵심까지 60초 초과, 게임 구간 밖, 운영에 다른 영상의 하이라이트가 있음)은 고치거나, 그대로 둘 이유를 페이지 `why`·`footnote`에 적는다.
- 검사를 통과하면 Artifact 도구로 `work/pages/highlight-batchN.html`을 게시하고 링크를 준다. 고칠 때는 `picks`를 고쳐 다시 만들고 **같은 파일 경로로** 다시 게시한다(같은 주소). HTML을 손으로 고치지 않는다. 모양은 `assets/page.css`가 정한다.
- 대화에는 게임마다 1위 후보를 한 줄씩(시각, 무슨 장면인지) 적고, 무엇을 정해 주면 되는지 묻는다.

### 7. 확정 → ops → games-edit

사용자가 고르면 `picks`의 `decision`(후보 번호)을 채운다. "다 1위로"면 전부 1이다. 사용자가 목록에 없는 시각을 직접 말하면 그 시각의 후보를 새로 넣고(`label`: "직접 정함") `protected.json`에도 추가한다.

```bash
$PY $S/build_page.py work/picks/batchN.json --prod work/ops/<운영 조회>.json --page work/pages/highlight-batchN.html --ops work/ops/ops-batchN.json
$PY $S/check_links.py work/pages/highlight-batchN.html --ops work/ops/ops-batchN.json
```

- 오류(운영에 없는 게임 id·영상, 사용자 지정 시각과 다른 확정)가 나면 파일이 만들어지지 않는다. 운영 조회를 다시 보고 고친다.
- 통과하면 페이지를 다시 게시하고('확정' 표시가 붙는다), 사용자에게 `games-edit` 스킬 절차의 명령을 준다. Claude Code 밖 PowerShell 창, 레포 루트에서:

```powershell
pnpm -s games:edit work\ops\ops-batchN.json            # 미리보기
pnpm -s games:edit work\ops\ops-batchN.json --apply    # 운영 반영 — 사용자만 실행
```

- 미리보기도 운영을 읽는다. 사용자가 허락하면 Claude가 PowerShell 도구로 돌려 요약을 `picks`와 대조하고, 아니면 사용자가 돌린 출력을 받아 대조한다. `.dev.vars`가 없으면 `games-edit`의 '준비'를 따른다.
- `--apply`는 Claude가 실행하지 않는다. 사용자가 적용했다고 하면 1번 조회를 새로 받아 값이 들어갔는지 확인한다.

### 8. 기록

묶음이 끝나면 메모리(`project_highlight_gpu.md`)에 확정 값·대기 중인 ops·페이지 주소를 남긴다. 사용자가 기준을 바꾸면 이 파일의 '고르는 기준'도 고친다.

## 함정

- `"4:26"` 같은 두 칸 시각: 묶음 TSV에서는 h:mm이지만 `games:edit`는 mm:ss로 읽는다. `picks`·ops에는 `"h:mm:ss"`만 쓴다(도구가 두 칸짜리를 거부한다).
- `calib_clips.py`(클립 제목으로 방송 시작 추정)는 1차 묶음 9편에서 모두 '없음'이었다. 그래도 된다. 그때는 클립을 게임 구간 전체에서 오디오로 찾는다(더 느리지만 정확).
- 클립이 '믿을 만함 0개'로 나온 영상은 클립 위치를 쓰지 않는다. 클립 제목은 장면을 찾는 단서로만 쓴다.
- 유튜브 자막이 없는 영상(3편)은 받아쓰기·클립·음량만으로 후보를 뽑는다. 구간 찾기(`timeline.py`)는 못 쓴다.
- jrgillick 웃음 탐지는 이 방송에서 쓸모가 없었다(도구에서 뺐다).
- `fetch_audio.sh get`이 강제로 죽으면 `work/audio/.fetching`이 남아 `run_batch.sh`가 계속 기다린다. 받기가 돌고 있지 않은 게 확실하면 그 파일을 지운다.
- `fetch_audio.sh`(크기 묻기·받기)와 묶음의 GPU 단계는 스킬로 옮긴 뒤 실제로 돌려 보지 않았다(옮기기 전 `work/tools`에서는 돌아갔다). 처음 돌릴 때 한 편짜리 묶음으로 먼저 확인한다.
- 운영에 그 게임의 다른 영상에 하이라이트가 있으면 카드는 날짜순 첫 영상을 튼다. `build_page.py`가 `주의`로 알린다. 어느 쪽을 남길지 사용자에게 묻는다.
- `work/tools/`는 1차 작업 때의 원본이다. 고칠 때는 이 스킬의 `scripts/`를 고친다.

## 파일

| 위치 | 내용 |
|---|---|
| `scripts/make_batch.py` · `timeline.py` | 묶음 TSV 만들기 · 자막으로 게임 구간 찾기 |
| `scripts/fetch_audio.sh` · `run_batch.sh` · `keep_awake.ps1` | 오디오 받기 · 묶음 처리 · 절전 막기 |
| `scripts/calib_clips.py` · `clips_for_video.py` · `align_clip.py` · `laugh_panns.py` · `asr_windows.py` · `build_packets.py` | `run_batch.sh`가 부르는 단계(사용법은 각 파일 머리말) |
| `scripts/peek.py` | 한 구간의 대사를 단어 시각으로 보기 |
| `scripts/build_page.py` · `check_links.py` | 페이지·ops 만들기 · 링크 검사 |
| `scripts/fetch_clips.py` | 치지직 클립 목록 새로 받기 |
| `protected.json` | 사용자가 직접 정한 시각 |
| `reference/picks-format.md` · `reference/setup.md` | 후보 파일 형식 · 환경 준비 |
| `work/hl/final.json` · `work/data/` · `work/subs/` | 게임 구간 · 클립 목록·영상 목록 · 유튜브 자막(git 무시) |
| `work/trial/` · `work/picks/` · `work/pages/` · `work/ops/` | 중간 결과 · 후보 파일 · 결과 페이지 · 운영 조회와 ops |
