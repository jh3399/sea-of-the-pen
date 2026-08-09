// 선체 폴리곤 → 고정 픽셀 표면.
//
// 물리는 폴리곤이 진실이고, 이 모듈은 그 면적을 출항 때 정한 격자에 투영할 뿐이다. 파손 뒤
// 새 격자를 만들지 않고 기존 셀만 조각에 나누므로 도트가 재배치되거나 되살아날 수 없다.
import { bounds, pointInPolygon } from '../geom/poly.js';

export const HULL_PIXEL_COLS = 28;
export const HULL_PIXEL_MIN = 0.05;
export const HULL_PIXEL_MAX = 0.3;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** 외곽선 안이면서 어느 구멍에도 속하지 않는 선체의 실질 면적. */
export function pointInHullSolid(point, outline, holes = []) {
  if (!outline?.length || !pointInPolygon(point, outline)) return false;
  return !holes.some((hole) => hole?.length && pointInPolygon(point, hole));
}

/** 안정적인 셀 ID. 렌더의 이웃 판정과 벤치의 단조 감소 검사가 함께 쓴다. */
export function surfaceCellKey(cell) {
  return `${cell.col},${cell.row}`;
}

/** 셀의 선체 로컬 중심점. 포함 판정은 생성·파손 분배에서 항상 이 점 하나를 쓴다. */
export function surfaceCellPoint(surface, cell) {
  return {
    x: surface.originX + (cell.col + 0.5) * surface.cell,
    y: surface.originY + (cell.row + 0.5) * surface.cell,
  };
}

/** 출항 형상에서 한 번만 만드는 고정 픽셀 표면. */
export function rasterizeHullSurface({ outline, holes = [] }) {
  if (!outline?.length) return null;
  const bb = bounds(outline);
  if (![bb.minX, bb.minY, bb.maxX, bb.maxY].every(Number.isFinite)) return null;

  const span = Math.max(bb.width, bb.height, 0.4);
  const cell = clamp(span / HULL_PIXEL_COLS, HULL_PIXEL_MIN, HULL_PIXEL_MAX);
  // 원점은 선체 로컬 원점에 고정한다. col/row 가 음수여도 괜찮고, 이후 조각의 무게중심이
  // 이동하면 origin 만 같은 양만큼 옮겨 셀의 월드 위치를 보존한다.
  const surface = { cell, originX: 0, originY: 0, cells: [] };
  const minCol = Math.floor(bb.minX / cell) - 1;
  const maxCol = Math.ceil(bb.maxX / cell) + 1;
  const minRow = Math.floor(bb.minY / cell) - 1;
  const maxRow = Math.ceil(bb.maxY / cell) + 1;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const candidate = { col, row };
      if (pointInHullSolid(surfaceCellPoint(surface, candidate), outline, holes)) {
        surface.cells.push(candidate);
      }
    }
  }
  return surface;
}

/**
 * 기존 표면 셀을 파손 뒤 살아남은 조각에 나눈다. 새 셀은 절대 만들지 않는다.
 * @returns {Array<object|null>} pieces 와 같은 순서의 표면 상태
 */
export function partitionHullSurface(surface, pieces) {
  if (!surface) return pieces.map(() => null);
  const children = pieces.map(() => ({
    cell: surface.cell,
    originX: surface.originX,
    originY: surface.originY,
    cells: [],
  }));

  for (const cell of surface.cells) {
    const point = surfaceCellPoint(surface, cell);
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (!pointInHullSolid(point, piece.outline, piece.holes ?? [])) continue;
      children[i].cells.push(cell);
      break;
    }
  }
  return children;
}

/** 조각 재중심화만큼 격자 원점을 옮긴 독립 표면 객체. */
export function translateHullSurface(surface, dx, dy) {
  if (!surface) return null;
  return {
    cell: surface.cell,
    originX: surface.originX + dx,
    originY: surface.originY + dy,
    cells: surface.cells.map((cell) => ({ ...cell })),
  };
}
