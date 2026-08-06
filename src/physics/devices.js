// 기본 장치(§5.1)의 힘 모델 — 좌현 노 · 우현 노 · 닻, 그리고 아이템으로 강등된 키.
//
// hydro.js 와 같은 구조로 **순수 계산 함수 + 얇은 planck 적용부**로 나눈다. 순수 함수를
// 따로 두는 이유는 예측 궤적선(predict.js)이 같은 식을 그대로 호출해야 예측과 실제가
// 일치하기 때문이다.
//
// 조향 시스템 코드는 여기에도 없다. 노는 **선체 로컬의 한 점에 힘을 주는 것**이 전부이고,
// 선회는 τ = r × F 에서 저절로 나온다 (§4.1). D1 의 단일 노는 비대칭 선체에서만 팔길이를
// 얻었지만, 좌우로 나뉜 노는 **대칭 선체에서도** 한쪽만 저으면 팔길이를 얻는다 — 조향이
// 장치 배치의 순수한 결과가 되고 키의 전용 양력식은 기본 장착에서 빠진다.
import { Vec2, RevoluteJoint } from 'planck';
import { HYDRO_TUNING } from '../hull/params.js';

export const DEVICE_TUNING = {
  // --- 노: 스트로크(한 번 젓기) 모델 ---
  //
  // 꾹 누르면 지속 추력이 나오던 D1 모델을 버리고 **누를 때마다 한 번 젓는** 방식으로 바꾼다.
  // 게임성 이유만이 아니다: 아래 oarMaxSpeed 감쇠가 지속 입력에서는 그저 종단 속도 상한으로만
  // 느껴지는데, 스트로크에서는 **최적 젓기 타이밍**이 된다 (속도가 붙었을 때 저으면 물을 헛젓고,
  // 조금 감속했을 때 저어야 온전한 추력이 나온다). 규칙을 더하지 않고 기존 항에서 리듬이 창발한다.

  /** 봉투 길이 D (s) — 입수 → 당김 → 회수 한 사이클. */
  oarStrokeDuration: 0.45,
  /**
   * 회수 쿨다운 C (s). 재입력을 막는 구간이라 최대 케이던스가 1/(D+C) 로 묶인다.
   *
   * ⚠ **연타 실험용 노브.** 0 이면 봉투가 끝나는 즉시 다시 저을 수 있어(2.22 회/s) 노가
   * 사실상 쉬지 않는다. 0.3 이면 1.33 회/s 로 "젓고 활공하기"가 강제된다.
   * 값을 바꿀 때 oarStrokePeak 도 같이 봐야 한다 — 듀티비 D/(D+C) 가 평균 추력을 정한다.
   */
  oarStrokeCooldown: 0,
  /**
   * 입력 버퍼 (s). 게이트가 열리기 이 시간 전까지의 입력은 **기억했다가 열리는 순간 발사**한다.
   *
   * 없으면 회수 중에 누른 키가 아무 반응 없이 사라져 "씹혔다"고 느껴진다. 연타의 체감은
   * 최대 케이던스보다 이쪽에 더 많이 걸려 있다 — 상한은 어차피 물리가 정하고, 플레이어가
   * 원하는 건 "누른 것이 언젠가는 반영된다"는 확신이다.
   * 창(窓)을 두는 이유는 유령 스트로크 방지다. 한참 전에 누른 것까지 기억하면 손을 뗀 뒤에도
   * 배가 혼자 한 번 더 젓는다.
   */
  oarStrokeBuffer: 0.25,
  /**
   * 노 하나의 피크 추력 (N/m², 갑판 면적당).
   *
   * 감쇠를 선형에서 `(1 − r²)²` 곡선으로 바꾸면서 250 → 400 으로 올렸다. 곡선은 종단 속도가
   * 서는 자리(r ≈ 0.8)에서 선형보다 낮아(0.123 vs 0.194) 그대로 두면 배가 느려진다.
   * 400 이면 종단이 2.91 m/s 로 선형 모델과 같고, 대신 **저·중속 가속만 살아난다** —
   * 곡선으로 바꾼 목적이 정확히 그것이다.
   *
   * 이 값을 건드리면 종단 속도가 움직이고, 종단 속도는 §6 화산대 통과 타이밍(가설 C)의
   * 전제다. 바꾼 뒤에는 반드시 `npm run bench` 로 젖은 나무배 케이스를 다시 봐야 한다.
   */
  oarStrokePeak: 800,
  /**
   * 노깃의 스트로크 속도 (m/s). 배가 이만큼 빨라지면 노깃이 더 이상 물을 뒤로 밀지 못해
   * 추력이 0 이 된다 — 프로펠러의 전진비 한계와 같은 이야기다.
   *
   * ⚠ "배의 최고 속도"가 아니다. 노만으로는 종단이 2.9 m/s 라 여기에 점근적으로만 다가간다.
   * 이 벽에 실제로 닿는 것은 부스터·돛·해류에 실려 갈 때다 (그때 노는 가속을 못 한다).
   */
  oarMaxSpeed: 6.0,
  /** 역젓기는 더 약하다. */
  oarReverseScale: 0.45,

  // --- 키 (§5.1 "유속 비례 선회력, 정지 시 무효") — D2 부터는 부착 아이템이다 ---
  /** 키 날개 면적 = 갑판 면적 × 이 비율. 큰 배엔 큰 키를 달아 형상 비교를 공정하게 만든다. */
  rudderAreaRatio: 0.06,
  /** 양력 계수. 실제 값이 아니라 게임 튜닝 노브다. */
  rudderLift: 2.4,
  /** 최대 타각 (rad, ≈34°). */
  rudderMaxAngle: 0.6,
  /** 조타 속도 (rad/s). 즉시 꺾이면 배가 아니라 자동차가 된다. */
  rudderRate: 2.0,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * ★ 입력 매핑 — 어느 키가 어느 노를 젓는가. **조작 실험은 이 표만 고치면 된다.**
 *
 * Y-up · +X = 뱃머리이므로 좌현(port)은 y > 0, 우현(starboard)은 y < 0 이다. 노 하나가 내는
 * 토크는 τ = −y·F 이므로 **우현 노를 저으면 좌선회**한다 — 카누와 같다. 그래서 ← 가 우현 노다.
 */
export const STROKE_KEYMAP = {
  ArrowUp: [{ side: 'port', dir: 1 }, { side: 'starboard', dir: 1 }],
  ArrowDown: [{ side: 'port', dir: -1 }, { side: 'starboard', dir: -1 }],
  ArrowLeft: [{ side: 'starboard', dir: 1 }],
  ArrowRight: [{ side: 'port', dir: 1 }],
};

/** 키 이름 → 스트로크 요청 배열 (없으면 null). */
export function strokesFromKey(key) {
  return STROKE_KEYMAP[key] ?? null;
}

// ───────────────────────────────────────────────────────── 스트로크 순수 함수

/**
 * 노 한 자루의 스트로크 상태.
 * `t` = 시작 후 경과(s), Infinity = 유휴. `queued` = 버퍼에 든 다음 젓기의 방향(0 = 없음).
 */
export function createStrokeState() {
  return { t: Infinity, dir: 0, queued: 0 };
}

/** 다음 스트로크를 시작할 수 있게 되는 시각 (스트로크 시작 기준, s). */
export function strokeGate() {
  return DEVICE_TUNING.oarStrokeDuration + DEVICE_TUNING.oarStrokeCooldown;
}

/**
 * ★ 노 추력 감쇠 — 진행 방향 속도 성분 `along` 에서 0..1 을 낸다.
 *
 * `(1 − r²)²` 곡선이다. 선형(1 − r)을 쓰면 감쇠가 두 군데서 어색했다:
 *  - **저·중속에서 너무 빨리 죽는다.** 2 m/s(r=0.56)에 벌써 절반 아래라 배가 붙기도 전에
 *    노가 먹통이 된다. 곡선은 같은 자리에서 0.49 → 0.56 으로 버틴다.
 *  - **상한에서 절벽이다.** 선형은 기울기 −1 로 내려오다 r=1 에서 툭 끊긴다. 곡선은 그
 *    지점의 기울기가 0 이라 "점점 헛젓다가 이윽고 안 먹는다"로 매끄럽게 붙는다.
 *
 * ⚠ **r 을 먼저 clamp 한 다음 곡선에 넣어야 한다.** 역젓기는 along < 0 이라 r < 0 인데,
 *   clamp 없이 넣으면 (1 − r²)² 이 다시 작아져 뒤로 젓는 힘이 고속에서 줄어든다.
 *   실제로는 정반대여야 한다 — 배가 빠를수록 역젓기는 물을 더 잘 잡는다.
 */
export function oarFalloff(along) {
  const r = clamp(along / DEVICE_TUNING.oarMaxSpeed, 0, 1);
  const s = 1 - r * r;
  return s * s;
}

/** 조종 상태의 기본값. 강체마다 하나씩 `hull.control` 에 산다. */
export function createControl() {
  return {
    strokes: { port: createStrokeState(), starboard: createStrokeState() },
    /** 눌려 있는 트리거 바인딩 {KeyA: true, …} — D2 아이템(부스터·키)이 읽는다. */
    held: {},
    steer: 0,
    rudder: 0,
    anchored: false,
  };
}

/**
 * 스트로크 힘 봉투 — 0..1. sin² 이라 시작과 끝이 0 이고 미분도 연속이라, 임펄스처럼
 * 한 스텝에 속도가 튀지 않는다 (그래야 predict.js 가 같은 식으로 재현할 수 있다).
 */
export function strokeEnvelope(t) {
  const D = DEVICE_TUNING.oarStrokeDuration;
  if (!(t >= 0) || t >= D) return 0;
  const s = Math.sin((Math.PI * t) / D);
  return s * s;
}

/**
 * 새 스트로크를 시작한다. 아직 젓는 중이면 **버퍼에 넣거나(게이트가 가까우면) 버린다.**
 *
 * 최대 케이던스 자체는 물리가 정한다(1/게이트). 여기서 정하는 것은 그 상한에 부딪혔을 때
 * 입력이 어떻게 느껴지는가다 — 그냥 버리면 "씹혔다"가 되고, 버퍼에 넣으면 "곧 나간다"가 된다.
 *
 * @returns {boolean} 지금 즉시 시작했는지 (버퍼에 들어간 것은 false)
 */
export function startStroke(state, dir) {
  if (!state || !dir) return false;
  const gate = strokeGate();
  // 1e-9 은 부동소수 여유 — 정확히 회수가 끝나는 순간의 입력은 받아 줘야 한다.
  // (없으면 dt 누산 오차 때문에 "최대 케이던스"가 실제로는 한 스텝 느려진다.)
  if (state.t < gate - 1e-9) {
    // 게이트가 코앞이면 기억해 둔다. 한참 전 입력까지 기억하면 손을 뗀 뒤에도
    // 배가 혼자 한 번 더 젓는 유령 스트로크가 된다.
    if (state.t >= gate - DEVICE_TUNING.oarStrokeBuffer) state.queued = Math.sign(dir);
    return false;
  }
  state.t = 0;
  state.dir = Math.sign(dir);
  state.queued = 0;
  return true;
}

/**
 * 스트로크 시계를 dt 만큼 전진하고, 게이트가 열리면 버퍼에 든 젓기를 발사한다.
 * **스텝의 맨 끝에서** 호출한다 (predict.js 와 순서 일치).
 */
export function advanceStrokes(control, dt) {
  const gate = strokeGate();
  for (const key of ['port', 'starboard']) {
    const s = control.strokes?.[key];
    if (!s) continue;
    if (Number.isFinite(s.t)) s.t += dt;
    if (s.queued && s.t >= gate - 1e-9) {
      s.t = 0;
      s.dir = s.queued;
      s.queued = 0;
    }
  }
}

/** 노가 지금 물을 젓고 있는가 (렌더·패널 표시용). */
export function strokeProgress(control, side) {
  const s = control?.strokes?.[side];
  if (!s) return 0;
  return strokeEnvelope(s.t);
}

/**
 * 진단용 — 최대 케이던스로 계속 저을 때의 종단 속도 추정치 (m/s).
 *
 * 균형식: `peak × area × mean(env) × duty × 2자루 × falloff(v) = drag.x × v²`.
 * sin² 봉투의 시간 평균이 0.5 라 노 둘의 duty 1.0 기준 좌변이 `peak × area × falloff(v)` 로
 * 깔끔하게 정리된다. falloff 가 4차라 해석해 대신 이분법으로 푼다 — UI 한 줄 값이라 충분하다.
 *
 * 튜닝 슬라이더가 이 값을 실시간으로 띄운다. 60초 몰아보지 않고도 "이 설정이면 얼마나
 * 빠른가"를 알 수 있어야 노브를 감으로 돌릴 수 있다. 실측과 1% 안쪽으로 맞는다.
 */
export function estimateOarTerminal(params) {
  if (!params?.area || !(params.drag?.x > 0)) return 0;
  const supply = (v) => DEVICE_TUNING.oarStrokePeak * params.area * oarFalloff(v);
  const demand = (v) => params.drag.x * v * v;
  let lo = 0;
  let hi = DEVICE_TUNING.oarMaxSpeed;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (supply(mid) > demand(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 목표 타각으로 서서히 이동시킨다 (조타 지연). 키 아이템을 장착했을 때만 의미가 있다.
 * @param {number} current 현재 타각 (rad)
 * @param {number} steer -1..1 (+ = 좌현)
 */
export function stepRudder(current, steer, dt) {
  const target = clamp(steer, -1, 1) * DEVICE_TUNING.rudderMaxAngle;
  const maxDelta = DEVICE_TUNING.rudderRate * dt;
  return current + clamp(target - current, -maxDelta, maxDelta);
}

// ───────────────────────────────────────────────────────────── 힘 (순수 함수)

/**
 * ★ 순수 함수 — 장치들이 만드는 로컬 좌표계 합력·합토크.
 *
 * @param {object} params computeHullParams 결과
 * @param {Array<object>} devices hull.items 중 type 을 가진 것들
 * @param {{u:number,v:number,w:number}} vel 로컬 전진·횡·각속도
 * @param {object} control createControl() 결과 (스트로크 상태 포함)
 * @returns {{fx:number, fy:number, torque:number}}
 */
export function deviceForcesLocal(params, devices, vel, control) {
  const t = DEVICE_TUNING;
  const u = vel.u;
  let fx = 0;
  let fy = 0;
  let torque = 0;

  for (const d of devices) {
    if (d.type === 'oar') {
      // 스트로크 봉투가 0 이면 이 노는 물 밖에 있다 — 힘이 정확히 0.
      const s = control.strokes?.[d.side];
      if (!s || !s.dir) continue;
      const env = strokeEnvelope(s.t);
      if (env === 0) continue;

      // 진행 방향 성분이 커질수록 추력이 죽는다. 종단 속도를 묶는 동시에,
      // 스트로크 모델에서는 "언제 젓는가"를 실력으로 만든다.
      //
      // `along` 은 **젓는 방향 기준** 속도라, 5 m/s 로 달리며 뒤로 저으면 along = −5 →
      // 감쇠 없음이 된다. 그래서 고속에서 노는 가속을 못 해도 제동과 역젓기 조향은 만력으로
      // 한다 — 조건 분기가 아니라 u·dir 부호 하나에서 나온다.
      const along = u * s.dir;
      const falloff = oarFalloff(along);
      const scale = s.dir < 0 ? t.oarReverseScale : 1;
      const f = t.oarStrokePeak * params.area * env * s.dir * scale * falloff;

      fx += f;
      // ★ 팔길이 창발. 좌우 노의 y 부호가 반대라 한쪽만 저으면 선회하고, 양쪽을 저으면
      //   토크가 상쇄돼 직진한다 — 단, 비대칭 선체는 두 부착점의 중점이 y=0 이 아니라서
      //   양쪽을 저어도 저절로 돈다. 조향 코드는 여전히 0줄이다.
      torque += -d.y * f;
    } else if (d.type === 'rudder') {
      // L = ½ρ·C_L·A·u·|u|·sin δ — 로컬 y 방향, 타판 부착점에 작용.
      //
      // u·|u| 라서 **정지 시 정확히 0**이고 **후진 시 자동으로 반전**된다. 두 성질 모두
      // 조건 분기가 아니라 식 자체에서 나온다 (§5.1 "키는 물살이 있어야 듣는다").
      //
      // 여기에 "타판이 만나는 실제 물살 각도"(ω·x_r 로 인한 사향류) 항을 넣어 볼 수 있으나
      // 넣지 않는다: 그 항은 키를 강한 요잉 감쇠기로 만들어 §4.1 의 비대칭 창발
      // (직진 입력만으로 선회)을 20초에 70° → 10° 로 눌러 버린다. D1 에서 실측했다.
      const area = t.rudderAreaRatio * params.area;
      const lift = -0.5 * HYDRO_TUNING.waterDensity * t.rudderLift * area
        * u * Math.abs(u) * Math.sin(control.rudder ?? 0);
      fy += lift;
      torque += d.x * lift; // τ = x·Fy − y·Fx, 키는 Fx = 0
    } else if (d.type === 'booster') {
      // §4.2 부스터 — **부착 방향으로 미는 상시력.** 트리거를 누르고 있는 동안만.
      //
      // ★ 여기가 가설 B 의 검증체다. 조향 코드는 없고 아래 세 줄이 전부인데,
      //   중심선 후미에 달면 직진, 좌우 비대칭으로 달면 자동 선회, 측면을 향하게 달면
      //   게걸음이 나온다. 차이는 오로지 (x, y, angle) 셋에서 온다.
      if (!control.held?.[d.bind]) continue;
      const fxi = (d.force ?? 0) * Math.cos(d.angle);
      const fyi = (d.force ?? 0) * Math.sin(d.angle);
      fx += fxi;
      fy += fyi;
      // 일반형 외적. 위의 노(Fy=0)와 키(Fx=0)는 이 식의 특수화일 뿐이다.
      torque += d.x * fyi - d.y * fxi;
    }
  }

  return { fx, fy, torque };
}

/**
 * 키(방향타) 아이템의 조타 입력. 방향키는 노가 가져갔으므로 Q/E 를 쓴다.
 * 부호는 §5.1 과 같이 **좌현 = +**.
 */
export function steerFromHeld(held) {
  if (!held) return 0;
  return (held.KeyQ ? 1 : 0) - (held.KeyE ? 1 : 0);
}

// ─────────────────────────────────────────────────────────── planck 적용부

/** 닻 조인트가 물릴 static 바닥. 월드당 하나면 충분하다. */
const GROUNDS = new WeakMap();

function groundBody(world) {
  let g = GROUNDS.get(world);
  if (!g) {
    g = world.createBody({ type: 'static', position: new Vec2(0, 0) });
    GROUNDS.set(world, g);
  }
  return g;
}

/**
 * 기본 닻 — 누르면 그 순간의 닻 위치에 RevoluteJoint 를 만들고, 놓으면 부순다.
 * 회전은 막지 않으므로 §4.2 "그 점을 축으로 도는" 거동이 자동으로 따라온다.
 */
function syncAnchor(body, hull, wanted) {
  const has = hull.anchorJoint != null;
  if (wanted === has) return;

  const world = body.getWorld();
  if (wanted) {
    const dev = hull.items.find((it) => it.type === 'anchor');
    if (!dev) return; // 파손으로 닻을 잃었으면 멈출 수 없다 (§5.2 원칙 3)
    const at = body.getWorldPoint(new Vec2(dev.x, dev.y));
    hull.anchorJoint = world.createJoint(new RevoluteJoint({}, groundBody(world), body, at));
  } else {
    world.destroyJoint(hull.anchorJoint);
    hull.anchorJoint = null;
  }
  hull.control.anchored = hull.anchorJoint != null;
}

const NO_STROKES = [];
const NO_HELD = {};

/**
 * 강체 하나에 장치 입력을 적용한다. **매 물리 스텝 직전**에 호출할 것 —
 * 렌더 프레임마다 넣으면 planck 이 스텝 후 힘 누산기를 비우는 탓에 조종감이 주사율에 좌우된다.
 *
 * ★ 스텝당 순서는 predict.js 가 그대로 재현한다. 바꾸면 예측선이 어긋난다:
 *   ① 스트로크 요청 소비 → ② 조타 지연 → ③ 힘 계산 → ④ 힘 적용 → ⑤ 스트로크 시계 전진
 *
 * @param {Body} body 선체 강체
 * @param {{strokes?:Array<{side,dir}>, held?:object, steer?:number, anchor?:boolean}} input
 * @param {number} dt 고정 타임스텝
 */
export function applyDevices(body, input, dt) {
  const hull = body.getUserData()?.hull;
  if (!hull || dt <= 0) return;

  const control = (hull.control ??= createControl());

  // ① 스트로크 요청 소비. 요청 배열은 세 척이 공유하지만 수락/거절은 배마다 따로 판단한다.
  for (const req of input.strokes ?? NO_STROKES) {
    startStroke(control.strokes[req.side], req.dir);
  }
  control.held = input.held ?? NO_HELD;
  control.steer = clamp(input.steer ?? steerFromHeld(control.held), -1, 1);
  // ② 조타 지연
  control.rudder = stepRudder(control.rudder, control.steer, dt);

  syncAnchor(body, hull, !!input.anchor);

  const devices = hull.items.filter((it) => it.type);
  if (devices.length > 0) {
    const vLocal = body.getLocalVector(body.getLinearVelocity());
    // ③ 힘
    const f = deviceForcesLocal(
      hull.params,
      devices,
      { u: vLocal.x, v: vLocal.y, w: body.getAngularVelocity() },
      control,
    );

    // ④ 힘을 무게중심에, 토크를 따로 넣는다 — 순수 함수가 낸 (fx, fy, τ) 와 완전히 같은
    //    결과이고, predict.js 가 재현해야 하는 것도 정확히 이 셋이다.
    body.applyForceToCenter(body.getWorldVector(new Vec2(f.fx, f.fy)), true);
    body.applyTorque(f.torque, true);
  }

  // ⑤ 스트로크 시계 전진
  advanceStrokes(control, dt);
}

/** 월드의 모든 선체에 같은 입력을 적용 (세 척 동시 주행 비교용). */
export function applyDevicesToWorld(world, input, dt) {
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.isDynamic()) applyDevices(body, input, dt);
  }
}

/** 홀드 상태(닻·트리거)만 뽑는다. 스트로크는 홀드가 아니라 keydown 엣지에서 온다. */
export function inputFromKeys(keys) {
  return { anchor: keys.has(' '), strokes: NO_STROKES, held: NO_HELD };
}
