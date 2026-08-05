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

  body.setUserData({
    hull: {
      outline: piece.outline,
      holes: piece.holes ?? [],
      // 부착물(§4.1). D0 은 마커 점으로 "아이템은 소속 폴리곤을 따라간다"만 검증한다.
      items: piece.items ?? [],
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
  const material = oldBody.getUserData()?.hull?.params?.material;

  const created = [];
  for (const piece of pieces) {
    // 조각의 무게중심을 로컬 원점으로 다시 맞춘다 — 회전 저항 클램프가 이를 전제로 한다.
    const m = polygonMoments(piece.outline);
    if (!m) continue;
    const centered = {
      outline: translate(piece.outline, -m.cx, -m.cy),
      holes: (piece.holes ?? []).map((h) => translate(h, -m.cx, -m.cy)),
      items: (piece.items ?? []).map((it) => ({ ...it, x: it.x - m.cx, y: it.y - m.cy })),
    };

    // 로컬 무게중심의 월드 위치를 새 강체의 원점으로 삼는다.
    const worldPos = oldBody.getWorldPoint(new Vec2(m.cx, m.cy));

    const body = createHullBody(world, centered, {
      position: { x: worldPos.x, y: worldPos.y },
      angle,
      material: options.material ?? material?.key ?? 'wood',
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
