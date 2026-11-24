#!/usr/bin/env bash
# 재선정 묶음 처리(GPU). 사용: run_batch.sh <묶음.tsv>     작업 폴더: 환경 변수 HL_WORK, 없으면 <레포>/work
# 입력 TSV(make_batch.py 출력): vid<TAB>gameId<TAB>게임시작<TAB>게임끝<TAB>방송날짜   시각은 h:mm:ss·h:mm·초, #으로 시작하는 줄은 건너뜀
# 단계: 방송 시작 추정(클립 제목) → 클립 받기+오디오 맞추기 → PANNs → WhisperX(게임 구간 전체) → 판정용 후보 묶음
# - 오디오는 받지 않는다. fetch_audio.sh get 이 받는 중이면(audio/.fetching) 그 영상이 올 때까지 기다리고, 아니면 건너뛴다
# - 끝난 단계는 결과 파일이 있으면 건너뛰므로 실패·중단 뒤 같은 명령으로 다시 돌리면 이어서 한다
# - 클립 단계가 실패한 영상은 후보 묶음을 만들지 않는다(가장 강한 신호가 빠진 채 판정하지 않게). 클립 없이 가기로 사용자와 정했으면 HL_NO_CLIPS=1
# - chzzk-cli가 종료 코드 5(앱이 열려 있음)를 내면 그 뒤 영상은 클립 단계와 후보 묶음을 미루고 GPU 단계만 계속한다
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${HL_WORK:-$(cd "$HERE/../../../.." && pwd)/work}"
PY="$W/venv/Scripts/python.exe"
[ -f "$1" ] || { echo "사용: run_batch.sh <묶음.tsv>"; exit 2; }
[ -x "$PY" ] || { echo "가상환경이 없어요: $PY (HL_WORK 확인, 준비는 reference/setup.md)"; exit 2; }
CKPT="$W/ext/panns/Cnn14_DecisionLevelMax.pth"
[ -f "$CKPT" ] || { echo "PANNs 가중치가 없어요: $CKPT"; exit 2; }
TSV="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$W" || exit 1
mkdir -p audio clips trial/clips trial/laugh trial/asr trial/packets
export PYTHONIOENCODING=utf-8
sec(){ local a b c; IFS=: read -r a b c <<<"$1"
  if [ -z "$b" ]; then echo "${a%.*}"; elif [ -z "$c" ]; then echo $((10#$a*3600+10#$b*60)); else echo $((10#$a*3600+10#$b*60+10#$c)); fi; }
audio_of(){ local e; for e in webm m4a opus; do [ -f "audio/$1.$e" ] && { echo "audio/$1.$e"; return 0; }; done; return 1; }
blocked=0; pending=""; nodone=""
while IFS=$'\t' read -r -u 3 vid game g0 g1 day; do
  day="${day%$'\r'}"
  case "$vid" in ''|\#*) continue;; esac
  t0=$(date +%s); echo "[$vid] $game 시작 $(date +%T)"
  s0=$(sec "$g0"); s1=$(sec "$g1")
  # 결과 파일 이름: 보통 <vid>. 이 TSV에 같은 영상이 두 번 나오거나, 이미 있는 받아쓰기가 다른 게임 구간이면 <vid>.<gameId>
  key="$vid"
  if [ "$(awk -F'\t' -v v="$vid" '$1==v' "$TSV" | wc -l)" -gt 1 ]; then key="$vid.$game"
  elif [ -f "trial/asr/$vid.json" ] && ! "$PY" -X utf8 -I -c "import json,sys;g=json.load(open(sys.argv[1],encoding='utf-8'))['game'];sys.exit(0 if [int(g[0]),int(g[1])]==[int(sys.argv[2]),int(sys.argv[3])] else 1)" "trial/asr/$vid.json" "$s0" "$s1"; then
    key="$vid.$game"; echo "[$vid] 기존 받아쓰기는 다른 구간 → 결과 이름 $key"
  fi
  export HL_KEY="$key"
  while ! audio_of "$vid" >/dev/null && [ -f audio/.fetching ]; do sleep 20; done
  au=$(audio_of "$vid") || { echo "[$vid] 오디오 없음 — fetch_audio.sh get 으로 먼저 받기. 건너뜀"; nodone="$nodone $game"; continue; }
  st=$("$PY" -X utf8 -I "$HERE/calib_clips.py" "$W" "$vid" "$day" | "$PY" -I -c "import json,sys;d=json.load(sys.stdin);print(d['start'] or '')")
  echo "[$vid] 방송 시작 추정: ${st:-없음(클립은 게임 구간 전체에서 오디오로 찾음)}"
  off=$(cat "audio/$vid.offset" 2>/dev/null || echo 0)
  clipnote=""
  if [ ! -f "trial/clips/$key.json" ] && [ "$HL_NO_CLIPS" != 1 ]; then
    if [ "$blocked" = 1 ]; then clipnote="미룸"
    else
      "$PY" -X utf8 -I "$HERE/clips_for_video.py" "$W" "$vid" "$day" "$s0" "$s1" "$st" > "trial/clips_$key.log" 2>&1; rc=$?
      if [ $rc = 0 ]; then echo "[$vid] $(tail -1 "trial/clips_$key.log")"
      elif [ $rc = 5 ]; then blocked=1; clipnote="미룸"; echo "[$vid] 클립 받기 막힘(종료 코드 5: VOD 클립 다운로더 앱이 열려 있음). GPU 단계만 계속"
      else clipnote="실패"; echo "[$vid] 클립 맞추기 FAILED(코드 $rc) $(tail -1 "trial/clips_$key.log")"; fi
    fi
  fi
  [ -f "trial/laugh/$vid.panns.npy" ] || "$PY" -I -u "$HERE/laugh_panns.py" "$CKPT" "$au" "trial/laugh/$vid" "$off" > "trial/laugh/$vid.panns.log" 2>&1 \
    || { echo "[$vid] PANNs FAILED $(grep -a -m1 -E 'Error' "trial/laugh/$vid.panns.log")"; nodone="$nodone $game"; continue; }
  [ -f "trial/asr/$key.json" ] || "$PY" -I -u "$HERE/asr_windows.py" "$W" "$vid" "$game" "$s0" "$s1" 16 full > "trial/asr/$key.log" 2>&1 \
    || { echo "[$vid] WhisperX FAILED $(grep -a -m1 -E 'Error' "trial/asr/$key.log")"; nodone="$nodone $game"; continue; }
  if [ -n "$clipnote" ]; then
    pending="$pending $game"; echo "[$vid] 받아쓰기까지 끝, 클립 $clipnote → 후보 묶음은 클립을 맞춘 뒤(다시 실행) $(( $(date +%s)-t0 ))초"; continue
  fi
  if [ -n "$st" ]; then "$PY" -X utf8 -I "$HERE/build_packets.py" "$W" "$vid" "$game" "$s0" "$s1" 40 "$st" > /dev/null
  else "$PY" -X utf8 -I "$HERE/build_packets.py" "$W" "$vid" "$game" "$s0" "$s1" 40 > /dev/null; fi \
    && echo "[$vid] 완료 $(( $(date +%s)-t0 ))초 → trial/packets/$key.v2.txt" || { echo "[$vid] 묶음 FAILED"; nodone="$nodone $game"; }
done 3< "$TSV"   # TSV는 3번으로 읽는다(ffmpeg 등 자식 프로세스가 표준 입력을 먹지 않게)
[ -n "$pending" ] && echo "[all] 클립 미처리:$pending — 앱을 닫거나 원인을 고친 뒤 같은 명령으로 다시 실행"
[ -n "$nodone" ] && echo "[all] 끝내지 못함:$nodone"
echo "[all] done $(date +%T)"
