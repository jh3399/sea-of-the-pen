// 기본 장치(§5.1) — 선체 확정 시 자동 장착되는 좌현 노 · 우현 노 · 닻.
//
// §4.1 통일 모델을 그대로 따른다: 아이템은 **부착 위치 · 방향 · 질량** 셋으로만 정의되고,
// 효과는 전부 그 셋과 물리 법칙에서 파생된다. D2 의 아이템 시스템은 이 자료구조를 확장만 한다.
//
// ★ D1 의 키(방향타)는 여기서 빠졌다. 키만 전용 양력식과 전용 튜닝 노브 넷을 갖고 있어
//   "조향 시스템 코드 0줄" 원칙의 유일한 예외였는데, 노를 좌우로 나누면 조향이 τ = −y·F
//   하나로 환원된다. 키는 D2 아이템 카탈로그로 내려가 **고속에서 노가 죽는 구간**을 메우는
//   선택지가 된다 (§5.2 원칙 2 "탈착·교체가 실력 표현").
import { bounds } from '../geom/poly.js';

/**
 * 장치 사양. `station` 은 선미 부착점 → 무게중심(로컬 원점) 사이의 보간 계수다.
 * 0 이면 부착점 그대로(가장 뒤), 1 이면 무게중심.
 *
 * 무게중심 쪽으로 당기는 이유가 둘 있다:
 *  - 선미 끝은 폴리곤 경계라 장치가 선체 밖으로 새기 쉽다 (파손 시 즉시 탈락 판정).
 *  - 팔길이(노 > 닻)에 자연스러운 서열이 생긴다 — §4.2 "후미일수록 효과적".
 */
export const DEVICE_SPECS = {
  oarPort: {
    type: 'oar', side: 'port', name: '좌현 노',
    mass: 12, material: 'wood', station: 0.28, bind: '↑↓→',
  },
  oarStarboard: {
    type: 'oar', side: 'starboard', name: '우현 노',
    mass: 12, material: 'wood', station: 0.28, bind: '↑↓←',
  },
  anchor: {
    type: 'anchor', name: '기본 닻',
    mass: 60, material: 'iron', station: 0.5, bind: 'Space',
  },
};

/** 후미 구간을 잘라내는 비율 — 이 안에서만 부착점 y 를 찾는다. */
const STERN_BAND = 0.15;
/** 부착점 x — 선미 끝에서 살짝 안쪽. 경계에 정확히 얹으면 내부 판정이 불안정하다. */
const STERN_INSET = 0.08;
/** 후미 구간을 훑는 단면 수. */
const STERN_SAMPLES = 7;

/** 노 부착점을 정할 때 station 주변을 훑는 밴드 폭 (선체 길이 비율)과 단면 수. */
const OAR_BAND = 0.06;
const OAR_SAMPLES = 5;
/** 노를 현측으로 얼마나 벌리는가 — 반폭의 이 비율. 1.0 이면 경계 위라 파손 판정이 불안정하다. */
const OAR_INSET = 0.8;

/**
 * x = station 인 세로선이 폴리곤을 자른 구간(최소 y ~ 최대 y).
 *
 * 정점의 y 최소·최대를 그냥 쓰지 않고 **변을 잘라 보간**하는 이유: 정점 min/max 는 어느
 * 정점이 구간 안에 떨어졌는지에 좌우돼 RDP 단순화가 만든 미세한 비대칭을 그대로 증폭한다.
 * (실측: 완전 대칭인 원형 코퍼스가 6.5 cm 의 가짜 오프셋을 얻어 저절로 선회했다.)
 */
function spanAtX(outline, station) {
  let lo = Infinity;
  let hi = -Infinity;
  let hits = 0;
  for (let i = 0, n = outline.length; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    if ((a.x <= station) === (b.x <= station)) continue; // 이 변은 세로선을 가로지르지 않는다
    const y = a.y + ((b.y - a.y) * (station - a.x)) / (b.x - a.x);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
    hits++;
  }
  return hits >= 2 ? { lo, hi, width: hi - lo } : null;
}

/**
 * 선체 로컬 폴리곤에서 선미 부착점을 뽑는다.
 *
 * 후미 구간을 여러 단면으로 훑어 각 단면의 y 중앙을 **폭으로 가중 평균**한다. 넓은 단면일수록
 * 그 자리에 실제 선체가 많다는 뜻이라 부착점으로서 신뢰도가 높다.
 *
 * @param {Array<{x,y}>} outline 무게중심 원점, +X = 뱃머리
 * @returns {{x:number, y:number, spanY:number}} spanY = 후미 구간의 대표 선폭 (진단용)
 */
export function sternAnchor(outline) {
  const bb = bounds(outline);
  if (!(bb.width > 0)) return { x: 0, y: 0, spanY: 0 };

  let weight = 0;
  let acc = 0;
  let spanY = 0;
  for (let i = 0; i < STERN_SAMPLES; i++) {
    const ratio = (STERN_BAND * (i + 1)) / STERN_SAMPLES;
    const span = spanAtX(outline, bb.minX + bb.width * ratio);
    if (!span || !(span.width > 0)) continue;
    acc += ((span.lo + span.hi) / 2) * span.width;
    weight += span.width;
    spanY = Math.max(spanY, span.width);
  }

  // 후미가 뾰족해 단면이 잡히지 않으면 가장 뒤쪽 정점으로 대신한다.
  if (weight <= 0) {
    let aft = outline[0];
    for (const p of outline) if (p.x < aft.x) aft = p;
    return { x: bb.minX + bb.width * STERN_INSET, y: aft.y, spanY: 0 };
  }

  return { x: bb.minX + bb.width * STERN_INSET, y: acc / weight, spanY };
}

/**
 * ★ 좌현·우현 노의 부착점 — x 주변 밴드를 여러 단면 훑어 **반폭을 폭 가중 평균**한 뒤
 * 주어진 중심선에서 양현으로 벌린다. sternAnchor 와 같은 이유로 정점 min/max 는 쓰지 않는다.
 *
 * ⚠ **중심선(centerY)은 호출자가 준다.** 여기서 잰 국소 중심(`center`)을 그대로 쓰면 안 된다 —
 * 두 노의 y 합이 곧 "양쪽을 고르게 저어도 남는 토크"인데, 단면 하나의 중심은 RDP 단순화가
 * 만든 미세 비대칭에 그대로 흔들린다. 실측: 완전 대칭인 원형 코퍼스가 1.0 cm 의 가짜 중심
 * 어긋남을 얻어 20초에 10° 돌았다 (D1 에서 한 번 잡았던 버그가 좌우 노에서 되살아난 것).
 * `sternAnchor` 는 후미 밴드를 7단면 훑어 같은 오차를 0.6 cm 로 눌러 놓았으므로 그 값을 쓴다.
 *
 * 조향은 여기서 나오는 두 수치가 전부다:
 *  - **반폭** → 한쪽만 저을 때의 팔길이 (넓은 배가 잘 돈다)
 *  - **중심선의 y** → 양쪽을 저어도 남는 토크 (비대칭 배가 저절로 돈다)
 *
 * @param {Array<{x,y}>} outline 선체 로컬 폴리곤
 * @param {number} x 부착점의 세로 위치
 * @param {number|null} centerY 노 쌍의 중심선. null 이면 국소 중심을 쓴다 (진단용).
 * @returns {{port:{x,y}, starboard:{x,y}, center:number, halfBeam:number}}
 */
export function sideAnchors(outline, x, centerY = null) {
  const bb = bounds(outline);
  let weight = 0;
  let accCenter = 0;
  let accHalf = 0;

  for (let i = 0; i < OAR_SAMPLES; i++) {
    const offset = bb.width * OAR_BAND * (i / (OAR_SAMPLES - 1) - 0.5);
    const span = spanAtX(outline, x + offset);
    if (!span || !(span.width > 0)) continue;
    accCenter += ((span.lo + span.hi) / 2) * span.width;
    accHalf += (span.width / 2) * span.width;
    weight += span.width;
  }

  if (weight <= 0) {
    const c = centerY ?? 0;
    return { port: { x, y: c }, starboard: { x, y: c }, center: 0, halfBeam: 0 };
  }

  const center = accCenter / weight;
  const half = (accHalf / weight) * OAR_INSET;
  const axis = centerY ?? center;
  return {
    port: { x, y: axis + half },
    starboard: { x, y: axis - half },
    center,
    halfBeam: half,
  };
}

/**
 * 기본 장치를 선체에 자동 배치한다.
 * 반환 형식은 `hull.items` 와 동일 — 파손 시 소속 폴리곤 판정(§7.5)을 그대로 탄다.
 * @param {Array<{x,y}>} outline 선체 로컬 폴리곤
 */
export function defaultDevices(outline) {
  const a = sternAnchor(outline);
  return Object.entries(DEVICE_SPECS).map(([key, spec]) => {
    // 먼저 선미 부착점을 무게중심 쪽으로 당겨 station 좌표를 잡고,
    const x = a.x * (1 - spec.station);
    const y = a.y * (1 - spec.station);
    const at = spec.side
      // 노라면 그 중심선에서 그 자리의 실제 선폭만큼 현측으로 벌린다.
      // (중심선은 sternAnchor 것을 그대로 쓴다 — sideAnchors 주석의 ⚠ 참조.)
      ? sideAnchors(outline, x, y)[spec.side]
      : { x, y };

    return {
      key,
      type: spec.type,
      side: spec.side ?? null,
      name: spec.name,
      bind: spec.bind,
      mass: spec.mass,
      material: spec.material,
      angle: 0, // §4.1 의 "방향". 기본 장치는 전부 선체 정면(+X) 기준이다.
      x: at.x,
      y: at.y,
    };
  });
}

/** 장치 질량 합 — `computeHullParams(outline, { extraMass })` 로 흘수에 반영된다. */
export function deviceExtraMass(devices) {
  let sum = 0;
  for (const d of devices) sum += d.mass ?? 0;
  return sum;
}
