// 파손이 **얼마나** 일어나는가 — 순수 함수와 노브만. planck 도 필드도 모른다.
//
// 반경을 고정 상수로 두면 안 된다. 같은 1.76 m 가 큰 배에는 긁힌 자국이고 작은 배에는
// 즉사다. §2.1 이 형상을 물리량으로 바꾸는 것과 같은 이유로, 피해도 **선체 크기 대비**로
// 재야 "그리기가 곧 내구도 설계"가 된다 (큰 배는 맞아도 버티지만 흘수가 깊다 — 원칙 2).

export const DAMAGE_TUNING = {
  /**
   * 연소 파괴 1회가 깎는 반경 = √면적 × 이 값.
   * 0.45 면 13 m² 슬루프에서 1.62 m, 면적의 약 20% 다.
   *
   * 규칙표의 `wood-burns-down` 이 2초마다(2026-08-10, 4→2) 발화하고 `engine.js` 가 연소
   * 시계를 되감으므로, 이 값은 곧 **전손까지 걸리는 사이클 수** 다.
   * ⚠ 2026-08-10: 용암에서 나무배가 "더 많이·더 빨리" 무너지도록 0.30→0.45 로 올렸다.
   *   실측(균일 330° 용암, 슬루프): 옛값(0.30·4초 간격)은 60초를 돌려도 완전 침몰이 안
   *   났다(14사이클에서 여전히 표류) — 겉보기엔 "무너진다"지만 실제 전손은 사실상 안 왔던
   *   것이다. 새 값(0.45·2초 간격)은 46.3초에 완전 침몰한다.
   */
  burnRadiusOfHull: 0.45,
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

/**
 * 이 충격이 재질에 실제로 싣는 에너지와, 얼마나 비스듬히 맞았는가.
 *
 * 반경 계산과 "튕겨 나감" 표시가 **같은 식**을 봐야 한다 — 따로 두면 상태줄이 말하는 수치와
 * 실제 차감이 어긋나고, 그건 플레이어가 배울 수 없는 종류의 거짓말이 된다.
 *
 * @returns {{normal:number, effective:number, incidence:number|null}}
 *   normal    솔버가 실제로 실은 법선분 (J)
 *   effective 재질의 `deflection` 을 반영해 실제로 재질을 때린 에너지 (J)
 *   incidence 입사각 (rad). `strikeEnergy` 를 모르면 null — `cos²θ = E_법선 / E_총` 에서 뽑는다.
 *             ⚠ 각도기가 아니라 **표시용**이다. 솔버의 법선분이 해석값보다 10%쯤 크게 나와
 *               (측정 20.0 vs 18.1 kJ) 기하학적 45°가 42°로 읽힌다. 몇 도를 다투는 판정에
 *               쓰지 말 것 — 벤치가 각도를 재야 하면 판때기를 돌려 기하로 통제한다.
 */
export function resolveImpactEnergy({ impulse, effectiveMass, material, strikeEnergy = null }) {
  const normal = (impulse * impulse) / (2 * Math.max(effectiveMass, 1e-9));
  if (strikeEnergy == null || !(strikeEnergy > 0)) {
    return { normal, effective: normal, incidence: null };
  }
  // 솔버가 낸 법선분이 총 에너지를 넘길 수 있어(측정: 20.0 vs 18.1 kJ) 음수로 새지 않게 막는다.
  const glanced = Math.max(0, strikeEnergy - normal);
  return {
    normal,
    effective: normal + (1 - (material.deflection ?? 1)) * glanced,
    incidence: Math.acos(Math.sqrt(Math.min(1, normal / strikeEnergy))),
  };
}

/**
 * 충돌·피탄의 차감 반경 (§7.2 "충격 지점·강도·재질 내구도에 따라").
 *
 * ★ 임펄스가 아니라 **에너지**로 잰다. `E = J²/2μ`.
 *   임펄스를 그대로 쓰면 무거운 배가 **무겁다는 이유만으로** 더 깎인다 — 같은 벽에 같은
 *   속도로 부딪혀도 철배의 임펄스가 3배라서다. 에너지로 정규화하면 그 교란이 사라지고,
 *   "얼마나 세게 부딪혔는가"만 남는다. 재질 차이는 임계·인성으로만 들어온다.
 *
 * 암초가 안 깎이는 것은 여기가 아니라 `applyImpact` 가 hull 없는 강체에 null 을 내는
 * 덕이다. 이 함수는 rock 의 무한대 임계로 한 번 더 막을 뿐이다.
 *
 * ★ **입사각 감쇠는 재질이 정한다** (`material.deflection`).
 *
 *   `J` 는 접촉의 **법선** 임펄스라 `E = J²/2μ` 는 이미 `E_총 × cos²(입사각)` 이다. 즉 아무것도
 *   안 하면 **모든 재질이 경사 장갑을 공짜로 얻는다** — 나무배도 비스듬히 맞으면 튕겨 낸다.
 *   그건 물리적으로 틀렸다. 경사 장갑은 매끄럽고 질긴 강판의 성질이고, 나무는 빗맞아도
 *   섬유가 쪼개지며 뚫린다.
 *
 *   그래서 흘려보낸 접선 성분(`E_총 − E_법선`)을 재질에 따라 **되돌려 준다**:
 *     `deflection 1` → 법선분만 (완전한 경사 장갑 — 철)
 *     `deflection 0` → 전체 에너지 (입사각 무관 — 천)
 *   `E_총` 을 모르는 충돌(암초·선체끼리)은 그대로 법선분만 쓴다. 발사체만 자기 질량·속력을
 *   userData 에 들고 다녀서 `E_총` 이 정확히 알려져 있다 — 항력이 0 이라 속력이 안 변한다.
 *
 * @param {{impulse:number, effectiveMass:number, material:object, hullArea:number,
 *          strikeEnergy?:number}} p
 *   effectiveMass 는 환산질량 μ. 상대가 static 이면 동적 쪽 질량이 곧 μ 다.
 *   strikeEnergy 는 때린 쪽이 **가지고 있던** 총 운동에너지 (J). 모르면 생략한다.
 * @returns {number} 반경 (m). 0 이면 흠집도 안 났다는 뜻.
 */
export function carveRadiusFromImpact({
  impulse, effectiveMass, material, hullArea, strikeEnergy = null,
}) {
  if (!material || !(effectiveMass > 0)) return 0;
  const { effective } = resolveImpactEnergy({ impulse, effectiveMass, material, strikeEnergy });
  const over = effective - material.impactThreshold;
  if (!(over > 0)) return 0;

  return Math.min(
    Math.sqrt(over / material.toughness),
    material.maxCarveRadius ?? Infinity,                        // §7.4 철 = "함몰만"
    Math.sqrt(Math.max(hullArea, 0)) * DAMAGE_TUNING.maxCarveOfHull,
  );
}

/**
 * 두 강체의 환산질량. static(질량 0) 상대면 동적 쪽 질량이 그대로 μ 가 된다
 * (무한 질량과의 환산질량 극한).
 */
export function reducedMass(massA, massB) {
  if (!(massA > 0)) return massB;
  if (!(massB > 0)) return massA;
  return (massA * massB) / (massA + massB);
}
