// §4.1 아이템 부착 — 카탈로그 정의를 **선체 로컬에 앵커된 인스턴스**로 만든다.
//
// 인스턴스 형식은 D1 의 기본 장치(defaults.js)와 완전히 같다. 그래야 파손 시 소속 폴리곤
// 판정(§7.5)과 조각 승계(body.js respawnPieces)를 무수정으로 그대로 탄다.
//
// ★ `key` 는 **인스턴스 고유 ID** 다. 트리거 바인딩이 타입이 아니라 이 참조를 붙들기 때문에,
//   D3 에서 "부스터 두 개 중 좌현 것만 잘려나갔다"를 표현할 수 있다. 타입에 키를 하드코딩하면
//   그 순간 §7.5 의 트리거 무효화가 불가능해진다.
import { Vec2 } from 'planck';
import { ITEM_CATALOG, BIND_POOL } from './catalog.js';

let serial = 0;

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
    /** 규칙 엔진의 상태(불붙음·젖음). 아이템도 규칙표의 예외가 아니다 (§4.4). */
    state: {},
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
