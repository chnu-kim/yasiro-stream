"""장르별 기준용 후보 묶음: 웃음뿐 아니라 놀람·흥분·클리어·탄식 등 반응 전반을 후보로 뽑는다.

사용: python build_packets.py <work_dir> <video_id> <game_id> <game_start> <game_end> [max_groups=45] [방송시작 "YYYY-MM-DD HH:MM:SS"]
신호: yt 태그([웃음]·[비명]·[헉 소리]·[환호]·[박수]) / 반응 말(WhisperX) / 음량 봉우리 / PANNs 웃음 / 치지직 클립(가장 무겁다)
  클립은 trial/clips/<vid>.json(오디오로 맞춘 위치, ok인 것)이 있으면 그것을, 없고 방송 시작을 주면 '만든 시각 - 방송 시작' 추정을 쓴다
  유튜브 자막(subs/<vid>.txt)·1차 선정(hl/final-funny.json)은 있으면 쓴다
출력: trial/packets/<vid>.v2.txt (환경 변수 HL_KEY가 있으면 그 이름. 입력 asr·clips도 같은 이름)  (work/tools/build_packets2.py를 옮긴 것이라 출력 파일 이름은 그대로 둔다)
  클립 줄 끝이 [오디오 일치]면 '추정'이라고 적혀 있어도 오디오로 맞춘 위치다
"""
import json
import re
import subprocess
import sys

import numpy as np

W, vid, game = sys.argv[1], sys.argv[2], sys.argv[3]
import os  # noqa: E402
KEY = os.environ.get('HL_KEY') or vid  # 결과 파일 이름. 한 영상에 게임이 둘이면 run_batch.sh가 <vid>.<gameId>를 준다
maxg = int(sys.argv[6]) if len(sys.argv) > 6 else 45


def sec(x):
    if ':' in x:  # "h:mm" 또는 "h:mm:ss"
        p = [int(v) for v in x.split(':')] + [0]
        return p[0] * 3600 + p[1] * 60 + p[2]
    return float(x)


def ts(s):
    s = max(0.0, s)
    return f'{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:04.1f}'


g0, g1 = sec(sys.argv[4]), sec(sys.argv[5])
TAG = re.compile(r'\[(웃음|비명|헉 소리|환호|박수)\]')
WORD = re.compile(r'ㅋㅋ|개웃|웃겨|웃기|웃긴|어이없|미친|뭐야|깼다|깼어|이겼|아싸|됐다|살았|죽었|으악|깜짝|무서|억울|왜 내가|아니 왜|말도 안|나이스|개쩔|대박')
LINE = re.compile(r'^\[(\d+):(\d\d):(\d\d)\]\s?(.*)$')
yt = []
import os  # noqa: E402
_sub = f'{W}/subs/{vid}.txt'
for line in (open(_sub, encoding='utf-8') if os.path.exists(_sub) else []):
    m = LINE.match(line.strip())
    if m:
        yt.append((int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]), m[4]))

score = {}  # 초 단위 점수


def add(t, w, s):
    t = int(t)
    if g0 <= t <= g1:
        e = score.setdefault(t, [0.0, set()])
        e[0] += w
        e[1].add(s)


for t, x in yt:  # 유튜브 줄은 30초 단위라 줄 가운데에 약하게
    for m in TAG.finditer(x):
        add(t + 15, 1.5, 'yt:' + m[1])
asr = json.load(open(f'{W}/trial/asr/{KEY}.json', encoding='utf-8'))
words = sorted([w for s in asr['segments'] for w in s['words'] if w.get('start') is not None],
               key=lambda w: w['start'])
for w in words:
    if WORD.search(w['word'] or ''):
        add(w['start'], 1.0, 'say:' + WORD.search(w['word'])[0])
# 음량 봉우리(1초 RMS, 게임 구간 상위 1.5%)
import os  # noqa: E402
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio_offset import audio_path, offset  # noqa: E402
OFF = offset(W, vid)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(max(0, g0 - OFF)), '-to', str(g1 - OFF), '-i', audio_path(W, vid),
                      '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
y = np.frombuffer(raw, dtype=np.float32)
rms = np.sqrt((y[:len(y) // 8000 * 8000].reshape(-1, 8000) ** 2).mean(1))
db = 20 * np.log10(rms + 1e-6)
thr = np.percentile(db, 98.5)
for i in np.where(db >= thr)[0]:
    add(g0 + i, 1.0, 'loud')
P = np.load(f'{W}/trial/laugh/{vid}.panns.npy').astype(np.float32)[:, :5].max(1)
ps = P[:len(P) // 100 * 100].reshape(-1, 100).max(1)
for t in np.where(ps >= 0.03)[0]:
    add(t, 1.5, 'laugh')

# 치지직 클립: argv[7] = 방송 시작 시각 "YYYY-MM-DD HH:MM:SS"(KST). 클립 위치 ≈ 만든 시각 - 방송 시작 (끝 기준)
clipmarks = []
aligned_p = f'{W}/trial/clips/{KEY}.json'
if os.path.exists(aligned_p):  # 오디오로 맞춘 정확한 위치가 있으면 그것을 쓴다
    for c in json.load(open(aligned_p, encoding='utf-8')):
        if c['ok'] and g0 - 60 <= c['end'] and c['start'] <= g1 + 60:
            cc = {'clipTitle': c['title'] + ' [오디오 일치]', 'duration': c['duration'], 'readCount': c['readCount']}
            clipmarks.append((c['start'], c['end'], cc))
            for t in range(int(c['start']), int(c['end']) + 1, 5):
                add(t, 3.0, 'clip')
elif len(sys.argv) > 7:
    import datetime as D
    st = D.datetime.fromisoformat(sys.argv[7])
    for c in json.load(open(f'{W}/data/chzzk-clips.json', encoding='utf-8')):
        end = (D.datetime.fromisoformat(c['createdDate']) - st).total_seconds()
        a = end - c['duration']
        if g0 - 60 <= end <= g1 + 60:
            clipmarks.append((a, end, c))
            for t in range(int(a), int(end) + 1, 5):
                add(t, 3.0, 'clip')

# 15초 안에 붙은 지점을 묶고 점수 합으로 순위
groups = []
for t in sorted(score):
    sc, src = score[t]
    if groups and t - groups[-1]['t1'] <= 15:
        g = groups[-1]
        g['t1'] = t
        g['score'] += sc
        g['src'] |= src
    else:
        groups.append({'t0': t, 't1': t, 'score': sc, 'src': set(src)})
top = sorted(groups, key=lambda g: -g['score'])[:maxg]
top.sort(key=lambda g: g['t0'])


def script(a, b):
    out, line, ls, prev = [], [], None, None
    for w in words:
        if w['start'] < a or w['start'] > b:
            continue
        if prev is not None and w['start'] - prev >= 2.5:
            if line:
                out.append(f'[{ts(ls)}] {" ".join(line)}')
            out.append(f'   (말 없음 {w["start"] - prev:.1f}초)')
            line = []
        elif line and w['start'] - ls > 4:
            out.append(f'[{ts(ls)}] {" ".join(line)}')
            line = []
        if not line:
            ls = w['start']
        line.append(w['word'])
        prev = w.get('end') or w['start']
    if line:
        out.append(f'[{ts(ls)}] {" ".join(line)}')
    return out


_ffp = f'{W}/hl/final-funny.json'
ff = {x['gameId']: x for x in json.load(open(_ffp, encoding='utf-8'))}.get(game) if os.path.exists(_ffp) else None
os.makedirs(f'{W}/trial/packets', exist_ok=True)
with open(f'{W}/trial/packets/{KEY}.v2.txt', 'w', encoding='utf-8') as f:
    f.write(f'# {vid} {game} 게임 구간 {ts(g0)}~{ts(g1)}\n')
    if ff:
        f.write(f'# 기존 선정 {ts(ff["start"])} ({ff["src"]}): {ff["note"]}\n')
    f.write(f'# 반응 묶음 {len(groups)}개 중 점수 상위 {len(top)}개(시간순). '
            f'신호: yt:태그, say:반응 말, loud=음량 봉우리, laugh=PANNs 웃음\n\n')
    for i, g in enumerate(top, 1):
        a, b = g['t0'] - 40, g['t1'] + 12
        f.write(f'## 후보 {i} {ts(g["t0"])}~{ts(g["t1"])} 점수 {g["score"]:.1f} [{", ".join(sorted(g["src"]))}]\n')
        yl = [x for t, x in yt if a - 30 <= t <= b and TAG.search(x)]
        for x in yl[:2]:
            f.write(f'  * yt: {x[:110]}\n')
        for ca, cb, c in clipmarks:
            if ca <= b and cb >= a:
                f.write(f'  * 클립 "{c["clipTitle"]}" ({c["duration"]}초, 조회 {c["readCount"]}) 추정 {ts(ca)}~{ts(cb)}\n')
        for ln in script(a, b):
            f.write(ln + '\n')
        f.write('\n')
print(vid, len(groups), 'groups ->', len(top))
