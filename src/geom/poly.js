// 순수 폴리곤 기하 — 물리 유닛(m), Y-up, CCW = 양의 면적.
// 여기 있는 값들이 설계 문서 §2.1의 3대 파라미터 산출 근거가 된다.

/**
 * 폴리곤의 면적·무게중심·2차 모멘트를 한 번의 순회로 구한다.
 * 반환되는 Ixx/Iyy/Ixy는 **무게중심 기준**(평행축 이동 완료).
 */
export function polygonMoments(pts) {
  const n = pts.length;
  if (n < 3) return null;

  let a2 = 0, cxAcc = 0, cyAcc = 0, ixx = 0, iyy = 0, ixy = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cxAcc += (p.x + q.x) * cross;
    cyAcc += (p.y + q.y) * cross;
    ixx += cross * (p.y * p.y + p.y * q.y + q.y * q.y);
    iyy += cross * (p.x * p.x + p.x * q.x + q.x * q.x);
    ixy += cross * (p.x * q.y + 2 * p.x * p.y + 2 * q.x * q.y + q.x * p.y);
  }

  const area = a2 / 2;
  if (Math.abs(area) < 1e-12) return null;

  const cx = cxAcc / (6 * area);
  const cy = cyAcc / (6 * area);

  // 원점 기준 → 무게중심 기준 (평행축 정리)
  const ixxC = ixx / 12 - area * cy * cy;
  const iyyC = iyy / 12 - area * cx * cx;
  const ixyC = ixy / 24 - area * cx * cy;

  return { area, cx, cy, ixx: ixxC, iyy: iyyC, ixy: ixyC };
}

export function polygonArea(pts) {
  let a2 = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a2 += p.x * q.y - q.x * p.y;
  }
  return a2 / 2;
}

/** CCW(양의 면적)로 정규화. 필요하면 뒤집은 새 배열을 준다. */
export function ensureCCW(pts) {
  return polygonArea(pts) < 0 ? pts.slice().reverse() : pts;
}

/**
 * 면적 분포의 주축 각도 (PCA). 길쭉한 배의 "앞뒤" 방향을 찾는 데 쓴다.
 * 무게중심 기준 2차 모멘트를 면적으로 나누면 곧 좌표 분산이므로, 최대 분산 방향이 장축이다.
 */
export function principalAngle(moments) {
  const { area, ixx, iyy, ixy } = moments;
  const varX = iyy / area; // ∫x² dA / A
  const varY = ixx / area; // ∫y² dA / A
  const covXY = ixy / area;
  return 0.5 * Math.atan2(2 * covXY, varX - varY);
}

/** 방향 (ux, uy) 축 위로 폴리곤을 투영했을 때의 폭. 저항 타원의 "정면 폭" 산출에 쓴다. */
export function projectedExtent(pts, ux, uy) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const t = p.x * ux + p.y * uy;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return max - min;
}

export function bounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function translate(pts, dx, dy) {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function rotate(pts, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

/** 연속한 중복/근접 점 제거 — pointermove 가 뿜는 잉여 점을 먼저 걷어낸다. */
export function dedupe(pts, minDist = 1e-4) {
  if (pts.length === 0) return [];
  const out = [pts[0]];
  const minSq = minDist * minDist;
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy >= minSq) out.push(b);
  }
  return out;
}

/**
 * 같은 정점을 두 번 지나는 "핀치" 지점에서 링을 독립 루프로 분리한다.
 *
 * 8자를 그리면 두 로브가 교차점 한 점에서만 이어진 폴리곤이 나온다. 물리적으로 그건 이미
 * 잘린 배이고 강체로 삼으면 퇴화한 경첩이 되므로, 여기서 갈라놓고 큰 쪽만 선체로 쓴다.
 */
export function splitAtRepeatedVertices(ring) {
  const loops = [];
  const stack = [];
  const index = new Map();
  const keyOf = (p) => `${p.x},${p.y}`;

  for (const p of ring) {
    const k = keyOf(p);
    if (index.has(k)) {
      const start = index.get(k);
      const loop = stack.splice(start);
      for (const q of loop) index.delete(keyOf(q));
      if (loop.length >= 3) loops.push(loop);
    }
    index.set(k, stack.length);
    stack.push(p);
  }
  if (stack.length >= 3) loops.push(stack);
  return loops.length ? loops : [ring];
}

/** 짝수-홀수 규칙 점-내부 판정 (파편 소속 아이템 판정용 경량 버전). */
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
