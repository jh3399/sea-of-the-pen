// §4.1 아이템 부착 — 카탈로그 정의를 **선체 로컬에 앵커된 인스턴스**로 만든다.
//
// 인스턴스 형식은 D1 의 기본 장치(defaults.js)와 완전히 같다. 그래야 파손 시 소속 폴리곤
// 판정(§7.5)과 조각 승계(body.js respawnPieces)를 무수정으로 그대로 탄다.
//
// ★ `key` 는 **인스턴스 고유 ID** 다. 트리거 바인딩이 타입이 아니라 이 참조를 붙들기 때문에,
//   D3 에서 "부스터 두 개 중 좌현 것만 잘려나갔다"를 표현할 수 있다. 타입에 키를 하드코딩하면
//   그 순간 §7.5 의 트리거 무효화가 불가능해진다.
import { Vec2 } from 'planck';
import { pointInPolygon } from '../geom/poly.js';
import { ITEM_CATALOG, BIND_POOL } from './catalog.js';

let serial = 0;

/**
 * ★ 그 자리에 아이템을 붙일 수 있는가 — **선체 안이어야 한다.**
 *
 * 단순한 UI 검사처럼 보이지만 §7.5 가 전제하는 불변식이다. 파손 판정(`damage/carve.js`)은
 * 아이템을 담고 있는 조각을 `pointInPolygon` 으로 찾고, 어느 조각에도 없으면 그대로 탈락
 * 시킨다. 그래서 선체 밖에 붙인 아이템은 **첫 파손에서 무조건 사라진다** — 게다가 파손
 * 전까지는 팔길이만 공짜로 늘어난 치트로 동작한다. 둘 다 여기서 막는다.
 *
 * 경계에 **가까운** 것은 막지 않는다. 현측 끝에 단 부스터가 작은 타격에도 떨어지는 것은
 * 버그가 아니라 §7.5 가 의도한 트레이드오프이고, 플레이어가 감수하고 고를 수 있어야 한다.
 *
 * @param {Array<{x,y}>} outline 선체 로컬 폴리곤
 * @param {Array<Array<{x,y}>>} holes 구멍들 (없으면 생략)
 * @param {{x:number, y:number}} pt 선체 로컬 좌표
 */
export function canAttachAt(outline, holes, pt) {
  if (!outline?.length || !pt) return false;
  if (!pointInPolygon(pt, outline)) return false;
  return !(holes ?? []).some((hole) => pointInPolygon(pt, hole));
}

/**
 * 카탈로그 항목 하나를 선체 로컬 좌표에 붙인다.
 *
 * @param {{items: Array}} hull 선체 (hull.items 에 push 된다)
 * @param {string} type ITEM_CATALOG 키
 * @param {{x:number, y:number, angle?:number, bind?:string}} at 선체 로컬 부착점·방향
 * @returns {object|null} 생성된 아이템 인스턴스
 */
export function attachItem(hull, type, at) {
  const spec = ITEM_CATALOG[type];
  if (!spec || !hull) return null;

  const item = {
    key: `${type}-${++serial}`,
    type,
    kind: spec.kind,
    side: null,
    name: spec.name,
    mass: spec.mass,
    material: spec.material,
    /** §4.1 의 "방향" — 부스터는 추력 방향, 돛은 법선. 라디안, +X 기준. */
    angle: at.angle ?? 0,
    x: at.x,
    y: at.y,
    /** 카탈로그의 세기 스칼라를 인스턴스로 복사 — 힘 함수가 카탈로그를 몰라도 되게. */
    force: spec.force,
    impulse: spec.impulse,
    area: spec.area,
    bind: at.bind ?? spec.bind ?? null,
    /** 규칙 엔진의 상태 타이머(불붙음·젖음). 아이템도 규칙표의 예외가 아니다 (§4.4). */
    status: {},
  };

  hull.items.push(item);
  return item;
}

/** 트리거 바인딩 자동 배정 — 이미 쓰이는 것을 피해 풀에서 하나 고른다. */
export function nextBind(items) {
  const used = new Set(items.map((it) => it.bind).filter(Boolean));
  return BIND_POOL.find((b) => !used.has(b)) ?? BIND_POOL[0];
}

/** 인스턴스 ID 로 떼어 낸다. @returns {boolean} 떼어 냈는지 */
export function detachItem(hull, key) {
  const i = hull.items.findIndex((it) => it.key === key);
  if (i < 0) return false;
  hull.items.splice(i, 1);
  return true;
}

/**
 * 아이템 부착점의 월드 좌표.
 * D3 대포의 반동 임펄스가 "무게중심이 아니라 포구에" 걸리려면 이 값이 필요하다.
 */
export function itemWorldPoint(body, item) {
  return body.getWorldPoint(new Vec2(item.x, item.y));
}

/** 아이템 부착 방향의 월드 각도 (선체 회전 포함). */
export function itemWorldAngle(body, item) {
  return body.getAngle() + (item.angle ?? 0);
}

/** 총 부가 질량 — computeHullParams 의 extraMass 로 흘수·관성에 반영된다. */
export function itemsExtraMass(items) {
  let sum = 0;
  for (const it of items) sum += it.mass ?? 0;
  return sum;
}
