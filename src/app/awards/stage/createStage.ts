// /awards 시상식장(Three.js). React와 떨어진 명령형 모듈이라 AwardsStage가 동적 import로만 불러온다(다른 페이지 번들에 안 들어간다).
// 연출 근거는 work/research/awards-grandeur-report.md(2026-11-26 조사), 오프닝 설계는 work/trophy/lang/opening-decisions.json(11-27).
//
// 장면: 계단식 검은 대리석 단상(단마다 금선) 위 트로피(trophy.glb: 비틀린 육각 기둥 위 꿀붕이, 검정 받침),
// 트로피 뒤 붓끝 아치(헤일로), 뒤쪽 후보 포스터 스크린 벽(낮은 밝기로 숨 쉼),
// 천장 서치라이트(가는 빔 · 넓은 빛 2 · 역광 2 · 위 빔 1), 트로피 앞뒤 안개 막, 금가루, 금 꽃가루.
//
// 큐(full, 약 8초. 오프닝 '링이 무대를 연다', 11-27 결정): 어둠 → 붓끝 아치가 왼쪽부터 그려지며 붓끝 빛이 지나가는 쪽부터 트로피를 비춤
// (왼쪽 림 → 꼭대기 역광·핀 → 오른쪽 림, 0.9~3.5) → 위 조명·키·보조·단 금선 → 빔(4.6, 가운데부터) → 벽(5.0) → 꽃가루·제목(6.2) → 버튼(8.2) → 대기.
// 카메라는 아치가 그려지는 동안 정면에서 한 번 짧게 다가가 3.9초에 멈추고 글자는 그 뒤. 포스터 올리기(호버)는 버튼이 나온 뒤에만.
// 'short'는 재방문용 약 3초, 'none'은 완성 장면(동작 줄이기). skipIntro()는 완성 장면으로, setPaused()는 대기 움직임을 멈춘다.
// 시계는 포스터·트로피를 다 읽고(실패 포함, 최대 PRELOAD_MAX_MS) 셰이더를 미리 컴파일·예열한 뒤 출발한다(첫 프레임 끊김 방지).
// 밝기는 BRIGHTNESS 한곳에서 정한다(사용자가 눈부심을 지적했다). 섬광은 피한다(점화 후 유지, 왕복 없음).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { coverCrop } from '@/lib/awards/orbit';

export interface StageItem {
  id: string;
  /** 텍스처 주소(stageTextureUrl을 거친 값) */
  url: string;
}

export type StageIntro = 'full' | 'short' | 'none';

export interface StageOptions {
  items: readonly StageItem[];
  reducedMotion: boolean;
  intro: StageIntro;
  /** 폭 640px 이하: 개수·해상도·반사·bloom·AA를 줄인다 */
  compact: boolean;
  /** 연출 시계가 출발했을 때(그림을 다 읽고 셰이더 예열까지 끝남). 자막 타이밍의 기준 */
  onReady?: () => void;
}

export interface Stage {
  /** 심사 시작: 카메라가 헤일로 안으로 날아든다. false면 제자리로 */
  setLaunch(on: boolean): void;
  skipIntro(): void;
  /** 대기 움직임 멈춤(WCAG 2.2.2). 멈추면 지금 장면 한 장만 남는다 */
  setPaused(on: boolean): void;
  /** 진행 중에 동작 줄이기가 켜지면 완성 장면으로 멈춘다 */
  setReducedMotion(on: boolean): void;
  dispose(): void;
}

/** 연출 시간표(초, 시계 출발 기준). SetupScreen CUES(제목·자막·버튼)와 맞물린다 */
export interface StageTimeline {
  /** 위 조명·키·역광·림이 켜지기 시작(링이 다 그어질 즈음. 핀이 꺼지기 전에 겹친다) */
  lights: number;
  /** 보조·단 금선·환경 반사 */
  fill: number;
  /** 꿀붕이 핀이 물러나기 시작 */
  pinOff: number;
  /** 좁은 빔이 가운데부터 켜지기 시작 */
  beams: number;
  /** 금가루·안개가 차오르기 시작 */
  open: number;
  /** 금가루가 멈추는 정적(hold ~ impact) */
  hold: number;
  /** 링이 그어지기 시작 */
  impact: number;
  wall: number;
  title: number;
  call: number;
}

/** 링이 왼쪽 끝에서 위를 지나 오른쪽으로 그려지는 시간(초). 첫 방문은 붓이 지나가며 빛을 떨어뜨리므로 천천히(오프닝 '링이 무대를 연다', 11-27 결정),
 *  재방문 짧은 연출은 같은 문법을 줄여서 */
const RING_DRAW = { full: 2.6, short: 1.0, none: 1.0 } as const;
/** 벽 칸 하나가 켜지는 시간(초) */
const WALL_RAMP = { full: 1.4, short: 0.5, none: 0.5 } as const;
/** 조명이 켜지는 데 걸리는 시간(초) */
const LIGHT_RAMP = { full: 1.2, short: 0.5, none: 0.5 } as const;
/** 아치가 남기는 각도(위 가운데 기준 전체). 끝은 붓끝처럼 가늘어진다(11-27 결정) */
const ARC_SPAN = Math.PI * 1.28;

export const STAGE_TIMELINES: Record<StageIntro, StageTimeline> = {
  // 오프닝 '링이 무대를 연다'(11-27 결정): 어둠(0~0.6) → 붓끝 아치가 왼쪽부터(0.6~3.2, 끝은 가늘고 어두워 1.2초쯤 보이기 시작, 붓끝 빛이 지나가는 쪽부터 트로피를 비춤: applySpotCues)
  // → 위 조명·키(2.7, 링이 끝나기 직전부터 이어서) → 빔(4.4) → 벽(4.6, 천천히) → 제목·꽃가루(6.2) → 자막(7.2) → 버튼(8.2). SetupScreen CUES도 같이
  full: { lights: 2.7, fill: 3.2, pinOff: 3.8, beams: 4.4, open: 3.6, hold: 3.6, impact: 0.3, wall: 4.6, title: 6.2, call: 8.2 },
  // 짧은 연출(재방문 2.2초): 같은 문법을 줄인 것. 카메라는 최종 자리 고정. 겹치지 않게: 링(0~1.0)·조명(0.5) → 빔·벽(0.7) → 제목(1.3) → 자막(1.8) → 버튼(2.2). 꽃가루 없음
  short: { lights: 0.5, fill: 0.8, pinOff: 1.0, beams: 0.7, open: 0.7, hold: -99, impact: 0, wall: 0.7, title: 1.3, call: 2.2 },
  none: { lights: -99, fill: -99, pinOff: -99, beams: -99, open: -99, hold: -99, impact: -99, wall: -99, title: -99, call: -99 },
};

/** 밝기 예산. 노출·bloom 상한은 올리지 않는다(사용자 눈부심 지적). 효과를 더할 때는 여기 값을 먼저 정한다 */
const BRIGHTNESS = {
  exposure: 0.82,
  bloomStrength: 0.13, // 11-27 리뷰: 정수리·받침 테두리가 하얗게 번졌다
  key: 95, // 11-27: 140이면 최종 화면에서 트로피가 납작한 노란 덩어리로 보였다. 옆·뒤 빛이 형태를 맡는다
  rimSide: 100,
  back: 170,
  fill: 26,
  beamAlpha: 0.2,
  washAlpha: 0.045, // 11-27 리뷰: 양옆 넓은 빛이 회색 안개 기둥처럼 탁했다
  backBeamAlpha: 0.12,
  hazeAlpha: 0.045,
  /** 스크린 벽 최대 밝기(색 배율). 트로피보다 확실히 낮게 */
  wallMax: 0.026, // 11-27 리뷰: 제목 전에 벽이 가장 밝아 주인공이 됐다. 눌러 낮추던 값(최종)을 처음부터 쓴다
  /** 포스터 채도(0 흑백 ~ 1 원색). 원색 일러스트가 트로피와 싸워 무늬처럼 물러나게(11-27) */
  wallSat: 0.12,
  /** 반사 환경 세기(어둠 속 처음 / 빛이 번진 뒤 더하는 값) */
  envBase: 0.35,
  envImpact: 0.4,
  /** 위에서 트로피로 떨어지는 스포트라이트·핀(실제 광원) */
  poolSpot: 55, // 11-27: 180이면 머리 꼭대기가 날아갔고, 78에서도 눈·입보다 이마 얼룩이 먼저 읽혀(리뷰) 55로
  halo: 0.72,
  edge: 0.28, // 단 몸체는 어둠에 묻혀 금선만 떠 보였다(11-27). 받침 아래 가로줄이 남아 더 낮춤
  /** 은은한 실내광(반구광, 처음부터 고정) */
  ambient: 0.3,
};

const PRELOAD_MAX_MS = 2500;
const STEPS = 8;
const STAGE_TOP = 1.6;
/** 트로피(glb, 높이 3.19m)를 무대 크기(약 6.6)에 맞추는 배율 */
const TROPHY_GLB_SCALE = 1.93; // 11-27 리뷰: 7% 줄여 받침과 아래 자막 사이를 띄운다(시선을 낮춰 머리 자리는 거의 그대로)
/** 헤일로·역광·빔이 겨누는 높이(예전 임시 트로피의 지구본 높이 2.5 × 배율 1.55) */
const GLOBE_Y = STAGE_TOP + 2.5 * 1.55;
const TILE_W = 2.1;
const TILE_H = 2.8;

// 3D 모델(gltf-transform으로 압축, 출처는 work/assets). 모델을 고치면 v2 폴더로 올린다(public/_headers 1년 캐시)
const STAGE_ASSETS = '/stage/v1';

/** 심사위원석(카메라가 머무는 자리, 사용자 승인 구도) */
const CAM_JUDGE = new THREE.Vector3(0, 5.0, 19.8); // 11-26: 21.5에서 당김
const LOOK_JUDGE = new THREE.Vector3(0, 4.85, 0);
const CAM_LAUNCH = new THREE.Vector3(0, 6.1, 2.4);
const LOOK_LAUNCH = new THREE.Vector3(0, 6.3, -4);
/** 세로 시야(다가가며 줌까지 겹치면 확대가 두 번으로 느껴져 바꾸지 않는다) */
const FOV_WIDE = 34;

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** 양 끝에서 속도·가속도가 모두 0인 5차 곡선 */
const smootherstep = (x: number) => {
  const k = clamp01(x);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** 지각 밝기 p(0~1)를 세기로: 어둠에서 차오를 때 p²로 넣는다(디밍 곡선) */
const ramp = (t: number, at: number, dur: number) => {
  const p = clamp01((t - at) / dur);
  return p * p;
};

export function createStage(canvas: HTMLCanvasElement, opts: StageOptions): Stage {
  const compact = opts.compact;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = BRIGHTNESS.exposure;
  // 불투명 검정: 페이지 배경의 CSS 조명이 비치지 않게. --gala-bg(#0F0C09)를 넣으면 후처리(OutputPass)를 거치며 갈색으로 떠서 검정을 쓴다
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // 반사 환경: 검은 방 + 길쭉한 조명판(금속감은 밝기가 아니라 어두운 바탕과 좁은 하이라이트의 대비에서 나온다, 조사 P10).
  // 바탕이 검어서 세기를 올려도 화면 전체는 밝아지지 않고 금에만 줄무늬 반사가 생긴다. 세기는 applySpotCues가 정한다
  const envSource = studioEnvironment();
  const envTex = pmrem.fromScene(envSource, 0.02).texture;
  envSource.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  scene.environment = envTex;
  scene.fog = new THREE.FogExp2(0x050403, 0.012);

  const camera = new THREE.PerspectiveCamera(FOV_WIDE, 1, 0.1, 160);
  let reduced = opts.reducedMotion;
  let timeline = STAGE_TIMELINES[reduced ? 'none' : opts.intro];
  const intro: StageIntro = reduced ? 'none' : opts.intro;
  const ringDraw = RING_DRAW[intro];

  const disposables: { dispose(): void }[] = [envTex, pmrem];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ── 재질 ──
  const marble = track(new THREE.MeshPhysicalMaterial({ color: 0x0b0907, metalness: 0.2, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1 }));
  /** 빛을 내는 선(단상 금선·빛기둥·헤일로). 색 배율로 켜고 끈다 */
  const glow = () => track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }));

  // ── 바닥: 반사판 + 반투명 검은 막 ──
  const floorGeo = track(new THREE.CircleGeometry(70, 96));
  if (!compact) {
    const mirror = new Reflector(floorGeo, { textureWidth: 1024, textureHeight: 1024, color: 0x6a6052, clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    scene.add(mirror);
    disposables.push({ dispose: () => mirror.dispose() });
  }
  const floorTint = new THREE.Mesh(
    floorGeo,
    track(new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 0.5, metalness: 0.2, transparent: true, opacity: compact ? 1 : 0.82 })),
  );
  floorTint.rotation.x = -Math.PI / 2;
  floorTint.position.y = 0.002;
  scene.add(floorTint);

  // ── 단상: 검은 대리석 계단(단마다 앞 모서리 금선) ──
  const edgeMat = glow();
  const edgeOn = new THREE.Color(0xc9a24e);
  const stepH = STAGE_TOP / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const w = 18 - i * 1.35;
    const d = 11 - i * 0.95;
    const step = new THREE.Mesh(track(new THREE.BoxGeometry(w, stepH, d)), marble);
    step.position.set(0, stepH * (i + 0.5), -0.4 + i * 0.05);
    scene.add(step);
    const front = step.position.z + d / 2;
    const edge = new THREE.Mesh(track(new THREE.BoxGeometry(w, 0.02, 0.02)), edgeMat);
    edge.position.set(0, stepH * (i + 1) - 0.01, front);
    scene.add(edge);
  }
  // 트로피(glb)의 재질: 무광 금(금 F0 선형 1, 0.71, 0.31), 가장자리만 조금 매끈한 금, 검정 돌(사용자 결정 11-27)
  // 받침 돌은 거칠게: 0.4이면 위 조명을 받아 테두리가 하얗게 떴다(11-27 리뷰)
  const stoneBlack = track(new THREE.MeshStandardMaterial({ color: 0x121216, roughness: 0.72, metalness: 0 }));
  const goldMatte = track(new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(1, 0.71, 0.31, THREE.LinearSRGBColorSpace), metalness: 1, roughness: 0.5 }));
  const goldEdge = track(new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(1, 0.71, 0.31, THREE.LinearSRGBColorSpace), metalness: 1, roughness: 0.25 }));

  // ── 트로피: 단상 위 그룹(대기 흔들림). 모델은 읽은 뒤 단다 ──
  const trophy = new THREE.Group();
  trophy.position.y = STAGE_TOP;
  scene.add(trophy);
  // 받침 아래 접촉 그림자: 위 조명만으로는 받침이 단에서 떠 보였다(11-27 리뷰)
  const contactShadow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(3.4, 3.4)),
    track(new THREE.MeshBasicMaterial({ map: track(dotTexture()), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false })),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, STAGE_TOP + 0.004, 0);
  scene.add(contactShadow);

  // 위에서 트로피로 떨어지는 스포트라이트(빛이 번질 때 켜진다)
  const poolSpot = new THREE.SpotLight(0xfff0cf, 0, 34, 0.16, 0.55, 1.4);
  poolSpot.position.set(0, 21, 1.0);
  poolSpot.target.position.set(0, STAGE_TOP, 0);
  scene.add(poolSpot, poolSpot.target);
  // 오프닝 "한 점": 꿀붕이만 겨누는 좁은 핀(각 0.05). 처음부터 장면에 둔다(광원 수가 바뀌면 셰이더를 다시 컴파일한다)
  const pinSpot = new THREE.SpotLight(0xfff0cf, 0, 34, 0.05, 0.6, 1.4);
  pinSpot.position.set(0, 21, 1);
  pinSpot.target.position.set(0, 7.6, 0);
  scene.add(pinSpot, pinSpot.target);

  // ── 헤일로: 트로피 뒤 붓끝 아치. 위쪽 약 230°만 남기고 양 끝으로 갈수록 가늘고 어두워진다(정점 색) ──
  const haloMat = glow();
  const haloOn = new THREE.Color(0xb8913f);
  const halo = new THREE.Group();
  halo.position.set(0, GLOBE_Y, -2.4);
  const arcGeo = track(new THREE.TorusGeometry(4.5, 0.03, 12, 320, ARC_SPAN));
  arcGeo.rotateZ(Math.PI / 2 - ARC_SPAN / 2);
  {
    // 끝 처리: 위 가운데에서 잰 각(fromTop)으로 끝까지 남은 각(toEnd)을 구해 굵기·밝기를 정한다
    const pos = arcGeo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ang = Math.atan2(v.y, v.x);
      const fromTop = Math.abs(((ang - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const toEnd = Math.max(0, ARC_SPAN / 2 - fromTop);
      // 붓끝: 끝 0.9rad에서 굵기가 점으로, 밝기는 끝 0.5rad에서 0으로
      const thick = 0.08 + 0.92 * smooth(0, 0.9, toEnd);
      const bright = smooth(0, 0.5, toEnd);
      // 관 단면 중심(큰 원 위의 점)에서 정점까지의 거리를 thick배로
      const cx = Math.cos(ang) * 4.5;
      const cy = Math.sin(ang) * 4.5;
      pos.setXYZ(i, cx + (v.x - cx) * thick, cy + (v.y - cy) * thick, v.z * thick);
      cols.set([bright, bright, bright], i * 3);
    }
    pos.needsUpdate = true;
    arcGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    haloMat.vertexColors = true;
    // 링이 그려지는 진행: 정점마다 0(왼쪽 끝) → 1(오른쪽 끝) 값을 두고 셰이더가 진행보다 앞선 부분을 버린다
    const left = Math.PI / 2 + ARC_SPAN / 2;
    const rv = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const theta = Math.atan2(pos.getY(i), pos.getX(i));
      rv[i] = clamp01((left - (theta < -Math.PI / 2 ? theta + Math.PI * 2 : theta)) / ARC_SPAN);
    }
    arcGeo.setAttribute('aReveal', new THREE.BufferAttribute(rv, 1));
    const top = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const ang = Math.atan2(pos.getY(i), pos.getX(i));
      top[i] = Math.abs(((ang - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    }
    arcGeo.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
  }
  halo.add(new THREE.Mesh(arcGeo, haloMat));
  scene.add(halo);
  // 맨 앞은 조금 더 밝게
  const ringReveal = { value: 1 };
  /** 0~1: 제목이 뜨면 아치 꼭대기(제목 뒤를 지나는 구간)를 흐린다 */
  const ringTitle = { value: 0 };
  haloMat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = ringReveal;
    sh.uniforms.uTitle = ringTitle;
    sh.vertexShader = 'attribute float aReveal;\nattribute float aTop;\nvarying float vReveal;\nvarying float vTop;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vReveal = aReveal;\n  vTop = aTop;');
    sh.fragmentShader =
      'uniform float uReveal;\nuniform float uTitle;\nvarying float vReveal;\nvarying float vTop;\n' +
      sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  if (vReveal > uReveal) discard;\n  gl_FragColor.rgb *= 1.0 + 1.6 * smoothstep(uReveal - 0.07, uReveal, vReveal) * step(uReveal, 0.999);\n  gl_FragColor.rgb *= 1.0 - 0.9 * uTitle * (1.0 - smoothstep(0.42, 0.78, vTop));',
      );
  };
  haloMat.customProgramCacheKey = () => 'halo-reveal';

  // ── 스크린 벽: 무대 뒤 곡면에 후보 포스터(낮은 밝기, 흑백). 줄마다 번갈아 반대로 아주 천천히 흐르며(띠) 올해 한 게임이 끊김 없이 차례로 지나간다 ──
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const items = compact ? opts.items.slice(0, 24) : opts.items;
  const wallCols = compact ? 9 : 15;
  const wallRows = 4;
  const wallR = 26;
  const wallGeo = track(new THREE.PlaneGeometry(TILE_W, TILE_H));
  /** 줄마다 보이는 칸(wallCols)보다 둘 많은 칸을 띠로 돌린다(양 끝 어둠 속에서 반대편으로 넘어가며 다음 게임으로 바뀐다) */
  const ROW_TILES = wallCols + 2;
  /** 흐르는 속도(칸/초). 6초에 한 칸: 배경은 아주 멀리 물러나 숨 쉬듯(조사 P2·P6) */
  const DRIFT_SPEED = 1 / 6;
  const wallTiles: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; item: number; col: number; row: number; home: THREE.Vector3; pop: number; x: number; sat?: { value: number } }[] = [];
  /** 줄별 흐름: 누적 칸 수와 속도 배율(마우스를 올린 줄은 천천히 멈춘다) */
  const rowDrift = Array.from({ length: wallRows }, () => ({ offset: 0, speed: 1 }));
  /** 게임별 포스터 텍스처(읽히는 대로 채운다) */
  const itemTex: (THREE.Texture | null)[] = items.map(() => null);
  const wall = new THREE.Group();
  wall.position.set(0, 0, 14);
  for (let row = 0; row < wallRows; row++) {
    for (let col = 0; col < ROW_TILES; col++) {
      const mat = track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }));
      const tile = new THREE.Mesh(wallGeo, mat);
      tile.userData.tileIndex = wallTiles.length;
      wall.add(tile);
      // 자리·게임은 layoutWall이 흐름에 맞춰 정한다
      wallTiles.push({ mesh: tile, mat, item: -2, col, row, home: new THREE.Vector3(), pop: 0, x: col - 1 });
    }
  }
  scene.add(wall);
  // TEMP(벽 비교): localStorage['stage-wall']='none'이면 포스터 벽을 숨긴다. 결정 뒤 지운다
  const WALL_OFF = typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && window.localStorage.getItem('stage-wall') === 'none';
  wall.visible = !WALL_OFF;
  // 포스터는 거의 흑백(따뜻한 회색)으로 물러나 있다가, 올리면(호버) 원래 색으로 돌아온다
  for (const w of wallTiles) {
    const sat = { value: BRIGHTNESS.wallSat };
    w.sat = sat;
    w.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSat = sat;
      sh.fragmentShader = 'uniform float uSat;\n' + sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n  diffuseColor.rgb = mix(vec3(lum) * vec3(1.0, 0.94, 0.84), diffuseColor.rgb, uSat);',
      );
    };
    w.mat.customProgramCacheKey = () => 'wall-sat';
  }
  const tileMeshes = wallTiles.map((w) => w.mesh);

  // ── 조명(실제 광원): 트로피 역광 + 정면 키 + 양옆 림 + 정면 보조 + 은은한 실내광 ──
  const back = new THREE.SpotLight(0xffe6b8, 0, 40, 0.42, 0.7, 1.4);
  back.position.set(0, 11, -8);
  back.target.position.set(0, GLOBE_Y, 0);
  const key = new THREE.SpotLight(0xfff0cf, 0, 40, 0.26, 0.6, 1.4);
  key.position.set(0, 18, 7);
  key.target.position.set(0, STAGE_TOP + 3, 0);
  const rims = [-1, 1].map((side) => {
    const rim = new THREE.SpotLight(0xffe2a8, 0, 40, 0.35, 0.8, 1.4);
    rim.position.set(side * 10, 14, -5);
    rim.target.position.set(0, STAGE_TOP + 3.5, 0);
    scene.add(rim, rim.target);
    return rim;
  });
  scene.add(new THREE.HemisphereLight(0xffd9a6, 0x120c08, BRIGHTNESS.ambient));
  const fill = new THREE.PointLight(0xffd9a0, 0, 30, 2);
  fill.position.set(0, 5, 13);
  scene.add(back, back.target, key, key.target, fill);
  // 붓끝을 따라가는 작은 따뜻한 빛. 처음부터 0으로 넣어 둔다(광원 수가 바뀌면 재질을 다시 컴파일해 멈칫한다)
  const tipLight = new THREE.PointLight(0xffd29a, 0, 9, 2);
  scene.add(tipLight);

  // ── 서치라이트(시각용 빛줄기): 가는 빔 6(호박) · 넓은 빛 2(차가운 백색) · 역광 2(무대 뒤에서 가장자리를 스침) · 위 빔 1 ──
  const beamGeo = track(new THREE.ConeGeometry(0.42, 1, 40, 1, true));
  beamGeo.translate(0, -0.5, 0); // 꼭짓점을 원점(광원)에
  type Beam = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; origin: THREE.Vector3; seed: number; kind: 'narrow' | 'wash' | 'back' | 'pool'; aim: THREE.Vector3; widen: number };
  const beams: Beam[] = [];
  const addBeam = (kind: Beam['kind'], origin: THREE.Vector3, seed: number, color: number, alpha: number, widen: number) => {
    const mat = track(beamMaterial(color, alpha));
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    beams.push({ mesh, mat, origin, seed, kind, aim: new THREE.Vector3(), widen });
  };
  const narrowCount = compact ? 4 : 6;
  for (let i = 0; i < narrowCount; i++) {
    addBeam('narrow', new THREE.Vector3((i / (narrowCount - 1) - 0.5) * 26, 21, -3 + (i % 2) * 5), i * 1.7 + 0.3, 0xf3cf86, BRIGHTNESS.beamAlpha, 0.035);
  }
  for (const side of [-1, 1]) addBeam('wash', new THREE.Vector3(side * 6, 22, 10), side * 2.1, 0xdfe6f0, BRIGHTNESS.washAlpha, 0.11);
  if (!compact) for (const side of [-1, 1]) addBeam('back', new THREE.Vector3(side * 5, 12, -12), side * 3.3, 0xf3d58e, BRIGHTNESS.backBeamAlpha, 0.05);
  /** 가는 빔의 점등 순서: 가운데(원점 x가 작은 것)부터 */
  const narrowRank = new Map(
    beams
      .filter((b) => b.kind === 'narrow')
      .sort((a, b) => Math.abs(a.origin.x) - Math.abs(b.origin.x))
      .map((b, i) => [b, i] as const),
  );
  addBeam('pool', new THREE.Vector3(0, 21, 1.0), 0, 0xf3cf86, BRIGHTNESS.beamAlpha, 0.075);

  // ── 안개 막: 트로피 앞뒤 반투명 판(느리게 흐르는 잡음). 빛줄기가 겹을 통과하는 깊이 ──
  const hazeMats = [-2.5, 7].map((z) => {
    const mat = track(hazeMaterial());
    const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(46, 22)), mat);
    plane.position.set(0, 9, z);
    scene.add(plane);
    return mat;
  });

  // ── 금가루 ──
  const DUST = compact ? 260 : 650;
  const dustPos = new Float32Array(DUST * 3);
  const dustSpeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 40;
    dustPos[i * 3 + 1] = Math.random() * 18;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 34;
    dustSpeed[i] = 0.08 + Math.random() * 0.22;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = track(
    new THREE.PointsMaterial({ color: 0xf0d48a, size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: track(dotTexture()) }),
  );
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ── 금 꽃가루: 제목과 함께 한 번, 짧게(약 2.5초 안에 다 내려온다. 자막과 겹치지 않게) ──
  const CONFETTI = compact ? 50 : 90;
  const confettiMat = track(new THREE.MeshStandardMaterial({ color: 0xb8954a, metalness: 0.75, roughness: 0.55, side: THREE.DoubleSide }) /* 거칠게: 매끈하면 반사가 bloom을 넘어 흐린 빛 방울로 번졌다(11-27) */);
  const confetti = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(0.09, 0.16)), confettiMat, CONFETTI);
  const bits = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), alive: false }));
  confetti.count = 0;
  confetti.frustumCulled = false; // 조각이 장면 곳곳을 날아다녀 경계 구로 판정할 수 없다
  scene.add(confetti);
  let confettiBurst = false;
  // TEMP(프레임 분석): 개발 중 localStorage['stage-t']='4.2'면 연출 시계를 그 시각에 멈춘다. 커밋 전 제거
  const freezeRaw = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' ? window.localStorage.getItem('stage-t') : null;
  const freezeT = freezeRaw === null ? null : Number(freezeRaw);
  const fh = (i: number) => {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);

  // ── 후처리: 데스크톱은 MSAA 4(얇은 금선 계단 방지), 약한 bloom ──
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: compact ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (!compact) composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), BRIGHTNESS.bloomStrength, 0.18, 0.88));
  composer.addPass(new OutputPass());
  disposables.push(composer, target);

  // ── 크기 ──
  let fovScale = 1;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // 세로 화면은 시야를 넓혀 트로피와 고리가 들어오게
    fovScale = w / h < 1.1 ? 1.75 : 1;
    camera.updateProjectionMatrix();
    if (started && (reduced || paused)) renderStill();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ── 입력: 시점 따라오기 + 벽 포스터 올리기 ──
  const pointer = new THREE.Vector2(0, 0);
  const ndc = new THREE.Vector2(9, 9);
  const raycaster = new THREE.Raycaster();
  const onMove = (e: PointerEvent) => {
    // 터치는 올리기·시차를 쓰지 않는다(탭으로 건너뛸 때 그 자리 포스터가 커지지 않게)
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    ndc.copy(pointer);
  };
  const onLeave = () => {
    pointer.set(0, 0);
    ndc.set(9, 9);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);

  // ── 상태 ──
  let launch = false;
  let launchAt = -1;
  let paused = false;
  let frame = 0;
  let visible = true;
  let started = false;
  let disposed = false;
  const clock = new THREE.Clock();
  let start = performance.now();
  let lastT = 0;
  const camPos = new THREE.Vector3();
  const lookPos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const aimTmp = new THREE.Vector3();
  const trophyAim = new THREE.Vector3(0, GLOBE_Y + 0.6, 0);
  const smoothPos = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();
  let smoothReady = false;
  const audienceAim = new THREE.Vector3(0, 0.3, 26);

  /** 시각 t의 카메라 자리. 정면에서 한 번 짧게 다가가 4.4초에 멈춘다(글자는 그 뒤). 짧은 연출·완성 장면은 처음부터 최종 자리 */
  function cameraAt(t: number, out: THREE.Vector3, look: THREE.Vector3): number {
    const k = intro === 'full' ? smootherstep((t - 0.3) / 3.6) : 1; // 링이 그려지는 동안 다가가 3.9초에 멈춘다
    out.set(0, 4.95, 21.2).lerp(CAM_JUDGE, k);
    look.copy(LOOK_JUDGE);
    return FOV_WIDE * fovScale;
  }

  /** driftDt: 띠가 흐를 시간(초). 멈춘 장면·예열에서는 0 */
  function layoutWall(dt: number, hovered: number, t: number, driftDt = dt) {
    const tl = timeline;
    const hoveredRow = hovered >= 0 ? wallTiles[hovered].row : -1;
    for (let r = 0; r < wallRows; r++) {
      const d = rowDrift[r];
      d.speed += ((r === hoveredRow ? 0 : 1) - d.speed) * Math.min(1, driftDt * 2.5);
      d.offset += (r % 2 === 0 ? 1 : -1) * DRIFT_SPEED * d.speed * driftDt;
    }
    const n = items.length;
    const rowBase = Math.ceil(n / wallRows);
    for (let i = 0; i < wallTiles.length; i++) {
      const w = wallTiles[i];
      // 띠 위 자리: 0~ROW_TILES를 돌고, 한 바퀴 넘을 때마다(wrap) 그 칸은 띠의 다음 게임이 된다
      const p = w.col + rowDrift[w.row].offset;
      const wrap = Math.floor(p / ROW_TILES);
      w.x = p - wrap * ROW_TILES - 1;
      const item = n === 0 ? -1 : (((w.row * rowBase + w.col - wrap * ROW_TILES) % n) + n) % n;
      if (item !== w.item) {
        w.item = item;
        const next = item >= 0 ? itemTex[item] : null;
        if ((next === null) !== (w.mat.map === null)) w.mat.needsUpdate = true;
        w.mat.map = next;
      }
      const a = ((w.x - (wallCols - 1) / 2) / wallCols) * 1.25;
      w.home.set(Math.sin(a) * wallR, 2.2 + w.row * 3.05, -Math.cos(a) * wallR);
      w.mesh.rotation.set(0, -a, 0); // 벽 중심(0, y, 0)을 바라본다
      // 양 끝 어둠 속에서 넘어간다
      const edge = smooth(-1, 0.4, w.x) * smooth(wallCols, wallCols - 1.4, w.x);
      const centerDist = Math.abs(w.x - (wallCols - 1) / 2);
      const on = ramp(t, tl.wall + centerDist * 0.06 + w.row * 0.04, WALL_RAMP[intro]); // 제목·꽃가루와 한꺼번에 터지지 않게 천천히
      // 트로피 뒤 가운데(화면 폭 약 35%)는 비워 실루엣이 포스터 격자에 잘리지 않게
      const center = 0.62 + 0.38 * smooth(1.5, 3.2, centerDist);
      const breath = 0.5 + 0.5 * Math.sin(t * 0.8 - w.x * 0.42 + w.row * 0.3);
      const level = on * edge * BRIGHTNESS.wallMax * center * (0.55 + 0.45 * breath);
      // 켜지기 전 칸은 그리지 않는다(검은 칸이 안개에 물들어 회색 네모로 비쳤다)
      w.mesh.visible = !WALL_OFF && ((on > 0.002 && edge > 0.002) || w.pop > 0.002);
      w.pop += ((i === hovered ? 1 : 0) - w.pop) * Math.min(1, dt * 10);
      if (w.sat) w.sat.value = BRIGHTNESS.wallSat + (1 - BRIGHTNESS.wallSat) * w.pop;
      const lit = level + (1 - level) * w.pop;
      // 약한 탈채도 느낌: 따뜻한 회색 쪽으로 살짝 기운 배율
      w.mat.color.setRGB(lit, lit * 0.96, lit * 0.9);
      if (!w.mat.map) w.mat.color.multiplyScalar(0.15);
      w.mesh.scale.setScalar(1 + w.pop * 0.45);
      w.mesh.position.copy(w.home).multiplyScalar(1 - w.pop * 0.06);
    }
  }

  /** 오프닝 조명 큐('링이 무대를 연다'). 붓끝을 따라 림·역광·핀 → 위 조명·키 → 보조·단 금선·환경 반사.
   *  ramp는 p²라 어둠에서 툭 켜지지 않는다. 짧은 연출도 같은 순서를 시간만 줄여 쓴다 */
  function applySpotCues(t: number) {
    const tl = timeline;
    const B = BRIGHTNESS;
    const poolDecay = 1 - 0.45 * ramp(t, tl.impact + 0.8, 1.5);
    // 붓끝이 지나가는 자리: 왼쪽 림(진행 0~0.3) → 꼭대기에서 역광·핀(0.4~0.6) → 오른쪽 림(0.7~0.95). 다 그을 즈음 위 조명·키.
    // 위 조명은 핀·붓끝 빛이 물러나기 전에 겹쳐 켠다(사이가 비면 트로피가 잠깐 갈색으로 탁해졌다, 11-27). 짧은 연출도 같은 문법
    const r = easeInOutCubic((t - tl.impact) / ringDraw);
    const d = LIGHT_RAMP[intro];
    const back2 = 0.4 * smooth(0.35, 0.6, r) + 0.6 * ramp(t, tl.lights - 0.1, d);
    const rim = 0.4 * smooth(0.05, 0.3, r) + 0.6 * ramp(t, tl.lights - 0.1, d);
    const rimR = 0.4 * smooth(0.7, 0.95, r) + 0.6 * ramp(t, tl.lights - 0.1, d);
    const pin = smooth(0.4, 0.6, r) * (1 - ramp(t, tl.pinOff, d));
    const pool = ramp(t, tl.lights, d) * poolDecay;
    const keyK = ramp(t, tl.lights, d);
    const fillK = ramp(t, tl.fill, d);
    const edgeK = fillK;
    const envI = fillK;
    const envB = smooth(0, 0.5, r);
    pinSpot.intensity = B.poolSpot * pin;
    poolSpot.intensity = B.poolSpot * pool;
    back.intensity = B.back * back2;
    rims[0].intensity = B.rimSide * rim;
    rims[1].intensity = B.rimSide * rimR;
    if (intro !== 'none') {
      const a = Math.PI / 2 + ARC_SPAN / 2 - r * ARC_SPAN;
      // 링과 같은 면(트로피 뒤)에 두고, 링 끝이 가늘고 어두운 구간에서는 빛도 같이 약하게(빛이 링보다 먼저 오거나 기둥에 얼룩이 지던 문제, 11-27)
      tipLight.position.set(Math.cos(a) * 4.5, GLOBE_Y + Math.sin(a) * 4.5, -2.4);
      const visible = smooth(0, 0.5, Math.min(r, 1 - r) * ARC_SPAN);
      tipLight.intensity = 20 * visible * ramp(t, tl.impact, 0.2);
    } else tipLight.intensity = 0;
    key.intensity = B.key * keyK;
    fill.intensity = B.fill * fillK;
    edgeMat.color.copy(edgeOn).multiplyScalar(B.edge * edgeK);
    scene.environmentIntensity = B.envBase * envB + B.envImpact * envI;
  }

  function applyLights(t: number) {
    const tl = timeline;
    applySpotCues(t);

    // 링(결정 3): 왼쪽 끝부터 RING_DRAW초에 걸쳐 그어진다
    haloMat.color.copy(haloOn).multiplyScalar(BRIGHTNESS.halo * 0.85 * ramp(t, tl.impact, 0.12));
    ringReveal.value = easeInOutCubic((t - tl.impact) / ringDraw);
    ringTitle.value = easeInOutCubic((t - tl.title + 0.3) / 0.8);
    const titleDuck = 1 - 0.4 * easeInOutCubic((t - tl.title) / 0.8);
    dustMat.opacity = 0.55 * ramp(t, tl.open, 1.5) * titleDuck;
    for (const m of hazeMats) {
      (m.uniforms.time as { value: number }).value = t;
      (m.uniforms.level as { value: number }).value = BRIGHTNESS.hazeAlpha * ramp(t, tl.open, 1.5);
    }

    // 서치라이트: 처음부터 트로피로 모인 채 가운데부터 0.12초 간격, 워시·역광 빔은 0.4초 뒤, 위 빔은 위 조명을 따른다.
    // 호명에서 넓은 빛이 객석(관객) 쪽으로
    const callK = easeInOutCubic((t - tl.call) / 1.5);
    const titleBeam = 1 - 0.4 * easeInOutCubic((t - tl.title) / 0.8);
    for (const b of beams) {
      let on = 0;
      if (b.kind === 'narrow') {
        on = ramp(t, tl.beams + (narrowRank.get(b) ?? 0) * 0.12, 0.3) * titleBeam;
        aimTmp.set(Math.sin(t * 0.45 + b.seed) * 13, 1 + Math.abs(Math.sin(t * 0.3 + b.seed * 2)) * 4, Math.cos(t * 0.38 + b.seed) * 9 + 6);
        b.aim.lerpVectors(aimTmp, trophyAim, 0.85);
      } else if (b.kind === 'wash') {
        on = ramp(t, tl.beams + 0.4, 0.8);
        aimTmp.set(b.seed * 2.5 + Math.sin(t * 0.2 + b.seed) * 2, STAGE_TOP, 2 + Math.cos(t * 0.17) * 2);
        b.aim.lerpVectors(aimTmp, audienceAim, callK);
      } else if (b.kind === 'pool') {
        on = poolSpot.intensity / BRIGHTNESS.poolSpot;
        b.aim.set(0, STAGE_TOP, 0);
      } else {
        on = ramp(t, tl.beams + 0.4, 0.6);
        b.aim.set(Math.sign(b.seed) * (10 + Math.sin(t * 0.25) * 1.5), 7, 22);
      }
      aimBeam(b.mesh, b.origin, b.aim, tmp, b.widen);
      (b.mat.uniforms.strength as { value: number }).value = on;
      (b.mat.uniforms.time as { value: number }).value = t;
    }
  }

  function updateConfetti(dt: number, t: number) {
    // TEMP(프레임 분석): 멈춘 시각의 꽃가루 위치를 식으로 계산
    if (freezeT !== null) {
      const tau = t - (timeline.title - 0.3);
      let n = 0;
      if (tau > 0) {
        bits.forEach((b, i) => {
          b.p.set((fh(i * 3 + 1) < 0.5 ? -1 : 1) * (3.6 + fh(i * 5 + 4) * 5.4), 9 + fh(i * 3 + 2) * 5, (fh(i * 3 + 3) - 0.5) * 6);
          b.p.x += (fh(i * 7 + 1) - 0.5) * 1.2 * tau;
          b.p.z += (fh(i * 7 + 2) - 0.5) * 1.2 * tau;
          b.p.y += -(3.4 + fh(i * 7 + 5) * 2) * tau + 0.3 * tau * tau;
          if (b.p.y < 0) return;
          b.rot.set(fh(i * 11) * 6 + tau * 3, fh(i * 13) * 6 + tau * 2, fh(i * 17) * 6);
          m4.compose(b.p, q.setFromEuler(b.rot), sc);
          confetti.setMatrixAt(n++, m4);
        });
      }
      confetti.count = n;
      confetti.instanceMatrix.needsUpdate = true;
      return;
    }
    // 제목과 함께 터진다(위에서 화면에 들어오는 데 걸리는 만큼 0.3초 먼저)
    if (intro !== 'full') return; // 재방문은 꽃가루 없이(리뷰: 벽보다 먼저 터져 순서가 뒤집혔다)
    if (!confettiBurst && t >= timeline.title - 0.3) {
      confettiBurst = true;
      for (const b of bits) {
        // 트로피와 제목을 덮지 않게 양옆(|x| 3.6~9)으로만, 깊이 폭을 좁혀 조각 크기가 고르게
        b.p.set((Math.random() < 0.5 ? -1 : 1) * (3.6 + Math.random() * 5.4), 9 + Math.random() * 5, (Math.random() - 0.5) * 6);
        b.v.set((Math.random() - 0.5) * 1.2, -(3.4 + Math.random() * 2), (Math.random() - 0.5) * 1.2);
        b.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        b.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        b.alive = true;
      }
    }
    if (!confettiBurst) return;
    let n = 0;
    for (const b of bits) {
      if (!b.alive) continue;
      b.v.y += dt * 0.6; // 공기 저항으로 조금씩 느려짐
      b.p.addScaledVector(b.v, dt);
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
      if (b.p.y < 0) {
        b.alive = false;
        continue;
      }
      m4.compose(b.p, q.setFromEuler(b.rot), sc);
      confetti.setMatrixAt(n++, m4);
    }
    confetti.count = n;
    confetti.instanceMatrix.needsUpdate = true;
  }

  function placeCamera(t: number, dt: number) {
    const fov = cameraAt(t, camPos, lookPos);
    const settled = t > timeline.call + 2.0;
    // 대기: 트로피 둘레 느린 호(±3°, 40초) + 마우스 시차
    const idle = smooth(timeline.call + 1.5, timeline.call + 4.5, t); // 정지 뒤 대기 호는 속도 0에서 천천히 붙는다
    const yaw = Math.sin((t * Math.PI * 2) / 40) * THREE.MathUtils.degToRad(3) * idle;
    const bx = camPos.x;
    const bz = camPos.z;
    // 연출 중에는 마우스 시차를 끄고, 버튼이 나온 뒤 1초에 걸쳐 켠다
    const parallax = smooth(timeline.call, timeline.call + 1, t);
    camPos.x = bx * Math.cos(yaw) + bz * Math.sin(yaw) + pointer.x * (0.25 + 0.45 * idle) * parallax;
    camPos.z = -bx * Math.sin(yaw) + bz * Math.cos(yaw);
    camPos.y += pointer.y * 0.25 * (settled ? 1 : 0.4) * parallax;
    if (launch) {
      const k = easeInOutCubic((t - launchAt) / 1.35);
      camPos.lerp(CAM_LAUNCH, k);
      lookPos.lerp(LOOK_LAUNCH, k);
    }
    // 감쇠: 연출 중에는 짧은 시간 상수(0.18초)로, 대기 중에는 느리게 따라간다. 첫 프레임·정지 화면(dt 1)은 바로 자리 잡는다
    const tau = t < timeline.call + 2.2 || launch ? 0.18 : 0.4;
    const follow = !smoothReady || dt >= 1 ? 1 : 1 - Math.exp(-dt / tau);
    smoothReady = true;
    smoothPos.lerp(camPos, follow);
    smoothLook.lerp(lookPos, follow);
    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function step(now: number) {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = freezeT ?? (now - start) / 1000; // TEMP(프레임 분석)
    lastT = t;

    raycaster.setFromCamera(ndc, camera);
    // 포스터 올리기는 연출이 끝나고 버튼이 나온 뒤에만(연출 중 포스터가 튀어나오면 주인공이 흐트러진다)
    const hit = ndc.x > 2 || launch || t < timeline.call ? null : raycaster.intersectObjects(tileMeshes, false)[0];
    const hovered = hit ? (hit.object.userData.tileIndex as number) : -1;

    applyLights(t);
    layoutWall(dt, hovered, t);
    updateConfetti(dt, t);
    placeCamera(t, dt);

    // 연출 중에는 돌지 않고(빛이 움직인다) 버튼 뒤 0에서 천천히 붙는다
    // 좌우 약 ±20°(11-27: ±10°에서 늘림. 무광 금 위로 하이라이트가 흐르고 비틀린 기둥 옆면이 보인다)
    trophy.rotation.y = Math.sin((t - timeline.call) * 0.22) * 0.35 * smooth(timeline.call, timeline.call + 2, t);

    // 금가루: 정지 구간에는 멈춘다
    const holdStill = t > timeline.hold && t < timeline.impact ? 0.05 : 1;
    const dpos = dustGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < DUST; i++) {
      let y = dpos.getY(i) + dustSpeed[i] * dt * 0.35 * holdStill;
      if (y > 18) y = 0;
      dpos.setY(i, y);
      dpos.setX(i, dpos.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.03 * holdStill);
    }
    dpos.needsUpdate = true;

    composer.render(dt);
  }

  function loop(now: number) {
    frame = 0;
    if (!visible || document.hidden || paused || reduced) return;
    step(now);
    frame = requestAnimationFrame(loop);
  }

  /** 멈춤·동작 줄이기: 지금(또는 완성) 장면 한 장 */
  function renderStill() {
    const t = reduced ? 99 : lastT;
    applyLights(t);
    layoutWall(1, -1, t, 0);
    placeCamera(t, 1);
    composer.render();
  }

  /** 그림을 다 읽었거나 기다림이 끝나면: 셰이더 컴파일 → 예열(보이지 않게 한 번 그림) → 시계 출발(한 번만) */
  let beginning = false;
  async function begin() {
    if (started || beginning || disposed) return;
    beginning = true;
    canvas.style.visibility = 'hidden';
    try {
      applyLights(99); // 모든 효과가 켜진 상태로 컴파일·예열해 프로그램을 빠짐없이 만든다
      layoutWall(1, -1, 99, 0);
      await renderer.compileAsync(scene, camera);
      if (disposed) return;
      composer.render();
    } catch {
      // 예열 실패는 무시하고 그대로 진행(첫 프레임이 조금 늦을 뿐)
    }
    canvas.style.visibility = '';
    started = true;
    start = performance.now();
    lastT = 0;
    opts.onReady?.();
    if (reduced) renderStill();
    else resume();
  }

  // ── 포스터·트로피 읽기(다 읽거나 실패하면 연출 시계 출발) ──
  let pending = items.length + 1;
  const settled = () => {
    pending -= 1;
    if (pending === 0) void begin();
  };
  items.forEach((item, i) => {
    loader.load(
      item.url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const img = tex.image as { width?: number; height?: number };
        const c = coverCrop(img.width ?? 0, img.height ?? 0, TILE_W / TILE_H);
        tex.repeat.set(c.repeatX, c.repeatY);
        tex.offset.set(c.offsetX, c.offsetY);
        tex.anisotropy = 4;
        renderer.initTexture(tex); // GPU에 미리 올려 첫 표시 때 끊기지 않게
        itemTex[i] = tex;
        for (const w of wallTiles) {
          if (w.item === i) {
            w.mat.map = tex;
            w.mat.needsUpdate = true;
          }
        }
        disposables.push(tex);
        if (started && (reduced || paused)) renderStill();
        settled();
      },
      undefined,
      settled, // 못 읽은 그림은 빈 칸으로 남긴다
    );
  });

  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  /** 읽은 모델의 GPU 자원을 dispose 목록에 올린다 */
  const trackModel = (root: THREE.Object3D) =>
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      disposables.push(mesh.geometry);
      for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
        disposables.push(m);
        const std = m as THREE.MeshStandardMaterial;
        for (const tex of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap]) if (tex) disposables.push(tex);
      }
    });
  // 트로피(공통 언어 11-27, work/blender/build_lang.py 'fi' + CENTER_BODY): 3:1 비틀린 육각 기둥 위 꿀붕이, 아래 검정 받침.
  // 원점 = 받침 바닥 가운데, 높이 약 3.19m. 재질은 이름으로 끼운다
  gltfLoader.load(
    `${STAGE_ASSETS}/trophy.glb`,
    (g) => {
      trackModel(g.scene);
      const byName: Record<string, THREE.Material> = { gold: goldMatte, kkul: goldMatte, edge: goldEdge, black: stoneBlack };
      g.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const name = (mesh.material as THREE.Material).name;
        if (byName[name]) mesh.material = byName[name];
      });
      g.scene.scale.setScalar(TROPHY_GLB_SCALE);
      trophy.add(g.scene);
      settled();
    },
    undefined,
    settled,
  );

  const resume = () => {
    if (started && !reduced && !paused && frame === 0 && visible && !document.hidden) {
      clock.getDelta();
      frame = requestAnimationFrame(loop);
    }
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', resume);

  resize();
  const preloadTimer = window.setTimeout(() => void begin(), PRELOAD_MAX_MS);
  if (pending === 0) void begin();

  return {
    setLaunch(on) {
      if (on && !launch) launchAt = lastT;
      launch = on;
      if (on && paused) {
        paused = false;
        start = performance.now() - lastT * 1000;
        resume();
      }
    },
    skipIntro() {
      if (timeline === STAGE_TIMELINES.none || intro === 'none') return;
      // 시계를 완성 시점 뒤로 옮긴다(조명·벽은 바로 완성, 카메라는 부드럽게 따라간다). 꽃가루는 건너뛴다
      confettiBurst = true;
      const done = timeline.call + 2.4;
      if (!started) {
        timeline = STAGE_TIMELINES.none;
        void begin();
        return;
      }
      start = Math.min(start, performance.now() - done * 1000);
      if (reduced || paused) {
        lastT = done;
        renderStill();
      }
    },
    setPaused(on) {
      paused = on;
      if (on) {
        cancelAnimationFrame(frame);
        frame = 0;
        if (started) renderStill();
      } else {
        // 멈춘 동안 흐른 시간만큼 시계를 미뤄 그 자리에서 이어 간다
        start = performance.now() - lastT * 1000;
        resume();
      }
    },
    setReducedMotion(on) {
      if (on === reduced) return;
      reduced = on;
      if (on) {
        cancelAnimationFrame(frame);
        frame = 0;
        timeline = STAGE_TIMELINES.none;
        if (started) renderStill();
      } else {
        resume();
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(preloadTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', resume);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      confetti.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}

/** 빛줄기: 광원(꼭짓점, uv.y = 1)에서 과녁(uv.y = 0)으로 뻗는 원뿔. 더하기 혼합.
 *  광원 근처는 줄기들이 겹쳐 하늘이 뿌옇게 되므로 옅게, 가운데가 가장 진하다. 바닥 가까이(world y)에서 사라지고 잡음으로 결이 흐른다 */
function beamMaterial(color: number, alpha: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 0 }, alpha: { value: alpha }, time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      void main() {
        vY = uv.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      uniform float alpha;
      uniform float time;
      varying float vY;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vW;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float edge = pow(abs(dot(vN, vV)), 1.8);
        float along = smoothstep(0.0, 0.55, vY) * (1.0 - 0.85 * smoothstep(0.55, 1.0, vY));
        float floorFade = smoothstep(0.0, 2.5, vW.y);
        vec3 q = vW * 0.35 + vec3(0.0, time * 0.25, time * 0.1);
        float grain = 0.65 + 0.35 * (0.5 * n(q) + 0.3 * n(q * 2.1) + 0.2 * n(q * 4.3));
        gl_FragColor = vec4(color, alpha * edge * along * floorFade * grain * strength);
      }`,
  });
}

/** 금속 반사용 스튜디오: 검은 방 안에 조명판(위 넓은 판, 양옆 세로 띠, 뒤 가로 띠). 화면에는 안 보이고 반사에만 쓰인다 */
function studioEnvironment(): THREE.Scene {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.BackSide }));
  room.position.y = 4;
  env.add(room);
  const panel = (w: number, h: number, x: number, y: number, z: number, level: number, color = 0xfff1dc) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(level), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 1.5, 0);
    env.add(m);
  };
  panel(6, 1.4, 0, 9.5, 1, 6); // 위
  panel(0.7, 7, -7.5, 4, 2.5, 4.5); // 왼쪽 세로 띠
  panel(0.7, 7, 7.5, 4, -1.5, 3.5); // 오른쪽 세로 띠
  panel(9, 0.5, 0, 6, -9, 3, 0xffd9a0); // 뒤 가로 띠(따뜻하게)
  panel(4, 0.35, 0, 1.2, 9, 1.2); // 앞 낮은 띠(정면 몰딩에 가는 선)
  return env;
}

/** 안개 막: 아주 낮은 알파의 흐르는 잡음. 위·아래·옆 끝은 사라진다 */
function hazeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { level: { value: 0 }, time: { value: 0 }, color: { value: new THREE.Color(0xc9a46a) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float level;
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main() {
        vec2 p = vUv * vec2(6.0, 3.0) + vec2(time * 0.03, time * 0.012);
        float f = 0.5 * n(p) + 0.3 * n(p * 2.2 + 3.1) + 0.2 * n(p * 4.7 + 7.3);
        float mask = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(color, level * f * mask);
      }`,
  });
}

/** 원뿔(꼭짓점이 원점, 몸통이 -y)을 광원에서 과녁까지 눕히고 늘인다. widen = 길이당 벌어짐 */
function aimBeam(beam: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, tmp: THREE.Vector3, widen: number) {
  tmp.subVectors(to, from);
  const len = tmp.length();
  beam.position.copy(from);
  beam.scale.set(1 + len * widen, len, 1 + len * widen);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tmp.normalize());
}

/** 가운데가 밝은 동그란 점 */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
