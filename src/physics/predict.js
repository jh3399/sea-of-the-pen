// 예측 궤적선 — "지금 입력을 그대로 유지하면 배가 어디로 가는가".
//
// dev_plan.md 가 이것을 D1 에 넣은 이유는 심적 회전 문제의 실측이다: 카메라가 돌지 않으므로
// 플레이어는 "내 배가 어느 쪽으로 미끄러지는지"를 스스로 계산해야 하는데, 이방성 저항 때문에
// 뱃머리 방향과 실제 진행 방향이 다르다. 궤적선이 그 계산을 대신해 준다.
//
// ★ 불변식: 여기서는 hydro.js · devices.js 의 **순수 함수를 그대로 호출한다.** 예측 전용으로
//   식을 다시 쓰면 그 순간부터 예측선이 거짓말을 시작하고, 없느니만 못한 UI 가 된다.
import { hydroForcesLocal } from './hydro.js';
import { deviceForcesLocal, stepRudder } from './devices.js';
import { FIXED_DT } from './world.js';

export const PREDICT_DEFAULTS = {
  /** 예측 구간 (초). */
  horizon: 2.5,
  /** 샘플 간격 (물리 스텝 수). 2.5초 @1/60 을 3스텝마다 → 50점. */
  stride: 3,
};

/**
 * 현재 상태 + 현재 입력 유지 가정으로 앞으로의 무게중심 경로를 적분한다.
 * 충돌은 무시한다 (빈 바다 전제 — D3 에서 지형이 들어오면 그때 다시 본다).
 *
 * @param {Body} body 선체 강체
 * @param {{throttle?:number, steer?:number}} input
 * @returns {Array<{x:number,y:number}>} 월드 좌표 경로. 닻이 물려 있으면 빈 배열.
 */
export function predictPath(body, input, options = {}) {
  const hull = body.getUserData()?.hull;
  if (!hull) return [];
  if (hull.anchorJoint != null) return []; // 닻이 물리면 예측할 것이 없다

  const dt = FIXED_DT;
  const horizon = options.horizon ?? PREDICT_DEFAULTS.horizon;
  const stride = options.stride ?? PREDICT_DEFAULTS.stride;
  const steps = Math.round(horizon / dt);

  const mass = body.getMass();
  const inertia = body.getInertia();
  if (!(mass > 0) || !(inertia > 0)) return [];

  const devices = hull.items.filter((it) => it.type);
  const control = {
    throttle: input.throttle ?? 0,
    steer: input.steer ?? 0,
    // 조타 지연까지 재현해야 "지금 꺾는 중"인 상태의 예측이 맞는다.
    rudder: hull.control?.rudder ?? 0,
  };

  const center = body.getWorldCenter();
  const velocity = body.getLinearVelocity();
  let x = center.x;
  let y = center.y;
  let angle = body.getAngle();
  let vx = velocity.x;
  let vy = velocity.y;
  let w = body.getAngularVelocity();

  const path = [{ x, y }];
  for (let i = 0; i < steps; i++) {
    control.rudder = stepRudder(control.rudder, control.steer, dt);

    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const vel = { u: vx * c + vy * s, v: -vx * s + vy * c, w };

    const d = deviceForcesLocal(hull.params, devices, vel, control);
    const h = hydroForcesLocal(hull.params.drag, vel, mass, inertia, dt);
    const fx = d.fx + h.fx;
    const fy = d.fy + h.fy;
    const torque = d.torque + h.torque;

    // planck 과 같은 semi-implicit Euler: 속도를 먼저 갱신하고 그 속도로 위치를 옮긴다.
    vx += ((fx * c - fy * s) / mass) * dt;
    vy += ((fx * s + fy * c) / mass) * dt;
    w += (torque / inertia) * dt;
    x += vx * dt;
    y += vy * dt;
    angle += w * dt;

    if (i % stride === stride - 1) path.push({ x, y });
  }
  return path;
}
