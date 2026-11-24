"""게임 구간을 WhisperX(large-v3)로 받아쓴다. 일곱 번째 인자가 full이면 구간 전체(장르별 기준은 이쪽), 없으면 후보 지점 주변만.

사용: python asr_windows.py <work_dir> <video_id> <game_id> <game_start> <game_end> [batch=16] [full]
  game_start/end: "h:mm"·"h:mm:ss" 또는 초
  모델은 <work_dir>/models(HF_HOME·TORCH_HOME)에 둔다. 유튜브 자막(subs/<vid>.txt)·1차 선정(hl/final-funny.json)은 있으면 쓴다
후보 지점: 유튜브 자막의 [웃음]·웃음 말 줄, jrgillick·PANNs 상위 봉우리, 기존 선정 시각
창: 지점 -60s ~ +20s(자막 줄은 줄 시작 -60 ~ +50), 겹치면 합친다
출력: trial/asr/<vid>.json (환경 변수 HL_KEY가 있으면 그 이름). {audio, model, game:[시작초,끝초], windows, segments[{start,end,text,words}]}
"""
import gc
import json
import re
import sys
import time

import os

# 모델은 작업 폴더 안(<work_dir>/models)에 둔다. whisperx를 불러오기 전에 정해야 한다
_W = os.path.abspath(sys.argv[1])
os.environ.setdefault('HF_HOME', os.path.join(_W, 'models', 'hf'))
os.environ.setdefault('TORCH_HOME', os.path.join(_W, 'models', 'torch'))

import numpy as np  # noqa: E402
import torch  # noqa: E402
import whisperx  # noqa: E402

W, vid, game = sys.argv[1], sys.argv[2], sys.argv[3]
KEY = os.environ.get('HL_KEY') or vid  # 결과 파일 이름. 한 영상에 게임이 둘이면 run_batch.sh가 <vid>.<gameId>를 준다
batch = int(sys.argv[6]) if len(sys.argv) > 6 else 16


def sec(x):
    if ':' in x:  # "h:mm" 또는 "h:mm:ss"
        p = [int(v) for v in x.split(':')] + [0]
        return p[0] * 3600 + p[1] * 60 + p[2]
    return float(x)


g0, g1 = sec(sys.argv[4]), sec(sys.argv[5])
LINE = re.compile(r'^\[(\d+):(\d\d):(\d\d)\]\s?(.*)$')
CUE = re.compile(r'\[웃음\]|ㅋㅋ|개웃|웃겨|웃기|웃긴|어이없|어이가 없|미친놈|뭐야 이게')
pts = []
_sub = f'{W}/subs/{vid}.txt'
for line in (open(_sub, encoding='utf-8') if os.path.exists(_sub) else []):
    m = LINE.match(line.strip())
    if m and CUE.search(m[4]):
        t = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
        pts.append((t - 60, t + 50, 'yt'))
import os  # noqa: E402
lp = f'{W}/trial/laugh/{vid}.laughs.json'
lj = json.load(open(lp)) if os.path.exists(lp) else {'laughs': []}  # jrgillick은 선택(정확도 낮아 생략 가능)
ev = sorted([x for x in lj['laughs'] if g0 <= x[0] <= g1], key=lambda x: -(x[1] - x[0]) * x[2])[:40]
pts += [(a - 60, b + 20, 'jg') for a, b, p in ev]
P = np.load(f'{W}/trial/laugh/{vid}.panns.npy').astype(np.float32)[:, :5].max(1)
ps = P[:len(P) // 100 * 100].reshape(-1, 100).max(1)
picked = []
for t in np.argsort(-ps):
    if not (g0 <= t <= g1):
        continue
    if all(abs(t - q) > 15 for q in picked):
        picked.append(int(t))
    if len(picked) == 40:
        break
pts += [(t - 60, t + 20, 'pn') for t in picked]
_ffp = f'{W}/hl/final-funny.json'
ff = {x['gameId']: x for x in json.load(open(_ffp, encoding='utf-8'))}.get(game) if os.path.exists(_ffp) else None
if ff:
    pts.append((ff['start'] - 60, ff['start'] + 60, 'ff'))
pts = sorted((max(g0, a), min(g1, b), s) for a, b, s in pts if b > g0 and a < g1)
wins = []
for a, b, s in pts:
    if wins and a <= wins[-1][1] + 5:
        wins[-1][1] = max(wins[-1][1], b)
    else:
        wins.append([a, b])
if len(sys.argv) > 7 and sys.argv[7] == 'full':  # 게임 구간 전체(장르별 기준용)
    wins = [[g0, g1]]
total = sum(b - a for a, b in wins)
print(f'{len(pts)} points -> {len(wins)} windows, {total/60:.0f} min of {(g1-g0)/60:.0f} min game', flush=True)

t0 = time.time()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio_offset import audio_path, offset  # noqa: E402
OFF = offset(W, vid)  # 구간만 받은 오디오면 그 시작 초
audio = whisperx.load_audio(audio_path(W, vid))
SR = 16000
wins = [[max(a, OFF), b] for a, b in wins if b > OFF]
model = whisperx.load_model('large-v3', 'cuda', compute_type='float16', language='ko', vad_method='silero',
                            asr_options={'condition_on_previous_text': False})
raw = []
for a, b in wins:
    r = model.transcribe(audio[int((a - OFF) * SR):int((b - OFF) * SR)], batch_size=batch, language='ko',
                         print_progress=False)
    raw.append((a, b, r['segments']))
print(f'transcribed in {time.time()-t0:.0f}s', flush=True)
del model
gc.collect()
torch.cuda.empty_cache()
am, meta = whisperx.load_align_model(language_code='ko', device='cuda')
segs = []
for a, b, ss in raw:
    if not ss:
        continue
    clip = audio[int((a - OFF) * SR):int((b - OFF) * SR)]
    al = whisperx.align(ss, am, meta, clip, 'cuda', return_char_alignments=False)
    for s in al['segments']:
        off = lambda x: None if x is None else round(x + a, 2)  # noqa: E731
        segs.append({'start': off(s.get('start')), 'end': off(s.get('end')), 'text': s.get('text', '').strip(),
                     'words': [{'word': w.get('word'), 'start': off(w.get('start')), 'end': off(w.get('end')),
                                'score': w.get('score')} for w in s.get('words', [])]})
json.dump({'audio': vid, 'model': 'large-v3', 'game': [g0, g1], 'windows': wins, 'segments': segs},
          open(f'{W}/trial/asr/{KEY}.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(f'done {time.time()-t0:.0f}s')
