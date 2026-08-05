// ★ 스파이크 ② — 폴리곤 불리언 차감 + 절단 판정
//
// 설계 문서 §7의 전제: 배는 이미 폴리곤이므로 데미지를 HP 수치로 추상화할 이유가 없다.
// 피해 = 형상의 실제 변형이면, 저항 타원·무게중심·관성이 전부 자동으로 재계산되고
// "좌현이 깎여서 배가 좌편향한다" 같은 거동이 신규 코드 없이 창발한다.
//
// 이 모듈은 순수 기하만 담당한다. 강체 재구성은 damage/apply.js 가 맡는다.
import { differencePolys, circleBrush } from '../geom/clip.js';
import { polygonArea, pointInPolygon } from '../geom/poly.js';

export const CARVE_DEFAULTS = {
  /** 이보다 작은 파편은 소멸시킨다 (§7.5 물리 안정성). */
  minPieceArea: 0.35,
  /** 원형 브러시의 다각형 근사 단계. 낮출수록 차감이 싸진다 — D0 폴백의 첫 번째 노브. */
  brushSteps: 12,
};

/**
 * 선체에서 브러시 영역을 깎아낸다.
 *
 * @param {{outline: Array<{x,y}>, holes?: Array, items?: Array}} hull 선체 로컬 폴리곤
 * @param {Array<Array<{x,y}>>} brushes 선체 로컬 브러시 링
 * @returns {{pieces, removedArea, droppedPieces, droppedArea, split, destroyed, ms}}
 */
export function carveHull(hull, brushes, options = {}) {
  const opt = { ...CARVE_DEFAULTS, ...options };
  const t0 = performance.now();

  const subject = [hull.outline, ...(hull.holes ?? [])];
  const areaBefore = Math.abs(polygonArea(hull.outline))
    - (hull.holes ?? []).reduce((s, h) => s + Math.abs(polygonArea(h)), 0);

  const { outers, holes } = differencePolys(subject, brushes);

  // 구멍을 자신을 감싸는 가장 작은 외곽 링에 귀속시킨다.
  const pieces = outers.map((outline) => ({ outline, holes: [], items: [] }));
  for (const hole of holes) {
    const owner = smallestContainer(pieces, hole[0]);
    if (owner) owner.holes.push(hole);
  }

  // 아이템은 소속 폴리곤을 따라간다(§7.5). 어느 조각에도 없으면 탈락.
  const droppedItems = [];
  for (const item of hull.items ?? []) {
    const owner = smallestContainer(pieces, item);
    if (owner) owner.items.push(item);
    else droppedItems.push(item);
  }

  // 최소 파편 크기 미만 소멸
  const kept = [];
  let droppedArea = 0;
  let droppedPieces = 0;
  for (const piece of pieces) {
    if (netArea(piece) < opt.minPieceArea) {
      droppedArea += netArea(piece);
      droppedPieces++;
      droppedItems.push(...piece.items);
      continue;
    }
    kept.push(piece);
  }

  const areaAfter = kept.reduce((s, p) => s + netArea(p), 0);

  return {
    pieces: kept,
    removedArea: areaBefore - areaAfter,
    droppedPieces,
    droppedArea,
    droppedItems,
    /** 조각이 둘 이상이면 절단 — 버그가 아니라 공식 기능(§7.3.3). */
    split: kept.length > 1,
    destroyed: kept.length === 0,
    ms: performance.now() - t0,
  };
}

/** 원형 충격(포탄·암초)용 브러시. */
export function makeCircleBrush(center, radius, steps = CARVE_DEFAULTS.brushSteps) {
  return circleBrush(center.x, center.y, radius, steps);
}

function netArea(piece) {
  return Math.abs(polygonArea(piece.outline))
    - piece.holes.reduce((s, h) => s + Math.abs(polygonArea(h)), 0);
}

/** 점을 포함하는 조각 중 면적이 가장 작은 것 (중첩 링 대비). */
function smallestContainer(pieces, pt) {
  let best = null;
  let bestArea = Infinity;
  for (const piece of pieces) {
    if (!pointInPolygon(pt, piece.outline)) continue;
    if (piece.holes.some((h) => pointInPolygon(pt, h))) continue;
    const a = Math.abs(polygonArea(piece.outline));
    if (a < bestArea) {
      best = piece;
      bestArea = a;
    }
  }
  return best;
}
