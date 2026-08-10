// 환경 필드의 planck 적용부. hydro.js · devices.js 와 같은 자리에 있고, 같은 규약을 따른다.
//
// `field/` 는 순수하게 데이터와 수학만 두고 엔진을 모른다. 엔진에 힘을 넣는 일은 여기서만
// 한다 — predict.js 가 같은 순수 함수를 planck 없이 부를 수 있어야 하기 때문이다.
import { Vec2 } from 'planck';
import { fieldForcesLocal, toLocalVector } from '../field/forces.js';
import { hydroForcesLocal } from './hydro.js';

/**
 * ★ 순수 함수 — 바람과 흐르는 유체가 선체에 만드는 추가 힘.
 *
 * hydro.js 는 정지한 유체의 항력을 이미 적용한다. 해류는 별도 추력이 아니라 **유체 자체의
 * 속도**이므로, 상대속도 항력에서 정수면 항력을 뺀 보정만 돌려준다:
 *   hydro(v - current) - hydro(v)
 * 실제 hydro 와 더하면 정확히 `hydro(v - current)` 가 되어 형상별 저항·클램프를 그대로 쓴다.
 */
export function environmentForcesLocal(hull, windLocal, currentLocal, vel, mass, inertia, dt) {
  const wind = fieldForcesLocal(hull.items, windLocal, vel);
  const cx = currentLocal?.x ?? 0;
  const cy = currentLocal?.y ?? 0;
  if (cx === 0 && cy === 0) return wind;

  const still = hydroForcesLocal(hull.params.drag, vel, mass, inertia, dt);
  const flowing = hydroForcesLocal(hull.params.drag, {
    u: vel.u - cx,
    v: vel.v - cy,
    w: vel.w,
  }, mass, inertia, dt);

  return {
    fx: wind.fx + flowing.fx - still.fx,
    fy: wind.fy + flowing.fy - still.fy,
    torque: wind.torque + flowing.torque - still.torque,
  };
}

/**
 * 강체 하나가 있는 자리의 필드를 샘플해 힘을 넣는다. **매 물리 스텝 직전**에 호출.
 * @param {Body} body
 * @param {object} fields createFields() 결과
 */
export function applyFields(body, fields, dt, time = 0) {
  const hull = body.getUserData()?.hull;
  if (!hull || !fields || fields.isEmpty || dt <= 0) return;

  const c = body.getWorldCenter();
  const angle = body.getAngle();
  const windLocal = toLocalVector(fields.sampleVector('wind', c.x, c.y, time), angle);
  const currentLocal = toLocalVector(fields.sampleVector('current', c.x, c.y, time), angle);
  const vLocal = body.getLocalVector(body.getLinearVelocity());

  const f = environmentForcesLocal(hull, windLocal, currentLocal, {
    u: vLocal.x, v: vLocal.y, w: body.getAngularVelocity(),
  }, body.getMass(), body.getInertia(), dt);
  if (f.fx === 0 && f.fy === 0 && f.torque === 0) return;

  body.applyForceToCenter(body.getWorldVector(new Vec2(f.fx, f.fy)), true);
  body.applyTorque(f.torque, true);
}

/** 월드의 모든 선체에 적용. FixedStepper 의 onPreStep 에 물린다. */
export function applyFieldsToWorld(world, fields, dt, time = 0) {
  if (!fields || fields.isEmpty) return;
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.isDynamic()) applyFields(body, fields, dt, time);
  }
}
