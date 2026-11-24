"""야시로 채널의 치지직 클립 목록을 모두 받아 JSON으로 저장한다(제목·길이·만든 시각·조회수. 영상은 받지 않는다).

사용: python fetch_clips.py <out.json>     보통 <work_dir>/data/chzzk-clips.json
- 치지직 공개 API를 50개씩 0.3초 간격으로 읽는다(2026-11 기준 871개, 수 초)
- 기존 파일을 덮어쓰므로 새 묶음을 시작할 때 한 번만 돌린다
"""
import json
import sys
import time
import urllib.parse
import urllib.request

CH = 'd6e680f5b17eba0b078f978dd722c0f3'  # 야시로 채널(공개 정보)
KEYS = ('clipUID', 'videoId', 'clipTitle', 'clipCategory', 'categoryType', 'duration', 'createdDate', 'readCount')
out, nxt = [], None
while True:
    q = {'filterType': 'ALL', 'orderType': 'RECENT', 'size': 50}
    if nxt:
        q.update(nxt)
    u = f'https://api.chzzk.naver.com/service/v1/channels/{CH}/clips?' + urllib.parse.urlencode(q)
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
    d = json.load(urllib.request.urlopen(req))['content']
    out += [{k: c.get(k) for k in KEYS} for c in d['data']]
    nxt = d['page'].get('next')
    if not nxt or not d['data']:
        break
    time.sleep(0.3)
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(out), '개', out[-1]['createdDate'] if out else '', '~', out[0]['createdDate'] if out else '')
