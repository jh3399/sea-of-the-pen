// ★ 스파이크 ① — 손그림 폐곡선 → 물리 폴리곤
//
// 파이프라인: 중복점 제거 → 픽셀→물리 유닛(Y 뒤집기) → 폐곡선화 → 자기교차 제거(clipper2
// NonZero Union) → RDP 단순화 → 정점 상한 클램프 → CCW 정규화 → 무게중심·주축 정규화.
//
// 자기교차 보정을 직접 구현하지 않고 clipper2 의 NonZero Union 으로 처리하는 것이 이 모듈의
// 핵심 판단이다. 스파이크 ②(차감)와 같은 라이브러리를 쓰므로 검증 대상도 하나로 줄어든다.
import polyDecomp from 'poly-decomp';
import { unionSelf, simplifyClosed } from '../geom/clip.js';
import {
  polygonMoments, principalAngle, ensureCCW, polygonArea, splitAtRepeatedVertices,
  dedupe, translate, rotate, bounds,
} from '../geom/poly.js';

export const HULL_DEFAULTS = {
  pixelsPerMeter: 40,
  /** RDP 시작 epsilon (m). 40 px/m 기준 약 2 px. */
  epsilon: 0.05,
  /** planck 의 fixture 당 정점 한계와 성능을 함께 고려한 외곽선 상한. */
  maxVerts: 64,
  /** 이보다 작으면 배로 인정하지 않는다 (§2.3 최소 면적 제한). */
  minArea: 0.5,
  maxArea: 400,
  /** 시작점과 끝점이 이 거리를 넘으면 "열린 곡선" 경고 (자동 연결은 그대로 수행). */
  closeGapTolerance: 1.2,
};

/**
 * 캔버스 스트로크(px, Y-down) → 선체 폴리곤(m, Y-up).
 *
 * 반환하는 outline 은 **선체 로컬 좌표**다: 무게중심이 원점, 주축(장축)이 +X = 뱃머리 방향.
 * 월드 배치는 `origin` + `angle` 로 복원한다 — world = origin + R(angle)·local.
 */
export function strokeToHull(rawPoints, options = {}) {
  const opt = { ...HULL_DEFAULTS, ...options };
  const t0 = performance.now();
  const diag = { rawPoints: rawPoints.length, warnings: [] };

  if (rawPoints.length < 3) {
    return fail('empty', '점이 너무 적다', diag, t0);
  }

  // 1. 중복점 제거 후 물리 유닛으로. 캔버스는 Y-down, 물리 세계는 Y-up 이라 여기서 뒤집는다.
  const ppm = opt.pixelsPerMeter;
  const deduped = dedupe(rawPoints, 0.75); // px 단위 임계
  const metric = deduped.map((p) => ({ x: p.x / ppm, y: -p.y / ppm }));
  diag.dedupedPoints = metric.length;

  if (metric.length < 3) {
    return fail('degenerate', '유효한 점이 3개 미만', diag, t0);
  }

  // 2. 폐곡선화 — clipper 는 경로를 닫힌 것으로 보므로 실제 연결은 필요 없고, 벌어진 정도만 알린다.
  const first = metric[0];
  const last = metric[metric.length - 1];
  diag.closeGap = Math.hypot(last.x - first.x, last.y - first.y);
  if (diag.closeGap > opt.closeGapTolerance) diag.warnings.push('openCurve');

  // 3. 자기교차 제거. 교차 방식에 따라 결과가 두 갈래다:
  //    - 정점이 아닌 곳에서 가로지르면 clipper 가 링을 여러 개로 쪼개 준다.
  //    - 정점에서 만나면 한 점으로 이어진 "핀치" 링이 나오므로 우리가 갈라야 한다.
  //    두 경우 모두 가장 큰 루프 하나만 선체로 삼는다.
  const rawArea = Math.abs(polygonArea(metric));
  const { outers, holes } = unionSelf(metric);
  diag.ringsAfterUnion = outers.length;
  diag.holesDropped = holes.length;
  if (outers.length === 0) {
    return fail('degenerate', '면적이 없는 경로', diag, t0);
  }

  const unionArea = outers.reduce((s, r) => s + Math.abs(polygonArea(r)), 0)
    - holes.reduce((s, h) => s + Math.abs(polygonArea(h)), 0);
  if (Math.abs(unionArea - rawArea) > 0.02 * Math.max(rawArea, unionArea, 1e-6)) {
    diag.warnings.push('selfIntersect');
  }
  if (outers.length > 1) diag.warnings.push('multiRing');
  if (holes.length > 0) diag.warnings.push('holesDropped');

  const loops = outers.flatMap(splitAtRepeatedVertices);
  diag.loops = loops.length;
  if (loops.length > outers.length) diag.warnings.push('pinchSplit');

  let ring = loops.reduce((best, r) =>
    Math.abs(polygonArea(r)) > Math.abs(polygonArea(best)) ? r : best);

  // 4. RDP 단순화 + 정점 상한. 상한을 넘으면 epsilon 을 키워가며 다시 줄인다.
  diag.vertsBeforeSimplify = ring.length;
  let eps = opt.epsilon;
  ring = simplifyClosed(ring, eps);
  let guard = 0;
  while (ring.length > opt.maxVerts && guard++ < 12) {
    eps *= 1.6;
    ring = simplifyClosed(ring, eps);
  }
  diag.epsilonUsed = eps;
  diag.verts = ring.length;

  if (ring.length < 3) {
    return fail('degenerate', '단순화 후 정점 부족', diag, t0);
  }

  // 5. CCW 정규화 후 면적 검사
  ring = ensureCCW(ring);
  const moments = polygonMoments(ring);
  if (!moments) return fail('degenerate', '모멘트 계산 불가', diag, t0);

  diag.area = moments.area;
  if (moments.area < opt.minArea) return fail('tooSmall', '선체가 너무 작다', diag, t0);
  if (moments.area > opt.maxArea) return fail('tooBig', '선체가 너무 크다', diag, t0);

  // 6. 로컬 정규화 — 무게중심을 원점으로, 주축을 +X 로.
  const angle = principalAngle(moments);
  let local = rotate(translate(ring, -moments.cx, -moments.cy), -angle);

  // 뱃머리 판정 휴리스틱: 무게중심 대비 bbox 중심이 +X 쪽이면 +X 끝이 가늘다 → 그쪽이 뱃머리.
  const bb = bounds(local);
  let heading = angle;
  if ((bb.minX + bb.maxX) / 2 < 0) {
    local = rotate(local, Math.PI);
    heading = angle + Math.PI;
  }

  // 보정이 실제로 성공했는지 최종 확인 — 자기교차가 남아 있으면 볼록 분해가 깨진다.
  diag.simple = polyDecomp.isSimple(local.map((p) => [p.x, p.y]));
  if (!diag.simple) diag.warnings.push('notSimple');

  diag.ms = performance.now() - t0;

  return {
    ok: true,
    outline: local,
    origin: { x: moments.cx, y: moments.cy },
    angle: heading,
    diagnostics: diag,
    warnings: diag.warnings,
  };
}

/**
 * 월드 좌표 → 선체 로컬 좌표. `strokeToHull` 이 낸 배치의 **역변환**이다
 * (world = origin + R(angle)·local 이므로 local = R(−angle)·(world − origin)).
 *
 * 이 파일에 두는 이유는 CLAUDE.md 의 규약이다 — 캔버스는 Y-down, 물리 세계는 Y-up 이고
 * 그 사이의 변환은 여기 한 곳에서만 한다. 아이템 부착점도 주인공의 자리도 같은 식을 쓴다.
 *
 * @param {{origin:{x,y}, angle:number}} placement strokeToHull 결과 (또는 같은 모양)
 * @param {{x:number, y:number}} worldPoint
 */
export function toHullLocal(placement, worldPoint) {
  const dx = worldPoint.x - placement.origin.x;
  const dy = worldPoint.y - placement.origin.y;
  const c = Math.cos(-placement.angle);
  const s = Math.sin(-placement.angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function fail(reason, message, diag, t0) {
  diag.ms = performance.now() - t0;
  return { ok: false, reason, message, diagnostics: diag, warnings: diag.warnings };
}
