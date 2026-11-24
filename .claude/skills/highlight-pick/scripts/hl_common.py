"""highlight-pick 도구들이 함께 쓰는 작은 함수: 시각 변환, 운영 조회 결과 읽기, 사용자 지정 시각 목록."""
import json
import os
import re

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_HMS = re.compile(r'^(\d+):([0-5]\d):([0-5]\d)$')


def to_sec(x):
    """초 정수 또는 "h:mm:ss"만 받는다. "4:26"처럼 두 칸짜리는 h:mm인지 mm:ss인지 갈려서 거부한다."""
    if isinstance(x, bool):
        raise ValueError(f'시각이 아니에요: {x!r}')
    if isinstance(x, int):
        t = x
    else:
        m = _HMS.match(str(x).strip())
        if not m:
            raise ValueError(f'시각은 초 정수나 "h:mm:ss"로 써요: {x!r}')
        t = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
    if not 0 <= t <= 86399:
        raise ValueError(f'시각은 0~86399초(24시간 미만)여야 해요: {x!r}')
    return t


def hms(t):
    t = int(t)
    return f'{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}'


def read_text(path):
    """PowerShell 5.1의 > 는 UTF-16으로, Out-File -Encoding utf8은 BOM을 붙여 저장한다. 셋 다 읽는다."""
    raw = open(path, 'rb').read()
    if raw[:2] in (b'\xff\xfe', b'\xfe\xff'):
        return raw.decode('utf-16')
    return raw.decode('utf-8-sig')


def load_prod(path):
    """운영 조회 결과(wrangler d1 execute --json 출력)를 읽어 행 목록으로 돌려준다.

    행: {game_id, video_id, highlight_start(초 | None), date?(있으면)}
    하이라이트가 있는 행만 담긴 조회(2026-11-24 형식)와 다시보기 전체 조회 둘 다 받는다.
    """
    s = read_text(path)
    d, i = None, s.find('[')
    while i >= 0:  # wrangler가 JSON 앞에 안내·경고 줄("[WARNING]" 등)을 찍는 경우를 건너뛴다
        try:
            d = json.loads(s[i:])
            break
        except ValueError:
            i = s.find('[', i + 1)
    if not isinstance(d, list) or not d:
        raise ValueError(f'{path}: 조회 결과(JSON 배열)를 찾지 못했어요. 조회가 실패했거나 빈 결과예요')
    rows = d[0]['results'] if d and isinstance(d[0], dict) and 'results' in d[0] else d
    for r in rows:
        if 'game_id' not in r or 'video_id' not in r or 'highlight_start' not in r:
            raise ValueError(f'{path}: game_id·video_id·highlight_start 열이 필요해요: {r}')
        if '�' in r['game_id'] or '?' in r['game_id']:
            raise ValueError(f'{path}: 게임 id의 한글이 깨졌어요({r["game_id"]!r}). PowerShell에서 '
                             '[Console]::OutputEncoding = [Text.Encoding]::UTF8 을 먼저 실행하고 다시 조회하세요')
    return rows


def load_protected():
    """사용자가 직접 정한 시각. {gameId: {name, videoId, start(초)}}"""
    d = json.load(open(os.path.join(SKILL_DIR, 'protected.json'), encoding='utf-8'))
    return {g: {**v, 'start': to_sec(v['start'])} for g, v in d['games'].items()}
