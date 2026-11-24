"""치지직 클립 오디오를 다시보기 오디오에 맞춰 클립의 정확한 시작 시각을 찾는다.

사용: python align_clip.py <work_dir> <video_id> <clip_file> <추정_시작초> [탐색_반경초=600]
방법: 두 오디오를 8kHz로 읽어 10ms 단위 로그 에너지(대역 3개)를 만들고, 정규화 상호상관으로 가장 잘 겹치는 위치를 찾는다.
출력: 시작 시각, 상관 최고값, 두 번째 봉우리 대비 비율(1.5 이상이면 믿을 만함)
"""
import os
import subprocess
import sys

import numpy as np

W, vid, clip, est = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
R = float(sys.argv[5]) if len(sys.argv) > 5 else 600
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audio_offset import audio_path, offset  # noqa: E402

SR, HOP = 8000, 80  # 10ms


def load(path, ss=None, to=None):
    cmd = ['ffmpeg', '-v', 'error']
    if ss is not None:
        cmd += ['-ss', str(ss), '-to', str(to)]
    cmd += ['-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32)


def feat(y):
    n = len(y) // HOP
    fr = y[:n * HOP].reshape(n, HOP)
    spec = np.abs(np.fft.rfft(fr * np.hanning(HOP), axis=1)) ** 2  # 41 bins, 100Hz each
    bands = [spec[:, 1:6].sum(1), spec[:, 6:20].sum(1), spec[:, 20:].sum(1)]
    f = np.stack([np.log(b + 1e-8) for b in bands], 1)
    f = f - np.convolve(f.mean(1), np.ones(50) / 50, mode='same')[:, None]  # 느린 음량 변화 제거
    return (f - f.mean(0)) / (f.std(0) + 1e-8)


OFF = offset(W, vid)
a0 = max(OFF, est - R)
v = feat(load(audio_path(W, vid), a0 - OFF, est + R - OFF))
c = feat(load(clip))
L = len(c)
score = np.zeros(len(v) - L + 1)
for k in range(3):  # 대역별 정규화 상호상관 합
    x, q = v[:, k], c[:, k]
    num = np.correlate(x, q, mode='valid')
    cs = np.concatenate([[0], np.cumsum(x)])
    cs2 = np.concatenate([[0], np.cumsum(x * x)])
    s = cs[L:] - cs[:-L]
    s2 = cs2[L:] - cs2[:-L]
    sd = np.sqrt(np.maximum(s2 - s * s / L, 1e-8))
    score += num / (sd * np.sqrt(L))
score /= 3
i = int(score.argmax())
mask = np.ones_like(score, bool)
mask[max(0, i - 300):i + 300] = False  # ±3초 밖의 두 번째 봉우리
second = score[mask].max() if mask.any() else 0
t = a0 + i * HOP / SR
print(f'클립 시작 {int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f} ({t:.2f}초), 길이 {L * HOP / SR:.1f}초, '
      f'상관 {score[i]:.3f}, 두 번째 대비 {score[i] / max(second, 1e-6):.2f}배')
