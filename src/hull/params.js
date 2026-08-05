// 설계 문서 §2.1 — 형상 → 탑뷰 3대 파라미터 (저항 타원 · 관성 모멘트 · 흘수).
//
// 여기 상수들은 실제 유체역학 값이 아니라 **게임 튜닝 노브**다. D1 통과 질문("다르게 그린 배
// 세 척의 조작감이 다르게 느껴지는가")이 실패하면 사실성이 아니라 `slendernessGain` 을 올린다.
import { polygonMoments, projectedExtent } from '../geom/poly.js';

export const HYDRO_TUNING = {
  /** 물 밀도 (kg/m³). 흘수 산출과 항력 세기에 함께 쓰인다. */
  waterDensity: 1000,
  /** 기본 항력 계수. */
  dragBase: 1.0,
  /**
   * ★ 과장 계수 — 길쭉함이 전진 저항을 얼마나 깎아주는가.
   * 정면 폭 차이만으로도 이방성은 생기지만, 이 항이 "체감되는 차이"를 만든다.
   */
  slendernessGain: 0.9,
  /** 회전 저항 계수. 크면 제자리 회전이 둔해진다. */
  angularDrag: 0.5,
};

/**
 * D2 의 재질 시스템이 이 자리를 대체한다. D0/D1 은 나무 단일 재질.
 * areaDensity(kg/m²)는 "갑판 면적당 총 질량"이라 물 밀도로 나누면 곧 흘수(m)가 된다.
 * 나무 300 → 흘수 0.30 m, 철 900 → 0.90 m.
 */
export const MATERIALS = {
  wood: { key: 'wood', name: '나무', areaDensity: 300, color: '#a8763e' },
  iron: { key: 'iron', name: '철', areaDensity: 900, color: '#8892a0' },
  cloth: { key: 'cloth', name: '천', areaDensity: 40, color: '#e8dcc0' },
};

/**
 * 선체 로컬 폴리곤(무게중심 원점, +X = 뱃머리) → 물리 파라미터.
 * @param {Array<{x,y}>} outline
 * @param {{material?: string, extraMass?: number}} options
 */
export function computeHullParams(outline, options = {}) {
  const material = MATERIALS[options.material ?? 'wood'];
  const extraMass = options.extraMass ?? 0; // 아이템 질량 (D2 부터 채워진다)

  const m = polygonMoments(outline);
  if (!m) return null;

  const area = Math.abs(m.area);
  const length = projectedExtent(outline, 1, 0); // 주축 = 선체 길이
  const beam = projectedExtent(outline, 0, 1);   // 선폭
  const slenderness = beam > 1e-6 ? length / beam : 1;

  const hullMass = area * material.areaDensity;
  const mass = hullMass + extraMass;

  // 극관성 모멘트 (무게중심 기준). 면적 2차 모멘트 × 면밀도.
  const polarSecondMoment = m.ixx + m.iyy;
  const inertia = material.areaDensity * polarSecondMoment;
  const radiusOfGyration = Math.sqrt(Math.max(polarSecondMoment / area, 1e-9));

  // 흘수 = 총 질량 ÷ (선체 면적 × 물 밀도) — 부력의 스칼라 축약(§2.1). 아이템을 얹을수록 깊어진다.
  const draft = mass / (area * HYDRO_TUNING.waterDensity);

  // --- 저항 타원 ---
  // 전진: 정면 폭이 선폭(beam)이고, 길쭉할수록 유선형 보너스를 받는다.
  // 횡이동: 정면 폭이 선체 길이(length) 그대로 — 옆으로는 벽이나 마찬가지다.
  const t = HYDRO_TUNING;
  const cdForward = t.dragBase / (1 + t.slendernessGain * Math.max(0, slenderness - 1));
  const cdLateral = t.dragBase;

  const draftFactor = Math.max(draft, 1e-3);
  const dragX = 0.5 * t.waterDensity * cdForward * beam * draftFactor;
  const dragY = 0.5 * t.waterDensity * cdLateral * length * draftFactor;
  const dragW = 0.5 * t.waterDensity * t.angularDrag * draftFactor * area * radiusOfGyration * radiusOfGyration;

  return {
    area, length, beam, slenderness,
    mass, hullMass, extraMass, inertia, radiusOfGyration, draft,
    material,
    drag: { x: dragX, y: dragY, w: dragW },
    /** 오버레이용 — 방향별 저항의 크기를 반지름으로 표현한 타원. */
    dragEllipse: normalizeEllipse(dragX, dragY, length, beam),
  };
}

/** 저항비를 유지하면서 선체 크기에 맞춰 보기 좋게 스케일한 타원. */
function normalizeEllipse(dragX, dragY, length, beam) {
  const maxDrag = Math.max(dragX, dragY, 1e-9);
  const target = 0.45 * Math.max(length, beam);
  return { rx: (dragX / maxDrag) * target, ry: (dragY / maxDrag) * target };
}
