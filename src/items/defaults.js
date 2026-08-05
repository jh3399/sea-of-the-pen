// 기본 3종 장치(§5.1) — 선체 확정 시 자동 장착되는 키·노·닻.
//
// §4.1 통일 모델을 그대로 따른다: 아이템은 **부착 위치 · 방향 · 질량** 셋으로만 정의되고,
// 효과는 전부 그 셋과 물리 법칙에서 파생된다. D2 의 아이템 시스템은 이 자료구조를 확장만 한다.
//
// ★ 이 파일의 핵심은 `sternAnchor` 다. 부착점을 "중심선 y=0" 이 아니라 **실제 선체 형상의
//   후미 y 중앙**에서 뽑기 때문에, 비대칭으로 그린 배는 부착점이 무게중심 축을 벗어나고
//   → 노 추력이 팔길이를 얻고 → 토크가 생겨 **직진 입력만으로 저절로 선회한다.**
//   조향 코드는 여전히 0줄이며, §4.1 "어디에 붙였는가가 곧 조향 특성"의 예고편이 된다.
import { bounds } from '../geom/poly.js';

/**
 * 장치 사양. `station` 은 선미 부착점 → 무게중심(로컬 원점) 사이의 보간 계수다.
 * 0 이면 부착점 그대로(가장 뒤), 1 이면 무게중심.
 *
 * 무게중심 쪽으로 당기는 이유가 둘 있다:
 *  - 선미 끝은 폴리곤 경계라 장치가 선체 밖으로 새기 쉽다 (파손 시 즉시 탈락 판정).
 *  - 팔길이(키 > 노 > 닻)에 자연스러운 서열이 생긴다 — §4.2 "후미일수록 효과적".
 */
export const DEVICE_SPECS = {
  rudder: { name: '기본 키', mass: 30, material: 'wood', station: 0.0,  bind: '←→' },
  oar:    { name: '기본 노', mass: 12, material: 'wood', station: 0.28, bind: '↑↓' },
  anchor: { name: '기본 닻', mass: 60, material: 'iron', station: 0.5,  bind: 'Space' },
};

/** 후미 구간을 잘라내는 비율 — 이 안에서만 부착점 y 를 찾는다. */
const STERN_BAND = 0.15;
/** 부착점 x — 선미 끝에서 살짝 안쪽. 경계에 정확히 얹으면 내부 판정이 불안정하다. */
const STERN_INSET = 0.08;
/** 후미 구간을 훑는 단면 수. */
const STERN_SAMPLES = 7;

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
 * 기본 3종 장치를 선체에 자동 배치한다.
 * 반환 형식은 `hull.items` 와 동일 — 파손 시 소속 폴리곤 판정(§7.5)을 그대로 탄다.
 * @param {Array<{x,y}>} outline 선체 로컬 폴리곤
 */
export function defaultDevices(outline) {
  const a = sternAnchor(outline);
  return Object.entries(DEVICE_SPECS).map(([type, spec]) => ({
    key: type,
    type,
    name: spec.name,
    bind: spec.bind,
    mass: spec.mass,
    material: spec.material,
    angle: 0, // §4.1 의 "방향". 기본 장치는 전부 선체 정면(+X) 기준이다.
    x: a.x * (1 - spec.station),
    y: a.y * (1 - spec.station),
  }));
}

/** 장치 질량 합 — `computeHullParams(outline, { extraMass })` 로 흘수에 반영된다. */
export function deviceExtraMass(devices) {
  let sum = 0;
  for (const d of devices) sum += d.mass ?? 0;
  return sum;
}
