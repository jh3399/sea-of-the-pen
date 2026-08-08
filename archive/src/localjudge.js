// 로컬 판정 — AI 없이 코드로만 채점한다. 즉시·무료·오프라인.
//
// 왜 로컬인가: 게임 진행을 좌우하는 판정(배가 박살나는지, 도안을 얼마나 정확히
// 따라 그렸는지)이 네트워크에 걸려 있으면 시연 중 한 번의 통신 실패로 게임이 멈춘다.
// AI는 "무엇을 그렸는가"를 알아보고 세렌의 코멘트를 붙이는 데 쓰고(judge.js),
// 진행 판정은 전부 여기서 처리한다.
//
//   shipQuality(strokes, w, h)          배로서 성립하는가 → 박살/약함/양호/훌륭
//   traceScore(strokes, guideStrokes, w, h)  도안을 얼마나 정확히 따라 그렸나 (0~100)
//   emblemQuality(strokes, w, h)        마크(로고)로 쓸 만한가

// ---------------- 공통 유틸 ----------------

/** 스트로크(점 배열)들을 일정 간격으로 리샘플링해 점 목록으로 만든다 */
function samplePoints(strokes, step = 4) {
  const pts = [];
  for (const s of strokes) {
    const p = s.points || s;                 // DrawingCanvas 스트로크 / 생 배열 모두 허용
    if (!p || p.length < 2) continue;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1];
      const b = p[i];
      const ax = a.x ?? a[0];
      const ay = a.y ?? a[1];
      const bx = b.x ?? b[0];
      const by = b.y ?? b[1];
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      }
    }
    const last = p[p.length - 1];
    pts.push([last.x ?? last[0], last.y ?? last[1]]);
  }
  return pts;
}

/** 점들의 바운딩 박스 */
function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * 점 집합 A의 각 점에서 점 집합 B까지의 최근접 거리 — 격자 해싱으로 O(n).
 * 전수 비교하면 점이 수천 개일 때 프레임이 끊긴다.
 */
function makeGrid(pts, cell) {
  const map = new Map();
  for (const p of pts) {
    const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    let arr = map.get(key);
    if (!arr) map.set(key, (arr = []));
    arr.push(p);
  }
  return { map, cell };
}

function nearestDist(grid, x, y, maxRings = 2) {
  const cx = Math.floor(x / grid.cell);
  const cy = Math.floor(y / grid.cell);
  let best = Infinity;
  for (let ring = 0; ring <= maxRings; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue; // 링 테두리만
        const arr = grid.map.get(`${cx + dx},${cy + dy}`);
        if (!arr) continue;
        for (const p of arr) {
          const d = Math.hypot(p[0] - x, p[1] - y);
          if (d < best) best = d;
        }
      }
    }
    if (best <= grid.cell * ring) break; // 이 링 안에서 확정
  }
  return best;
}

// ---------------- 1) 배 품질 (박살 판정) ----------------

/**
 * 배로서 성립하는지 코드로 판정한다.
 * 무엇을 그렸는지는 모르지만, "성의 없는 낙서"와 "배 비슷한 형태"는 구분할 수 있다.
 *
 * 보는 것:
 *  - 잉크 양   : 총 선 길이 (화면 대각선 대비)
 *  - 채움      : 그림이 캔버스에서 차지하는 면적
 *  - 구조      : 스트로크 개수 (선 하나 찍 = 배가 아니다)
 *  - 가로 골격 : 선체는 가로로 길다
 *  - 세로 요소 : 돛대/돛이 있으면 배답다
 *
 * @returns { score, verdict: 'wreck'|'weak'|'ok'|'great', reason, detail }
 */
export function shipQuality(strokes, w, h) {
  // 캔버스 크기가 0이면 모든 비율이 NaN이 되고, NaN 비교는 전부 false라
  // 아무 검사도 통과해 버린다. 여기서 먼저 막는다.
  if (!(w > 0) || !(h > 0)) {
    return { score: 0, verdict: 'unknown', reason: '캔버스 크기를 알 수 없다', detail: {} };
  }

  const pts = samplePoints(strokes, 4);
  const valid = strokes.filter((s) => (s.points || s).length >= 2);

  if (pts.length < 8 || valid.length === 0) {
    return { score: 0, verdict: 'wreck', reason: '거의 아무것도 그리지 않았다', detail: {} };
  }

  const diag = Math.hypot(w, h);
  const box = bbox(pts);

  // 총 선 길이 (대각선 대비 몇 배를 그었나)
  let totalLen = 0;
  for (const s of valid) {
    const p = s.points || s;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      totalLen += Math.hypot((b.x ?? b[0]) - (a.x ?? a[0]), (b.y ?? b[1]) - (a.y ?? a[1]));
    }
  }
  const inkRatio = totalLen / diag;                       // 낙서 1획 ≈ 0.3, 배 한 척 ≈ 3~8
  const fill = (box.w * box.h) / (w * h);                 // 캔버스 점유 면적
  const aspect = box.h > 0 ? box.w / box.h : 0;           // 배는 대체로 가로로 길다

  // 가로 골격: 가장 긴 스트로크가 얼마나 가로로 뻗었나 (선체)
  let hullSpan = 0;
  for (const s of valid) {
    const b = bbox(samplePoints([s], 6));
    if (b.w > hullSpan) hullSpan = b.w;
  }
  const hullRatio = hullSpan / w;

  // 세로 요소: 세로가 가로보다 뚜렷하게 긴 스트로크 (돛대·돛)
  const mastCount = valid.filter((s) => {
    const b = bbox(samplePoints([s], 6));
    return b.h > b.w * 1.4 && b.h > h * 0.12;
  }).length;

  // 점수 조합 (각 항목 0..1)
  const sInk = Math.min(1, inkRatio / 3.2);
  const sFill = Math.min(1, fill / 0.22);
  const sParts = Math.min(1, valid.length / 4);
  const sHull = Math.min(1, hullRatio / 0.45);
  const sMast = Math.min(1, mastCount / 1);
  const sShape = aspect >= 0.7 && aspect <= 4.5 ? 1 : 0.45;   // 지나치게 세로로 긴 그림은 배가 아니다

  const raw = sInk * 0.26 + sFill * 0.18 + sParts * 0.14 + sHull * 0.22 + sMast * 0.12 + sShape * 0.08;
  const score = Math.round(raw * 100);

  // 38점 = "선을 두어 개라도 겹쳐 배 비슷한 형태를 만들었나"의 경계.
  // 한 획 찍 그은 것(≈30)은 가라앉고, 선체 두 줄짜리 허름한 배(≈46)는 뜬다.
  let verdict = 'great';
  let reason = '선체도 돛도 갖춘 훌륭한 배다';
  if (score < 38) {
    verdict = 'wreck';
    reason = pts.length < 40 ? '너무 성의 없이 그렸다' : '배라고 부르기 어려운 형태다';
  } else if (score < 45) {
    verdict = 'weak';
    reason = mastCount === 0 ? '돛대가 없어 위태롭다' : '부실하지만 어떻게든 뜬다';
  } else if (score < 70) {
    verdict = 'ok';
    reason = '그럭저럭 바다에 나갈 만하다';
  }

  return {
    score,
    verdict,
    reason,
    detail: {
      inkRatio: +inkRatio.toFixed(2),
      fill: +fill.toFixed(3),
      strokes: valid.length,
      hullRatio: +hullRatio.toFixed(2),
      mastCount,
      aspect: +aspect.toFixed(2),
    },
  };
}

// ---------------- 2) 도안 따라 그리기 정확도 ----------------

/**
 * 도안(정규화 폴리라인)을 얼마나 정확히 따라 그렸는지 채점한다.
 * 두 방향을 모두 본다:
 *  - 재현율(coverage) : 도안 선 중 사용자가 덮은 비율 → 빠뜨리지 않았나
 *  - 정밀도(precision): 사용자 선 중 도안 근처에 있는 비율 → 엉뚱한 데 안 그었나
 * 둘의 조화평균(F1)이라, 대충 다 칠하거나 일부만 정확히 그리면 점수가 안 나온다.
 *
 * @returns { score, coverage, precision, grade: 'S'|'A'|'B'|'C'|'D' }
 */
export function traceScore(strokes, guideStrokes, w, h) {
  const userPts = samplePoints(strokes, 3);
  if (userPts.length < 5) return { score: 0, coverage: 0, precision: 0, grade: 'D' };

  // 도안을 캔버스 좌표로 펼친다
  const guidePts = [];
  for (const gs of guideStrokes) {
    for (let i = 1; i < gs.length; i++) {
      const [ax, ay] = gs[i - 1];
      const [bx, by] = gs[i];
      const x1 = ax * w, y1 = ay * h, x2 = bx * w, y2 = by * h;
      const d = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.ceil(d / 3));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        guidePts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
      }
    }
  }
  if (guidePts.length === 0) return { score: 0, coverage: 0, precision: 0, grade: 'D' };

  // 허용 오차: 캔버스 크기에 비례 (짧은 쪽의 2.6% — 마우스로 그려도 억울하지 않되 등급은 갈리는 폭)
  const tol = Math.min(w, h) * 0.026;
  const cell = tol;

  const userGrid = makeGrid(userPts, cell);
  const guideGrid = makeGrid(guidePts, cell);

  let covered = 0;
  for (const [x, y] of guidePts) if (nearestDist(userGrid, x, y) <= tol) covered++;
  const coverage = covered / guidePts.length;

  let onTarget = 0;
  for (const [x, y] of userPts) if (nearestDist(guideGrid, x, y) <= tol) onTarget++;
  const precision = onTarget / userPts.length;

  const f1 = coverage + precision > 0 ? (2 * coverage * precision) / (coverage + precision) : 0;
  const score = Math.round(f1 * 100);
  const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : 'D';

  return { score, coverage: +coverage.toFixed(3), precision: +precision.toFixed(3), grade };
}

// ---------------- 3) 마크(로고) 품질 ----------------

/**
 * 돛에 새길 마크로 쓸 만한지. 배와 달리 형태는 자유이므로
 * "충분히 그렸는가 + 한 덩어리로 뭉쳐 있는가"만 본다.
 */
export function emblemQuality(strokes, w, h) {
  const pts = samplePoints(strokes, 3);
  if (pts.length < 10) {
    return { ok: false, score: 0, reason: '마크라기엔 너무 단순하다' };
  }
  const box = bbox(pts);
  const diag = Math.hypot(w, h);

  let totalLen = 0;
  for (const s of strokes) {
    const p = s.points || s;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      totalLen += Math.hypot((b.x ?? b[0]) - (a.x ?? a[0]), (b.y ?? b[1]) - (a.y ?? a[1]));
    }
  }
  const inkRatio = totalLen / diag;
  const compact = Math.min(box.w / w, box.h / h);   // 한쪽으로만 긴 선은 마크가 아니다

  const score = Math.round(Math.min(1, inkRatio / 1.6) * 60 + Math.min(1, compact / 0.25) * 40);
  return {
    ok: score >= 30,
    score,
    reason: score >= 30 ? '좋은 마크다' : '조금만 더 그려보자',
  };
}
