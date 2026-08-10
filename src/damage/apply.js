// 충격 이벤트 → 폴리곤 차감 → 강체 재구성 → 파라미터 재계산.
//
// §7.5 의 성능 요구사항을 지키는 지점: 재계산은 **이벤트 시점에만** 일어난다. 매 프레임
// 도는 것은 hydro.js 의 저항 적분뿐이고, 여기는 포탄이 맞았을 때만 호출된다.
import { Vec2 } from 'planck';
import { carveHull, makeCircleBrush } from './carve.js';
import { respawnPieces } from '../physics/body.js';
import { partitionHullSurface } from '../hull/raster.js';

// clipper 정수(mm) 왕복이 만드는 1 cm² 안팎의 면적 잡음은 실제 차감이 아니다. 최소 유효 충격
// 반경(0.12 m)의 면적보다 두 자릿수 작게 두어, 빗맞음 때문에 강체·도트가 재생성되지 않게 한다.
const MIN_REBUILD_AREA = 1e-3;

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

  // 표면 도트는 별도 데미지 모델이 아니다. 같은 차감 결과에 기존 셀을 나눠 붙여, 물리에서
  // 사라진 면적만 화면에서도 사라지게 한다. 새 셀을 만들지 않으므로 파손 뒤 되살아날 수 없다.
  if (hull.surface && result.pieces.length > 0 && (result.removedArea > MIN_REBUILD_AREA || result.split)) {
    const surfaces = partitionHullSurface(hull.surface, result.pieces);
    for (let i = 0; i < result.pieces.length; i++) result.pieces[i].surface = surfaces[i];
  }

  if (result.destroyed) {
    world.destroyBody(body);
    return { bodies: [], result };
  }

  // 형상이 전혀 안 변했으면(빗맞음) 강체를 건드리지 않는다 — 불필요한 재구성 비용 회피.
  if (result.removedArea <= MIN_REBUILD_AREA && !result.split) {
    return { bodies: [body], result };
  }

  const t0 = performance.now();
  const bodies = respawnPieces(world, body, result.pieces);
  result.rebuildMs = performance.now() - t0;
  return { bodies, result };
}
