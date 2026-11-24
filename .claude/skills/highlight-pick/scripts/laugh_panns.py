"""PANNs Cnn14_DecisionLevelMax로 프레임 단위 Laughter 확률을 계산한다(두 번째 웃음 탐지기).

사용: python laugh_panns.py <checkpoint> <audio> <out_prefix> [오디오_시작_오프셋초=0]
  GPU(cuda) 필요. 이 방송에서는 강한 봉우리만 정확하다(약한 값은 근거로 쓰지 않는다)
출력: <out_prefix>.panns.npy  (fps 100, 열: laughter, giggle, chuckle, baby laughter, belly laugh, speech, music)
"""
import subprocess
import sys
import time

import importlib.util
import os
import types

import numpy as np
import torch

# panns_inference/__init__ 은 홈 폴더(~/panns_data)의 라벨 파일을 요구한다 → 모델 코드만 불러온다
_pkg_dir = os.path.join(os.path.dirname(importlib.util.find_spec('torchlibrosa').origin), '..', 'panns_inference')
_pkg = types.ModuleType('panns_inference')
_pkg.__path__ = [os.path.abspath(_pkg_dir)]
sys.modules['panns_inference'] = _pkg
from panns_inference.models import Cnn14_DecisionLevelMax  # noqa: E402

ckpt, audio, out = sys.argv[1], sys.argv[2], sys.argv[3]
SR = 32000
# AudioSet class_labels_indices: 0 Speech, 16 Laughter, 17 Baby laughter, 18 Giggle, 20 Belly laugh, 21 Chuckle/chortle, 137 Music
COLS = [16, 18, 21, 17, 20, 0, 137]
t0 = time.time()
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
y = np.frombuffer(raw, dtype=np.float32)
print(f'audio {len(y)/SR/3600:.2f}h in {time.time()-t0:.0f}s', flush=True)

model = Cnn14_DecisionLevelMax(sample_rate=SR, window_size=1024, hop_size=320, mel_bins=64, fmin=50, fmax=14000,
                               classes_num=527)
state = torch.load(ckpt, map_location='cuda', weights_only=True)
model.load_state_dict(state['model'])
model.cuda().eval()

CH = SR * 60  # 1분 청크(+앞뒤 1초 겹침)
PAD = SR
outs = []
with torch.no_grad():
    for s in range(0, len(y), CH):
        a, b = max(0, s - PAD), min(len(y), s + CH + PAD)
        x = torch.from_numpy(y[a:b].copy()).cuda()[None]
        fw = model(x)['framewise_output'][0][:, COLS].float().cpu().numpy()  # (frames@100fps, 7)
        lo = (s - a) // 320
        n = (min(len(y), s + CH) - s) // 320
        outs.append(fw[lo:lo + n])
P = np.concatenate(outs)
OFF = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0  # 구간 오디오면 앞을 0으로 채워 영상 기준 시각에 맞춘다
if OFF:
    P = np.concatenate([np.zeros((int(OFF * 100), P.shape[1]), dtype=P.dtype), P])
np.save(out + '.panns.npy', P.astype(np.float16))
print(f'{P.shape} done {time.time()-t0:.0f}s')
