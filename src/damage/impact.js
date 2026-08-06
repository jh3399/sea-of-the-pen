// 파손이 **얼마나** 일어나는가 — 순수 함수와 노브만. planck 도 필드도 모른다.
//
// 반경을 고정 상수로 두면 안 된다. 같은 1.76 m 가 큰 배에는 긁힌 자국이고 작은 배에는
// 즉사다. §2.1 이 형상을 물리량으로 바꾸는 것과 같은 이유로, 피해도 **선체 크기 대비**로
// 재야 "그리기가 곧 내구도 설계"가 된다 (큰 배는 맞아도 버티지만 흘수가 깊다 — 원칙 2).

export const DAMAGE_TUNING = {
  /**
   * 연소 파괴 1회가 깎는 반경 = √면적 × 이 값.
   * 0.30 이면 13 m² 슬루프에서 1.08 m, 면적의 약 14% 다.
   *
   * 규칙표의 `wood-burns-down` 이 4초마다 발화하고 `engine.js` 가 연소 시계를 되감으므로,
   * 이 값은 곧 **전손까지 걸리는 사이클 수**다 (14% → 약 7사이클 = 28초).
   * D3 통과 질문 (a) 가 사람 눈에 안 읽히면 여기를 올린다 (0.30 → 0.42).
   */
  burnRadiusOfHull: 0.30,
  /** 한 번의 충격이 넘을 수 없는 상한 (√면적 대비). 즉사 방지. */
  maxCarveOfHull: 0.35,
  /** 이보다 작은 차감은 아예 요청하지 않는다 — 재구성 비용만 쓰고 형상은 그대로다. */
  minCarveRadius: 0.12,
};

/**
 * 연소 파괴 1회의 차감 반경.
 * @param {number} hullArea m²
 */
export function burnRadius(hullArea) {
  return Math.sqrt(Math.max(hullArea, 0)) * DAMAGE_TUNING.burnRadiusOfHull;
}
