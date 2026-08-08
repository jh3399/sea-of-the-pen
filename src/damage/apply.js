// 충격 이벤트 → 폴리곤 차감 → 강체 재구성 → 파라미터 재계산.
//
// §7.5 의 성능 요구사항을 지키는 지점: 재계산은 **이벤트 시점에만** 일어난다. 매 프레임
// 도는 것은 hydro.js 의 저항 적분뿐이고, 여기는 포탄이 맞았을 때만 호출된다.
import { Vec2 } from 'planck';
import { carveHull, makeCircleBrush } from './carve.js';
import { respawnPieces } from '../physics/body.js';

/**
 * 월드 좌표의 원형 충격을 선체에 가한다.
 *
 * @param {World} world
 * @param {Body} body 맞은 선체 강체
 * @param {{x:number,y:number}} worldPoint 충격 지점 (월드)
 * @param {number} radius 충격 반경 (m)
 * @returns {{bodies: Array<Body>, result: object}|null}
 */
export function applyImpact(world, body, worldPoint, radius, options = {}) {
  const hull = body.getUserData()?.hull;
  if (!hull) return null;

  // 월드 → 선체 로컬
  const local = body.getLocalPoint(new Vec2(worldPoint.x, worldPoint.y));
  const brush = makeCircleBrush({ x: local.x, y: local.y }, radius, options.brushSteps);

  const result = carveHull(hull, [brush], options);

  if (result.destroyed) {
    world.destroyBody(body);
    return { bodies: [], result };
  }

  // 형상이 전혀 안 변했으면(빗맞음) 강체를 건드리지 않는다 — 불필요한 재구성 비용 회피.
  if (result.removedArea <= 1e-6 && !result.split) {
    return { bodies: [body], result };
  }

  const t0 = performance.now();
  const bodies = respawnPieces(world, body, result.pieces);
  result.rebuildMs = performance.now() - t0;
  return { bodies, result };
}
