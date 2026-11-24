#!/usr/bin/env bash
# 묶음 TSV의 다시보기 오디오 받기. 작업 폴더: 환경 변수 HL_WORK, 없으면 <레포>/work
#   fetch_audio.sh sizes <묶음.tsv>   아직 없는 영상의 오디오 크기·길이만 묻는다(받지 않는다). 받기 전에 먼저 돌려 사용자에게 합계를 알린다
#   fetch_audio.sh get <묶음.tsv>     하나씩 차례로 받는다. 진행은 trial/dl_<vid>.log 에 줄 단위로 남는다
# - 전체 오디오를 받는다. yt-dlp --download-sections(구간만 받기)는 재생 속도 수준으로 느려서 쓰지 않는다
# - get 은 도는 동안 audio/.fetching 을 둔다(run_batch.sh가 이걸 보고 기다린다). 동시에 두 개를 돌리지 않는다
# - 시작 30초쯤 뒤 `tail -c 300 trial/dl_<vid>.log` 로 속도를 읽어 사용자에게 알린다. 느리면(1MB/s 아래) 멈추고 보고한다
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${HL_WORK:-$(cd "$HERE/../../../.." && pwd)/work}"
YT="$W/venv/Scripts/yt-dlp.exe"
mode="$1"
[ -f "$2" ] && { [ "$mode" = sizes ] || [ "$mode" = get ]; } || { echo "사용: fetch_audio.sh sizes|get <묶음.tsv>"; exit 2; }
[ -x "$YT" ] || { echo "yt-dlp가 없어요: $YT (HL_WORK 확인)"; exit 2; }
TSV="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
cd "$W" || exit 1
mkdir -p audio trial
has(){ local e; for e in webm m4a opus; do [ -f "audio/$1.$e" ] && return 0; done; return 1; }
vids=$(awk -F'\t' '$1 !~ /^#/ && $1 != "" {print $1}' "$TSV" | tr -d '\r' | awk '!seen[$0]++')
if [ "$mode" = sizes ]; then
  total=0; n=0
  for vid in $vids; do
    has "$vid" && { echo "$vid 이미 있음"; continue; }
    line=$("$YT" --js-runtimes node -f bestaudio --no-warnings --print "%(filesize,filesize_approx)s %(duration)s" "https://www.youtube.com/watch?v=$vid" 2>&1 | tail -1)
    bytes=${line%% *}; dur=${line##* }
    case "$bytes" in ''|*[!0-9]*) echo "$vid 크기 확인 실패: $line"; continue;; esac
    mb=$((bytes/1048576)); total=$((total+mb)); n=$((n+1))
    echo "$vid ${mb}MB (영상 $(( ${dur%.*}/3600 ))시간 $(( ${dur%.*}%3600/60 ))분)"
  done
  echo "받을 것 ${n}개, 합계 ${total}MB (2026-11-24 실측 속도 약 0.8~3.6MB/s). 디스크 여유: $(df -h "$W" | awk 'NR==2{print $4}')"
  exit 0
fi
[ -f audio/.fetching ] && { echo "다른 받기가 돌고 있어요(audio/.fetching). 끝난 게 확실하면 그 파일을 지우고 다시 실행"; exit 3; }
: > audio/.fetching; trap 'rm -f audio/.fetching' EXIT
for vid in $vids; do
  has "$vid" && continue
  t0=$(date +%s); echo "[받기] $vid 시작 $(date +%T) (로그 trial/dl_$vid.log)"
  if "$YT" --js-runtimes node -f bestaudio -o "audio/%(id)s.%(ext)s" --newline --progress-delta 5 \
      "https://www.youtube.com/watch?v=$vid" > "trial/dl_$vid.log" 2>&1 && has "$vid"; then
    f=$(ls audio/$vid.webm audio/$vid.m4a audio/$vid.opus 2>/dev/null | head -1); mb=$(du -m "$f" | cut -f1); dt=$(( $(date +%s)-t0 ))
    echo "[받기] $vid ${mb}MB ${dt}초 ($(awk -v m="$mb" -v d="$dt" 'BEGIN{printf "%.1f", m/(d>0?d:1)}')MB/s)"
  else echo "[받기] $vid FAILED $(tail -c 200 "trial/dl_$vid.log" | tr '\r' '\n' | tail -1)"; fi
done
echo "[받기] done $(date +%T)"
