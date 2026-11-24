"""한 다시보기의 치지직 클립을 받아 오디오로 정확한 위치를 찾는다.

사용: python clips_for_video.py <work_dir> <video_id> <방송날짜> <게임시작초> <게임끝초> [방송시작 "YYYY-MM-DD HH:MM:SS"]
- 방송 날짜 08시~다음 날 08시에 만든 클립 중, 추정 위치가 게임 구간(±5분) 안이거나 방송 시작을 모르면 전부 받는다
- chzzk-cli로 clips/<vid>/에 받고 align_clip.py로 맞춘다(추정이 있으면 ±10분, 없으면 게임 구간 전체)
- chzzk-cli 위치: 환경 변수 CHZZK_CLI, 없으면 %LOCALAPPDATA%/VOD 클립 다운로더/chzzk-cli.exe
  앱(VOD 클립 다운로더)이 열려 있으면 종료 코드 5 → 바로 멈춘다(종료 코드 5, 결과 파일을 쓰지 않는다)
출력: trial/clips/<vid>.json (환경 변수 HL_KEY가 있으면 그 이름)  [{clipUID,title,duration,readCount,category,start,end,score,ratio,ok,strong}]
  ok = 상관 0.5 이상·두 번째 대비 1.5배 이상(후보로 씀), strong = 상관 0.9 이상·1.5배 이상(초 단위로 믿음)
"""
import datetime as D
import json
import os
import re
import subprocess
import sys

W, vid, day, g0, g1 = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
st = D.datetime.fromisoformat(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6] else None
CLI = os.environ.get('CHZZK_CLI') or os.path.join(os.environ.get('LOCALAPPDATA', ''), 'VOD 클립 다운로더', 'chzzk-cli.exe')
HERE = os.path.dirname(os.path.abspath(__file__))
if not os.path.exists(CLI):
    sys.exit(f'chzzk-cli를 찾지 못했어요: {CLI} (CHZZK_CLI 환경 변수로 지정)')
PY = f'{W}/venv/Scripts/python.exe'
KEY = os.environ.get('HL_KEY') or vid  # 결과 파일 이름. 한 영상에 게임이 둘이면 run_batch.sh가 <vid>.<gameId>를 준다
lo = D.datetime.combine(D.date.fromisoformat(day), D.time(8))
hi = lo + D.timedelta(hours=24)
clips = [c for c in json.load(open(f'{W}/data/chzzk-clips.json', encoding='utf-8'))
         if lo <= D.datetime.fromisoformat(c['createdDate']) <= hi]
os.makedirs(f'{W}/clips/{vid}', exist_ok=True)
os.makedirs(f'{W}/trial/clips', exist_ok=True)
out = []
for c in clips:
    est = None
    if st:
        est = (D.datetime.fromisoformat(c['createdDate']) - st).total_seconds() - c['duration']
        if not (g0 - 300 <= est <= g1 + 300):
            continue
    r = subprocess.run([CLI, 'download', f'https://chzzk.naver.com/clips/{c["clipUID"]}', '--out', f'{W}/clips/{vid}'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode == 5:  # 앱이 열려 있음. 클립마다 실패를 반복하지 않고 멈춘다
        print('chzzk-cli 종료 코드 5: VOD 클립 다운로더 앱이 열려 있어요. 사용자에게 앱을 닫아 달라고 한 뒤 다시 실행하세요.', flush=True)
        sys.exit(5)
    path = (r.stdout.strip().splitlines() or [''])[-1]
    if r.returncode != 0 or not os.path.exists(path):
        print(f'  받기 실패 {c["clipTitle"]} (코드 {r.returncode})', flush=True)
        continue
    center, radius = (est, 600) if est is not None else ((g0 + g1) / 2, (g1 - g0) / 2 + 300)
    a = subprocess.run([PY, '-X', 'utf8', '-I', os.path.join(HERE, 'align_clip.py'), W, vid, path, str(center), str(radius)],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    m = re.search(r'\(([\d.]+)초\), 길이 ([\d.]+)초, 상관 ([-\d.]+), 두 번째 대비 ([\d.]+)배', a.stdout)
    if not m:
        print(f'  맞추기 실패 {c["clipTitle"]}: {a.stderr[-200:]}', flush=True)
        continue
    s, ln, sc, ratio = map(float, m.groups())
    ok = ratio >= 1.5 and sc >= 0.5
    out.append({'clipUID': c['clipUID'], 'title': c['clipTitle'], 'duration': c['duration'], 'readCount': c['readCount'],
                'category': c['clipCategory'], 'start': round(s, 2), 'end': round(s + ln, 2), 'score': sc, 'ratio': ratio,
                'ok': ok, 'strong': ok and sc >= 0.9})
    print(f'  {"OK " if ok else "?? "}{c["clipTitle"][:30]} → {int(s//3600)}:{int(s%3600//60):02d}:{s%60:04.1f} '
          f'(상관 {sc:.2f}, {ratio:.1f}배)', flush=True)
json.dump(out, open(f'{W}/trial/clips/{KEY}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{vid}: 클립 {len(clips)}개 중 {len(out)}개 맞춤, 믿을 만함 {sum(o["ok"] for o in out)}개')
