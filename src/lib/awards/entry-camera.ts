/**
 * /awards 입장 카메라(볼룸 위 비행 → 카펫 착지 → 걷기 → 무대 앞 정지)의 순수 계산.
 *
 * Blender 프리비즈에서 승인된 4.1-a 사양(work/research/camera-reference-report.md 4절)을 실시간 좌표(Y-up, 객석 +Z)로 옮겼다.
 * - 경로: Hermite 3구간(착지에서 접선이 정확히 카펫 방향) + 카펫 직선. 이음매에서 진행 방향이 꺾이지 않는다
 * - 속도: 호 길이 속도 하나. 정지 → smootherstep 가속 → 정점 하나 → 착지까지 단조 감속 → 일정한 걷기 → smootherstep 감속 정지.
 *   속도 정점이 둘이면 "날다 멈칫 다시 출발"처럼 보인다(3판 린트)
 * - 시선: 객석 앞쪽 → 무대로 한 번에 들어 올리고, 하강 중에는 진행 방향을 일부(headingWeight) 따라본다(4.1-a: 30%).
 *   정면만 보면 옆으로 내려가며 게걸음처럼 보였다
 * - 적분은 정수 인덱스로 한다. 시간을 실수로 누적하면 가끔 한 단계가 더 돌아 한 프레임이 튄다(3판 frame-hitch)
 */

export type Vec3 = readonly [number, number, number];

export interface EntryCameraSpec {
  /** 시작 → 경유 1 → 경유 2 → 착지 */
  points: readonly [Vec3, Vec3, Vec3, Vec3];
  /** 착지 지점의 접선(카펫 방향, 길이가 곡선의 당김 세기) */
  landTangent: Vec3;
  /** 정지 위치(착지에서 직선으로 걷는다) */
  end: Vec3;
  /** 출발 시각, 속도 정점 시각, 착지 시각, 정지 시각(초) */
  times: { start: number; peak: number; land: number; stop: number };
  /** 걷기 끝의 감속 길이(초). 걷기 속도는 남은 거리에 맞춰 계산한다 */
  decel: number;
  /** 시선: 처음 바라보는 곳 → 무대, 들어 올리는 구간(초) */
  look: { from: Vec3; to: Vec3; start: number; duration: number };
  /** 하강 중 진행 방향을 따라보는 비율(0~1)과 켜고 끄는 구간(초) */
  heading: { weight: number; onStart: number; onDuration: number; offStart: number; offDuration: number };
}

export interface CameraSample {
  pos: Vec3;
  look: Vec3;
  /** 걷기 흔들림 세기(0~1): 착지 1초 뒤 다 켜지고 감속 시작에 맞춰 꺼진다 */
  walk: number;
}

export interface EntryCamera {
  at(t: number): CameraSample;
  /** 하강 길이, 걷기 길이(m), 속도 정점·걷기 속도(m/s), 감속 시작 시각(초) */
  stats: { descent: number; walk: number; peakSpeed: number; walkSpeed: number; decelStart: number };
}

/** 양 끝에서 속도·가속도가 모두 0인 5차 곡선 */
export function smootherstep(x: number): number {
  const k = Math.min(1, Math.max(0, x));
  return k * k * k * (k * (k * 6 - 15) + 10);
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => add(a, scale(sub(b, a), k));
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

function hermite(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, u: number): Vec3 {
  const u2 = u * u;
  const u3 = u2 * u;
  return add(
    add(scale(p0, 2 * u3 - 3 * u2 + 1), scale(m0, u3 - 2 * u2 + u)),
    add(scale(p1, -2 * u3 + 3 * u2), scale(m1, u3 - u2)),
  );
}

const SAMPLES_PER_SEGMENT = 400;
const WALK_SAMPLES = 300;
/** 거리 적분 해상도(초당 단계 수). 프레임과 무관하게 고정 */
const STEPS_PER_SECOND = 480;

export function buildEntryCamera(spec: EntryCameraSpec): EntryCamera {
  const [s, w1, w2, land] = spec.points;
  const tangents: Vec3[] = [sub(w1, s), scale(sub(w2, s), 0.5), scale(sub(land, w1), 0.5), spec.landTangent];
  const pts = spec.points;
  const samples: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < SAMPLES_PER_SEGMENT; k++) {
      samples.push(hermite(pts[i], pts[i + 1], tangents[i], tangents[i + 1], k / SAMPLES_PER_SEGMENT));
    }
  }
  samples.push(land);
  const descentEnd = samples.length - 1;
  for (let k = 1; k <= WALK_SAMPLES; k++) samples.push(lerp(land, spec.end, k / WALK_SAMPLES));
  const cum = [0];
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + length(sub(samples[i], samples[i - 1])));
  const total = cum[cum.length - 1];
  const descent = cum[descentEnd];
  const walk = total - descent;

  const { start: t0, peak: tp, land: tl, stop: te } = spec.times;
  const tw = te - spec.decel;
  // 걷기 거리 = vw·(tw−tl) + vw·decel/2, 하강 거리 = vp·(tp−t0)/2 + (vp+vw)/2·(tl−tp)
  const vw = walk / (tw - tl + spec.decel / 2);
  const vp = (descent - (vw * (tl - tp)) / 2) / ((tp - t0) / 2 + (tl - tp) / 2);

  const speed = (t: number) => {
    if (t < t0) return 0;
    if (t < tp) return vp * smootherstep((t - t0) / (tp - t0));
    if (t < tl) return vw + (vp - vw) * (1 - smootherstep((t - tp) / (tl - tp)));
    if (t < tw) return vw;
    return vw * (1 - smootherstep((t - tw) / (te - tw))); // 적분은 정지 시각(te)까지만 부른다
  };
  // s(t) 표: 정수 인덱스 중점 적분
  const steps = Math.ceil(te * STEPS_PER_SECOND);
  const dist = new Float64Array(steps + 1);
  for (let j = 0; j < steps; j++) dist[j + 1] = dist[j] + speed((j + 0.5) / STEPS_PER_SECOND) / STEPS_PER_SECOND;
  // 끝에서 남는 적분 오차를 경로 길이에 맞춘다(정지 위치가 정확히 end)
  const fit = total / Math.max(dist[steps], Number.MIN_VALUE); // 길이 0인 경로면 0

  const distanceAt = (t: number) => {
    const x = Math.min(Math.max(t, 0), te) * STEPS_PER_SECOND;
    const j = Math.min(Math.floor(x), steps - 1);
    return (dist[j] + (dist[j + 1] - dist[j]) * (x - j)) * fit;
  };
  const pointAt = (d: number): Vec3 => {
    const x = Math.min(Math.max(d, 0), total);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= x) lo = mid;
      else hi = mid;
    }
    return lerp(samples[lo], samples[hi], (x - cum[lo]) / (cum[hi] - cum[lo] || 1));
  };
  /** 앞뒤 ±4m 접선 평균(경유점 근처에서 접선이 빨리 돌아 고개가 흔들리지 않게) */
  const headingAt = (d: number): Vec3 => {
    let acc: Vec3 = [0, 0, 0];
    for (let k = -4; k <= 4; k++) acc = add(acc, normalize(sub(pointAt(d + k + 0.5), pointAt(d + k - 0.5))));
    return normalize(acc);
  };
  const h = spec.heading;
  const headingWeight = (t: number) =>
    h.weight * smootherstep((t - h.onStart) / h.onDuration) * (1 - smootherstep((t - h.offStart) / h.offDuration));

  return {
    at(t: number): CameraSample {
      const d = distanceAt(t);
      const pos = pointAt(d);
      const base = lerp(spec.look.from, spec.look.to, smootherstep((t - spec.look.start) / spec.look.duration));
      const toBase = sub(base, pos);
      const w = headingWeight(t);
      const dir = normalize(lerp(normalize(toBase), headingAt(d), w));
      const look = add(pos, scale(dir, length(toBase)));
      const walkGain = smootherstep(t - tl) * (1 - smootherstep((t - (tw - 0.5)) / 1.5));
      return { pos, look, walk: walkGain };
    },
    stats: { descent, walk, peakSpeed: vp, walkSpeed: vw, decelStart: tw },
  };
}
