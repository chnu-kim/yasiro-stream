"""구간만 받은 오디오의 시작 오프셋(초). audio/<vid>.offset 파일이 없으면 0(전체 오디오)."""
import os


def audio_path(W, vid):
    for ext in ('webm', 'm4a', 'opus'):
        p = f'{W}/audio/{vid}.{ext}'
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f'{W}/audio/{vid}.*')


def offset(W, vid):
    p = f'{W}/audio/{vid}.offset'
    return float(open(p).read().strip()) if os.path.exists(p) else 0.0
