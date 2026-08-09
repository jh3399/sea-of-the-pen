// 예측 궤적선 — "지금 입력을 그대로 유지하면 배가 어디로 가는가".
//
// dev_plan.md 가 이것을 D1 에 넣은 이유는 심적 회전 문제의 실측이다: 카메라가 돌지 않으므로
// 플레이어는 "내 배가 어느 쪽으로 미끄러지는지"를 스스로 계산해야 하는데, 이방성 저항 때문에
// 뱃머리 방향과 실제 진행 방향이 다르다. 궤적선이 그 계산을 대신해 준다.
//
// ★ 불변식: 여기서는 hydro.js · devices.js 의 **순수 함수를 그대로 호출한다.** 예측 전용으로
//   식을 다시 쓰면 그 순간부터 예측선이 거짓말을 시작하고, 없느니만 못한 UI 가 된다.
import { hydroForcesLocal } from './hydro.js';
import {
  deviceForcesLocal, stepRudder, advanceStrokes, advanceCannons, cloneControl, steerFromHeld,
} from './devices.js';
import { FIXED_DT } from './world.js';
import { fieldForcesLocal, toLocalVector } from '../field/forces.js';

const ZERO = { fx: 0, fy: 0, torque: 0 };

export const PREDICT_DEFAULTS = {
  /** 예측 구간 (초). */
  horizon: 2.5,
  /** 샘플 간격 (물리 스텝 수). 2.5초 @1/60 을 3스텝마다 → 50점. */
  stride: 3,
};

/**
 * 지금 **더 젓지 않으면** 배가 어디로 가는가 — 무게중심 경로를 적분한다.
 * 충돌은 무시한다 (빈 바다 전제 — D3 에서 지형이 들어오면 그때 다시 본다).
 *
 * ★ 스트로크 입력의 예측 가정: **진행 중인 봉투는 끝까지 재생하고, 그 뒤로는 활공한다.**
 *   노가 keydown 엣지로 바뀌면서 "현재 입력 유지"라는 가정 자체가 정의되지 않게 됐다.
 *   케이던스가 이어질 것으로 가정해 미래의 젓기를 지어내면 궤적선이 플레이어의 입력을
 *   대신 상상하는 셈이라 D1 불변식("예측이 거짓말을 시작하면 없느니만 못하다")이 깨진다.
 *   그래서 예측은 정직한 질문 하나만 답한다 — "손을 떼면 어디까지 미끄러지는가".
 *
 * @param {Body} body 선체 강체
 * @param {{steer?:number, held?:object}} input
 * @returns {Array<{x:number,y:number}>} 월드 좌표 경로. 닻이 물려 있으면 빈 배열.
 */
export function predictPath(body, input, options = {}) {
  const hull = body.getUserData()?.hull;
  if (!hull) return [];
  if (hull.anchorJoint != null) return []; // 닻이 물리면 예측할 것이 없다

  const dt = FIXED_DT;
  const horizon = options.horizon ?? PREDICT_DEFAULTS.horizon;
  const stride = options.stride ?? PREDICT_DEFAULTS.stride;
  const fields = options.fields ?? null;
  const steps = Math.round(horizon / dt);

  const mass = body.getMass();
  const inertia = body.getInertia();
  if (!(mass > 0) || !(inertia > 0)) return [];

  const devices = hull.items.filter((it) => it.type);
  const live = hull.control;
  // 스트로크와 대포 시계를 모두 **깊은 복사**한다 — 예측이 실제 재장전·반동 상태를 앞당기거나
  // wasHeld 를 바꾸면 다음 실제 스텝의 발사 엣지까지 달라진다.
  const control = cloneControl(live);
  // 트리거(부스터·키)는 **지금 눌린 상태가 유지된다**고 본다. 대포는 엣지 장치라 예측 중 신규
  // 발사를 만들지 않고, 이미 시작된 반동 봉투만 끝까지 재생한다.
  control.held = { ...(input.held ?? live?.held ?? {}) };
  control.steer = input.steer ?? steerFromHeld(input.held ?? live?.held);
  // 조타 지연까지 재현해야 "지금 꺾는 중"인 상태의 예측이 맞는다.
  control.rudder = live?.rudder ?? 0;

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
    // devices.js 의 applyDevices 와 **같은 순서**로 돈다:
    //   ① 스트로크·대포 엣지 소비(예측에는 신규 입력이 없다) → ② 조타 지연 → ③ 힘 → ④ 적분
    //   → ⑤ 스트로크·대포 시계 전진. 이 순서가 어긋나면 비트 단위 일치가 깨진다.
    control.rudder = stepRudder(control.rudder, control.steer, dt);

    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const vel = { u: vx * c + vy * s, v: -vx * s + vy * c, w };

    const d = deviceForcesLocal(hull.params, devices, vel, control);
    const h = hydroForcesLocal(hull.params.drag, vel, mass, inertia, dt);
    // 필드도 **적분 중 좌표에서** 샘플한다. 바람 경계를 넘어가는 궤적이 경계를 무시하면
    // 궤적선이 가장 필요한 순간(돛배가 역풍 지대로 들어가기 직전)에 거짓말을 한다.
    const f = fields && !fields.isEmpty
      ? fieldForcesLocal(hull.items, toLocalVector(fields.sampleVector('wind', x, y), angle), vel)
      : ZERO;
    const fx = d.fx + h.fx + f.fx;
    const fy = d.fy + h.fy + f.fy;
    const torque = d.torque + h.torque + f.torque;

    // planck 과 같은 semi-implicit Euler: 속도를 먼저 갱신하고 그 속도로 위치를 옮긴다.
    vx += ((fx * c - fy * s) / mass) * dt;
    vy += ((fx * s + fy * c) / mass) * dt;
    w += (torque / inertia) * dt;
    x += vx * dt;
    y += vy * dt;
    angle += w * dt;
    advanceStrokes(control, dt);
    advanceCannons(control, dt);

    if (i % stride === stride - 1) path.push({ x, y });
  }
  return path;
}
