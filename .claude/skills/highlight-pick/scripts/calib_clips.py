"""치지직 클립 제목을 유튜브 자막과 대조해 방송 시작 시각(KST)을 추정한다.

사용: python calib_clips.py <work_dir> <video_id> <broadcast_date YYYY-MM-DD>
원리: 클립 끝 ≈ 만든 시각. 제목 낱말이 자막 줄에 나오면 '방송 시작 = 만든 시각 - 그 줄 시각'이 후보.
      낱말은 드물수록 무겁게(idf). 클립마다 가장 잘 맞는 줄(점수가 최고점의 80% 이상)만 후보로 내고,
      여러 클립 후보를 1분 단위로 모아 표가 가장 많은 값을 고른다(인접 ±1분 합산).
출력(stdout JSON): {"start": "YYYY-MM-DD HH:MM:SS" | null, "votes": x, "clips": n, "detail": [...]}
"""
import collections
import datetime as D
import json
import math
import re
import sys

W, vid, day = sys.argv[1], sys.argv[2], sys.argv[3]
LINE = re.compile(r'^\[(\d+):(\d\d):(\d\d)\]\s?(.*)$')
lines = []
import os  # noqa: E402
if not os.path.exists(f'{W}/subs/{vid}.txt'):  # 자막 없는 영상은 추정하지 않는다
    print(json.dumps({'start': None, 'votes': 0, 'clips': 0, 'detail': [], 'note': '자막 없음'}, ensure_ascii=False))
    sys.exit(0)
for line in open(f'{W}/subs/{vid}.txt', encoding='utf-8'):
    m = LINE.match(line.strip())
    if m:
        lines.append((int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]), m[4].replace(' ', '')))
N = len(lines)
d = D.date.fromisoformat(day)
lo = D.datetime.combine(d, D.time(8))
hi = lo + D.timedelta(hours=24)
clips = [c for c in json.load(open(f'{W}/data/chzzk-clips.json', encoding='utf-8'))
         if lo <= D.datetime.fromisoformat(c['createdDate']) <= hi]
ALT = {'1': '일', '2': '이', '3': '삼', '4': '사', '5': '오'}


def variants(w):
    out = {w}
    if any(ch in ALT for ch in w):
        out.add(''.join(ALT.get(ch, ch) for ch in w))
    return out


votes = collections.Counter()
detail = []
for c in clips:
    words = [w for w in re.findall(r'[가-힣A-Za-z0-9]{2,}', c['clipTitle'])]
    if not words:
        continue
    idf = {}
    for w in words:
        df = sum(1 for _, x in lines if any(v in x for v in variants(w)))
        if df:
            idf[w] = math.log((N + 1) / df)
    if not idf:
        detail.append({'title': c['clipTitle'], 'created': c['createdDate'], 'best': None})
        continue
    scored = []
    for t, x in lines:
        sc = sum(v for w, v in idf.items() if any(z in x for z in variants(w)))
        if sc:
            scored.append((sc, t))
    top = max(s for s, _ in scored)
    if top < math.log((N + 1) / 3):  # 너무 흔한 말만 맞으면 쓰지 않는다
        detail.append({'title': c['clipTitle'], 'created': c['createdDate'], 'best': None})
        continue
    best = [t for s, t in scored if s >= 0.8 * top]
    created = D.datetime.fromisoformat(c['createdDate'])
    ks = {int((created - D.timedelta(seconds=t + 30)).timestamp() // 60) for t in best}
    for k in ks:
        votes[k] += 1.0 / len(ks)
    detail.append({'title': c['clipTitle'], 'created': c['createdDate'], 'best': [t for t in best][:3]})
if votes:
    def score(k):
        return votes[k] + votes.get(k - 1, 0) + votes.get(k + 1, 0)
    best = max(votes, key=score)
    n = round(score(best), 2)
    start = D.datetime.fromtimestamp(best * 60).strftime('%Y-%m-%d %H:%M:%S') if n >= 1.5 else None
else:
    start, n = None, 0
print(json.dumps({'start': start, 'votes': n, 'clips': len(clips), 'detail': detail}, ensure_ascii=False))
