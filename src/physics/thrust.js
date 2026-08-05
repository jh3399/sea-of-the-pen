// D0/D1 임시 조종 장치 — D2 의 아이템 부착 시스템(§4.1)이 이 자리를 그대로 대체한다.
//
// 하는 일은 선미에 힘을 주는 것뿐이고 **조향 코드는 한 줄도 없다**. 선회는 무게중심에서
// 힘 작용점까지의 팔길이에서 저절로 나온다 (토크 = 힘 × r). 가설 B 의 예고편이다.
import { Vec2 } from 'planck';

/** 추력은 선체 면적에 비례 — 큰 배엔 큰 기관을 달아준 셈이고, 형상 비교가 공정해진다. */
export const THRUST_PER_AREA = 300;
/** 힘 작용점: 무게중심에서 선미 쪽으로 선체 길이의 40%. */
export const STERN_RATIO = 0.4;
/** 후진·횡추력은 전진보다 약하다 (원칙 2: 순수하게 좋기만 한 방향은 없다). */
export const REVERSE_SCALE = 0.5;
export const LATERAL_SCALE = 0.6;

/**
 * @param {Body} body 선체 강체
 * @param {{forward?: number, lateral?: number}} input -1..1 정규화 입력
 */
export function applySternThrust(body, { forward = 0, lateral = 0 }) {
  if (forward === 0 && lateral === 0) return;
  const hull = body.getUserData()?.hull;
  if (!hull) return;

  const thrust = THRUST_PER_AREA * hull.params.area;
  const fx = thrust * (forward > 0 ? forward : forward * REVERSE_SCALE);
  const fy = thrust * lateral * LATERAL_SCALE;
  const stern = new Vec2(-hull.params.length * STERN_RATIO, 0);

  body.applyForce(body.getWorldVector(new Vec2(fx, fy)), body.getWorldPoint(stern), true);
}

/** 방향키 상태 → 정규화 입력. */
export function inputFromKeys(keys) {
  return {
    forward: (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0),
    lateral: (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0),
  };
}
