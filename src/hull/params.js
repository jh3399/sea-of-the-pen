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
  /**
   * ★ 과장 계수 A — 요잉 부가질량(added mass). **"회전 둔함"의 주력 노브.**
   *
   * 형상만으로 구한 관성 모멘트는 슬루프와 둥근 배 사이에 1.4배 차이밖에 못 만드는데,
   * 선미 추력의 모멘트 팔은 선체 길이에 비례해 2.1배로 벌어진다. 그래서 그대로 두면
   * 길쭉한 배가 오히려 더 민첩해진다 (D0 브라우저 실측에서 확인한 역전).
   *
   * 물리적 근거: 선회하는 선체는 옆면을 따라 물을 함께 끌고 돌기 때문에 실제 회전 관성이
   * 기하학적 값보다 크고(부가질량), 이 효과는 길쭉할수록 강하다. 관성이 커지면 §2.1 이
   * 말하는 "회전 시작·정지가 **모두** 어려움"이 한 항으로 동시에 성립한다.
   *
   * 0.45 → 0.30: 사람이 몰아 보고 "방향 전환이 둔하다"는 판정이 나왔다. 이 노브가 응답성의
   * 주력이라 여기를 내린다 — 길쭉한 배의 회전 관성 과장이 +45% 에서 +30% 로 줄어 시작도
   * 정지도 가벼워진다. §2.1 의 **순서**(길쭉할수록 둔함)는 그대로고 폭만 좁아진다.
   * 아래 불변식(angularSlendernessGain 보다 클 것)의 여유가 0.25 → 0.10 으로 줄었으니,
   * 더 내리려면 0.2 를 같이 내려야 한다.
   */
  yawAddedMassGain: 0.30,
  /**
   * ★ 과장 계수 B — 길쭉함이 회전 **저항**을 키우는 정도. 최고 선회율만 낮추는 보조 노브.
   *
   * 물리적 근거: 회전 저항 토크는 ∫r³dA 라서 끝단이 지배하는데 dragW 는 Rg²(2승)만 쓰므로
   * 길쭉한 배의 끝단 저항을 과소평가한다. 이 항이 없으면 지속 선회의 종단 각속도가
   * 오히려 길쭉한 배 쪽이 높아진다.
   *
   * ⚠ 밸런싱 불변식: **yawAddedMassGain 보다 작게 유지할 것.** 회전 감속률은 dragW/I 이므로
   * 이 값이 부가질량 계수를 넘어서면 길쭉한 배가 더 빨리 멈춰버려 "정지도 어렵다"가 깨진다.
   * 벤치가 이 불변식을 검사한다.
   */
  angularSlendernessGain: 0.2,
};

/**
 * D2 의 재질 시스템이 이 자리를 대체한다. D0/D1 은 나무 단일 재질.
 * areaDensity(kg/m²)는 "갑판 면적당 총 질량"이라 물 밀도로 나누면 곧 흘수(m)가 된다.
 * 나무 300 → 흘수 0.30 m, 철 900 → 0.90 m.
 */
/**
 * §7.4 재질별 파손 거동. 세 칸이 추가로 붙는다:
 *
 * - `impactThreshold` (J) — 이 에너지 아래의 충격은 흠집도 안 난다. 스치는 접촉이 초당
 *   60번 배를 깎는 것을 막는 1차 방어선이다.
 * - `toughness` (J/m²) — 임계를 넘은 에너지가 얼마나 넓은 면적을 뜯어내는가.
 * - `maxCarveRadius` (m) — 한 번에 뚫릴 수 있는 최대 반경.
 *
 * ★ `maxCarveRadius` 가 `toughness` 와 **별도로** 있어야 하는 이유:
 *   철배는 면밀도가 3배라 같은 속도에서 충격 에너지도 3배다. toughness 만 올리면 그 3배와
 *   상쇄돼 결국 나무와 비슷하게 깎인다. §7.4 의 "고내구(대포알에 함몰만, 관통 어려움)"를
 *   표현하는 항은 **캡 하나뿐**이다.
 *
 * - `deflection` (0~1) — 빗맞은 충격을 얼마나 흘려보내는가. **경사 장갑의 노브다.**
 *
 *   접촉의 법선 임펄스는 그 자체로 `E_총 × cos²(입사각)` 이라, 이 항이 없으면 **모든 재질이
 *   경사 장갑을 공짜로 얻는다** — 나무배도 45°로 맞으면 절반을 튕겨 낸다. 그건 틀렸다.
 *   경사 장갑은 매끄럽고 질긴 강판의 성질이고, 나무는 빗맞아도 섬유가 쪼개지며 뚫린다.
 *   `damage/impact.js` 가 이 값으로 접선 성분을 되돌려 준다.
 *
 * 원칙 2 점검 — 철은 내구·경사 장갑이 강점이고 areaDensity 900(무게·흘수)이 이미 약점이다
 * (흘수 3배 → 노 종단 4.66 → 2.69 m/s). 나무는 얕은 흘수가 강점이고, 각도로 도망칠 수 없어
 * **맞으면 반드시 뚫리는 것**이 그 대가다. 천은 최저 밀도가 강점이고 스치기만 해도 찢어진다.
 */
export const MATERIALS = {
  wood: {
    key: 'wood', name: '나무', areaDensity: 300, color: '#a8763e',
    impactThreshold: 8000, toughness: 40000, maxCarveRadius: null,
    // 거의 안 흘린다. 빗맞아도 뚫린다 — 각도로 도망칠 수 없는 것이 나무의 약점이다.
    deflection: 0.35,
  },
  iron: {
    key: 'iron', name: '철', areaDensity: 900, color: '#8892a0',
    impactThreshold: 15000, toughness: 200000, maxCarveRadius: 0.30,
    // 완전한 경사 장갑. 비스듬히 몰면 포탄이 미끄러진다 — 조선(操船)이 곧 방어가 된다.
    deflection: 1,
  },
  cloth: {
    key: 'cloth', name: '천', areaDensity: 40, color: '#e8dcc0',
    impactThreshold: 500, toughness: 5000, maxCarveRadius: null,
    deflection: 0,   // 각도와 무관하게 찢어진다
  },
  /**
   * 살. **플레이어가 고를 수 없는 재질**이다 — `draw/screen.js` 의 `PALETTE_MATERIALS` 가
   * `['wood','iron']` 하드코딩이라 팔레트에 새지 않고, 어느 스테이지도 해금하지 않는다.
   * 4장 불가사리의 몸이 이걸 쓴다.
   *
   * ★ 규칙표에 `flesh` 줄이 **하나도 없는 것**이 요점이다. 철의 내화가 규칙 부재로 성립하듯
   *   (CLAUDE.md D2), 불가사리가 자기 빔(1400°)에 안 녹는 것도 규칙 부재로 성립한다.
   *   자기 공격에 자기가 죽지 않게 하려고 예외 분기를 두면 그 순간 원칙 1 이 샌다.
   *
   * 임계는 나무의 절반이라 **무르다** — 약한 타격도 반드시 박힌다.
   *
   * ★ 대신 **`maxCarveRadius` 가 실질 방어선이다.** 인성(20000)으로 계산한 파임 반경은
   *   대포탄(18.1 kJ)에서 0.84 m 지만 캡이 0.6 m 라 **언제나 캡이 물린다.** 그래서 한 발이
   *   뜯어내는 면적이 1.13 m² 로 고정되고, 85 m² 의 몸에서 발당 1.33% 라는 예측 가능한
   *   눈금이 나온다 — 「몇 발 더 때리면 되겠다」가 플레이어에게 읽힌다.
   * ⚠ 캡이 없으면 한 발이 로브를 통째로 끊어 **13 m² 가 한 번에** 날아가는 일이 생긴다
   *   (실측). 피해가 널을 뛰면 잔여 면적 바가 계기판 노릇을 못 한다.
   */
  flesh: {
    key: 'flesh', name: '살', areaDensity: 220, color: '#9c2f6e',
    impactThreshold: 4000, toughness: 20000, maxCarveRadius: 0.6,
    deflection: 0,   // 물컹해서 흘리지 못한다. 빗맞아도 박힌다
  },
  /**
   * 암초. 선체 재질이 아니라 **장애물 재질**이라 흘수 계산에는 안 쓰인다.
   * 안 깎이는 이유는 이 값들이 아니라 `hull` userData 가 없다는 사실이다 —
   * `applyImpact` 가 null 을 돌려준다. 여기 임계가 무한대인 것은 이중 안전장치다.
   */
  rock: {
    key: 'rock', name: '암초', areaDensity: 2400, color: '#5a5f66',
    impactThreshold: Infinity, toughness: Infinity, maxCarveRadius: 0,
    deflection: 1,   // 안 깎이므로 무의미 — 스키마를 비워 두지 않을 뿐이다
  },
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

  // 극관성 모멘트 (무게중심 기준). 면적 2차 모멘트 × 면밀도 × 요잉 부가질량 계수.
  const polarSecondMoment = m.ixx + m.iyy;
  const yawInertiaScale = 1 + HYDRO_TUNING.yawAddedMassGain * Math.max(0, slenderness - 1);
  const inertia = material.areaDensity * polarSecondMoment * yawInertiaScale;
  const radiusOfGyration = Math.sqrt(Math.max(polarSecondMoment / area, 1e-9));

  // 흘수 = 총 질량 ÷ (선체 면적 × 물 밀도) — 부력의 스칼라 축약(§2.1). 아이템을 얹을수록 깊어진다.
  const draft = mass / (area * HYDRO_TUNING.waterDensity);

  // --- 저항 타원 ---
  // 전진: 정면 폭이 선폭(beam)이고, 길쭉할수록 유선형 보너스를 받는다.
  // 횡이동: 정면 폭이 선체 길이(length) 그대로 — 옆으로는 벽이나 마찬가지다.
  const t = HYDRO_TUNING;
  const cdForward = t.dragBase / (1 + t.slendernessGain * Math.max(0, slenderness - 1));
  const cdLateral = t.dragBase;

  // 회전: 길쭉할수록 끝단이 물을 넓게 훑으므로 저항이 급격히 커진다.
  const cdAngular = t.angularDrag * (1 + t.angularSlendernessGain * Math.max(0, slenderness - 1));

  const draftFactor = Math.max(draft, 1e-3);
  const dragX = 0.5 * t.waterDensity * cdForward * beam * draftFactor;
  const dragY = 0.5 * t.waterDensity * cdLateral * length * draftFactor;
  const dragW = 0.5 * t.waterDensity * cdAngular * draftFactor * area * radiusOfGyration * radiusOfGyration;

  return {
    area, length, beam, slenderness,
    mass, hullMass, extraMass, inertia, radiusOfGyration, draft,
    /** physics/body.js 가 planck 이 산출한 관성에 곱해 줘야 하는 값. */
    yawInertiaScale,
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
