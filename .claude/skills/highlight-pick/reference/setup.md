# 환경 준비 (`work/`가 없거나 새 PC일 때)

2026-11-24 Windows PC(RTX 3060 12GB)에는 이미 갖춰져 있다. 아래는 다시 만들 때만 쓴다. **설치·모델 받기 전에 사용자에게 크기와 예상 시간을 알리고**, 하나씩 받고, 30초 안에 속도를 보고한다.

## 위치

모든 것은 레포의 `work/` 아래에 둔다. `work/`는 `.git/info/exclude`의 `/work/`로 무시된다(새 체크아웃이면 그 줄을 넣는다). C 드라이브 루트·홈 폴더에 만들지 않는다.

```
work/
  venv/            Python 3.13 가상환경
  models/hf/       HF_HOME (WhisperX large-v3, 한국어 정렬 모델). asr_windows.py가 스스로 지정한다
  models/torch/    TORCH_HOME
  ext/panns/       Cnn14_DecisionLevelMax.pth (PANNs 가중치)
  audio/           다시보기 전체 오디오 (<vid>.webm)
  clips/<vid>/     받은 치지직 클립
  subs/            유튜브 자동 자막 (<vid>.txt: "[h:mm:ss] 내용")
  data/            chzzk-clips.json(클립 목록), videos.json(영상·방송 날짜)
  hl/              final.json(게임 구간과 1차 선정), index2.json(게임 이름), final-funny.json
  trial/           중간 결과 (asr, laugh, clips, packets, 로그, 묶음 TSV)
  picks/ pages/ ops/   후보 파일 · 결과 페이지 · 운영 조회와 ops
  tools/           1차 작업 때의 도구 원본(이 스킬 scripts/의 출처. 그대로 둔다)
```

## 가상환경

2026-11-24에 돌아간 판(`work/venv`): torch 2.8.0+cu128 · torchaudio 2.8.0+cu128 · whisperx 3.8.6 · faster-whisper 1.2.1 · ctranslate2 4.9.1 · pyannote-audio 4.1.1 · panns-inference 0.1.1 · torchlibrosa 0.1.0 · librosa 1.0.1 · numpy 2.5.5 · hf-xet 1.8.0 · yt-dlp. 그 밖에 `ffmpeg`(PATH)와 `node`(yt-dlp `--js-runtimes node`)가 필요하다.

모델 받기에서 시간을 버린 일:

- Hugging Face 레포가 Xet 방식이면 `hf_xet`을 먼저 설치한다(없으면 1MB/s 수준).
- `snapshot_download`로 레포를 통째로 받지 않는다. 필요한 파일만 이름을 지정한다. 한국어 정렬 모델(`kresnik/wav2vec2-large-xlsr-korean`)은 `model.safetensors`·`config.json`·`vocab.json`·`preprocessor_config.json`·`tokenizer_config.json`·`special_tokens_map.json`만 필요하다(`optimizer.pt` 등 3.5GB를 받지 않는다).
- 큰 다운로드를 동시에 돌리지 않는다.
- PANNs 패키지는 홈 폴더(`~/panns_data`)에 라벨 파일을 받으려 한다. `laugh_panns.py`는 모델 코드만 불러와 이를 피한다.

## 치지직 클립 받기

사용자가 만든 앱 'VOD 클립 다운로더'의 CLI를 쓴다: `%LOCALAPPDATA%\VOD 클립 다운로더\chzzk-cli.exe`(다른 곳이면 환경 변수 `CHZZK_CLI`). 명령은 `info`·`download <클립 주소> --out <폴더>`·`status`·`login`.

- 앱이 열려 있으면 CLI가 종료 코드 5로 끝난다. 사용자에게 닫아 달라고 한다(멋대로 프로세스를 끝내지 않는다).
- 같은 폴더의 `credentials.json`·`session.json`은 열지 않는다.

## wrangler · pnpm

- Git Bash(Claude Code의 `!` 포함)에서는 pnpm 스크립트가 node를 못 찾는다. pnpm·wrangler는 PowerShell로 실행한다.
- wrangler 로그인이 풀렸으면 사용자가 PowerShell에서 `node node_modules/wrangler/bin/wrangler.js login`.
- `pnpm lint`는 `work/venv` 안의 JS까지 검사한다. `eslint.config.mjs` `globalIgnores`에 `work/**`가 들어가기 전에는 그 때문에 수백 건이 나온다(이 스킬과 무관).
