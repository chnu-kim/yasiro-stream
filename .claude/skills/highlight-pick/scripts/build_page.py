"""후보 파일(picks.json) 하나에서 결과 페이지(HTML)와 games:edit용 ops를 함께 만든다.

사용: python build_page.py <picks.json> --prod <prod.json> --page <out.html> [--ops <ops.json>]

- 유튜브 링크의 t=초, 화면의 h:mm:ss, ops의 start를 모두 같은 초 값에서 계산한다(손으로 쓰지 않는다)
- '핵심까지 N초'도 시작 시각과 첫 핵심 대사(key) 시각에서 계산한다
- 오류가 하나라도 있으면 아무 파일도 쓰지 않고 종료 코드 1:
    시각 형식(초 정수 또는 "h:mm:ss"만), 같은 게임 중복, 확정한 게임의 id·영상이 운영 조회에 없음,
    사용자 지정 시각(protected.json)과 다른 확정
- 주의(파일은 쓴다): 핵심까지 60초 초과·핵심이 시작보다 앞, 게임 구간 밖, 운영에 다른 영상의 하이라이트가 있음
- ops에는 확정(decision)한 게임만, 운영 값과 달라지는 것만 넣는다. --ops는 확정이 하나라도 있을 때 준다
- 만든 뒤 check_links.py <out.html> --ops <ops.json> 으로 한 번 더 검사한다(다른 방식의 검사)

picks.json 형식은 reference/picks-format.md.
"""
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hl_common import SKILL_DIR, hms, load_prod, load_protected, to_sec  # noqa: E402

for _o in (sys.stdout, sys.stderr):
    _o.reconfigure(encoding='utf-8')
argv = sys.argv[1:]
opt = {}
for k in ('--prod', '--page', '--ops'):
    if k in argv:
        i = argv.index(k)
        opt[k] = argv[i + 1]
        del argv[i:i + 2]
if len(argv) != 1 or '--prod' not in opt or '--page' not in opt:
    sys.exit(__doc__)

picks = json.load(open(argv[0], encoding='utf-8'))
prod = {}
for r in load_prod(opt['--prod']):
    prod.setdefault(r['game_id'], {})[r['video_id']] = r['highlight_start']
protected = load_protected()
errors, warns = [], []
e = html.escape


def sec_of(x, where):
    try:
        return to_sec(x)
    except ValueError as ex:
        errors.append(f'{where}: {ex}')
        return 0


seen = set()
games = []
for gi, g in enumerate(picks.get('games', []), 1):
    gid, vid, name = g.get('gameId'), g.get('videoId'), g.get('name') or g.get('gameId')
    where = f'{name}({gid})'
    if not gid or not vid or len(vid) != 11:
        errors.append(f'{where}: gameId와 11자 videoId가 필요해요')
        continue
    if gid in seen:
        errors.append(f'{where}: 같은 게임이 두 번 나와요')
    seen.add(gid)
    cands = g.get('candidates') or []
    if not cands:
        errors.append(f'{where}: 후보가 없어요')
    seg = [sec_of(x, f'{where} segment') for x in g['segment']] if g.get('segment') else None
    out_c = []
    for ci, c in enumerate(cands, 1):
        cw = f'{where} 후보 {ci}'
        start = sec_of(c.get('start'), cw)
        lines = [{'t': sec_of(ln.get('t'), f'{cw} 대사'), 'text': ln.get('text', ''), 'key': bool(ln.get('key'))}
                 for ln in c.get('lines', [])]
        keys = [ln['t'] for ln in lines if ln['key']]
        lead = min(keys) - start if keys else None
        if lead is not None and lead < 0:
            warns.append(f'{cw} {hms(start)}: 핵심 대사({hms(min(keys))})가 시작보다 앞이에요')
        elif lead is not None and lead > 60:
            warns.append(f'{cw} {hms(start)}: 핵심까지 {lead}초예요(기준은 30초~1분)')
        if seg and not seg[0] <= start <= seg[1]:
            warns.append(f'{cw} {hms(start)}: 게임 구간 {hms(seg[0])}~{hms(seg[1])} 밖이에요')
        if not c.get('title') or not c.get('why'):
            errors.append(f'{cw}: title(장면 한 줄)과 why(고른 이유)가 필요해요')
        out_c.append({**c, 'start': start, 'lines': lines, 'lead': lead})
    d = g.get('decision')
    decided = None
    if d is not None:
        if not isinstance(d, int) or isinstance(d, bool) or not 1 <= d <= len(out_c):
            errors.append(f'{where}: decision은 확정한 후보 번호(1부터)예요: {d!r}')
        else:
            decided = out_c[d - 1]
            if gid not in prod:
                errors.append(f'{where}: 운영 조회에 없는 게임 id예요(운영 원본 기준으로 다시 확인)')
            elif vid not in prod[gid]:
                errors.append(f'{where}: 운영에서 이 게임의 다시보기는 {", ".join(prod[gid])}예요({vid} 없음)')
            else:
                other = [v for v, h in prod[gid].items() if h is not None and v != vid]
                if other:
                    warns.append(f'{where}: 운영에 다른 영상({", ".join(other)})의 하이라이트가 있어요. '
                                 f'카드는 날짜순 첫 영상을 틀어요. 그쪽을 지울지 사용자에게 확인')
            p = protected.get(gid)
            if p and (p['start'] != decided['start'] or p['videoId'] != vid):
                errors.append(f'{where}: 사용자가 직접 정한 {hms(p["start"])}({p["videoId"]})와 달라요. 덮어쓰지 않아요')
    elif gid in protected:
        warns.append(f'{where}: 사용자 지정 게임인데 확정이 비어 있어요({hms(protected[gid]["start"])})')
    games.append({**g, 'name': name, 'cands': out_c, 'decided': decided, 'n': gi})

if errors:
    print('\n'.join('오류 ' + x for x in errors))
    print(f'오류 {len(errors)}건 — 파일을 쓰지 않았어요')
    sys.exit(1)


def link(vid, t):
    return f'https://www.youtube.com/watch?v={vid}&t={t}s'


def cand_html(g, i, c):
    is_pick = g['decided'] is c
    chips = []
    label = c.get('label') or f'{i}위'
    if is_pick:
        chips.append(f'<span class="chip good">확정 · {e(label)}</span>')
    else:
        chips.append(f'<span class="chip">{e(label)}</span>')
    head = (f'<div class="cand-title">{"".join(chips)}<span class="t">{hms(c["start"])}</span>'
            f'<span>{e(c["title"])}</span></div>')
    btn = (f'<a class="btn" href="{e(link(g["videoId"], c["start"]))}" target="_blank" rel="noopener">▶ 보기</a>')
    meta = []
    if c['lead'] is not None:
        meta.append(f'<span class="chip{" warn" if not 0 <= c["lead"] <= 60 else ""}">핵심까지 {c["lead"]}초</span>')
    clip = c.get('clip')
    if clip:
        how = {'strong': '오디오로 위치 확인', 'ok': '오디오로 맞춤(대사로 재확인)', 'estimate': '위치 추정'}.get(clip.get('aligned'), '')
        meta.append(f'<span class="chip">치지직 클립 "{e(clip["title"])}" · 조회 {int(clip["readCount"])}'
                    f'{" · " + how if how else ""}</span>')
    for f in c.get('flags', []):
        meta.append(f'<span class="chip warn">{e(f)}</span>')
    rows = ''.join(f'<div class="row{" key" if ln["key"] else ""}"><div class="tm">{hms(ln["t"])}</div>'
                   f'<div>{e(ln["text"])}</div></div>' for ln in c['lines'])
    return ('<article class="cand">'
            f'<div class="cand-head">{head}{btn}</div>'
            + (f'<div class="meta">{"".join(meta)}</div>' if meta else '')
            + (f'<div class="log">{rows}</div>' if rows else '')
            + f'<p class="why">{e(c["why"])}</p></article>')


css = open(os.path.join(SKILL_DIR, 'assets', 'page.css'), encoding='utf-8').read()
title = picks.get('pageTitle') or '하이라이트 후보'
lede = picks.get('lede') or ('장르별 기준으로 어워즈 카드 하이라이트를 고르고 있어요. 게임 안 장면만, 핵심 순간까지 30초에서 1분, '
                             '엔딩은 피하기예요. ▶ 보기를 누르면 그 시작 시각부터 재생돼요. 대사 시각은 받아쓰기 기준이에요. '
                             '운영에는 아직 반영하지 않았어요.')
parts = [f'<title>{e(title)}</title>', '<meta name="claude:viewport-fit-sides" content="cover">',
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@400;500;700'
         '&family=Fredoka:wght@500;600&display=swap">',
         f'<style>\n{css}</style>', '<main>',
         '<header style="display:grid;gap:10px"><span class="eyebrow">2026 야시로 게임 어워즈 · 하이라이트 고르기</span>'
         f'<h1>{e(picks.get("heading") or title)}</h1><p class="lede">{e(lede)}</p></header>',
         '<section aria-labelledby="st"><h2 id="st">진행 상황</h2><div class="status">']
for g in games:
    chip = (f'<span class="chip good">확정 {hms(g["decided"]["start"])}</span>' if g['decided']
            else '<span class="chip warn">고르는 중</span>')
    parts.append(f'<div class="st"><a href="#g{g["n"]}">{e(g["name"])}</a>{chip}</div>')
parts.append('</div></section>')
for g in games:
    parts.append(f'<section aria-labelledby="g{g["n"]}"><h2 id="g{g["n"]}">{e(g["name"])}'
                 f'{" · " + e(g["genre"]) if g.get("genre") else ""}</h2>')
    if g.get('note'):
        parts.append(f'<p class="note">{e(g["note"])}</p>')
    if g.get('ask') and not g['decided']:
        parts.append(f'<div class="ask"><strong>골라 주세요</strong><span>{e(g["ask"])}</span></div>')
    parts.append('<div class="cands">' + ''.join(cand_html(g, i, c) for i, c in enumerate(g['cands'], 1)) + '</div>')
    if g.get('footnote'):
        parts.append(f'<p class="note">{e(g["footnote"])}</p>')
    parts.append('</section>')
parts.append('</main>\n')

ops, same = [], []
for g in games:
    if not g['decided']:
        continue
    t = g['decided']['start']
    if prod[g['gameId']].get(g['videoId']) == t:
        same.append(g['name'])
        continue
    ops.append({'op': 'highlight', 'id': g['gameId'], 'url': f'https://www.youtube.com/watch?v={g["videoId"]}',
                'start': hms(t)})
decided_n = sum(1 for g in games if g['decided'])
if decided_n and '--ops' not in opt:
    print('오류 확정한 게임이 있는데 --ops가 없어요 — 파일을 쓰지 않았어요')
    sys.exit(1)
open(opt['--page'], 'w', encoding='utf-8', newline='\n').write('\n'.join(parts))
print(f'페이지 {opt["--page"]}: 게임 {len(games)}개, 후보 {sum(len(g["cands"]) for g in games)}개, 확정 {decided_n}개')
if '--ops' in opt:
    json.dump(ops, open(opt['--ops'], 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    print(f'ops {opt["--ops"]}: {len(ops)}건' + (f' (운영과 이미 같은 값이라 뺌: {", ".join(same)})' if same else ''))
    for g in games:
        if g['decided']:
            old = prod[g['gameId']].get(g['videoId'])
            print(f'  {g["name"]}: 운영 {hms(old) if old is not None else "없음"} → {hms(g["decided"]["start"])}')
for w in warns:
    print('주의 ' + w)
