// 기본 3종 장치(§5.1)의 힘 모델. `physics/thrust.js` 의 임시 선미 추력을 대체한다.
//
// hydro.js 와 같은 구조로 **순수 계산 함수 + 얇은 planck 적용부**로 나눈다. 순수 함수를
// 따로 두는 이유는 예측 궤적선(predict.js)이 같은 식을 그대로 호출해야 예측과 실제가
// 일치하기 때문이다.
//
// 조향 시스템 코드는 여기에도 없다. 키·노는 **선체 로컬의 한 점에 힘을 주는 것**이 전부이고,
// 선회는 τ = r × F 에서 저절로 나온다 (§4.1).
import { Vec2, RevoluteJoint } from 'planck';
import { HYDRO_TUNING } from '../hull/params.js';

export const DEVICE_TUNING = {
  // --- 기본 키 (§5.1 "유속 비례 선회력, 정지 시 무효") ---
  /** 키 날개 면적 = 갑판 면적 × 이 비율. 큰 배엔 큰 키를 달아 형상 비교를 공정하게 만든다. */
  rudderAreaRatio: 0.06,
  /** 양력 계수. 실제 값이 아니라 게임 튜닝 노브다. */
  rudderLift: 2.4,
  /** 최대 타각 (rad, ≈34°). */
  rudderMaxAngle: 0.6,
  /** 조타 속도 (rad/s). 즉시 꺾이면 배가 아니라 자동차가 된다. */
  rudderRate: 2.0,

  // --- 기본 노 (§5.1 "미약한 무풍 추력", §5.2 원칙 1 "맵 클리어 불가 수준") ---
  /** 갑판 면적당 노 추력 (N/m²). 종단 속도가 3 m/s 안팎이 되도록 잡았다. */
  oarPerArea: 150,
  /** 이 속도에 닿으면 노가 물을 못 잡는다 — 속도가 붙을수록 죽는 것이 원칙 2의 트레이드오프. */
  oarMaxSpeed: 3.6,
  /** 역젓기는 더 약하다. */
  oarReverseScale: 0.45,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 조종 상태의 기본값. 강체마다 하나씩 `hull.control` 에 산다. */
export function createControl() {
  return { throttle: 0, steer: 0, rudder: 0, anchored: false };
}

/**
 * 목표 타각으로 서서히 이동시킨다 (조타 지연).
 * @param {number} current 현재 타각 (rad)
 * @param {number} steer -1..1 (+ = 좌현)
 */
export function stepRudder(current, steer, dt) {
  const target = clamp(steer, -1, 1) * DEVICE_TUNING.rudderMaxAngle;
  const maxDelta = DEVICE_TUNING.rudderRate * dt;
  return current + clamp(target - current, -maxDelta, maxDelta);
}

/**
 * ★ 순수 함수 — 장치들이 만드는 로컬 좌표계 합력·합토크.
 *
 * @param {object} params computeHullParams 결과
 * @param {Array<object>} devices hull.items 중 type 을 가진 것들
 * @param {{u:number,v:number,w:number}} vel 로컬 전진·횡·각속도
 * @param {{throttle:number, rudder:number}} control
 * @returns {{fx:number, fy:number, torque:number}}
 */
export function deviceForcesLocal(params, devices, vel, control) {
  const t = DEVICE_TUNING;
  const u = vel.u;
  let fx = 0;
  let fy = 0;
  let torque = 0;

  for (const d of devices) {
    if (d.type === 'rudder') {
      // L = ½ρ·C_L·A·u·|u|·sin δ — 로컬 y 방향, 타판 부착점에 작용.
      //
      // u·|u| 라서 **정지 시 정확히 0**이고 **후진 시 자동으로 반전**된다. 두 성질 모두
      // 조건 분기가 아니라 식 자체에서 나온다 (§5.1 "키는 물살이 있어야 듣는다").
      // 부착점이 뒤일수록 팔길이가 길어 잘 듣는 것도 τ = x·F 에서 저절로 따라온다.
      //
      // 여기에 "타판이 만나는 실제 물살 각도"(ω·x_r 로 인한 사향류) 항을 넣어 볼 수 있으나
      // D1 에서는 넣지 않는다: 그 항은 키를 강한 요잉 감쇠기로 만들어 §4.1 의 비대칭 창발
      // (직진 입력만으로 선회)을 20초에 70° → 10° 로 눌러 버린다. 실측으로 확인했다.
      const area = t.rudderAreaRatio * params.area;
      const lift = -0.5 * HYDRO_TUNING.waterDensity * t.rudderLift * area
        * u * Math.abs(u) * Math.sin(control.rudder);
      fy += lift;
      torque += d.x * lift; // τ = x·Fy − y·Fx, 키는 Fx = 0
    } else if (d.type === 'oar') {
      const drive = control.throttle >= 0
        ? control.throttle
        : control.throttle * t.oarReverseScale;
      if (drive === 0) continue;
      // 진행 방향 성분이 커질수록 추력이 죽는다. 그래서 종단 속도가 oarMaxSpeed 아래로 묶인다.
      const along = u * Math.sign(drive);
      const falloff = clamp(1 - along / t.oarMaxSpeed, 0, 1);
      const f = t.oarPerArea * params.area * drive * falloff;
      fx += f;
      // ★ 부착점이 중심선(y=0)을 벗어나 있으면 여기서 토크가 생긴다 — 비대칭 선체가
      //   직진 입력만으로 선회하는 이유. 대칭 선체는 d.y = 0 이라 이 항이 사라진다.
      torque += -d.y * f;
    }
  }

  return { fx, fy, torque };
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

/**
 * 강체 하나에 장치 입력을 적용한다. **매 물리 스텝 직전**에 호출할 것 —
 * 렌더 프레임마다 넣으면 planck 이 스텝 후 힘 누산기를 비우는 탓에 조종감이 주사율에 좌우된다.
 *
 * @param {Body} body 선체 강체
 * @param {{throttle?:number, steer?:number, anchor?:boolean}} input
 * @param {number} dt 고정 타임스텝
 */
export function applyDevices(body, input, dt) {
  const hull = body.getUserData()?.hull;
  if (!hull || dt <= 0) return;

  const control = (hull.control ??= createControl());
  control.throttle = clamp(input.throttle ?? 0, -1, 1);
  control.steer = clamp(input.steer ?? 0, -1, 1);
  control.rudder = stepRudder(control.rudder, control.steer, dt);

  syncAnchor(body, hull, !!input.anchor);

  const devices = hull.items.filter((it) => it.type);
  if (devices.length === 0) return;

  const vLocal = body.getLocalVector(body.getLinearVelocity());
  const f = deviceForcesLocal(
    hull.params,
    devices,
    { u: vLocal.x, v: vLocal.y, w: body.getAngularVelocity() },
    control,
  );

  // 힘을 무게중심에, 토크를 따로 넣는다 — 순수 함수가 낸 (fx, fy, τ) 와 완전히 같은 결과이고,
  // predict.js 가 재현해야 하는 것도 정확히 이 셋이다.
  body.applyForceToCenter(body.getWorldVector(new Vec2(f.fx, f.fy)), true);
  body.applyTorque(f.torque, true);
}

/** 월드의 모든 선체에 같은 입력을 적용 (세 척 동시 주행 비교용). */
export function applyDevicesToWorld(world, input, dt) {
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.isDynamic()) applyDevices(body, input, dt);
  }
}

/** 키 상태 → 정규화 입력. */
export function inputFromKeys(keys) {
  return {
    throttle: (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0),
    steer: (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0),
    anchor: keys.has(' '),
  };
}
