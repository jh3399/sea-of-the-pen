// 선체 폴리곤 → planck 강체.
//
// 원칙 3의 실현 지점: 무게중심·질량·관성은 우리가 따로 관리하지 않고 fixture 집합에서
// 물리 엔진이 산출하게 둔다. 그래서 파손으로 형상이 바뀌면 조종 특성이 저절로 따라 바뀐다.
import { Polygon, Vec2 } from 'planck';
import { decomposeHull } from '../hull/decompose.js';
import { computeHullParams } from '../hull/params.js';
import { polygonMoments, translate } from '../geom/poly.js';
import { translateHullSurface } from '../hull/raster.js';

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
      /**
       * ★ 주인공의 선체 로컬 좌표 (없으면 null — 비교 주행·벤치의 배들이 그렇다).
       *
       * 물리에는 **아무 영향이 없다.** 질량도 콜라이더도 아니고, 카메라 중심과 도착 판정의
       * 주체일 뿐이다. 그런데 파손 시에는 아이템과 완전히 같은 §7.5 소속 폴리곤 판정을
       * 타므로 (damage/carve.js), 절단된 배에서 "어느 쪽이 내 배인가"가 저절로 정해진다.
       */
      crew: piece.crew ?? null,
      /** 조종 상태(스트로크·타각·닻). devices.js 가 첫 호출에서 채운다. */
      control: null,
      anchorJoint: null,
      /**
       * 규칙 엔진의 상태 타이머 (§6.2). `{burning: 탄 시간, wet: 남은 시간}`.
       * 조각으로 쪼개져도 승계된다 — 불붙은 배가 두 동강 나면 두 조각 다 계속 탄다.
       */
      status: { ...(piece.status ?? {}) },
      /** 마지막 충돌 차감 시각 (s). 조각에 승계된다 — damage/contact.js 의 쿨다운이 이걸 읽는다. */
      lastCarveAt: piece.lastCarveAt,
      /**
       * ★ 연소 반경의 기준이 되는 **출항 시** 면적.
       *
       * 현재 면적을 쓰면 매 사이클 일정 **비율**만 사라져 지수 감쇠가 되고 배가 영영 안 죽는다
       * (실측: 8사이클에 −28%, 최소 파편까지 약 78사이클 = 5분). 출항 면적으로 고정하면
       * 매번 같은 크기가 사라져 유한 사이클에 전손하고, 반경이 √면적에 비례하므로
       * **배 크기와 무관하게 비슷한 사이클 수**가 된다 — 내화는 크기가 아니라 재질이
       * 사는 것이라는 §3 과 맞는다.
       */
      launchArea: piece.launchArea ?? params.area,
      /** 직전 화점 (선체 로컬). 불이 여기서 번진다 — damage/hotspot.js */
      burnAt: piece.burnAt ?? null,
      /** 출항 때 고정한 픽셀 표면. 물리에는 영향이 없고 파손 이벤트에서 기존 셀만 줄어든다. */
      surface: piece.surface ?? null,
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
      // ★ 주인공은 **자기가 서 있던 조각에만** 실린다. 어느 조각인지는 carve.js 가 이미
      //   정해 두었으므로(`piece.crew`), 여기서는 아이템·화점과 **같은 변환**만 해 준다 —
      //   로컬 원점이 그 조각의 새 무게중심으로 옮겨간다. oldHull 에서 그대로 물려받으면
      //   두 조각 다 주인공을 태우게 되어 절단 판정이 무의미해진다.
      crew: piece.crew ? { x: piece.crew.x - m.cx, y: piece.crew.y - m.cy } : null,
      tag: oldHull?.tag ?? null,
      // 불·젖음은 조각을 따라간다 (§6.2). 타는 배를 쪼개서 불을 끌 수는 없다.
      status: oldHull?.status ?? {},
      // ★ 마지막 차감 시각도 따라가야 한다. 안 그러면 차감이 곧 쿨다운 초기화가 되어
      //   (강체가 여기서 바뀌므로) 충돌 파손이 물리 스텝마다 터진다 — damage/contact.js.
      lastCarveAt: oldHull?.lastCarveAt,
      // 연소 반경의 기준. 조각이 되어도 불의 세기는 그대로다.
      launchArea: oldHull?.launchArea,
      // 화점은 **아이템과 같은 변환**을 받아야 한다 — 로컬 원점이 새 무게중심으로 옮겨간다.
      burnAt: oldHull?.burnAt
        ? { x: oldHull.burnAt.x - m.cx, y: oldHull.burnAt.y - m.cy }
        : null,
      // 표면 격자도 같은 로컬 원점 이동을 받는다. 셀 ID는 유지되어 파손 뒤 재배치되지 않는다.
      surface: translateHullSurface(piece.surface, -m.cx, -m.cy),
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
