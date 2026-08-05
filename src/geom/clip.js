// clipper2-js 어댑터.
// clipper2 는 정수 좌표(Path64)에서 동작하므로 물리 유닛(m)에 스케일을 곱해 넣고 되돌린다.
// 이 파일이 스파이크 ①(자기교차 제거)과 ②(불리언 차감)의 공통 바닥이다.
import { Clipper, FillRule, Paths64, Point64, PointInPolygonResult } from 'clipper2-js';

/** 1 m = 1000 정수 단위 (mm 정밀도). 선체가 수 m 규모라 int 범위는 넉넉하다. */
export const CLIPPER_SCALE = 1000;

export function toPath64(pts) {
  const flat = new Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    flat[i * 2] = Math.round(pts[i].x * CLIPPER_SCALE);
    flat[i * 2 + 1] = Math.round(pts[i].y * CLIPPER_SCALE);
  }
  return Clipper.makePath(flat);
}

export function toPaths64(polys) {
  const out = new Paths64();
  for (const poly of polys) out.push(toPath64(poly));
  return out;
}

export function fromPath64(path) {
  const out = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    out[i] = { x: path[i].x / CLIPPER_SCALE, y: path[i].y / CLIPPER_SCALE };
  }
  return out;
}

export function fromPaths64(paths) {
  return Array.from(paths, fromPath64);
}

/**
 * 자기교차 제거 — NonZero 규칙으로 자기 자신과 Union.
 * 별도의 Bentley-Ottmann 구현 없이 clipper2 하나로 해결되는 지점이고,
 * 8자 곡선처럼 로브가 둘이면 결과 링도 둘로 갈라져 나온다.
 * @returns {{outers: Array, holes: Array}} 물리 유닛 링 배열
 */
export function unionSelf(pts) {
  const subject = new Paths64();
  subject.push(toPath64(pts));
  const result = Clipper.Union(subject, new Paths64(), FillRule.NonZero);
  return splitRings(result);
}

/**
 * 선체에서 브러시 영역을 차감 (파손 지오메트리의 핵심 연산).
 * @param {Array<Array<{x,y}>>} subjectPolys 외곽 + 구멍 링
 * @param {Array<Array<{x,y}>>} brushPolys 깎아낼 영역
 */
export function differencePolys(subjectPolys, brushPolys) {
  const result = Clipper.Difference(
    toPaths64(subjectPolys),
    toPaths64(brushPolys),
    FillRule.NonZero,
  );
  return splitRings(result);
}

/** clipper 결과를 외곽(양의 면적) / 구멍(음의 면적)으로 분리. */
function splitRings(paths) {
  const outers = [];
  const holes = [];
  for (const path of paths) {
    if (path.length < 3) continue;
    const ring = fromPath64(path);
    // clipper2 는 출력 방향을 정규화한다: 외곽은 양, 구멍은 음.
    if (Clipper.area(path) > 0) outers.push(ring);
    else holes.push(ring);
  }
  return { outers, holes };
}

/** 닫힌 경로 RDP 단순화 + 중복점 제거. epsilon 은 물리 유닛(m). */
export function simplifyClosed(pts, epsilon) {
  const path = Clipper.stripDuplicates(toPath64(pts), true);
  const simplified = Clipper.simplifyPath(path, epsilon * CLIPPER_SCALE, true);
  return fromPath64(simplified);
}

/** 원형 브러시 — 파손 차감에 쓰는 다각형 근사. steps 를 줄이면 차감 비용이 준다. */
export function circleBrush(cx, cy, radius, steps = 12) {
  const path = Clipper.ellipse(
    new Point64(Math.round(cx * CLIPPER_SCALE), Math.round(cy * CLIPPER_SCALE)),
    radius * CLIPPER_SCALE,
    radius * CLIPPER_SCALE,
    steps,
  );
  return fromPath64(path);
}

/** 'in' | 'out' | 'on' */
export function classifyPoint(pt, poly) {
  const r = Clipper.pointInPolygon(
    new Point64(Math.round(pt.x * CLIPPER_SCALE), Math.round(pt.y * CLIPPER_SCALE)),
    toPath64(poly),
  );
  if (r === PointInPolygonResult.IsInside) return 'in';
  if (r === PointInPolygonResult.IsOn) return 'on';
  return 'out';
}
