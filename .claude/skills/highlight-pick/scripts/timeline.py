"""유튜브 자막을 일정 간격으로 훑어 방송 흐름을 본다(게임 구간 시작·끝을 찾을 때).

사용: python timeline.py <work_dir> <간격초> <video_id> [...]
출력: <work_dir>/trial/timeline.txt  (영상마다 '===== <id>' 아래 'h:mm 자막 앞부분')
"""
import re
import sys

W = sys.argv[1]
step = int(sys.argv[2])
LINE = re.compile(r'^\[(\d+):(\d\d):(\d\d)\]\s?(.*)$')
out = []
for v in sys.argv[3:]:
    out.append(f'===== {v}')
    nxt = 0
    for line in open(f'{W}/subs/{v}.txt', encoding='utf-8'):
        m = LINE.match(line.strip())
        if not m:
            continue
        t = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
        if t >= nxt:
            out.append(f'{m[1]}:{m[2]} {m[4][:75]}')
            nxt = t + step
open(f'{W}/trial/timeline.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(f'{W}/trial/timeline.txt', len(out), '줄')
