// /awards 시상식장(Three.js). React와 떨어진 명령형 모듈이라 AwardsStage가 동적 import로만 불러온다(다른 페이지 번들에 안 들어간다).
// 연출 근거는 work/research/awards-grandeur-report.md(2026-11-26 조사). 은유는 "심사위원석으로 들어서는 밤":
// 객석(원형 테이블 만찬형 볼룸) → oxblood 카펫과 계단 → 단상 → 트로피 앞 심사위원석. 팔레트는 검정·oxblood·금 한 계열.
//
// 장면: 계단식 검은 대리석 단상(카펫이 덮인 계단) 위 금속 트로피(대리석 받침 + 지구본 + 꼭대기 꿀붕이 금속 메달),
// 지구본 뒤 빛의 고리(헤일로), 뒤쪽 후보 포스터 스크린 벽(낮은 밝기로 숨 쉼), 양옆 빛기둥, 위쪽 가장자리 샹들리에,
// 천장 서치라이트(가는 빔 6 · 넓은 빛 2 · 역광 2), 트로피 앞뒤 안개 막, 원형 테이블 객석 실루엣, 금가루.
//
// 큐(full, 약 16초. 시간값은 조사에 근거 없는 판단 시작값): 큰 사건은 셋(★)
//   0.0 객석 조명이 켜진 볼룸(테이블 위 따뜻한 빛 웅덩이, 샹들리에). 카메라는 디즈니 오프닝처럼 볼룸 위를 날다가(FLIGHT, 0~4.2초,
//   객석 샹들리에 사이로 내려가며 회전 때 살짝 기울어짐) 카펫 입구에 눈높이로 내려앉고, 1인칭으로 레드카펫을 걸어 들어간다(4.2~9.2초, 걸음 흔들림).
//   ★1 7.0 걷는 도중 객석 조명이 꺼지며 암전(쇼가 시작된다는 신호) → 8.4 빛기둥(불규칙) → 8.6 서치라이트 훑기 → 9.2 무대 앞에 멈춤
//   → 10.0 정지(빔이 트로피로 모이고 먼지가 멈춤, 시야가 천천히 좁혀 들어감) → ★2 10.6 임팩트(바닥 충격파 → 헤일로 점화 → 짧은 꽃가루,
//   정면광, 돌리 줌으로 다시 펼쳐짐, 미세 흔들림) → 10.8 금빛 띠가 트로피를 타고 오름 → 12.0 스크린 벽 점등 → 12.9 제목
//   → ★3 15.6 호명(벽이 더 어두워지고 넓은 빛이 객석 쪽으로, 카메라가 트로피 눈높이로) → 대기(느린 호 ±3°).
// 'short'는 재방문용 약 3초, 'none'은 완성 장면(동작 줄이기). skipIntro()는 완성 장면으로, setPaused()는 대기 움직임을 멈춘다.
// 시계는 포스터를 다 읽고(실패 포함, 최대 PRELOAD_MAX_MS) 셰이더를 미리 컴파일·예열한 뒤 출발한다(첫 프레임 끊김 방지).
// 밝기는 BRIGHTNESS 한곳에서 정한다(사용자가 눈부심을 지적했다). 섬광은 피하고(점화 후 유지, 왕복 없음) 샹들리에 반짝임 진폭은 작다.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEntryCamera, smootherstep, type EntryCameraSpec } from '@/lib/awards/entry-camera';
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
  /** 객석 조명이 꺼지기 시작(그 전까지 볼룸이 보인다). 짧은 연출·완성 장면은 처음부터 꺼져 있다 */
  house: number;
  /** 금 웅덩이 컨셉: 웅덩이로 스포트라이트 하나가 떨어지는 시각 */
  spot: number;
  /** 금 웅덩이 컨셉: 트로피가 수면을 뚫고 솟기 시작하는 시각(2.8초 동안) */
  rise: number;
  /** 빛이 꿀붕이에서 단으로 번지기 시작(키·림·보조광·단 금선). 이전 컨셉은 임팩트와 같다 */
  spread: number;
  /** 좁은 빔이 가운데부터 켜지기 시작(스포트 컨셉). 이전 컨셉은 open과 같다 */
  beams: number;
  pillars: number;
  open: number;
  hold: number;
  impact: number;
  wall: number;
  title: number;
  call: number;
}

/** 입장 컨셉(11-26 재구상): 'corridor' = 후보작 포스터 통로(A안), 'ballroom' = 볼룸 비행, 'pool' = 조사 ①안 금 웅덩이,
 *  'lattice' = 조사 ②안(그래미 2026 응용) 트로피 지구본의 금 격자 안에서 시작해 틈으로 빠져나오며 그것이 트로피였음이 드러난다.
 *  볼룸 소품은 실시간 디테일이 모자라 싸구려 세트처럼 보였고(사용자 피드백), 금 웅덩이는 액체로 읽히지 않아 품질이 낮았다(11-27) */
const CONCEPT = 'spot' as 'corridor' | 'ballroom' | 'pool' | 'lattice' | 'spot';
const POOL = CONCEPT === 'pool';
const CORRIDOR = CONCEPT === 'corridor';
const LATTICE = CONCEPT === 'lattice';
/** 공통 언어(11-27) 오프닝: 어둠 → 위에서 스포트가 꿀붕이에 열림 → 빛이 단으로 번짐 → 헤일로·벽 → 제목. 카메라는 한 번의 느린 접근 */
const SPOT = CONCEPT === 'spot';
/** TEMP(오프닝 결정 비교): 개발 중 localStorage로 선택지를 바꿔 본다. 결정 뒤 하나만 남긴다.
 *  stage-order: top(꼭대기부터, 추천) | bottom(바닥부터) | sil(윤곽 먼저)
 *  stage-cam: push(짧은 직선 접근, 추천) | fixed(고정) | descend(내려앉기)
 *  stage-impact: confetti(링 + 꽃가루, 추천) | ring(링만) | full(꽃가루 + 충격파 + 흔들림) */
const devFlag = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
// 결정(11-27, 선택 페이지 MfBXeZzcoa7Yhv1bM2Z5vJ): 윤곽 먼저 · 짧은 접근 · 링+꽃가루(꽃가루는 링이 다 차오른 뒤로 미룸)
const ORDER = devFlag('stage-order', ['top', 'bottom', 'sil'] as const, 'sil');
const CAM_MODE = devFlag('stage-cam', ['push', 'fixed', 'descend'] as const, 'push');
const IMPACT_MODE = devFlag('stage-impact', ['confetti', 'ring', 'full'] as const, 'confetti');
/** TEMP(링 비교): beads(지금: 두 겹 + 구슬 48) | thin(구슬 없는 가는 링 하나) | arc(위쪽만 남고 아래로 사라지는 호) */
// 결정(11-27): 링은 아치, 끝은 붓끝(구슬 두 겹 링은 촌스러움의 경계였다)
const RING = devFlag('stage-ring', ['beads', 'thin', 'arc'] as const, 'arc');
/** TEMP(아치 끝 비교): taper(붓끝처럼 가늘어짐) | finial(끝까지 밝고 금 마름모 장식) | ground(길게 내려와 무대 단 뒤에 닿음) */
const ARC_END = devFlag('stage-arc-end', ['taper', 'finial', 'ground'] as const, 'taper');
/** 아치가 남기는 각도(위 가운데 기준 전체). 무대에 세우기는 양 끝이 단 윗면 높이(약 y 1.6)까지 내려오게 */
const ARC_SPAN = ARC_END === 'ground' ? Math.PI * 1.67 : Math.PI * 1.28;
/** 링이 왼쪽 끝에서 위를 지나 오른쪽으로 그려지는 시간(초). 서서히 밝아지는 대신 그어지며 생긴다(11-27 사용자 제안) */
const RING_DRAW = 1.1;

export const STAGE_TIMELINES: Record<StageIntro, StageTimeline> = {
  // 금 웅덩이(11-26, 조사 ①안): 어둠 속 웅덩이가 은은히 빛나다(0.3) → 스포트라이트 하나(1.6) → 트로피가 수면을 뚫고 솟음(2.4~5.2)
  // → 임팩트(5.4: 헤일로·충격파·꽃가루) → 빛이 퍼짐 → 제목. 카메라는 처음부터 한 방향으로 천천히 물러나 9.6초에 심사위원석. SetupScreen CUES도 같이
  // 금 격자(11-27, 조사 ②안): 어둠 속 격자 안(0) → 위에서 빛 한 줄기(0.6) → 카메라가 격자 틈으로 빠져나와 물러남 → 트로피 전체가 드러남
  // → 임팩트(6.2: 지구본 속 심이 켜지고 헤일로) → 제목. 카메라는 한 방향으로 물러나 12초에 심사위원석
  // 스포트(11-27, 오프닝 설계 work/trophy/lang/opening-decisions.json): 한 점(핀 0.6) → 형태(트로피가 켜짐 2.2~4.4) → 정적(4.4~4.9)
  // → 링(4.9) → 빔(5.3, 가운데부터) → 벽(5.9) → 빛기둥(6.3) → 제목(6.8) → 자막(7.8) → 버튼(8.8). 카메라는 4.4초에 멈추고 글자는 그 뒤. SetupScreen CUES도 같이
  full: SPOT
    ? { house: -99, spot: 0.6, spread: 2.2, beams: 5.3, rise: -99, pillars: 6.3, open: 4.9, hold: 4.4, impact: 4.9, wall: 5.9, title: 6.8, call: 8.8 }
    : LATTICE
    ? { house: -99, spot: 0.6, spread: 6.2, beams: 6.2, rise: -99, pillars: 6.8, open: 6.2, hold: 7.4, impact: 6.2, wall: 7.6, title: 8.4, call: 11.1 }
    : { house: -99, spot: 1.6, spread: 5.4, beams: 5.4, rise: 2.4, pillars: 6.0, open: 5.4, hold: 6.6, impact: 5.4, wall: 6.8, title: 7.6, call: 10.3 },
  // 짧은 연출(재방문 2.8초): 카메라는 최종 자리 고정. 핀(0) → 나머지 일괄(0.5) → 링(1.2) → 벽(1.5) → 제목(1.8) → 자막(2.2) → 버튼(2.8)
  short: { house: -99, spot: 0, spread: 0.5, beams: 1.3, rise: -99, pillars: 1.5, open: 1.2, hold: 1.0, impact: 1.2, wall: 1.5, title: 1.8, call: 2.8 },
  none: { house: -99, spot: -99, spread: -99, beams: -99, rise: -99, pillars: -99, open: -99, hold: -99, impact: -99, wall: -99, title: -99, call: -99 },
};

/** 밝기 예산. 노출·bloom 상한은 올리지 않는다(사용자 눈부심 지적). 효과를 더할 때는 여기 값을 먼저 정한다 */
const BRIGHTNESS = {
  exposure: 0.82,
  bloomStrength: 0.18,
  key: 140,
  rimSide: 100,
  back: 170,
  fill: 26,
  beamAlpha: 0.2,
  washAlpha: 0.09,
  backBeamAlpha: 0.12,
  hazeAlpha: 0.045,
  /** 스크린 벽 최대 밝기(색 배율). 트로피보다 확실히 낮게 */
  wallMax: 0.13,
  /** 격자 컨셉: 지구본 안 빛(cd, 반지름 약 1.3m 안쪽 면 기준)과 임팩트 때 켜지는 심(색 배율) */
  inner: 1.6,
  core: 0.9,
  /** 격자 컨셉 반사 환경 세기(어둠 속 처음 / 임팩트 뒤 더하는 값) */
  envBase: 0.35,
  envImpact: 0.55,
  /** 금 웅덩이로 떨어지는 스포트라이트(실제 광원) */
  poolSpot: 90, // 11-27: 180이면 새 트로피 꿀붕이 머리 꼭대기가 하얗게 날아갔다
  /** 통로 포스터 최대 밝기(색 배율). 어둠 속에서 읽히되 눈부시지 않게 */
  corridor: 0.5,
  halo: 0.72,
  edge: 0.8,
  pillar: 0.62,
  chandelier: 0.85,
  lamp: 0.9,
  /** 객석 실내광(테이블·사람 윤곽이 읽힐 만큼만) */
  house: 1.2,
  /** 객석 빛 웅덩이(쇼 전) */
  housePool: 420,
};

const PRELOAD_MAX_MS = 2500;
const GOLD = 0xe0b654;
const OXBLOOD = 0x4a1016;
const STEPS = 8;
/** 금 웅덩이: 단상 위 둥근 받침의 반지름·높이(트로피 받침 대각선 반지름 약 2.5보다 크게) */
const POOL_R = 2.9;
const POOL_H = 0.14;
const STAGE_TOP = 1.6;
const TROPHY_SCALE = 1.55;
/** 새 트로피(glb, 높이 3.19m)를 예전 트로피 높이(약 6.6)에 맞추는 배율 */
const TROPHY_GLB_SCALE = 2.07;
const GLOBE_Y = STAGE_TOP + 2.5 * TROPHY_SCALE;
const TILE_W = 2.1;
const TILE_H = 2.8;

// 3D 모델(CC0 에셋을 gltf-transform으로 압축, 출처는 work/assets). 모델을 고치면 v2 폴더로 올린다(public/_headers 1년 캐시)
const STAGE_ASSETS = '/stage/v1';
/** 하객 자세 갈래: [앉기 동작 이름, 동작 시각(초)]. 시각을 달리해 같은 동작도 조금씩 다른 자세가 되게 */
const GUEST_POSES: [string, number][] = [
  ['Sitting_Idle_Loop', 0.4],
  ['Sitting_Talking_Loop', 0.9],
  ['Sitting_Talking_Loop', 2.3],
];
/** 모델 원점에서 앉은 엉덩이까지(의자 쪽으로 이만큼 들어가 앉는다) */
const GUEST_OFFSET = 0.18;
/** 피부로 칠할 뼈(이 뼈들에 주로 붙은 삼각형은 옷이 아니라 피부) */
const SKIN_BONES = /head|neck|hand|finger|thumb|index|middle|ring|pinky|eye|jaw/i;

// 카메라: 볼룸 위 비행 → 카펫 위로 낮게 → 멈추지 않고 떠올라 심사위원석에 정착(ENTRY_SPEC)
/** 입장 카메라(src/lib/awards/entry-camera.ts). Blender 프리비즈에서 승인된 4.1-a 사양을 실시간 좌표로 옮겼다:
 *  볼룸 왼쪽 뒤 높은 곳 → 샹들리에 아래로 호를 그리며 하강 → 카펫 착지(접선이 카펫 방향이라 꺾이지 않음) → 걷기 → 무대 앞 정지.
 *  속도 정점은 하나, 시선은 하강 중 진행 방향을 30% 따라봤다가 무대로. 바꾸면 work/blender/rt_entry_export.ts + camera_lint.py로 검사한다 */
/** 심사위원석(입장이 끝나 머무는 자리, 사용자 승인 구도) */
const CAM_JUDGE = new THREE.Vector3(0, 5.0, 19.8); // 11-26: 21.5에서 당김. 예전 대기 구간(약 20.4m)의 가까운 느낌을 살린다
const LOOK_JUDGE = new THREE.Vector3(0, 5.2, 0);
/** 입장 컨셉(11-26 재구상): 'corridor' = 어둠 속 후보작 포스터 통로를 지나 문이 갈라지며 무대(A안), 'ballroom' = 이전 볼룸 비행.
 *  볼룸의 테이블·하객·레드카펫·샹들리에는 실시간 디테일이 모자라 싸구려 세트처럼 보였다(사용자 피드백) */
const ENTRY_SPEC: EntryCameraSpec = SPOT
  ? {
      // 정면에서 한 번 느리게 다가가 심사위원석(지금의 최종 자리)에 멈춘다. 시선은 처음엔 꼭대기 꿀붕이, 빛이 단으로 번지며 무대 가운데로 내려온다
      points: [
        [0, 4.6, 26.0],
        [0, 4.7, 24.2],
        [0, 4.8, 22.6],
        [0, 4.9, 21.2],
      ],
      landTangent: [0, 0.07, -1.0],
      end: [CAM_JUDGE.x, CAM_JUDGE.y, CAM_JUDGE.z],
      times: { start: 0.3, peak: 3.2, land: 6.2, stop: 9.0 },
      decel: 2.4,
      look: { from: [0, 7.8, 0], to: [LOOK_JUDGE.x, LOOK_JUDGE.y, LOOK_JUDGE.z], start: 2.2, duration: 5.5 },
      heading: { weight: 0, onStart: 0, onDuration: 1, offStart: 0, offDuration: 1 },
    }
  : LATTICE
  ? {
      // 지구본 격자 안(가운데 조금 앞)에서 뒤쪽 안벽을 보며 출발 → 적도 위 틈(경선 사이, 위선 사이)으로 빠져나옴 → 한 방향으로 물러나 심사위원석.
      // 시선은 처음부터 지구본 쪽(뒤로 걷는 돌리 아웃)이라 고개를 돌리지 않는다. 틈 높이는 LATTICE_EXIT_Y
      points: [
        [0, 5.72, 0.15],
        [0, 5.72, 1.7],
        [0, 5.6, 6.5],
        [0, 5.25, 14.0],
      ],
      landTangent: [0, -0.18, 4.2],
      end: [CAM_JUDGE.x, CAM_JUDGE.y, CAM_JUDGE.z],
      times: { start: 0.5, peak: 5.2, land: 8.4, stop: 12.0 },
      decel: 2.4,
      look: { from: [0, 5.9, -1.6], to: [LOOK_JUDGE.x, LOOK_JUDGE.y, LOOK_JUDGE.z], start: 1.5, duration: 6.0 },
      heading: { weight: 0, onStart: 0, onDuration: 1, offStart: 0, offDuration: 1 },
    }
  : POOL
  ? {
      // 웅덩이 가까이(13.5m)에서 시작해 한 방향으로 천천히 물러나며 올라 심사위원석에 정착. 시선은 웅덩이 → 솟는 트로피를 따라 위로
      points: [
        [0, 3.0, 13.5],
        [0, 3.4, 15.0],
        [0, 4.0, 17.0],
        [0, 4.5, 18.6],
      ],
      landTangent: [0, 0.5, 1.2],
      end: [CAM_JUDGE.x, CAM_JUDGE.y, CAM_JUDGE.z],
      times: { start: 0.4, peak: 4.0, land: 7.5, stop: 9.6 },
      decel: 1.8,
      look: { from: [0, 2.0, 0], to: [LOOK_JUDGE.x, LOOK_JUDGE.y, LOOK_JUDGE.z], start: 2.4, duration: 3.6 },
      heading: { weight: 0, onStart: 0, onDuration: 1, offStart: 0, offDuration: 1 },
    }
  : CORRIDOR
  ? {
      // 통로 끝 높은 곳에서 출발 → 낮게 깔려 통로를 미끄러지듯 지나 → 문을 지나며 멈추지 않고 완만히 떠올라 심사위원석에 정착(한 번 움직여 정착).
      // 예전의 무대 앞 정지 → 6초 대기 → 엘리베이터처럼 상승은 두 번의 동작이라 어색했다(11-26)
      points: [
        [0, 5.6, 80],
        [-0.6, 4.2, 70],
        [-0.4, 3.0, 58],
        [0, 2.4, 46],
      ],
      landTangent: [0, 0.493, -4.976], // 착지 → 심사위원석 직선과 같은 방향
      end: [CAM_JUDGE.x, CAM_JUDGE.y, CAM_JUDGE.z],
      times: { start: 0.2, peak: 2.8, land: 7.6, stop: 15.0 },
      decel: 4.0,
      look: { from: [0, 3.0, 40], to: [LOOK_JUDGE.x, LOOK_JUDGE.y, LOOK_JUDGE.z], start: 0.6, duration: 14.4 },
      heading: { weight: 0.15, onStart: 0.6, onDuration: 3.0, offStart: 4.0, offDuration: 5.0 },
    }
  : {
      // 볼룸 왼쪽 뒤 높은 곳 → 샹들리에 아래로 호를 그리며 하강 → 카펫 위에 낮게 닿아 멈추지 않고 완만히 떠올라 심사위원석에 정착
      points: [
        [-17, 14, 64],
        [-12.6, 8.6, 57.4],
        [-3.2, 3.0, 47.0],
        [0, 2.6, 38],
      ],
      landTangent: [0, 0.654, -4.957], // 착지 → 심사위원석 직선과 같은 방향
      end: [CAM_JUDGE.x, CAM_JUDGE.y, CAM_JUDGE.z],
      times: { start: 0.2, peak: 3.0, land: 8.4, stop: 15.0 },
      decel: 4.0,
      look: { from: [0, 2, 20], to: [LOOK_JUDGE.x, LOOK_JUDGE.y, LOOK_JUDGE.z], start: 0.6, duration: 14.4 },
      heading: { weight: 0.3, onStart: 0.8, onDuration: 3.8, offStart: 4.6, offDuration: 6.5 },
    };
const ENTRY = buildEntryCamera(ENTRY_SPEC);
const FLIGHT_FOV = 40;
const CAM_SHORT = new THREE.Vector3(0, 3.0, 30);
const CAM_LAUNCH = new THREE.Vector3(0, 6.1, 2.4);
const LOOK_STAIRS = new THREE.Vector3(0, 5.5, 0);
const LOOK_LAUNCH = new THREE.Vector3(0, 6.3, -4);
/** 걷는 동안·무대 앞 정지 중의 세로 시야(위에서 내려오는 서치라이트가 화면에 들어오게) */
const FOV_WALK = 36;
/** 심사위원석 시야. 비행(40) → 걷기(36) → 심사위원석(34)으로 한 방향으로만 좁힌다 */
const FOV_WIDE = 34;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** 지각 밝기 p(0~1)를 세기로: 어둠에서 차오를 때 p²로 넣는다(디밍 곡선) */
const ramp = (t: number, at: number, dur: number) => {
  const p = clamp01((t - at) / dur);
  return p * p;
};
/** 0~1 결정적 난수(인덱스별) */
const hash = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// 꿀붕이(KkulMark와 같은 32px 격자 그림)의 몸통·귀·배 경로
const KKUL_BODY = 'M16 5.2C24.6 5.2 30.4 10.8 30.4 18.2C30.4 25 25.6 30 16 30C6.4 30 1.6 25 1.6 18.2C1.6 10.8 7.4 5.2 16 5.2Z';
const KKUL_EAR = 'M14.2 5.8C14.3 3.6 15.6 1.6 18.2 0.9C16.9 2.6 17 4.3 18.6 5.9Z';
const KKUL_BELLY = 'M28.63 24.53C26.45 27.89 22.24 30 16 30C9.76 30 5.55 27.89 3.37 24.53Q16 25.9 28.63 24.53Z';

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
  // 반사 환경: 격자 컨셉은 검은 방 + 길쭉한 조명판(금속감은 밝기가 아니라 어두운 바탕과 좁은 하이라이트의 대비에서 나온다, 조사 P10).
  // 바탕이 검어서 세기를 올려도 화면 전체는 밝아지지 않고 금에만 줄무늬 반사가 생긴다
  const envSource = LATTICE || SPOT ? studioEnvironment() : new RoomEnvironment();
  const envTex = pmrem.fromScene(envSource, 0.02).texture;
  if (LATTICE || SPOT) envSource.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  scene.environment = envTex;
  scene.environmentIntensity = 0.02;
  // 안개는 비행 첫 장면(볼룸 높은 곳, 약 60 거리)에서도 무대가 보일 만큼 옅게
  scene.fog = new THREE.FogExp2(0x050403, 0.012);

  // 격자 컨셉은 금 줄 바로 옆을 지나가므로 가까운 면을 당긴다
  const camera = new THREE.PerspectiveCamera(FOV_WALK, 1, LATTICE ? 0.03 : 0.1, 160);
  let reduced = opts.reducedMotion;
  let timeline = STAGE_TIMELINES[reduced ? 'none' : opts.intro];
  const intro: StageIntro = reduced ? 'none' : opts.intro;

  const disposables: { dispose(): void }[] = [envTex, pmrem];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ── 재질 ──
  const gold = track(new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.27, clearcoat: 0.25, clearcoatRoughness: 0.3 }));
  const goldSoft = track(new THREE.MeshPhysicalMaterial({ color: 0xd8b25e, metalness: 1, roughness: 0.42 }));
  const goldDeep = track(new THREE.MeshStandardMaterial({ color: 0x6e521c, metalness: 1, roughness: 0.45 }));
  const marble = track(new THREE.MeshPhysicalMaterial({ color: 0x0b0907, metalness: 0.2, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const carpet = track(new THREE.MeshStandardMaterial({ color: OXBLOOD, roughness: 0.92, metalness: 0 }));
  const tableCloth = track(new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.92, side: THREE.DoubleSide }));
  /** 빛을 내는 선(단상 금선·빛기둥·헤일로·램프). 색 배율로 켜고 끈다 */
  const glow = () => track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }));

  /** 볼룸 소품(레드카펫 길·샹들리에·객석·의자·하객). 통로 컨셉에서는 숨긴다 */
  const ballroom = new THREE.Group();
  ballroom.visible = CONCEPT === 'ballroom';
  scene.add(ballroom);

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

  // ── 단상: 검은 대리석 계단(단마다 앞 모서리 금선) + 가운데를 덮는 oxblood 카펫 ──
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
    // 카펫: 계단 앞쪽 디딤 부분을 덮는다
    const rug = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.012, 0.95)), carpet);
    rug.position.set(0, stepH * (i + 1) + 0.006, front - 0.475);
    ballroom.add(rug);
  }
  // 새 트로피(glb)의 재질: 무광 금(금 F0 선형 1, 0.71, 0.31), 가장자리만 조금 매끈한 금, 검정 돌(사용자 결정 11-27)
  const stoneBlack = track(new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.4, metalness: 0 }));
  const goldMatte = track(new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(1, 0.71, 0.31, THREE.LinearSRGBColorSpace), metalness: 1, roughness: 0.5 }));
  const goldEdge = track(new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(1, 0.71, 0.31, THREE.LinearSRGBColorSpace), metalness: 1, roughness: 0.25 }));

  // 객석에서 단상까지 이어지는 카펫
  const runway = new THREE.Mesh(track(new THREE.PlaneGeometry(3.4, 44)), carpet);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.012, 5.1 + 22);
  ballroom.add(runway);
  // 카펫 양옆 금 테
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.02, 44)), edgeMat);
    trim.position.set(side * 1.72, 0.02, 5.1 + 22);
    ballroom.add(trim);
  }

  // ── 트로피: 대리석 받침 + 금 띠 + 줄기 + 지구본 + 꿀붕이 메달 ──
  const trophy = new THREE.Group();
  /** 트로피가 서는 높이(웅덩이 컨셉은 받침 수면 위) */
  const trophyRestY = STAGE_TOP + (POOL ? POOL_H : 0);
  trophy.position.y = trophyRestY;
  trophy.scale.setScalar(TROPHY_SCALE);
  const box = (w: number, h: number, dd: number, mat: THREE.Material, y: number) => {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, dd)), mat);
    m.position.y = y;
    trophy.add(m);
    return m;
  };
  box(2.3, 0.5, 2.3, marble, 0.25);
  box(2.36, 0.05, 2.36, gold, 0.52);
  box(1.6, 0.42, 1.6, marble, 0.76);
  box(1.66, 0.05, 1.66, gold, 0.99);
  const plaque = box(0.9, 0.2, 0.02, gold, 0.76);
  plaque.position.z = 0.81;
  const stem = new THREE.Mesh(track(new THREE.CylinderGeometry(0.17, 0.34, 0.75, 48)), gold);
  stem.position.y = 1.39;
  trophy.add(stem);

  const globe = new THREE.Group();
  globe.position.y = 2.5;
  /** 지구본 속 심(격자 컨셉): 임팩트 때 가운데서 켜져 격자 사이로 빛이 새어 나온다 */
  const coreGlowMat = track(coreMaterial());
  const coreGlow = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 48, 32)), coreGlowMat);
  coreGlow.visible = LATTICE;
  globe.add(coreGlow);
  /** 지구본 안의 따뜻한 빛: 카메라가 격자 안에 있을 때 안쪽 면이 빛나 성당 천장처럼 보이게 */
  const innerLight = new THREE.PointLight(0xffd59a, 0, 4.5, 2);
  innerLight.position.y = 0.05;
  globe.add(innerLight);
  if (LATTICE) {
    // 속이 빈 금 격자(혼천의). 경선 8개(16줄)는 정면(+z)을 비켜 가도록 반 칸 돌려 두고, 위선은 적도 띠 + 넷.
    // 카메라는 적도와 위 첫 위선 사이, 정면 두 경선 사이 틈(가로 약 0.5m, 세로 약 0.4m)으로 빠져나온다
    const ribGeo = track(new THREE.TorusGeometry(0.868, 0.017, 10, 160));
    for (let i = 0; i < 8; i++) {
      const meridian = new THREE.Mesh(ribGeo, gold);
      meridian.rotation.y = ((i + 0.5) * Math.PI) / 8;
      globe.add(meridian);
    }
    for (const lat of [-0.6, -0.32, 0, 0.32, 0.6]) {
      const r = Math.sqrt(0.868 ** 2 - lat ** 2);
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(r, lat === 0 ? 0.03 : 0.015, 10, 160)), lat === 0 ? goldSoft : gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = lat;
      if (lat === 0) ring.scale.z = 1.8; // 적도 띠는 위아래로 넓적하게
      globe.add(ring);
    }
  } else {
    globe.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.86, 72, 54)), gold));
    const lineGeo = track(new THREE.TorusGeometry(0.868, 0.011, 6, 128));
    for (let i = 0; i < 6; i++) {
      const meridian = new THREE.Mesh(lineGeo, goldDeep);
      meridian.rotation.y = (i * Math.PI) / 6;
      globe.add(meridian);
    }
    for (const lat of [-0.6, -0.3, 0, 0.3, 0.6]) {
      const r = Math.sqrt(0.868 ** 2 - lat ** 2);
      const latRing = new THREE.Mesh(track(new THREE.TorusGeometry(r, 0.011, 6, 128)), goldDeep);
      latRing.rotation.x = Math.PI / 2;
      latRing.position.y = lat;
      globe.add(latRing);
    }
  }
  // 지구본을 잡는 고리 받침(골든글로브식 지지대)
  const cradle = new THREE.Mesh(track(new THREE.TorusGeometry(0.62, 0.05, 16, 96)), gold);
  cradle.rotation.x = Math.PI / 2;
  cradle.position.y = -0.62;
  globe.add(cradle);
  trophy.add(globe);

  // 꿀붕이 금속 메달: 공식 그림 경로를 압출하고 베벨로 가장자리를 둥글린다(구·원뿔 임시 도형 대체)
  const medalGold = track(new THREE.MeshPhysicalMaterial({ color: 0xd9ad4e, metalness: 1, roughness: 0.4, clearcoat: 0.1, clearcoatRoughness: 0.5 }));
  const kkul = buildKkulMedal(track, medalGold, goldSoft, goldDeep);
  kkul.position.y = 3.72;
  trophy.add(kkul);
  scene.add(trophy);

  // ── 금 웅덩이(POOL): 단상 위 둥근 받침에 고인 액체 금. 어둠 속에서 은은히 빛나다 스포트라이트를 받고, 트로피가 수면을 뚫고 솟으면 물결이 퍼진다 ──
  const poolGroup = new THREE.Group();
  poolGroup.visible = POOL;
  scene.add(poolGroup);
  const poolRim = new THREE.Mesh(track(new THREE.CylinderGeometry(POOL_R + 0.1, POOL_R + 0.16, POOL_H, 128, 1, true)), marble);
  poolRim.position.y = STAGE_TOP + POOL_H / 2;
  poolGroup.add(poolRim);
  const poolLip = new THREE.Mesh(track(new THREE.RingGeometry(POOL_R - 0.02, POOL_R + 0.1, 128)), gold);
  poolLip.rotation.x = -Math.PI / 2;
  poolLip.position.y = STAGE_TOP + POOL_H + 0.004;
  poolGroup.add(poolLip);
  const poolGeo = track(new THREE.RingGeometry(0.0001, POOL_R, compact ? 96 : 160, compact ? 28 : 48));
  poolGeo.rotateX(-Math.PI / 2);
  const poolBase = Float32Array.from(poolGeo.attributes.position.array as ArrayLike<number>);
  const poolMat = track(new THREE.MeshStandardMaterial({ color: 0xd9a646, metalness: 1, roughness: 0.16, emissive: 0x6a3d0c, emissiveIntensity: 0 }));
  const poolMesh = new THREE.Mesh(poolGeo, poolMat);
  poolMesh.position.y = STAGE_TOP + POOL_H;
  poolGroup.add(poolMesh);
  const poolSpot = new THREE.SpotLight(0xfff0cf, 0, 34, 0.16, 0.55, 1.4);
  poolSpot.position.set(0, 21, 1.0);
  poolSpot.target.position.set(0, STAGE_TOP, 0);
  scene.add(poolSpot, poolSpot.target); // 격자 컨셉도 같은 위 조명을 쓴다(웅덩이 묶음이 숨어도 켜지게)
  // 오프닝 "한 점": 꿀붕이만 겨누는 좁은 핀(각 0.05). 처음부터 장면에 둔다(광원 수가 바뀌면 셰이더를 다시 컴파일한다)
  const pinSpot = new THREE.SpotLight(0xfff0cf, 0, 34, 0.05, 0.6, 1.4);
  pinSpot.position.set(0, 21, 1);
  pinSpot.target.position.set(0, 7.6, 0);
  scene.add(pinSpot, pinSpot.target);
  // 바닥부터 켜기(시안 bottom)에서만: 정면 낮은 곳에서 위로 훑어 올라가는 빛
  const liftSpot = new THREE.SpotLight(0xffe2b8, 0, 30, 0.07, 0.8, 1.4);
  liftSpot.position.set(0, 3.0, 14);
  liftSpot.target.position.set(0, 1.9, 0);
  if (SPOT && ORDER === 'bottom') scene.add(liftSpot, liftSpot.target);
  /** 수면: 느린 너울 + 트로피가 뚫고 나올 때 가운데서 퍼지는 물결(감쇠). 정점 높이를 매 프레임 다시 계산한다 */
  function updatePool(t: number) {
    if (!POOL) return;
    const tl = timeline;
    const pos = poolGeo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const since = t - (tl.rise + 0.25);
    const wave = tl.rise < 0 || since < 0 ? 0 : 0.11 * Math.exp(-since * 0.75);
    for (let i = 0; i < arr.length; i += 3) {
      const x = poolBase[i];
      const z = poolBase[i + 2];
      const d = Math.hypot(x, z);
      let y = 0.012 * Math.sin(d * 2.6 - t * 1.1) + 0.008 * Math.sin(x * 1.7 + t * 0.7);
      if (wave > 0) {
        const front = since * 1.5;
        const env = smooth(front + 0.2, front - 1.4, d) * (d < front + 0.2 ? 1 : 0);
        y += wave * env * Math.sin(7 * (d - front));
      }
      arr[i + 1] = y * smooth(POOL_R, POOL_R - 0.35, d); // 가장자리는 받침에 붙는다
    }
    pos.needsUpdate = true;
    poolGeo.computeVertexNormals();
    // 어둠 속 은은한 빛(녹은 금) → 스포트라이트를 받으면 반사가 주인공, 임팩트 뒤에는 조금 가라앉는다
    poolMat.emissiveIntensity = 0.35 * ramp(t, 0.3, 1.6) * (1 - 0.5 * ramp(t, tl.impact, 1.5));
  }

  // ── 헤일로: 지구본 뒤 빛의 고리 두 겹 + 빛 점 ──
  const haloMat = glow();
  const haloOn = new THREE.Color(0xb8913f);
  const halo = new THREE.Group();
  halo.position.set(0, GLOBE_Y, -2.4);
  halo.add(new THREE.Mesh(track(new THREE.TorusGeometry(4.5, 0.045, 12, 220)), haloMat));
  halo.add(new THREE.Mesh(track(new THREE.TorusGeometry(3.95, 0.016, 8, 220)), haloMat));
  const beadGeo = track(new THREE.SphereGeometry(0.07, 10, 8));
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const bead = new THREE.Mesh(beadGeo, haloMat);
    bead.position.set(Math.cos(a) * 4.22, Math.sin(a) * 4.22, 0);
    halo.add(bead);
  }
  scene.add(halo);
  if (RING !== 'beads') {
    // 구슬(전구처럼 읽힘)과 안쪽 링을 뺀다. 아치는 위쪽 약 230°만 남기고 양 끝으로 갈수록 어두워진다(정점 색)
    for (let i = 1; i < halo.children.length; i++) halo.children[i].visible = false;
    const ring = halo.children[0] as THREE.Mesh;
    const arc = RING === 'arc' ? ARC_SPAN : Math.PI * 2;
    const geo = track(new THREE.TorusGeometry(4.5, 0.03, 12, 320, arc));
    if (RING === 'arc') {
      geo.rotateZ(Math.PI / 2 - arc / 2);
      // 끝 처리: 위 가운데에서 잰 각(fromTop)으로 끝까지 남은 각(toEnd)을 구해 굵기·밝기를 정한다
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const cols = new Float32Array(pos.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const ang = Math.atan2(v.y, v.x);
        const fromTop = Math.abs(((ang - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const toEnd = Math.max(0, arc / 2 - fromTop);
        let bright = 1;
        let thick = 1;
        if (ARC_END === 'taper') {
          // 붓끝: 끝 0.9rad에서 굵기가 점으로, 밝기는 끝 0.5rad에서 0으로
          thick = 0.08 + 0.92 * smooth(0, 0.9, toEnd);
          bright = smooth(0, 0.5, toEnd);
        } else if (ARC_END === 'ground') {
          bright = smooth(0, 0.12, toEnd); // 단 뒤로 들어가며 끊김 없이
        }
        // 관 단면 중심(큰 원 위의 점)에서 정점까지의 거리를 thick배로
        const cx = Math.cos(ang) * 4.5;
        const cy = Math.sin(ang) * 4.5;
        pos.setXYZ(i, cx + (v.x - cx) * thick, cy + (v.y - cy) * thick, v.z * thick);
        cols.set([bright, bright, bright], i * 3);
      }
      pos.needsUpdate = true;
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      haloMat.vertexColors = true;
      if (ARC_END === 'finial') {
        // 끝 장식: 양 끝에 금 마름모(정팔면체를 세로로 늘림). 선이 닿을 때 켜진다
        const finGeo = track(new THREE.OctahedronGeometry(0.13, 0));
        finGeo.scale(0.8, 1.5, 0.8);
        for (const side of [-1, 1]) {
          const a = Math.PI / 2 + side * (arc / 2);
          const fin = new THREE.Mesh(finGeo, haloMat);
          fin.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0);
          fin.rotation.z = a - Math.PI / 2;
          fin.userData.finial = true;
          halo.add(fin);
        }
      }
    }
    ring.geometry = geo;
  }

  // 링이 그려지는 진행: 정점마다 0(왼쪽 끝) → 1(끝) 값을 두고 셰이더가 진행보다 앞선 부분을 버린다. 맨 앞은 조금 더 밝게
  const ringReveal = { value: 1 };
  const revealOf = (x: number, y: number) => {
    const theta = Math.atan2(y, x);
    if (RING === 'arc') {
      const arc = ARC_SPAN;
      const left = Math.PI / 2 + arc / 2;
      return clamp01((left - (theta < -Math.PI / 2 ? theta + Math.PI * 2 : theta)) / arc);
    }
    return (Math.PI - theta) / (Math.PI * 2); // 왼쪽 0 → 위 0.25 → 오른쪽 0.5 → 아래 0.75
  };
  for (const child of halo.children) {
    const mesh = child as THREE.Mesh;
    const g = mesh.geometry as THREE.BufferGeometry;
    if (g.type !== 'TorusGeometry') {
      mesh.userData.reveal = revealOf(mesh.position.x, mesh.position.y); // 구슬은 자리로 켠다
      continue;
    }
    const pos = g.attributes.position as THREE.BufferAttribute;
    const rv = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) rv[i] = revealOf(pos.getX(i), pos.getY(i));
    g.setAttribute('aReveal', new THREE.BufferAttribute(rv, 1));
  }
  haloMat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = ringReveal;
    sh.vertexShader = 'attribute float aReveal;\nvarying float vReveal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vReveal = aReveal;');
    sh.fragmentShader =
      'uniform float uReveal;\nvarying float vReveal;\n' +
      sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  if (vReveal > uReveal) discard;\n  gl_FragColor.rgb *= 1.0 + 1.6 * smoothstep(uReveal - 0.07, uReveal, vReveal) * step(uReveal, 0.999);',
      );
  };
  haloMat.customProgramCacheKey = () => 'halo-reveal';

  // ── 임팩트 효과: 바닥 충격파 링(트로피를 타고 오르던 금빛 띠는 11-27 사용자 요청으로 뺐다) ──
  const shockMat = track(new THREE.MeshBasicMaterial({ color: 0xd9b45a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const shock = new THREE.Mesh(track(new THREE.RingGeometry(1, 1.05, 160)), shockMat);
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = STAGE_TOP + 0.02;
  scene.add(shock);

  // ── 스크린 벽: 무대 뒤 곡면에 후보 포스터(낮은 밝기, 숨 쉬듯 느린 파동, 약한 탈채도) ──
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const items = compact ? opts.items.slice(0, 12) : opts.items;
  const wallCols = compact ? 9 : 15;
  const wallRows = 4;
  const wallR = 26;
  const wallGeo = track(new THREE.PlaneGeometry(TILE_W, TILE_H));
  const wallTiles: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; item: number; col: number; row: number; home: THREE.Vector3; pop: number }[] = [];
  const wall = new THREE.Group();
  wall.position.set(0, 0, 14);
  for (let row = 0; row < wallRows; row++) {
    for (let col = 0; col < wallCols; col++) {
      const a = ((col - (wallCols - 1) / 2) / wallCols) * 1.25;
      const mat = track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }));
      const tile = new THREE.Mesh(wallGeo, mat);
      tile.position.set(Math.sin(a) * wallR, 2.2 + row * 3.05, -Math.cos(a) * wallR);
      tile.lookAt(0, tile.position.y, 0);
      tile.userData.tileIndex = wallTiles.length;
      wall.add(tile);
      wallTiles.push({ mesh: tile, mat, item: items.length === 0 ? -1 : (row * 7 + col * 3) % items.length, col, row, home: tile.position.clone(), pop: 0 });
    }
  }
  scene.add(wall);
  const tileMeshes = wallTiles.map((w) => w.mesh);

  // ── 후보작 통로(CORRIDOR): 2026년에 한 게임 포스터가 어둠 속 양옆에 서 있고 카메라가 다가가면 하나씩 켜진다. 끝의 문이 갈라지며 무대 ──
  const corridorGeo = track(new THREE.PlaneGeometry(TILE_W * 0.72, TILE_H * 0.72));
  type CorridorTile = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; item: number; lit: number; gate: number; home: THREE.Vector3 };
  const corridorTiles: CorridorTile[] = [];
  const corridor = new THREE.Group();
  corridor.visible = CORRIDOR;
  if (CORRIDOR) {
    const STATIONS = compact ? 10 : 14;
    let k = 0;
    for (let i = 0; i < STATIONS; i++) {
      const z = 78 - i * 2.4;
      for (const side of [-1, 1]) {
        // 높이·거리를 조금씩 어긋나게(벽지처럼 반복되지 않게), 위 줄은 번갈아
        const tiers = i % 2 === 0 ? [2.0, 4.6] : [3.3];
        for (const y of tiers) {
          const mat = track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: true }));
          const mesh = new THREE.Mesh(corridorGeo, mat);
          const x = side * (3.4 + hash(k + 300) * 0.9);
          mesh.position.set(x, y + (hash(k + 310) - 0.5) * 0.5, z + side * 0.8);
          mesh.rotation.y = -side * (Math.PI / 2 - 0.42); // 통로 가운데를 비스듬히 향해(다가오는 카메라에 얼굴이 보이게)
          corridor.add(mesh);
          corridorTiles.push({ mesh, mat, item: items.length === 0 ? -1 : (k * 5 + 2) % items.length, lit: 0, gate: -1, home: mesh.position.clone() });
          k++;
        }
      }
    }
    // 문: 통로 끝을 막은 포스터 판 4×2. 무대 앞에 닿기 전에 가운데부터 양옆으로 갈라진다
    const GATE_Z = 38;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const mat = track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: true, transparent: true }));
        const mesh = new THREE.Mesh(corridorGeo, mat);
        mesh.position.set((col - 1.5) * 1.58, 1.15 + row * 2.1, GATE_Z);
        corridor.add(mesh);
        corridorTiles.push({ mesh, mat, item: items.length === 0 ? -1 : (k * 5 + 2) % items.length, lit: 0, gate: col, home: mesh.position.clone() });
        k++;
      }
    }
  }
  scene.add(corridor);
  /** 문이 갈라지기 시작하는 시각: 카메라가 문 앞 7m에 닿을 때(경로를 바꿔도 따라간다) */
  const gateOpenAt = (() => {
    for (let t = 0; t < ENTRY_SPEC.times.stop; t += 1 / 60) if (ENTRY.at(t).pos[2] < 38 + 7) return t;
    return ENTRY_SPEC.times.stop;
  })();

  // ── 빛기둥: 양옆으로 깊게 늘어선 세로 기둥(불규칙 간격으로 켜진다) ──
  const PILLARS = compact ? 6 : 9;
  const pillarGeo = track(new THREE.BoxGeometry(0.16, 18, 0.16));
  const pillarOn = new THREE.Color(0x9c7a35);
  const pillars: { mat: THREE.MeshBasicMaterial; cue: number; phase: number }[] = [];
  for (let i = 0; i < PILLARS; i++) {
    for (const side of [-1, 1]) {
      const mat = glow();
      const p = new THREE.Mesh(pillarGeo, mat);
      p.position.set(side * (16 + i * 0.6), 9, -16 + i * 4.4);
      scene.add(p);
      const k = pillars.length;
      pillars.push({ mat, cue: hash(k) * 1.7, phase: hash(k + 40) * 6 });
    }
  }

  // ── 샹들리에: 위쪽 가장자리 실루엣 + 아주 작은 크리스털 반짝임(불규칙 주기, 작은 진폭) ──
  const chandeliers = new THREE.Group();
  const crystalCount = compact ? 60 : 140;
  const crystalPos: number[] = [];
  const crystalPhase: number[] = [];
  const crystalRate: number[] = [];
  // 무대 위 둘 + 객석 위(카메라가 내려가며 지나가는 높이)
  const chandelierSpots = compact
    ? [new THREE.Vector3(-7, 15.5, 9), new THREE.Vector3(7, 15.5, 9), new THREE.Vector3(-6, 11.5, 40), new THREE.Vector3(6, 11.5, 40)]
    : [
        new THREE.Vector3(-10, 15, 8),
        new THREE.Vector3(10, 15, 8),
        new THREE.Vector3(-7, 11.5, 38),
        new THREE.Vector3(7, 11.5, 38),
        new THREE.Vector3(-8, 12.5, 52),
        new THREE.Vector3(8, 12.5, 52),
      ];
  /** 샹들리에 모델의 전구 재질(읽은 뒤 채운다), 모델로 만든 InstancedMesh(dispose용) */
  const chandelierLamps: THREE.MeshStandardMaterial[] = [];
  const instancedExtra: THREE.InstancedMesh[] = [];
  // 샹들리에 심: 빛나는 작은 구(쇼 전 볼룸 조명과 함께 켜지고 꺼진다)
  const coreMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  const coreGeo = track(new THREE.SphereGeometry(0.32, 16, 12));
  // 샹들리에 모델(Poly Haven Chandelier_01, CC0)은 아래 모델 읽기에서 각 자리에 복제해 단다. 여기서는 사슬과 빛나는 심만
  const chainGeo = track(new THREE.CylinderGeometry(0.03, 0.03, 8, 6));
  for (const at of chandelierSpots) {
    const c = new THREE.Group();
    c.position.copy(at);
    const chain = new THREE.Mesh(chainGeo, goldDeep);
    chain.position.y = 4.9;
    c.add(chain);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = -1.4;
    core.scale.set(1, 1.3, 1);
    c.add(core);
    chandeliers.add(c);
    for (let i = 0; i < crystalCount; i++) {
      const tier = i % 3;
      const r = [0.9, 1.5, 2.1][tier];
      const a = hash(i + at.x * 3) * Math.PI * 2;
      crystalPos.push(at.x + Math.cos(a) * r, at.y - tier * 0.55 - 0.15 - hash(i * 7) * 0.5, at.z + Math.sin(a) * r);
      crystalPhase.push(hash(i * 13 + at.x) * 6.28);
      crystalRate.push(0.6 + hash(i * 17 + at.y) * 1.8);
    }
  }
  ballroom.add(chandeliers);
  const crystalGeo = track(new THREE.BufferGeometry());
  crystalGeo.setAttribute('position', new THREE.Float32BufferAttribute(crystalPos, 3));
  crystalGeo.setAttribute('phase', new THREE.Float32BufferAttribute(crystalPhase, 1));
  crystalGeo.setAttribute('rate', new THREE.Float32BufferAttribute(crystalRate, 1));
  const crystalMat = track(sparkleMaterial(track(dotTexture())));
  ballroom.add(new THREE.Points(crystalGeo, crystalMat));

  // ── 객석: 원형 테이블 만찬형 볼룸(카펫 양옆). 테이블 원판 + 둘러앉은 사람 실루엣 + 작은 호박색 램프 점 ──
  const tables: THREE.Vector3[] = [];
  const ROWS = compact ? 3 : 4;
  for (let r = 0; r < ROWS; r++) {
    for (const side of [-1, 1]) {
      for (let c = 0; c < (compact ? 2 : 3); c++) {
        tables.push(new THREE.Vector3(side * (4.2 + c * 4.6 + (r % 2) * 1.2), 0, 24 + r * 4.4));
      }
    }
  }
  // 연회 테이블: 바닥까지 내려오는 테이블보(윗면 + 주름진 치마)
  const tableTop = new THREE.InstancedMesh(track(tableClothGeometry()), tableCloth, tables.length);
  // 가운데 장식: 가는 금 촛대(촛불은 lamps)
  const tableLeg = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.02, 0.07, 0.42, 12)), goldDeep, tables.length);
  // 램프는 안개에 묻히지 않게(fog 끔). 어둠 속 테이블 위치를 알려 주는 작은 점
  const lampMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  const lamps = new THREE.InstancedMesh(track(new THREE.SphereGeometry(0.035, 10, 8)), lampMat, tables.length);
  const SEATS = 5;
  /** 하객 자리: 모델(Quaternius Universal Base Characters, CC0)을 읽은 뒤 앉은 자세(Universal Animation Library의 앉기 동작)로
   *  굳혀 자세·성별 갈래마다 InstancedMesh로 놓는다. 옷은 대부분 검은 정장, 일부 드레스(와인·네이비·샴페인) */
  const guestSeats: { matrix: THREE.Matrix4; outfit: number; female: boolean; variant: number }[] = [];
  // 드레스는 피부색과 헷갈리지 않는 짙은 색만(샴페인색은 맨몸처럼 보여 뺐다)
  const OUTFITS = [0x0d0c0c, 0x0d0c0c, 0x0d0c0c, 0x101217, 0x3a1418, 0x1b2236, 0x14302a];
  /** 의자 자리(모델을 읽은 뒤 InstancedMesh로 놓는다): 하객 바로 뒤, 테이블을 향해 */
  const chairMats: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  tables.forEach((t, i) => {
    m4.compose(pos.set(t.x, 0, t.z), q.setFromAxisAngle(Y_AXIS, hash(i + 70) * 6.28), sc.set(1, 1, 1));
    tableTop.setMatrixAt(i, m4);
    m4.compose(pos.set(t.x, 0.99, t.z), q.identity(), sc.set(1, 1, 1));
    tableLeg.setMatrixAt(i, m4);
    m4.compose(pos.set(t.x, 1.24, t.z), q.identity(), sc.set(1, 1, 1));
    lamps.setMatrixAt(i, m4);
    for (let s = 0; s < SEATS; s++) {
      const a = (s / SEATS) * Math.PI * 2 + hash(i) * 0.6;
      const k = i * SEATS + s;
      const x = t.x + Math.cos(a) * 1.55;
      const z = t.z + Math.sin(a) * 1.55;
      // 테이블 쪽(가운데)을 향해 앉는다: 넓은 어깨가 테이블과 나란하게
      const yaw = Math.atan2(t.x - x, t.z - z);
      q.setFromAxisAngle(Y_AXIS, yaw);
      chairMats.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(t.x + Math.cos(a) * 1.68, 0, t.z + Math.sin(a) * 1.68),
          q.clone(),
          new THREE.Vector3(0.82, 0.82, 0.82),
        ),
      );
      // 하객: 의자 앞쪽에 앉는다(GUEST_OFFSET은 모델 원점과 앉은 엉덩이 사이 거리를 맞추는 값)
      const female = hash(k + 5) < 0.45;
      const tall = 0.96 + hash(k + 3) * 0.08;
      guestSeats.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(t.x + Math.cos(a) * (1.68 - GUEST_OFFSET), 0, t.z + Math.sin(a) * (1.68 - GUEST_OFFSET)),
          q.clone(),
          new THREE.Vector3(tall, tall, tall),
        ),
        outfit: female ? OUTFITS[3 + Math.floor(hash(k + 11) * 4)] : OUTFITS[Math.floor(hash(k + 11) * 4)],
        female,
        variant: Math.floor(hash(k + 17) * GUEST_POSES.length),
      });
    }
  });
  // 인스턴스 위치를 다 넣은 뒤 경계 구를 다시 잡는다(안 하면 원점 근처 작은 구로 판정돼 카메라가 원점을 안 볼 때 통째로 잘린다)
  for (const m of [tableTop, tableLeg, lamps]) m.computeBoundingSphere();
  ballroom.add(tableTop, tableLeg, lamps);

  // ── 조명(실제 광원): 트로피 역광 + 정면 키 + 양옆 림 + 정면 보조 ──
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
  const houseLight = new THREE.HemisphereLight(0xffd9a6, 0x120c08, 0);
  scene.add(houseLight);
  // 객석 조명: 천장에서 테이블 구역으로 떨어지는 따뜻한 빛 웅덩이(쇼가 시작되면 꺼진다)
  const housePools = [-1, 1].map((side) => {
    const pool = new THREE.SpotLight(0xffd2a0, 0, 46, 0.62, 0.9, 1.3);
    pool.position.set(side * 8.5, 17, 31);
    pool.target.position.set(side * 8.5, 0, 30);
    scene.add(pool, pool.target);
    return pool;
  });
  const fill = new THREE.PointLight(0xffd9a0, 0, 30, 2);
  fill.position.set(0, 5, 13);
  scene.add(back, back.target, key, key.target, fill);

  // ── 서치라이트(시각용 빛줄기): 가는 빔 6(호박) · 넓은 빛 2(차가운 백색) · 역광 2(무대 뒤에서 가장자리를 스침) ──
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
  if (POOL || LATTICE || SPOT) addBeam('pool', new THREE.Vector3(0, 21, 1.0), 0, 0xf3cf86, BRIGHTNESS.beamAlpha, 0.075);

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

  // ── 금 꽃가루: 임팩트 때 한 번, 짧게(약 2.5초 안에 다 내려온다. 자막과 겹치지 않게) ──
  const CONFETTI = compact ? 180 : 420;
  const confettiMat = track(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }));
  const confetti = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(0.09, 0.16)), confettiMat, CONFETTI);
  const bits = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), alive: false }));
  confetti.count = 0;
  confetti.frustumCulled = false; // 조각이 장면 곳곳을 날아다녀 경계 구로 판정할 수 없다
  scene.add(confetti);
  let confettiBurst = false;

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
    // 세로 화면은 시야를 넓혀 트로피와 고리가 들어오게(돌리 줌도 같은 배율로)
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
  const lookNow = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const aimTmp = new THREE.Vector3();
  const trophyAim = new THREE.Vector3(0, GLOBE_Y + 0.6, 0);
  const smoothPos = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();
  let smoothReady = false;
  let rollNow = 0;
  // TEMP(카메라 측정): 커밋 전 제거
  const traceBuf: { t: number; pos: number[]; fwd: number[]; fov: number; aspect: number }[] | null =
    process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && window.localStorage.getItem('stage-trace') === '1' ? [] : null;
  if (traceBuf) (window as unknown as { __stageTrace: unknown }).__stageTrace = traceBuf;
  // TEMP(디버그): 개발 중 장면·카메라를 창에 연결. 커밋 전 제거
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') Object.assign(window as object, { __stageDbg: { scene, camera, THREE } });
  // TEMP(슬로 모션 확인): 개발 중 localStorage['stage-slow']='0.25'면 연출 시계를 늦춘다. 커밋 전 제거
  const slowMo = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' ? Number(window.localStorage.getItem('stage-slow') ?? 1) || 1 : 1;
  // TEMP(스토리보드): 개발 중 localStorage['stage-t']='4.2'면 연출 시계를 그 시각에 멈춘다(정해진 시각의 장면을 찍는다). 커밋 전 제거
  const freezeRaw = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' ? window.localStorage.getItem('stage-t') : null;
  const freezeT = freezeRaw === null ? null : Number(freezeRaw);
  const audienceAim = new THREE.Vector3(0, 0.3, 26);

  /** 시각 t의 카메라 자리(키프레임). 돌리 줌 구간에는 fov도 정한다 */
  function cameraAt(t: number, out: THREE.Vector3, look: THREE.Vector3): number {
    const tl = timeline;
    const fovAt = (f: number) => f * fovScale;
    if (SPOT && !launch) {
      // 오프닝 카메라(결정 2). 짧은 연출·시안 fixed는 처음부터 최종 자리. 접근은 4.4초에 멈춘다(글자는 그 뒤)
      rollNow = 0;
      const k = intro === 'full' && CAM_MODE !== 'fixed' ? smootherstep((t - 0.6) / 3.8) : 1;
      if (CAM_MODE === 'descend') {
        out.set(0, 7.4, 21.3).lerp(CAM_JUDGE, k);
        look.set(0, 7.0, 0).lerp(LOOK_JUDGE, k);
      } else {
        out.set(0, 4.95, 21.2).lerp(CAM_JUDGE, k);
        look.copy(LOOK_JUDGE);
      }
      return fovAt(FOV_WIDE);
    }
    if (intro === 'short' && tl !== STAGE_TIMELINES.none) {
      const k = easeInOutCubic(t / (tl.call + 1.2));
      out.lerpVectors(CAM_SHORT, CAM_JUDGE, k);
      look.lerpVectors(LOOK_STAIRS, LOOK_JUDGE, k);
      return fovAt(FOV_WIDE);
    }
    if (t < ENTRY_SPEC.times.stop) {
      // 입장: 승인된 카메라 사양(경로·속도·시선)을 정지 시각까지 그대로 따른다. 기울임(롤)은 0(조사 규칙: 롤은 0).
      // 예전에는 임팩트 시각에서 끊고 정착 자리로 건너뛰어, 남은 거리(약 10m)를 감쇠가 0.5초 만에 따라잡았다(11-27 "마지막에 갑자기 빨라짐", 초속 20m)
      const e = ENTRY.at(t);
      out.set(e.pos[0], e.pos[1], e.pos[2]);
      look.set(e.look[0], e.look[1], e.look[2]);
      rollNow = 0;
      // 걷는 구간: 스테디캠처럼 아주 느린 흔들림(서로 다른 주기의 사인을 섞어 기계적으로 반복되지 않게)
      const walkW = LATTICE || SPOT ? 0 : e.walk; // 격자 컨셉은 틈을 빠져나가므로 흔들지 않는다
      out.x += (Math.sin(t * 0.83) * 0.6 + Math.sin(t * 1.37 + 1.1) * 0.4) * 0.035 * walkW;
      out.y += (Math.sin(t * 1.21 + 2.3) * 0.6 + Math.sin(t * 0.57) * 0.4) * 0.018 * walkW;
      // 시야: 비행은 넓게 → 걷기 → 무대 앞에 멈춘 뒤 임팩트까지 천천히 좁혀 들어가며 긴장을 모은다(임팩트의 돌리 줌이 다시 펼친다)
      // 스포트 컨셉은 시야를 바꾸지 않는다(다가가며 줌까지 겹치면 확대가 두 번으로 느껴진다)
      if (SPOT) return fovAt(FOV_WIDE);
      return fovAt(THREE.MathUtils.lerp(FLIGHT_FOV, FOV_WIDE, smooth(ENTRY_SPEC.times.peak, ENTRY_SPEC.times.stop - 1, t)));
    }
    rollNow = 0;
    // 정착한 뒤에는 끝까지 그 자리(임팩트·조명·제목·호명은 고정된 화면 위에서). 예전의 좁히기 → 돌리 줌 → 밀기 → 상승은
    // 확대·축소·확대와 두 번의 동작이 반복돼 촌스러웠다(11-26). 시야는 한 방향으로만 좁힌다(40 → 34)
    const done = ENTRY.at(ENTRY_SPEC.times.stop);
    out.set(done.pos[0], done.pos[1], done.pos[2]);
    look.set(done.look[0], done.look[1], done.look[2]);
    return fovAt(FOV_WIDE);
  }

  /** 통로: 카메라 앞 22m→8m에서 서서히 켜진다. 밝기 상한은 BRIGHTNESS.corridor. 문은 gateOpenAt부터 1.6초에 걸쳐 바깥쪽으로 */
  function layoutCorridor(t: number) {
    if (!CORRIDOR) return;
    const camZ = camera.position.z;
    const open = easeInOutCubic((t - gateOpenAt) / 1.6);
    for (const c of corridorTiles) {
      const ahead = camZ - c.mesh.position.z;
      c.lit = Math.max(c.lit, smooth(22, 8, ahead));
      if (t >= 90) c.lit = 1;
      let level = c.lit * BRIGHTNESS.corridor;
      if (c.gate >= 0) {
        const dir = c.gate < 2 ? -1 : 1;
        const far = c.gate === 0 || c.gate === 3 ? 1 : 0.7;
        c.mesh.position.x = c.home.x + dir * open * (4.2 + far * 2);
        c.mesh.rotation.y = -dir * open * 0.9;
        c.mat.opacity = 1 - open;
        c.mesh.visible = open < 0.999;
        level = Math.max(level, BRIGHTNESS.corridor * smooth(0, 1, (t - gateOpenAt + 2.5) / 1.5));
      }
      c.mat.color.setRGB(level, level * 0.96, level * 0.9);
      if (!c.mat.map) c.mat.color.multiplyScalar(0.15);
    }
  }

  function layoutWall(dt: number, hovered: number, t: number) {
    const tl = timeline;
    // 제목 구간에서 한 번, 호명 구간에서 한 번 더 누른다(한 시점에 주인공 하나)
    const duck = 1 - 0.45 * easeInOutCubic((t - tl.title) / 0.8) - 0.35 * easeInOutCubic((t - tl.call + 1.6) / 1.6);
    for (let i = 0; i < wallTiles.length; i++) {
      const w = wallTiles[i];
      const centerDist = Math.abs(w.col - (wallCols - 1) / 2);
      const on = ramp(t, tl.wall + centerDist * 0.07 + w.row * 0.05, 0.7);
      const breath = 0.5 + 0.5 * Math.sin(t * 0.8 - w.col * 0.42 + w.row * 0.3);
      const level = on * BRIGHTNESS.wallMax * (0.55 + 0.45 * breath) * duck;
      w.pop += ((i === hovered ? 1 : 0) - w.pop) * Math.min(1, dt * 10);
      const lit = level + (1 - level) * w.pop;
      // 약한 탈채도 느낌: 따뜻한 회색 쪽으로 살짝 기운 배율
      w.mat.color.setRGB(lit, lit * 0.96, lit * 0.9);
      if (!w.mat.map) w.mat.color.multiplyScalar(0.15);
      w.mesh.scale.setScalar(1 + w.pop * 0.45);
      w.mesh.position.copy(w.home).multiplyScalar(1 - w.pop * 0.06);
    }
  }

  /** 오프닝 조명 큐(스포트 컨셉, 결정 1 '켜는 순서'). 위 핀·위 조명·역광·림·키·보조·단 금선·환경 반사를 큐 표대로 켠다.
   *  ramp는 p²라 어둠에서 툭 켜지지 않는다. 짧은 연출은 핀(0) → 나머지 일괄(0.5) */
  function applySpotCues(t: number) {
    const tl = timeline;
    const B = BRIGHTNESS;
    const poolDecay = 1 - 0.45 * ramp(t, tl.impact + 0.8, 1.5);
    let pin: number, pool: number, back2: number, rim: number, keyK: number, fillK: number, edgeK: number, envB: number, envI: number;
    let lift = 0;
    if (intro !== 'full') {
      const rest = ramp(t, tl.spread, 0.6);
      pin = ramp(t, tl.spot, 0.4) * (1 - ramp(t, tl.spread, 0.6));
      pool = rest * poolDecay;
      back2 = rim = keyK = fillK = edgeK = envI = rest;
      envB = ramp(t, tl.spot, 0.5);
    } else if (ORDER === 'bottom') {
      edgeK = ramp(t, 0.6, 1.0);
      lift = ramp(t, 1.6, 0.6) * (1 - ramp(t, 3.6, 0.8));
      liftSpot.target.position.y = THREE.MathUtils.lerp(1.9, 7.2, smootherstep((t - 1.6) / 1.8));
      rim = ramp(t, 3.0, 1.0);
      back2 = ramp(t, 3.0, 1.2);
      pin = ramp(t, 3.5, 0.8) * (1 - ramp(t, tl.impact + 0.3, 1.2));
      pool = ramp(t, 3.7, 0.9) * poolDecay;
      keyK = ramp(t, 3.5, 0.9);
      fillK = envI = ramp(t, 3.7, 0.7);
      envB = ramp(t, 0.6, 1.2);
    } else if (ORDER === 'sil') {
      back2 = 0.3 * ramp(t, 0.6, 1.4) + 0.7 * ramp(t, 3.0, 1.0);
      rim = 0.25 * ramp(t, 0.8, 1.4) + 0.75 * ramp(t, 3.0, 1.0);
      pin = ramp(t, 2.2, 0.9) * (1 - ramp(t, 3.4, 1.2));
      pool = ramp(t, 3.0, 1.0) * poolDecay;
      keyK = ramp(t, 3.0, 1.0);
      fillK = edgeK = envI = ramp(t, 3.5, 0.9);
      envB = ramp(t, 2.2, 1.2);
    } else {
      // 꼭대기부터(추천): 꿀붕이 핀 → 위 조명이 넓어져 컵·기둥 → 윤곽 → 정면 → 단 금선
      pin = ramp(t, tl.spot, 0.9) * (1 - ramp(t, tl.spread + 0.6, 1.4));
      pool = ramp(t, tl.spread, 1.2) * poolDecay;
      back2 = 0.35 * ramp(t, tl.spread, 1.2) + 0.65 * ramp(t, tl.spread + 1.3, 0.9);
      rim = ramp(t, tl.spread + 0.6, 1.0);
      keyK = ramp(t, tl.spread + 1.0, 1.0);
      fillK = edgeK = envI = ramp(t, tl.spread + 1.3, 0.9);
      envB = ramp(t, tl.spot, 1.2);
    }
    pinSpot.intensity = B.poolSpot * pin;
    poolSpot.intensity = B.poolSpot * pool;
    liftSpot.intensity = 0.6 * B.key * lift;
    back.intensity = B.back * back2;
    for (const r of rims) r.intensity = B.rimSide * rim;
    key.intensity = B.key * keyK;
    fill.intensity = B.fill * fillK;
    edgeMat.color.copy(edgeOn).multiplyScalar(B.edge * edgeK);
    scene.environmentIntensity = B.envBase * envB + B.envImpact * envI;
  }

  function applyLights(t: number) {
    const tl = timeline;
    const impactK = ramp(t, tl.impact, 0.3);
    // 빛이 번지는 정도: 스포트 컨셉은 1.4초에 걸쳐 천천히(켜짐이 곧 등장), 이전 컨셉은 임팩트와 함께 0.3초
    const spreadK = ramp(t, tl.spread, SPOT ? 1.4 : 0.3);
    // 역광 림: 이전 컨셉은 처음부터, 스포트 컨셉은 스포트가 열린 뒤 아주 천천히(p²) 차오른다(첫 순간은 완전한 어둠)
    back.intensity = BRIGHTNESS.back * ramp(t, SPOT ? tl.spot + 0.4 : -0.2, 1.8);
    key.intensity = BRIGHTNESS.key * spreadK;
    for (const r of rims) r.intensity = BRIGHTNESS.rimSide * spreadK;
    fill.intensity = BRIGHTNESS.fill * spreadK;
    // 객석 조명: 처음엔 켜져 있다가(쇼 전 볼룸) 암전 큐에 꺼진다. 쇼가 끝난 뒤에도 아주 약하게만 남는다
    const houseOn = 1 - easeInOutCubic((t - tl.house) / 1.2);
    const houseUp = tl.house < 0 ? 0.25 : Math.max(houseOn * ramp(t, -0.3, 0.8), 0.25 * ramp(t, tl.impact, 1));
    houseLight.intensity = BRIGHTNESS.house * houseUp;
    for (const pool of housePools) pool.intensity = BRIGHTNESS.housePool * (tl.house < 0 ? 0 : houseOn * ramp(t, -0.3, 0.8));
    scene.environmentIntensity = SPOT
      ? BRIGHTNESS.envBase * ramp(t, tl.spot, 1.2) + BRIGHTNESS.envImpact * spreadK
      : LATTICE
      ? BRIGHTNESS.envBase * ramp(t, 0, 1.5) + BRIGHTNESS.envImpact * impactK
      : 0.02 + 0.3 * impactK;
    // 위에서 떨어지는 단 하나의 빛(웅덩이·격자 컨셉). 임팩트 뒤 다른 빛들이 켜지면 한 걸음 물러난다
    poolSpot.intensity = POOL || LATTICE || SPOT ? BRIGHTNESS.poolSpot * ramp(t, tl.spot, 0.9) * (1 - 0.45 * ramp(t, tl.impact + 0.8, 1.5)) : 0;
    if (LATTICE) {
      // 격자 안의 빛: 처음부터 은은히(안쪽 면이 보이게) → 임팩트에 심이 켜지며 밝아졌다가 조금 가라앉는다
      const coreK = ramp(t, tl.impact - 0.15, 0.35);
      innerLight.intensity = BRIGHTNESS.inner * (ramp(t, 0.1, 1.4) + 1.5 * coreK);
      (coreGlowMat.uniforms.level as { value: number }).value = BRIGHTNESS.core * coreK * (1 - 0.25 * ramp(t, tl.impact + 0.6, 1.6));
      coreGlow.scale.setScalar(0.2 + 0.8 * easeOutCubic((t - tl.impact + 0.15) / 0.6));
    }

    if (SPOT) applySpotCues(t);

    for (let pi = 0; pi < pillars.length; pi++) {
      const p = pillars[pi];
      // 스포트 컨셉: 안쪽(i가 작은 쌍)부터 0.12초 간격
      const on = ramp(t, tl.pillars + (SPOT ? Math.floor(pi / 2) * 0.12 : p.cue), 0.35);
      p.mat.color.copy(pillarOn).multiplyScalar(BRIGHTNESS.pillar * on * (0.8 + 0.2 * Math.sin(t * 0.6 + p.phase)));
    }
    if (!SPOT) edgeMat.color.copy(edgeOn).multiplyScalar(BRIGHTNESS.edge * spreadK);
    // 링(결정 3): 스포트 컨셉의 confetti·ring은 0.5초에 걸쳐 차오르고, full은 예전처럼 0.3초
    haloMat.color
      .copy(haloOn)
      .multiplyScalar(BRIGHTNESS.halo * (RING === 'beads' ? 1 : 0.85) * (SPOT ? ramp(t, tl.impact, 0.12) : ramp(t, tl.impact + 0.08, 0.3)));
    // 스포트 컨셉: 링이 왼쪽 끝부터 그려진다(구슬은 그 자리에 선이 닿을 때 켜진다)
    ringReveal.value = SPOT ? easeInOutCubic((t - tl.impact) / RING_DRAW) : 1;
    for (const child of halo.children) {
      // 구슬(지금 모양)과 아치 끝 장식만 선이 닿을 때 켠다. 다른 모양에서 숨긴 구슬은 건드리지 않는다
      if (child.userData.reveal !== undefined && (RING === 'beads' || child.userData.finial)) child.visible = child.userData.reveal <= ringReveal.value + 0.001;
    }
    lampMat.color.setRGB(0.95, 0.62, 0.25).multiplyScalar(BRIGHTNESS.lamp * ramp(t, -0.4, 1.2));
    // 샹들리에: 쇼 전에는 볼룸 조명으로 반짝이고, 암전 때 낮아졌다가 임팩트 뒤 다시 은은하게
    const chandelierLevel = tl.house < 0 ? ramp(t, tl.pillars + 0.4, 1.2) : Math.max(houseOn * ramp(t, -0.3, 0.8), 0.7 * ramp(t, tl.impact + 0.5, 1.2));
    (crystalMat.uniforms.level as { value: number }).value = BRIGHTNESS.chandelier * chandelierLevel;
    coreMat.color.setRGB(0.95, 0.66, 0.34).multiplyScalar(0.5 * chandelierLevel);
    for (const l of chandelierLamps) l.emissiveIntensity = 1.6 * chandelierLevel;
    (crystalMat.uniforms.time as { value: number }).value = t;
    const titleDuck = 1 - 0.4 * easeInOutCubic((t - tl.title) / 0.8);
    dustMat.opacity = 0.55 * ramp(t, tl.open, 1.5) * titleDuck;
    for (const m of hazeMats) {
      (m.uniforms.time as { value: number }).value = t;
      (m.uniforms.level as { value: number }).value = BRIGHTNESS.hazeAlpha * ramp(t, tl.open, 1.5);
    }

    // 충격파: 임팩트 순간 바닥에서 퍼져 나가며 사라진다
    const sk = clamp01((t - tl.impact) / 1.3);
    shock.scale.setScalar(1 + easeOutCubic(sk) * 13);
    shockMat.opacity = t < tl.impact || (SPOT && IMPACT_MODE !== 'full') ? 0 : 0.5 * (1 - sk);

    // 서치라이트: 열림부터 훑고 → 정지에서 트로피로 모이고 → 호명에서 넓은 빛이 객석(관객) 쪽으로
    const holdK = easeInOutCubic((t - tl.hold) / 0.6);
    const callK = easeInOutCubic((t - tl.call) / 1.5);
    const titleBeam = 1 - 0.4 * easeInOutCubic((t - tl.title) / 0.8);
    for (const b of beams) {
      let on = 0;
      if (SPOT) {
        // 스포트 컨셉: 처음부터 트로피로 모인 채 가운데부터 0.12초 간격(무작위 점등 대신), 워시·역광 빔은 0.4초 뒤, 위 빔은 위 조명을 따른다
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
      } else if (b.kind === 'narrow') {
        on = ramp(t, tl.open + hash(b.seed * 10) * 0.5, 0.25) * titleBeam;
        aimTmp.set(Math.sin(t * 0.45 + b.seed) * 13, 1 + Math.abs(Math.sin(t * 0.3 + b.seed * 2)) * 4, Math.cos(t * 0.38 + b.seed) * 9 + 6);
        b.aim.lerpVectors(aimTmp, trophyAim, holdK * 0.85);
      } else if (b.kind === 'wash') {
        on = ramp(t, tl.open, 0.8);
        aimTmp.set(b.seed * 2.5 + Math.sin(t * 0.2 + b.seed) * 2, STAGE_TOP, 2 + Math.cos(t * 0.17) * 2);
        b.aim.lerpVectors(aimTmp, audienceAim, callK);
      } else if (b.kind === 'pool') {
        // 처음 떨어지는 단 하나의 빛. 임팩트 뒤 다른 빛들이 켜지면 한 걸음 물러난다
        on = ramp(t, tl.spot, 0.9) * (1 - 0.5 * ramp(t, tl.impact + 0.8, 1.5));
        b.aim.set(0, STAGE_TOP, 0);
      } else {
        on = ramp(t, tl.hold, 0.6);
        b.aim.set(Math.sign(b.seed) * (10 + Math.sin(t * 0.25) * 1.5), 7, 22);
      }
      aimBeam(b.mesh, b.origin, b.aim, tmp, b.widen);
      (b.mat.uniforms.strength as { value: number }).value = on;
      (b.mat.uniforms.time as { value: number }).value = t;
    }
  }

  /** 꽃가루가 터지는 시각: 스포트 컨셉은 제목과 함께(위에서 화면에 들어오는 데 걸리는 만큼 0.3초 먼저), 이전 컨셉은 임팩트 직후 */
  const confettiAt = () => (SPOT ? timeline.title - 0.3 : timeline.impact + 0.14);

  function updateConfetti(dt: number, t: number) {
    if (SPOT && IMPACT_MODE === 'ring') return; // 링만(결정 3)
    // TEMP(스토리보드): 시계를 멈춘 화면이면 꽃가루를 그 시각의 위치로 계산해 그린다(물리 적분은 실제 시간으로 흘러 다 떨어진다)
    if (freezeT !== null) {
      const tau = t - confettiAt();
      let n = 0;
      if (tau > 0) {
        bits.forEach((b, i) => {
          b.p.set((hash(i * 3 + 1) - 0.5) * 16, 9 + hash(i * 3 + 2) * 5, (hash(i * 3 + 3) - 0.5) * 12 + 2);
          const vy = -(3.4 + hash(i * 7 + 5) * 2);
          b.p.x += (hash(i * 7 + 1) - 0.5) * 1.2 * tau;
          b.p.z += (hash(i * 7 + 2) - 0.5) * 1.2 * tau;
          b.p.y += vy * tau + 0.3 * tau * tau;
          if (b.p.y < 0) return;
          b.rot.set(hash(i * 11) * 6 + tau * 3, hash(i * 13) * 6 + tau * 2, hash(i * 17) * 6);
          m4.compose(b.p, q.setFromEuler(b.rot), sc.set(1, 1, 1));
          confetti.setMatrixAt(n++, m4);
        });
      }
      confetti.count = n;
      confetti.instanceMatrix.needsUpdate = true;
      return;
    }
    if (!confettiBurst && t >= confettiAt()) {
      confettiBurst = true;
      for (const b of bits) {
        b.p.set((Math.random() - 0.5) * 16, 9 + Math.random() * 5, (Math.random() - 0.5) * 12 + 2);
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
      m4.compose(b.p, q.setFromEuler(b.rot), sc.set(1, 1, 1));
      confetti.setMatrixAt(n++, m4);
    }
    confetti.count = n;
    confetti.instanceMatrix.needsUpdate = true;
  }

  function placeCamera(t: number, dt: number) {
    const fov = cameraAt(t, camPos, lookPos);
    const settled = t > timeline.call + 2.0;
    // 대기: 트로피 둘레 느린 호(±3°, 40초) + 마우스 시차. 연출 중에는 시차를 작게
    const idle = smooth(timeline.call + 1.5, timeline.call + 4.5, t); // 정지 뒤 대기 호는 속도 0에서 천천히 붙는다
    const yaw = Math.sin((t * Math.PI * 2) / 40) * THREE.MathUtils.degToRad(3) * idle;
    // Y축으로 돌린다. 예전에는 x를 sin(yaw)·z로 덮어써서 입장 경로의 좌우 호가 사라지고 정중앙으로만 내려왔다(11-26)
    const bx = camPos.x;
    const bz = camPos.z;
    // 격자 컨셉: 틈을 빠져나가는 동안에는 마우스 시차를 끈다(금 줄에 부딪히지 않게)
    // 스포트 컨셉: 연출 중에는 마우스 시차를 끄고, 버튼이 나온 뒤 1초에 걸쳐 켠다
    const parallax = LATTICE ? smooth(ENTRY_SPEC.times.peak - 1, ENTRY_SPEC.times.peak + 1, t) : SPOT ? smooth(timeline.call, timeline.call + 1, t) : 1;
    camPos.x = bx * Math.cos(yaw) + bz * Math.sin(yaw) + pointer.x * (0.25 + 0.45 * idle) * parallax;
    camPos.z = -bx * Math.sin(yaw) + bz * Math.cos(yaw);
    camPos.y += pointer.y * 0.25 * (settled ? 1 : 0.4) * parallax;
    // 임팩트 흔들림: 3~4프레임, 아주 작게
    const shakeK = t - timeline.impact;
    if (shakeK > 0 && shakeK < 0.12 && !(SPOT && IMPACT_MODE !== 'full')) {
      camPos.x += (hash(Math.floor(t * 60)) - 0.5) * 0.08;
      camPos.y += (hash(Math.floor(t * 60) + 9) - 0.5) * 0.06;
    }
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
    lookNow.copy(smoothLook);
    camera.lookAt(lookNow);
    if (rollNow !== 0 && !launch) camera.rotateZ(rollNow);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // TEMP(카메라 측정): 개발 중 localStorage['stage-trace']='1'이면 프레임마다 카메라를 기록한다. 커밋 전 제거
    if (traceBuf) {
      camera.getWorldDirection(aimTmp);
      traceBuf.push({ t, pos: camera.position.toArray(), fwd: aimTmp.toArray(), fov: camera.fov, aspect: camera.aspect });
    }
  }

  function step(now: number) {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = freezeT ?? ((now - start) / 1000) * slowMo;
    lastT = t;

    raycaster.setFromCamera(ndc, camera);
    const hit = ndc.x > 2 || launch ? null : raycaster.intersectObjects(tileMeshes, false)[0];
    const hovered = hit ? (hit.object.userData.tileIndex as number) : -1;

    applyLights(t);
    layoutWall(dt, hovered, t);
    updateConfetti(dt, t);
    placeCamera(t, dt);
    layoutCorridor(t);

    // 격자 컨셉: 카메라가 틈을 빠져나가는 동안 돌지 않는다(임팩트 뒤부터 천천히)
    // 스포트 컨셉: 연출 중에는 돌지 않고(빛이 움직인다) 버튼 뒤 0에서 천천히 붙는다
    trophy.rotation.y = SPOT
      ? Math.sin((t - timeline.call) * 0.22) * 0.18 * smooth(timeline.call, timeline.call + 2, t)
      : Math.sin(t * 0.22) * 0.18 * (LATTICE ? smooth(timeline.impact, timeline.impact + 3, t) : 1);
    // 금에서 솟는 트로피: 수면 아래(단상 속)에서 2.8초에 걸쳐 올라온다. 받침까지 다 잠길 만큼 깊게 시작
    trophy.position.y = trophyRestY - (timeline.rise < 0 ? 0 : (1 - smootherstep((t - timeline.rise) / 2.8)) * 7.2);
    updatePool(t);
    kkul.position.y = 3.72 + Math.sin(t * 1.4) * 0.025;
    halo.rotation.z = RING === 'arc' ? 0 : t * 0.04; // 아치는 틈이 아래에 머물러야 한다

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
    layoutWall(1, -1, t);
    placeCamera(t, 1);
    layoutCorridor(t);
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
      layoutWall(1, -1, 99);
      layoutCorridor(99);
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

  // ── 포스터·모델 읽기(다 읽거나 실패하면 연출 시계 출발) ──
  let pending = items.length + 2 + 5 + 1;
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
        for (const w of [...wallTiles, ...corridorTiles]) {
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
  // 샹들리에: 원점이 천장 고정점(아래로 약 0.8m). 4배로 키워 각 자리에 단다. 전구 재질은 볼룸 조명과 함께 켜고 끈다
  gltfLoader.load(
    `${STAGE_ASSETS}/chandelier.glb`,
    (g) => {
      trackModel(g.scene);
      g.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.name.startsWith('lamps')) {
            std.emissive = new THREE.Color(0xffc27a);
            std.emissiveIntensity = 0;
            chandelierLamps.push(std);
          }
        }
      });
      for (const c of chandeliers.children) {
        const model = g.scene.clone();
        model.scale.setScalar(4);
        c.add(model);
      }
      settled();
    },
    undefined,
    settled,
  );
  // 트로피(공통 언어 11-27, work/blender/build_lang.py 'fi' + CENTER_BODY): 3:1 비틀린 육각 기둥 위 꿀붕이, 아래 검정 받침.
  // 원점 = 받침 바닥 가운데, 높이 약 3.19m. 코드로 쌓은 임시 트로피는 숨기고 같은 그룹(흔들림·위치)에 단다. 재질은 이름으로 끼운다
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
      for (const child of trophy.children) child.visible = false;
      g.scene.scale.setScalar(TROPHY_GLB_SCALE / TROPHY_SCALE);
      trophy.add(g.scene);
      settled();
    },
    undefined,
    settled,
  );
  // 의자: 원점이 바닥. 금빛이 살짝 도는 색을 곱해 연회 의자처럼
  gltfLoader.load(
    `${STAGE_ASSETS}/chair.glb`,
    (g) => {
      trackModel(g.scene);
      let src: THREE.Mesh | null = null;
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
      });
      if (src) {
        const mesh: THREE.Mesh = src;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.setHex(0xc4a46a);
        disposables.push(mat);
        const chairs = new THREE.InstancedMesh(mesh.geometry, mat, chairMats.length);
        const tmpM = new THREE.Matrix4();
        chairMats.forEach((cm, i) => chairs.setMatrixAt(i, tmpM.multiplyMatrices(cm, mesh.matrixWorld)));
        chairs.computeBoundingSphere();
        ballroom.add(chairs);
        instancedExtra.push(chairs);
      }
      settled();
    },
    undefined,
    settled,
  );

  // 하객: 캐릭터 2종 + 머리카락 2종 + 앉기 동작을 다 읽으면 자세를 굳혀 놓는다
  const guestParts: Partial<Record<'male' | 'female' | 'hairMale' | 'hairFemale' | 'anims', THREE.Group | THREE.AnimationClip[]>> = {};
  const onGuestPart = (key: keyof typeof guestParts) => (g: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => {
    guestParts[key] = key === 'anims' ? g.animations : g.scene;
    if (Object.keys(guestParts).length === 5) {
      try {
        buildGuests();
      } catch {
        // 하객을 못 만들어도 무대는 그대로 진행한다
      }
    }
    settled();
  };
  for (const [key, file] of [
    ['male', 'guest-male'],
    ['female', 'guest-female'],
    ['hairMale', 'hair-male'],
    ['hairFemale', 'hair-female'],
    ['anims', 'sit-anims'],
  ] as const) {
    gltfLoader.load(`${STAGE_ASSETS}/${file}.glb`, onGuestPart(key), undefined, settled);
  }

  /** 캐릭터를 앉기 동작의 한 순간으로 굳혀 [옷, 피부] 정적 지오메트리(모델 원점 기준)로 만든다. 머리카락은 머리 뼈를 따라 옮겨 피부 쪽에 합친다 */
  function bakeGuest(src: THREE.Group, hair: THREE.Group, clip: THREE.AnimationClip, time: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
    const root = cloneSkinned(src) as THREE.Group;
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    mixer.setTime(time);
    root.updateMatrixWorld(true);
    const cloth: THREE.BufferGeometry[] = [];
    const skinParts: THREE.BufferGeometry[] = [];
    let headBone: THREE.Bone | null = null;
    let headBindInv: THREE.Matrix4 | null = null;
    const v = new THREE.Vector3();
    root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      const count = geo.attributes.position.count;
      const posed = new Float32Array(count * 3);
      const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
      if (skinned) mesh.skeleton.update();
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, v); // 스킨(뼈) 변형까지 반영한 메시 좌표
        v.applyMatrix4(mesh.matrixWorld);
        posed.set([v.x, v.y, v.z], i * 3);
      }
      // 삼각형마다 옷/피부를 가른다: 꼭짓점들의 가장 무거운 뼈 이름이 피부 뼈면 피부
      const skinVertex = new Uint8Array(count);
      if (skinned) {
        const si = geo.attributes.skinIndex;
        const sw = geo.attributes.skinWeight;
        for (let i = 0; i < count; i++) {
          let best = 0;
          let bestW = -1;
          for (let c = 0; c < 4; c++) {
            const w = sw.getComponent(i, c);
            if (w > bestW) {
              bestW = w;
              best = si.getComponent(i, c);
            }
          }
          skinVertex[i] = SKIN_BONES.test(mesh.skeleton.bones[best]?.name ?? '') ? 1 : 0;
        }
        if (!headBone) {
          const idx = mesh.skeleton.bones.findIndex((b) => /^head$/i.test(b.name) || /head/i.test(b.name));
          if (idx >= 0) {
            headBone = mesh.skeleton.bones[idx];
            headBindInv = mesh.skeleton.boneInverses[idx].clone();
          }
        }
      } else {
        skinVertex.fill(1); // 눈·눈썹 같은 따로 된 메시는 피부 쪽
      }
      const index = geo.index ? (geo.index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i);
      const clothIdx: number[] = [];
      const skinIdx: number[] = [];
      for (let f = 0; f < index.length; f += 3) {
        const a = index[f];
        const b = index[f + 1];
        const c = index[f + 2];
        (skinVertex[a] + skinVertex[b] + skinVertex[c] >= 2 ? skinIdx : clothIdx).push(a, b, c);
      }
      for (const [idx, out] of [
        [clothIdx, cloth],
        [skinIdx, skinParts],
      ] as const) {
        if (idx.length === 0) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(posed.slice(), 3));
        g.setIndex(idx);
        out.push(g);
      }
    });
    // 머리카락: T자 자세(바인드) 기준으로 놓인 정적 메시를 머리 뼈가 움직인 만큼 옮긴다
    if (headBone && headBindInv) {
      const delta = new THREE.Matrix4().multiplyMatrices((headBone as THREE.Bone).matrixWorld, headBindInv);
      hair.updateMatrixWorld(true);
      hair.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // 압축(양자화)된 정수 좌표를 실수로 풀어 둔다(몸통과 합칠 때 배열 형식이 같아야 한다)
        const src = mesh.geometry.attributes.position;
        const floats = new Float32Array(src.count * 3);
        for (let i = 0; i < src.count; i++) floats.set([src.getX(i), src.getY(i), src.getZ(i)], i * 3);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(floats, 3));
        if (mesh.geometry.index) g.setIndex(Array.from(mesh.geometry.index.array as ArrayLike<number>));
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(delta, mesh.matrixWorld));
        skinParts.push(g);
      });
    }
    mixer.stopAllAction();
    const join = (list: THREE.BufferGeometry[]) => {
      const merged = mergeGeometries(list.map((g) => g.toNonIndexed()), false) ?? new THREE.BufferGeometry();
      merged.computeVertexNormals();
      for (const g of list) g.dispose();
      return merged;
    };
    return [join(cloth), join(skinParts)];
  }

  function buildGuests() {
    const anims = guestParts.anims as THREE.AnimationClip[];
    const clip = (name: string) => anims.find((c) => c.name === name) ?? anims[0];
    const clothMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 }));
    const skinMat = track(new THREE.MeshStandardMaterial({ color: 0x6a4a36, roughness: 0.65 }));
    const outfitColor = new THREE.Color();
    for (const female of [false, true]) {
      const src = (female ? guestParts.female : guestParts.male) as THREE.Group;
      const hair = (female ? guestParts.hairFemale : guestParts.hairMale) as THREE.Group;
      GUEST_POSES.forEach(([name, time], variant) => {
        const seats = guestSeats.filter((g) => g.female === female && g.variant === variant);
        if (seats.length === 0) return;
        const [clothGeo, skinGeo] = bakeGuest(src, hair, clip(name), time);
        disposables.push(clothGeo, skinGeo);
        const clothes = new THREE.InstancedMesh(clothGeo, clothMat, seats.length);
        const skins = new THREE.InstancedMesh(skinGeo, skinMat, seats.length);
        seats.forEach((g, i) => {
          clothes.setMatrixAt(i, g.matrix);
          skins.setMatrixAt(i, g.matrix);
          clothes.setColorAt(i, outfitColor.setHex(g.outfit));
        });
        for (const m of [clothes, skins]) {
          m.computeBoundingSphere();
          ballroom.add(m);
          instancedExtra.push(m);
        }
      });
    }
  }

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
      for (const m of [tableTop, tableLeg, lamps, confetti, ...instancedExtra]) m.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}

/** 꿀붕이 금속 메달: KkulMark 경로를 압출(두께 + 둥근 베벨)하고, 배는 한 단 낮은 무광 금, 눈·코는 박아 넣은 짙은 금, 볼은 무광 금.
 *  32px 격자(y 아래로)를 세계 단위로 옮기며 y를 뒤집고 가운데로 맞춘다. 앞면이 +z */
function buildKkulMedal(
  track: <T extends { dispose(): void }>(x: T) => T,
  gold: THREE.Material,
  goldSoft: THREE.Material,
  goldDeep: THREE.Material,
): THREE.Group {
  const loader = new SVGLoader();
  const shapesOf = (d: string) => loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`).paths.flatMap((p) => SVGLoader.createShapes(p));
  const S = 0.034; // 32px → 약 1.1 단위 폭
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.set(S, -S, S);
  inner.position.set(-16 * S, 17.5 * S, 0);
  group.add(inner);

  const extrude = (d: string, depth: number, bevel: number, mat: THREE.Material, z: number) => {
    const geo = track(
      new THREE.ExtrudeGeometry(shapesOf(d), {
        depth,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel * 0.8,
        bevelSegments: 8,
        curveSegments: 40,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = z;
    inner.add(mesh);
    return mesh;
  };
  // 몸통: 두툼하게(앞뒤로 둥근 베벨)
  extrude(KKUL_BODY, 6, 3.2, gold, -3);
  extrude(KKUL_EAR, 2.4, 0.9, gold, -1.2);
  // 배: 앞면에서 살짝 솟은 무광 금
  extrude(KKUL_BELLY, 0.5, 0.35, goldSoft, 6.2);
  // 눈·코: 짙은 금 알
  const eyeGeo = track(new THREE.SphereGeometry(1.45, 20, 14));
  for (const [x, y] of [
    [9.7, 17.4],
    [22.3, 17.4],
  ]) {
    const eye = new THREE.Mesh(eyeGeo, goldDeep);
    eye.position.set(x, y, 5.6);
    eye.scale.set(1, 1, 0.5);
    inner.add(eye);
  }
  const nose = new THREE.Mesh(track(new THREE.SphereGeometry(1, 16, 12)), goldDeep);
  nose.position.set(16, 18.9, 6.2);
  nose.scale.set(1.15, 0.75, 0.4);
  inner.add(nose);
  // 볼: 양옆 무광 금 타원
  const cheekGeo = track(new THREE.SphereGeometry(1, 20, 14));
  for (const x of [6.9, 25.1]) {
    const cheek = new THREE.Mesh(cheekGeo, goldSoft);
    cheek.position.set(x, 20.3, 5.4);
    cheek.scale.set(2.7, 2.3, 0.6);
    inner.add(cheek);
  }
  return group;
}

/** 연회 테이블보: 윗면(반지름 1.1, 높이 0.78)에서 바닥까지 내려오는 치마. 아래로 갈수록 바깥으로 퍼지고 주름이 깊어진다 */
function tableClothGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0, 0.78),
    new THREE.Vector2(1.08, 0.78),
    new THREE.Vector2(1.12, 0.765),
    new THREE.Vector2(1.14, 0.72),
    new THREE.Vector2(1.17, 0.4),
    new THREE.Vector2(1.2, 0.08),
    new THREE.Vector2(1.22, 0),
  ];
  const geo = new THREE.LatheGeometry(profile, 96);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const depth = THREE.MathUtils.clamp((0.74 - v.y) / 0.74, 0, 1); // 윗면은 그대로, 아래일수록 주름
    if (depth > 0) {
      const ang = Math.atan2(v.z, v.x);
      const fold = 1 + (Math.sin(ang * 14) * 0.022 + Math.sin(ang * 23 + 1.3) * 0.01) * depth;
      v.x *= fold;
      v.z *= fold;
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
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

/** 안개 막: 아주 낮은 알파의 흐르는 잡음. 위·아래·옆 끝은 사라진다 */
/** 지구본 속 빛 구슬: 가운데(시선과 마주한 면)가 밝고 가장자리로 갈수록 스며 사라진다(더하기 합성). 단색 구는 납작한 원판처럼 보였다 */
function coreMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { level: { value: 0 }, color: { value: new THREE.Color(1, 0.72, 0.36) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float level;
      uniform vec3 color;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.0);
        gl_FragColor = vec4(color * level * f, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
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

/** 샹들리에 크리스털: 점마다 불규칙한 주기로 아주 작게 반짝인다(섬광·줄무늬 기준을 넘지 않게 진폭이 작다) */
function sparkleMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { level: { value: 0 }, time: { value: 0 }, map: { value: map }, color: { value: new THREE.Color(0xfff1cf) } },
    vertexShader: /* glsl */ `
      attribute float phase;
      attribute float rate;
      uniform float time;
      varying float vTw;
      void main() {
        vTw = 0.7 + 0.3 * sin(time * rate + phase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 6.0 * (12.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float level;
      uniform sampler2D map;
      uniform vec3 color;
      varying float vTw;
      void main() {
        float a = texture2D(map, gl_PointCoord).a;
        gl_FragColor = vec4(color, a * level * vTw * 0.6);
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
