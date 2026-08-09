// 암초 — 맵 데이터가 만드는 정적 강체.
//
// ★ **암초가 저절로 안 깎이는 것이 곧 코드 0줄이다.** userData 에 `hull` 이 없으므로:
//   - `applyImpact` 가 null 을 돌려준다 (damage/apply.js)
//   - `applyHydroDrag` 가 `hull.params.drag` 를 못 찾고 즉시 반환한다
//   - `applyFields` · `engine.tick` 은 `hull` 없는 강체를 건너뛴다
//   장애물을 위한 예외 분기가 물리·규칙 어디에도 필요 없다. 이것이 §6.1 이 "장애물은
//   필드를 국소 변조하는 장치일 뿐"이라고 쓴 것의 구현 측 대응이다.
//
// "충각으로 암초를 깬다"는 창발은 여기에 `hull` 을 주면 열리지만, `respawnPieces` 가
// static 조각을 스폰하는 경로가 없다. D3 범위 밖이라 스키마 자리(`breakable`)만 남긴다.
import { Polygon, Circle, Vec2 } from 'planck';
import { MATERIALS } from '../hull/params.js';

/** 다각형 암초를 볼록 조각으로 쪼갤 때의 fixture 정점 한계 (planck Settings.maxPolygonVertices). */
const MAX_VERTICES = 12;

/**
 * 장애물 스펙 하나 → 정적 강체.
 *
 * @param {World} world
 * @param {{shape:'circle'|'poly', x?:number, y?:number, radius?:number,
 *          points?:Array<[number,number]>, material?:string, breakable?:boolean}} spec
 * @returns {Body|null}
 */
export function createObstacle(world, spec) {
  const material = MATERIALS[spec.material ?? 'rock'] ?? MATERIALS.rock;
  const body = world.createBody({ type: 'static', position: new Vec2(spec.x ?? 0, spec.y ?? 0) });

  if (spec.shape === 'circle') {
    if (!(spec.radius > 0)) { world.destroyBody(body); return null; }
    body.createFixture({ shape: new Circle(spec.radius), friction: 0.4, restitution: 0.1 });
  } else if (spec.shape === 'poly') {
    const pts = (spec.points ?? []).map(([x, y]) => new Vec2(x, y));
    if (pts.length < 3 || pts.length > MAX_VERTICES) { world.destroyBody(body); return null; }
    // planck 이 볼록 껍질을 계산한다 — 오목 암초는 스펙에서 여러 개로 나눠 쓴다.
    body.createFixture({ shape: new Polygon(pts), friction: 0.4, restitution: 0.1 });
  } else {
    world.destroyBody(body);
    return null;
  }

  body.setUserData({ obstacle: { material, spec, breakable: spec.breakable === true } });
  return body;
}
