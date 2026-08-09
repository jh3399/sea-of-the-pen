// 환경 필드의 planck 적용부. hydro.js · devices.js 와 같은 자리에 있고, 같은 규약을 따른다.
//
// `field/` 는 순수하게 데이터와 수학만 두고 엔진을 모른다. 엔진에 힘을 넣는 일은 여기서만
// 한다 — predict.js 가 같은 순수 함수를 planck 없이 부를 수 있어야 하기 때문이다.
import { Vec2 } from 'planck';
import { fieldForcesLocal, toLocalVector } from '../field/forces.js';

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
  const vLocal = body.getLocalVector(body.getLinearVelocity());

  const f = fieldForcesLocal(hull.items, windLocal, {
    u: vLocal.x, v: vLocal.y, w: body.getAngularVelocity(),
  });
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
