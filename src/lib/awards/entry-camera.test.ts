import { describe, expect, it } from 'vitest';
import { buildEntryCamera, smootherstep, type EntryCameraSpec, type Vec3 } from './entry-camera';

const SPEC: EntryCameraSpec = {
  points: [
    [-17, 14, 64],
    [-12.6, 8.6, 57.4],
    [-3.4, 2.7, 51.6],
    [0, 1.62, 44],
  ],
  landTangent: [0, 0, -6],
  end: [0, 1.62, 31],
  times: { start: 0.4, peak: 2.6, land: 8.0, stop: 13.0 },
  decel: 2.8,
  look: { from: [0, 2, 20], to: [0, 5.5, 0], start: 1.2, duration: 8.0 },
  heading: { weight: 0.3, onStart: 1.0, onDuration: 3.5, offStart: 4.5, offDuration: 5.0 },
};

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const FPS = 60;
const frames = (cam: ReturnType<typeof buildEntryCamera>, until: number) =>
  Array.from({ length: Math.round(until * FPS) + 1 }, (_, i) => cam.at(i / FPS));

describe('smootherstep', () => {
  it('clamps and has zero slope at both ends', () => {
    expect(smootherstep(-1)).toBe(0);
    expect(smootherstep(2)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5);
    expect(smootherstep(0.001)).toBeLessThan(1e-7);
    expect(1 - smootherstep(0.999)).toBeLessThan(1e-7);
  });
});

describe('buildEntryCamera', () => {
  const cam = buildEntryCamera(SPEC);

  it('starts at the first point, lands on the carpet and stops exactly at the end', () => {
    expect(dist(cam.at(0).pos, SPEC.points[0])).toBeLessThan(1e-9);
    expect(dist(cam.at(-5).pos, SPEC.points[0])).toBeLessThan(1e-9);
    expect(dist(cam.at(SPEC.times.land).pos, SPEC.points[3])).toBeLessThan(0.15);
    expect(dist(cam.at(SPEC.times.stop).pos, SPEC.end)).toBeLessThan(1e-6);
    expect(dist(cam.at(99).pos, SPEC.end)).toBeLessThan(1e-6);
  });

  it('derives a single speed peak and a walking speed from the path lengths', () => {
    const { descent, walk, peakSpeed, walkSpeed, decelStart } = cam.stats;
    expect(descent).toBeGreaterThan(20);
    expect(walk).toBeCloseTo(13, 5);
    expect(decelStart).toBeCloseTo(10.2);
    expect(walkSpeed).toBeCloseTo(13 / (10.2 - 8 + 1.4), 5);
    expect(peakSpeed).toBeGreaterThan(walkSpeed);
  });

  it('has one speed peak, no frame hitches and no stop-restart', () => {
    const f = frames(cam, SPEC.times.stop);
    const v = f.slice(1).map((s, i) => dist(s.pos, f[i].pos) * FPS);
    let peaks = 0;
    for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] + 1e-6 && v[i] > v[i + 1] + 1e-6) peaks++;
    expect(peaks).toBe(1);
    for (let i = 1; i < v.length - 1; i++) expect(Math.abs(v[i] - (v[i - 1] + v[i + 1]) / 2)).toBeLessThan(0.02 * v[i] + 0.02);
    const moving = v.findIndex((x) => x > 0.01);
    const lastMoving = v.length - 1 - [...v].reverse().findIndex((x) => x > 0.01);
    expect(v.slice(moving, lastMoving).every((x) => x > 0.005)).toBe(true);
  });

  it('moves along the carpet without a sideways kink after landing', () => {
    for (let t = SPEC.times.land; t <= SPEC.times.stop; t += 0.25) expect(Math.abs(cam.at(t).pos[0])).toBeLessThan(0.05);
  });

  it('looks toward the stage at the end and follows the descent heading in between', () => {
    const end = cam.at(SPEC.times.stop);
    const dir = [end.look[0] - end.pos[0], end.look[2] - end.pos[2]];
    expect(Math.abs(dir[0])).toBeLessThan(1e-6);
    const noHeading = buildEntryCamera({ ...SPEC, heading: { ...SPEC.heading, weight: 0 } });
    const yaw = (s: { pos: Vec3; look: Vec3 }) => Math.atan2(s.look[0] - s.pos[0], -(s.look[2] - s.pos[2]));
    expect(yaw(cam.at(4.5))).toBeGreaterThan(yaw(noHeading.at(4.5)) + 0.05);
    expect(yaw(cam.at(0))).toBeCloseTo(yaw(noHeading.at(0)), 6);
  });

  it('turns the walk sway on after landing and off before the stop', () => {
    expect(cam.at(SPEC.times.land - 0.1).walk).toBe(0);
    expect(cam.at(SPEC.times.land + 1.5).walk).toBeCloseTo(1);
    expect(cam.at(SPEC.times.stop).walk).toBe(0);
  });

  it('keeps the look still when the path has no length to follow', () => {
    const p: Vec3 = [0, 2, 40];
    const still = buildEntryCamera({ ...SPEC, points: [p, p, p, p], landTangent: [0, 0, 0], end: p });
    const s = still.at(3);
    expect(dist(s.pos, p)).toBeLessThan(1e-9);
    expect(Number.isFinite(s.look[0])).toBe(true);
  });
});
