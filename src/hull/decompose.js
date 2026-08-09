// 볼록 분해 — Box2D 계열은 볼록 폴리곤 fixture 만 받으므로 선체를 잘게 나눠야 한다.
//
// 구멍이 없으면 poly-decomp(파트 수가 적어 fixture 가 적다), 구멍이 있으면 earcut(구멍 지원).
// 파손으로 선체 가운데가 뚫리면 후자 경로를 타게 된다 — 즉 D3 에서 반드시 쓰이는 분기다.
import polyDecomp from 'poly-decomp';
import earcut from 'earcut';
import { Settings } from 'planck';
import { polygonArea } from '../geom/poly.js';

const { quickDecomp, makeCCW, removeCollinearPoints, removeDuplicatePoints } = polyDecomp;

/** planck 의 fixture 당 정점 한계 (기본 12). */
export const MAX_FIXTURE_VERTS = Settings.maxPolygonVertices;
/** 이보다 작은 조각은 물리적으로 불안정해서 버린다. */
const MIN_PART_AREA = 2e-4;

/**
 * @param {Array<{x,y}>} outline CCW 외곽선
 * @param {Array<Array<{x,y}>>} holes 구멍 링 (있으면 earcut 경로)
 * @returns {Array<Array<{x,y}>>} 볼록 파트 목록 (각각 CCW, 정점 ≤ MAX_FIXTURE_VERTS)
 */
export function decomposeHull(outline, holes = []) {
  if (holes.length > 0) return triangulate(outline, holes);

  const poly = outline.map((p) => [p.x, p.y]);
  removeDuplicatePoints(poly, 1e-4);
  removeCollinearPoints(poly, 0.005);
  if (poly.length < 3) return [];
  makeCCW(poly);

  let parts = null;
  try {
    parts = quickDecomp(poly);
  } catch {
    parts = null; // 병적인 입력이면 삼각분할로 폴백
  }
  if (!parts || parts.length === 0) return triangulate(outline, []);

  const out = [];
  for (const part of parts) {
    if (part.length < 3) continue;
    if (part.length > MAX_FIXTURE_VERTS) {
      out.push(...triangulate(part.map(([x, y]) => ({ x, y })), []));
    } else {
      out.push(part.map(([x, y]) => ({ x, y })));
    }
  }
  return out.filter(isUsable).map(toCCW);
}

/** earcut 삼각분할 — 구멍을 지원하고 어떤 단순 폴리곤에도 실패하지 않는다. */
function triangulate(outline, holes) {
  const verts = [];
  const holeIndices = [];
  for (const p of outline) verts.push(p.x, p.y);
  for (const hole of holes) {
    holeIndices.push(verts.length / 2);
    for (const p of hole) verts.push(p.x, p.y);
  }

  const indices = earcut(verts, holeIndices.length ? holeIndices : null, 2);
  const parts = [];
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const idx = indices[i + k] * 2;
      tri.push({ x: verts[idx], y: verts[idx + 1] });
    }
    parts.push(tri);
  }
  return parts.filter(isUsable).map(toCCW);
}

function isUsable(part) {
  return part.length >= 3 && Math.abs(polygonArea(part)) >= MIN_PART_AREA;
}

function toCCW(part) {
  return polygonArea(part) < 0 ? part.slice().reverse() : part;
}
