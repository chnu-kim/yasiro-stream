"""운영 조회 결과를 기준으로 재선정 묶음(TSV)을 만든다.

사용:
  python make_batch.py <work_dir> <prod.json> --list [N=40]      남은 게임을 치지직 게임 클립이 많은 순으로 보여 준다
  python make_batch.py <work_dir> <prod.json> <gameId> [...]     그 게임들의 TSV를 stdout으로 낸다(안내는 stderr)

- 게임 id·영상 id는 운영 조회(prod.json)가 기준이다. 넘겨받은 목록의 id를 믿지 않는다
- 게임 구간은 <work_dir>/hl/final.json(segmentStartSec/EndSec)에서, 방송 날짜는 data/videos.json에서 읽는다
  구간이 없거나 영상이 운영과 다르면 그 게임은 빼고 알린다(timeline.py로 구간을 찾아 TSV에 손으로 넣는다)
- 사용자가 직접 정한 게임(protected.json)은 넣지 않는다
- --list의 '확정'은 <work_dir>/ops/ops-batch*.json에 이미 들어 있는 게임이다
TSV: vid<TAB>gameId<TAB>게임시작 h:mm:ss<TAB>게임끝 h:mm:ss<TAB>방송날짜
"""
import collections
import datetime as D
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hl_common import hms, load_prod, load_protected  # noqa: E402

if len(sys.argv) < 4:
    sys.exit(__doc__)
W, prod_path, args = sys.argv[1], sys.argv[2], sys.argv[3:]
for out in (sys.stdout, sys.stderr):
    out.reconfigure(encoding='utf-8', newline='\n')


def load(rel):
    return json.load(open(f'{W}/{rel}', encoding='utf-8'))


prod = collections.defaultdict(list)
for r in load_prod(prod_path):
    prod[r['game_id']].append(r)
protected = load_protected()
final = {x['gameId']: x for x in load('hl/final.json')}
vdate = {v['id']: v['dates'][0] for v in load('data/videos.json') if v.get('dates')}
names = {x['gameId']: x['name'] for x in load('hl/index2.json')} if os.path.exists(f'{W}/hl/index2.json') else {}
clips = load('data/chzzk-clips.json')
done = set()
for p in glob.glob(f'{W}/ops/ops-batch*.json'):
    done |= {o['id'] for o in json.load(open(p, encoding='utf-8')) if o.get('op') == 'highlight'}


def row(game):
    """(행 | None, 이유). 영상은 운영에서 하이라이트가 적힌 다시보기, 없으면 final.json의 영상이 운영 다시보기에 있을 때 그것."""
    if game not in prod:
        return None, '운영 조회에 없는 게임 id'
    if game in protected:
        return None, f'사용자 지정 {hms(protected[game]["start"])} — 덮어쓰지 않음'
    f = final.get(game)
    if not f or f.get('segmentStartSec') is None or f.get('segmentEndSec') is None:
        return None, 'final.json에 게임 구간 없음(timeline.py로 찾기)'
    vid = f['url'][-11:]
    lit = [r['video_id'] for r in prod[game] if r['highlight_start'] is not None]
    if vid not in [r['video_id'] for r in prod[game]]:
        return None, f'final.json 영상({vid})이 운영 다시보기에 없음'
    if lit and vid not in lit:
        return None, f'운영 하이라이트는 다른 영상({", ".join(lit)})에 있음 — 어느 영상으로 할지 확인'
    if vid not in vdate:
        return None, f'videos.json에 {vid} 날짜 없음'
    return {'vid': vid, 'game': game, 'g0': f['segmentStartSec'], 'g1': f['segmentEndSec'], 'day': vdate[vid],
            'fixed': bool(f.get('fixed'))}, ''


def game_clips(day):
    lo = D.datetime.combine(D.date.fromisoformat(day), D.time(8))
    hi = lo + D.timedelta(hours=24)
    return [c for c in clips if lo <= D.datetime.fromisoformat(c['createdDate']) <= hi
            and c['clipCategory'] not in ('talk', 'music')]


def has(rel_glob):
    return bool(glob.glob(f'{W}/{rel_glob}'))


if args[0] == '--list':
    n = int(args[1]) if len(args) > 1 else 40
    rows, skipped, problems = [], collections.Counter(), []
    for game in sorted(prod):
        r, why = row(game)
        if game in protected:
            skipped['사용자 지정'] += 1
        elif game in done:
            skipped['묶음에서 확정'] += 1
        elif not r:
            skipped['구간·영상 문제'] += 1
            problems.append(f'{game}: {why}')
        else:
            r['clips'] = game_clips(r['day'])
            rows.append(r)
    rows.sort(key=lambda r: (-len(r['clips']), r['g1'] - r['g0']))
    print(f'운영 게임 {len(prod)}개 중 남은 게임 {len(rows)}개. 제외: ' + ', '.join(f'{k} {v}' for k, v in skipped.items()))
    print('게임 id | 이름 | 영상 방송날짜 | 게임 구간(시간) | 그날 게임 클립 수(최다 조회) | 준비된 것')
    for r in rows[:n]:
        top = max((c['readCount'] for c in r['clips']), default=0)
        ready = ''.join(k for k, g in (('오', f'audio/{r["vid"]}.*'), ('자', f'subs/{r["vid"]}.txt'),
                                        ('받', f'trial/asr/{r["vid"]}.json')) if has(g)) or '-'
        print(f'{r["game"]} | {names.get(r["game"], "")} | {r["vid"]} {r["day"]} | {hms(r["g0"])}~{hms(r["g1"])} '
              f'({(r["g1"] - r["g0"]) / 3600:.1f}h) | {len(r["clips"])}({top}) | {ready}'
              + (' | 1차 시각을 Claude가 고친 게임(fixed)' if r['fixed'] else ''))
    for x in problems:
        print('문제 ' + x)
    print('준비된 것: 오=오디오 받음, 자=유튜브 자막 있음, 받=WhisperX 받아쓰기 끝남. 그날 클립은 방송 날짜 기준이라 같은 날 다른 게임 클립이 섞일 수 있어요.')
    sys.exit(0)

hours = 0.0
for game in args:
    r, why = row(game)
    if not r:
        print(f'뺌 {game}: {why}', file=sys.stderr)
        continue
    if game in done:
        print(f'주의 {game}: ops-batch*.json에 이미 확정된 게임이에요', file=sys.stderr)
    if r['fixed']:
        print(f'참고 {game}: 1차 시각은 에이전트 값을 Claude가 고친 것(fixed)', file=sys.stderr)
    hours += (r['g1'] - r['g0']) / 3600
    print('\t'.join([r['vid'], game, hms(r['g0']), hms(r['g1']), r['day']]))
print(f'게임 구간 합계 {hours:.1f}시간. 받아쓰기는 게임 1시간에 약 5분(RTX 3060 실측), 오디오 받기·클립 맞추기·PANNs는 따로 걸려요 '
      f'(1차 묶음 9편, 게임 구간 약 32시간이 3시간 16분. 오디오 일부는 미리 받은 상태).', file=sys.stderr)
