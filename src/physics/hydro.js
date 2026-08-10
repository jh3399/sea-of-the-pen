// ★ 스파이크 ③ — 이방성 저항(저항 타원)을 물리 엔진 위에 커스텀 구현
//
// Box2D 계열은 등방성 linearDamping 밖에 제공하지 않는다. 하지만 이 게임의 조종감 전체가
// "앞으로는 잘 나가고 옆으로는 안 밀린다"는 방향별 저항 차이에서 나오므로, 매 스텝 선체
// 로컬 좌표계에서 감쇠력을 직접 적분해야 한다.
//
// 진짜 리스크는 성능이 아니라 **explicit Euler 발산**이다. 2차 항력(∝v²)은 고속에서 한 스텝의
// 감쇠 충격량이 현재 운동량을 넘어서면 속도 부호를 뒤집고, 그다음 스텝에서 더 큰 힘을 만들어
// 발산한다. 아래 클램프가 그것을 막는다 — 저항은 배를 멈출 수는 있어도 되밀 수는 없다.
import { Vec2 } from 'planck';
import { HYDRO_TUNING } from '../hull/params.js';

/**
 * 각속도 클램프의 안전계수.
 * planck 의 getInertia() 는 로컬 원점 기준이라 무게중심 기준값보다 크거나 같다. 선체는 항상
 * 무게중심을 로컬 원점에 맞춰 생성하므로 둘이 거의 같지만, 여유를 둬서 과소 클램프를 막는다.
 */
const ANGULAR_SAFETY = 0.8;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * ★ 순수 함수 — 선체 로컬 좌표계에서의 저항력·저항 토크.
 *
 * `applyHydroDrag`(실제 시뮬레이션)와 `predict.js`(예측 궤적선)가 **같은 식**을 쓰게 하려고
 * 분리했다. 예측이 실제와 어긋나면 궤적선은 없느니만 못하다.
 *
 * @param {{x:number,y:number,w:number}} drag params.drag
 * @param {{u:number,v:number,w:number}} vel 로컬 전진·횡·각속도
 * @param {number} mass 클램프 기준 질량 (planck 이 산출한 값)
 * @param {number} inertia 클램프 기준 관성
 * @param {number} dt 고정 타임스텝
 * @returns {{fx:number, fy:number, torque:number}} 로컬 좌표계
 */
export function hydroForcesLocal(drag, vel, mass, inertia, dt) {
  if (!drag || dt <= 0) return { fx: 0, fy: 0, torque: 0 };

  // --- 병진 저항 ---
  //
  // ★ `(|v| + v₀)·v` — 순수 v² 가 아니다. v₀(HYDRO_TUNING.dragLowSpeed) 아래에서는 선형 항이
  //   이겨 지수 감쇠가 되고, 위에서는 v² 그대로다. 조건 분기가 아니라 한 항이라 클램프도
  //   predict.js 도 손댈 것이 없다 (§조작감: 순수 v² 는 1/t 꼬리를 끌어 배가 영영 미끄러진다).
  const low = HYDRO_TUNING.dragLowSpeed;
  let fx = -drag.x * (Math.abs(vel.u) + low) * vel.u;
  let fy = -drag.y * (Math.abs(vel.v) + low) * vel.v;
  if (mass > 0) {
    // |F|·dt ≤ m·|v| — 이 스텝에 속도를 0 아래로 끌어내리지 못하게 한다.
    const maxFx = (Math.abs(vel.u) * mass) / dt;
    const maxFy = (Math.abs(vel.v) * mass) / dt;
    fx = clamp(fx, -maxFx, maxFx);
    fy = clamp(fy, -maxFy, maxFy);
  }

  // --- 회전 저항 ---
  let torque = -drag.w * Math.abs(vel.w) * vel.w;
  if (inertia > 0) {
    const maxTorque = (ANGULAR_SAFETY * Math.abs(vel.w) * inertia) / dt;
    torque = clamp(torque, -maxTorque, maxTorque);
  }

  return { fx, fy, torque };
}

/**
 * 강체 하나에 이방성 유체 저항을 적용한다. 매 물리 스텝 직전에 호출.
 * @param {Body} body userData.hull.params.drag 를 가진 선체 강체
 * @param {number} dt 고정 타임스텝
 */
export function applyHydroDrag(body, dt) {
  const drag = body.getUserData()?.hull?.params?.drag;
  if (!drag || dt <= 0) return;

  const vLocal = body.getLocalVector(body.getLinearVelocity());
  const f = hydroForcesLocal(
    drag,
    { u: vLocal.x, v: vLocal.y, w: body.getAngularVelocity() },
    body.getMass(),
    body.getInertia(),
    dt,
  );

  body.applyForceToCenter(body.getWorldVector(new Vec2(f.fx, f.fy)), true);
  body.applyTorque(f.torque, true);
}

/** 월드의 모든 선체 강체에 적용. FixedStepper 의 onPreStep 에 물린다. */
export function applyHydroToWorld(world, dt) {
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.isDynamic()) applyHydroDrag(body, dt);
  }
}

/**
 * 진단용 — 일정한 추력 F 와 균형을 이루는 종단 속도. 발산 여부를 눈으로 판정할 기준선이 된다.
 * `drag·(v + v₀)·v = F` 의 근이라 저속 항이 없던 시절의 `sqrt(F/drag)` 보다 조금 낮다.
 */
export function terminalSpeed(dragCoefficient, force) {
  if (dragCoefficient <= 0) return Infinity;
  const v0 = HYDRO_TUNING.dragLowSpeed;
  return (Math.sqrt(v0 * v0 + 4 * Math.abs(force) / dragCoefficient) - v0) / 2;
}
