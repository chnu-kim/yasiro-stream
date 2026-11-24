"""결과 페이지의 유튜브 링크(t=초)가 화면에 적힌 h:mm:ss와 같은지 검사한다. 하나라도 틀리면 종료 코드 1.

사용: python check_links.py <page.html> [--ops <ops.json>]
- 후보 카드(<article class="cand">)마다 큰 시각(<span class="t">)과 링크의 t=초가 같아야 한다. 카드에 링크·시각이 하나씩 있어야 한다
- 카드 밖의 링크는 가장 가까이 적힌 h:mm:ss와 비교한다
- --ops를 주면 ops의 각 항목(영상 id·start)이 페이지에서 '확정' 표시가 붙은 카드의 링크와 같은지도 본다
build_page.py가 만든 페이지도, 손으로 고친 페이지도 올리기 전에 반드시 통과시킨다(2026-11-24 손 계산 링크 3개가 틀렸다).
"""
import json
import re
import sys

for _o in (sys.stdout, sys.stderr):
    _o.reconfigure(encoding='utf-8')
argv = sys.argv[1:]
ops_path = None
if '--ops' in argv:
    i = argv.index('--ops')
    ops_path = argv[i + 1]
    del argv[i:i + 2]
if len(argv) != 1:
    sys.exit(__doc__)
path = argv[0]
s = open(path, encoding='utf-8').read()
LINK = re.compile(r'watch\?v=([\w-]{11})&(?:amp;)?t=(\d+)s')
TIME = re.compile(r'(?<![\d:])(\d+):(\d\d):(\d\d)(?![\d:])')


def hms(t):
    return f'{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}'


bad, n = 0, 0
confirmed = set()  # 확정 카드의 (영상 id, 초)
covered = []
for m in re.finditer(r'<article class="cand">.*?</article>', s, re.S):
    block = m.group(0)
    covered.append((m.start(), m.end()))
    links = LINK.findall(block)
    shown = re.findall(r'<span class="t">\s*(\d+:\d\d:\d\d)\s*</span>', block)
    if len(links) != 1 or len(shown) != 1:
        bad += 1
        print(f'틀림 카드에 링크 {len(links)}개·큰 시각 {len(shown)}개(하나씩이어야 함): {re.sub(r"<[^>]+>", " ", block)[:60]}')
        continue
    n += 1
    vid, t = links[0][0], int(links[0][1])
    if hms(t) != shown[0]:
        bad += 1
        print(f'틀림 {vid}: 링크 t={t}({hms(t)}) / 화면 {shown[0]}')
    if re.search(r'<span class="chip good">\s*확정', block):
        confirmed.add((vid, t))
for m in LINK.finditer(s):  # 카드 밖 링크
    if any(a <= m.start() < b for a, b in covered):
        continue
    n += 1
    t = int(m.group(2))
    lo = max(0, m.start() - 400)
    near = min(TIME.finditer(s, lo, m.end() + 120), key=lambda x: abs(x.start() - m.start()), default=None)
    if not near or near.group(0) != hms(t):
        bad += 1
        print(f'틀림 {m.group(1)}: 링크 t={t}({hms(t)}) / 옆 표기 {near.group(0) if near else "없음"}')
if n == 0:
    bad += 1
    print('틀림 유튜브 링크가 하나도 없어요')
if ops_path:
    for o in json.load(open(ops_path, encoding='utf-8')):
        if o.get('op') != 'highlight' or o.get('start') is None:
            continue
        mt = TIME.fullmatch(str(o['start']))
        vid = re.search(r'[\w-]{11}$', o['url']).group(0)
        if not mt:
            bad += 1
            print(f'틀림 ops {o["id"]}: start는 "h:mm:ss"로 써요: {o["start"]!r}')
            continue
        t = int(mt[1]) * 3600 + int(mt[2]) * 60 + int(mt[3])
        if (vid, t) not in confirmed:
            bad += 1
            print(f'틀림 ops {o["id"]}: {vid} {o["start"]}와 같은 확정 카드가 페이지에 없어요')
print(f'링크 검사 {"통과" if not bad else f"실패 {bad}건"} (링크 {n}개{", ops 대조" if ops_path else ""})')
sys.exit(1 if bad else 0)
