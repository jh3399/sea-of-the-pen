// 선체 폴리곤 → planck 강체.
//
// 원칙 3의 실현 지점: 무게중심·질량·관성은 우리가 따로 관리하지 않고 fixture 집합에서
// 물리 엔진이 산출하게 둔다. 그래서 파손으로 형상이 바뀌면 조종 특성이 저절로 따라 바뀐다.
import { Polygon, Vec2 } from 'planck';
import { decomposeHull } from '../hull/decompose.js';
import { computeHullParams } from '../hull/params.js';
import { polygonMoments, translate } from '../geom/poly.js';

/**
 * 선체 조각 하나를 강체로 만든다.
 * @param {World} world
 * @param {{outline: Array<{x,y}>, holes?: Array}} piece 선체 로컬 폴리곤
 * @param {{position:{x,y}, angle:number, material?:string, extraMass?:number}} placement
 */
export function createHullBody(world, piece, placement) {
  const parts = decomposeHull(piece.outline, piece.holes ?? []);
  if (parts.length === 0) return null;

  const params = computeHullParams(piece.outline, {
    material: placement.material,
    extraMass: placement.extraMass,
  });
  if (!params) return null;

  const body = world.createBody({
    type: 'dynamic',
    position: new Vec2(placement.position.x, placement.position.y),
    angle: placement.angle,
    linearDamping: 0,
    angularDamping: 0,
  });

  for (const part of parts) {
    // planck 은 입력 점들의 볼록 껍질을 계산하므로 미세한 오목/공선은 스스로 흡수한다.
    body.createFixture({
      shape: new Polygon(part.map((p) => new Vec2(p.x, p.y))),
      density: params.material.areaDensity,
      friction: 0.2,
      restitution: 0.05,
    });
  }

  // 요잉 부가질량 — planck 은 fixture 기하로 관성을 산출하므로, 물을 끌고 도는 몫은
  // 여기서 더해 준다. 질량과 무게중심은 엔진이 낸 값을 그대로 둔다.
  if (params.yawInertiaScale > 1.0001) {
    const md = { mass: 0, center: new Vec2(0, 0), I: 0 };
    body.getMassData(md);
    md.I *= params.yawInertiaScale;
    body.setMassData(md);
  }

  body.setUserData({
    hull: {
      outline: piece.outline,
      holes: piece.holes ?? [],
      // 부착물(§4.1) — D1 부터 여기에 기본 3종 장치가 들어온다. 파손 시 소속 폴리곤을
      // 따라가므로, 키를 얹은 선미가 잘려나가면 조향을 그대로 잃는다 (§5.2 원칙 3).
      items: piece.items ?? [],
      /** 조종 상태(타각·닻). devices.js 가 첫 호출에서 채운다. */
      control: null,
      anchorJoint: null,
      /** 비교 주행용 표식 {label, color}. 물리에는 영향이 없다. */
      tag: piece.tag ?? null,
      parts,
      params,
    },
  });
  return body;
}

/**
 * 파손 후 재구성 — 조각이 여러 개면 각각 독립 강체가 된다(§7.5 절단 판정).
 * 기존 강체의 속도를 물려주어 "잘려나갔다"는 느낌이 물리적으로 이어지게 한다.
 *
 * @returns {Array<Body>} 새로 생성된 강체들
 */
export function respawnPieces(world, oldBody, pieces, options = {}) {
  const angle = oldBody.getAngle();
  const linearVelocity = oldBody.getLinearVelocity().clone();
  const angularVelocity = oldBody.getAngularVelocity();
  const oldCenter = oldBody.getWorldCenter().clone();
  const oldHull = oldBody.getUserData()?.hull;
  const material = oldHull?.params?.material;

  const created = [];
  for (const piece of pieces) {
    // 조각의 무게중심을 로컬 원점으로 다시 맞춘다 — 회전 저항 클램프가 이를 전제로 한다.
    const m = polygonMoments(piece.outline);
    if (!m) continue;
    const items = (piece.items ?? []).map((it) => ({ ...it, x: it.x - m.cx, y: it.y - m.cy }));
    const centered = {
      outline: translate(piece.outline, -m.cx, -m.cy),
      holes: (piece.holes ?? []).map((h) => translate(h, -m.cx, -m.cy)),
      items,
      tag: oldHull?.tag ?? null,
    };

    // 로컬 무게중심의 월드 위치를 새 강체의 원점으로 삼는다.
    const worldPos = oldBody.getWorldPoint(new Vec2(m.cx, m.cy));

    const body = createHullBody(world, centered, {
      position: { x: worldPos.x, y: worldPos.y },
      angle,
      material: options.material ?? material?.key ?? 'wood',
      // 흘수는 **살아남은** 장치의 질량만 반영한다 — 떨어져 나간 닻은 더 이상 배를 누르지 않는다.
      extraMass: items.reduce((s, it) => s + (it.mass ?? 0), 0),
    });
    if (!body) continue;

    // 강체 분리 시 회전에서 오는 접선 속도를 각 조각에 반영한다.
    const r = Vec2.sub(body.getWorldCenter(), oldCenter);
    body.setLinearVelocity(new Vec2(
      linearVelocity.x - angularVelocity * r.y,
      linearVelocity.y + angularVelocity * r.x,
    ));
    body.setAngularVelocity(angularVelocity);
    created.push(body);
  }

  world.destroyBody(oldBody);
  return created;
}
