"""한 구간의 대사를 단어 시각과 함께 본다(시작 시각을 초 단위로 정할 때).

사용: python peek.py <work_dir> <key> <시작> <끝>      시각은 "h:mm:ss" 또는 초, key는 결과 파일 이름(보통 영상 id)
출력(stdout): 받아쓰기(WhisperX) 줄(약 3초 단위, 줄 첫 단어의 시각) · 그 구간에 겹치는 치지직 클립(오디오로 맞춘 위치) · 유튜브 자막 줄
- 2.5초 넘게 말이 없으면 (말 없음 N초)를 적는다. 비명·웃음은 받아쓰기에 안 잡히므로 말 없는 자리를 의심한다
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hl_common import to_sec  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
if len(sys.argv) != 5:
    sys.exit(__doc__)
W, key = sys.argv[1], sys.argv[2]
t0, t1 = (to_sec(int(x) if x.isdigit() else x) for x in sys.argv[3:5])
vid = key[:11]


def ts(s):
    return f'{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:04.1f}'


print(f'== 받아쓰기 {ts(t0)}~{ts(t1)}')
asr = json.load(open(f'{W}/trial/asr/{key}.json', encoding='utf-8'))
words = sorted((w for s in asr['segments'] for w in s['words'] if w.get('start') is not None and t0 <= w['start'] <= t1),
               key=lambda w: w['start'])
line, ls, prev = [], None, None
for w in words:
    if prev is not None and w['start'] - prev >= 2.5:
        if line:
            print(f'[{ts(ls)}] {" ".join(line)}')
        print(f'   (말 없음 {w["start"] - prev:.1f}초)')
        line = []
    elif line and w['start'] - ls > 3:
        print(f'[{ts(ls)}] {" ".join(line)}')
        line = []
    if not line:
        ls = w['start']
    line.append(w['word'])
    prev = w.get('end') or w['start']
if line:
    print(f'[{ts(ls)}] {" ".join(line)}')
cp = f'{W}/trial/clips/{key}.json'
if os.path.exists(cp):
    hits = [c for c in json.load(open(cp, encoding='utf-8')) if c['start'] <= t1 and c['end'] >= t0]
    if hits:
        print('== 치지직 클립(오디오로 맞춘 위치)')
    for c in hits:
        level = '믿음' if c.get('strong', c['ok'] and c['score'] >= 0.9) else ('대사로 재확인' if c['ok'] else '못 믿음')
        print(f'{ts(c["start"])}~{ts(c["end"])} "{c["title"]}" 조회 {c["readCount"]} · 상관 {c["score"]:.2f}, {c["ratio"]:.1f}배 → {level}')
sp = f'{W}/subs/{vid}.txt'
if os.path.exists(sp):
    print('== 유튜브 자막(약 30초 단위 줄)')
    LINE = re.compile(r'^\[(\d+):(\d\d):(\d\d)\]')
    for raw in open(sp, encoding='utf-8'):
        m = LINE.match(raw.strip())
        if m and t0 - 30 <= int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) <= t1:
            print(raw.rstrip())
