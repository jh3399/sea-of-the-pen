// 불가사리 — 4장의 보스. 상태 기계 하나이고, 렌더·DOM·planck 을 모른다.
//
// ★ **보스는 핵도 팔도 폴리곤이 절대 안 깎인다 — 형태 전체가 무형태 진행 지표다.**
//   몸통은 `game/pirates.js` 의 해적선과 같은 `createHullBody` 선체이고 팔도 한때(2026-08-10
//   세 번째 라운드) 대포로 실제로 끊어 낼 수 있는 선체였지만, 이후 사람 판정("보스 형태
//   전체가 안 부서지게")으로 팔도 핵과 같은 취급을 받는다. 그래서 HP 는 `측정`(폴리곤
//   면적)이 아니라 `applyDamage` 한 문으로만 깎이는 **독립 자원**이다 — §7.1 "배는 닳는
//   것이지 체력이 줄지 않는다"의 예외를 보스 하나에 명시적으로 둔 것이다(형태를 지킬
//   방법이 그것뿐이라서다).
//
// ★ **취약 창(open) 게이트는 없다.** 예전에는 흡입 뒤 입이 열린 몇 초에만 핵이 맞았다 —
//   지금은 입 상태와 무관하게 핵·팔 어디에 맞아도 **항상** `applyDamage` 이 들어간다.
//   `open`/`sucking` 은 이제 순수 연출(입을 벌리는 애니메이션·흡입 필드)일 뿐 피해 판정에는
//   안 쓰인다.
//
// ★ **팔 피해도 핵과 같은 풀에 합산된다.** 팔도 핵과 똑같이 폴리곤을 안 깎으므로, 재질 캡이
//   정하는 근사 면적(`π·radius²`)을 그대로 HP 에서 뺀다 — 핵·팔이 완전히 같은 공식과 같은
//   문(`boss.applyDamage(delta)`)을 두드리므로 피해 로직이 두 벌로 안 갈라진다.
//
// ★ **조준 로직이 0줄이다.** 부채 방위·회전·빔 레인·난파선 각도가 전부 데이터이고,
//   플레이어를 쫓는 판단은 어디에도 없다 (`game/turrets.js` 머리말과 같은 전제).
//   난도는 조준이 아니라 **패턴의 겹침**으로 올린다.
//
// ★ **누워 있다.** 위치가 시간의 함수조차 아니라 상수다 — S-02 의 "가만히 누워서 빨아들인다"
//   가 그대로 구현이다. 매 스텝 제자리에 못 박는 것은 해적선과 같은 수법이고, 덕분에
//   들이받혀도 밀려나지 않는다.
import { Vec2 } from 'planck';
import { createHullBody } from '../physics/body.js';
import { polygonMoments, translate } from '../geom/poly.js';
import { createTurrets } from './turrets.js';

/** 보스 몸통의 게임 계층 표식. `hull.role` 로 들어가 조각에도 그대로 상속된다. */
export const BOSS_ROLE = 'boss';

export const BOSS_TUNING = {
  /**
   * 쓰러지는 잔여 체력 비율. **0 이 아닌 것이 이름값이다** — 不可殺伊(죽일 수 없는 것)라
   * "몸"(연출상의 핵)이 사라지지 않는다. 4할 가까이 깎여야 싸움을 그만두고 늘어진다.
   *
   * ★ 두 번의 절반(0.62→0.81→0.905) 뒤 **4배로 되돌렸다** (필요 피해량 9.5% × 4 = 38%
   *   → `fallAt` 0.905 → **0.62**). 공교롭게도 최초 기준값과 정확히 같다 — 절반을 두 번
   *   낮춘 것을 한 번에 되돌렸을 뿐이다. 더 조절하려면 `BOSS_PHASES[0].until`·`[1].until`
   *   도 같은 비율로 같이 움직여야 한다 (§`syncPhase` 의 불변식: `until0 > until1 > fallAt`).
   */
  fallAt: 0.62,
  /**
   * 흡입이 끝난 뒤 입이 열려 있는 시간 (s) — **연출 전용.** 취약 창 게이트를 없앤 뒤로는
   * 피해 판정과 무관하다(핵은 입 상태와 무관하게 항상 맞는다). 입을 벌리는 애니메이션의
   * 지속 시간일 뿐이라 싸움 길이를 더 이상 결정하지 않는다 — 그 역할은 이제 `fallAt` 과
   * 플레이어의 명중률이 정한다.
   */
  openFor: 6.0,
  /** 흡입 지속 (s) 과 주기 (s). */
  suckFor: 3.0,
  suckEvery: 11,
  /** 흡입 반경 (m) · 가장자리 부드러움 · 세기 (m/s, 음수 = 안으로). */
  suckRadius: 40,
  suckFalloff: 0.85,
  suckStrength: -5,
  /** 난파선을 삼키는 거리 (m) — 핵 중심에서 이 안에 들어오면 사라진다. */
  swallowWithin: 9,
};

/**
 * 페이즈 표 — 잔여 면적이 `until` 위인 동안 이 페이즈다. 위에서부터 순서대로 본다.
 *
 * 패턴은 **누적**이다: 부채꼴이 바닥에 깔리고 흡입 → 빔 → 난파선이 차례로 얹힌다.
 * 각 페이즈의 `emitters` 는 `game/turrets.js` 스펙 그대로다 (`angle` 은 도, -90 = 아래).
 *
 * ★ **포탄 질량 70 kg 은 두 재질 임계 사이를 노린 값이다.** 처음엔 30 kg 이었는데
 *   E = ½mv² 가 10.1 kJ 라 철의 피격 임계 15 kJ **아래**였다 — 실측으로 철 선체가 120발을
 *   맞고 **흠집 하나 없었다.** 탄막이 통째로 무의미해지는 값이라, 임계 **위**로 올려야 했다.
 *
 *   70 kg 실측 (슬루프, 회피 없이 계속 맞히기):
 *     맞는 자리        나무            철
 *     뱃전(빗맞음)     36~40발 침몰    120발 맞고 82~88% 잔존
 *     정중앙(주인공)   2발 침몰        2발 침몰
 *   ⚠ 이 **스무 배 차이가 버그가 아니다.** 주인공은 무게중심에 서 있고(§7.5) 그 조각이
 *     떨어져 나가면 재질과 무관하게 끝난다 — 암초에 정통으로 박는 것과 같은 규칙이다.
 *     그래서 이 탄막에서 배우는 것은 "맞지 마라"가 아니라 **"뱃전으로 받아라"** 이고,
 *     그게 이 게임의 조선(操船)이 방어라는 §7.4 와 같은 이야기다.
 *   철이 압도적으로 단단한 것은 그대로 둔다(§7.4 "함몰만, 관통 어려움"). 대가는 흘수
 *   3배 — 노 종단이 4.24 → 3.33 m/s 라 **흡입에서 불리하다** (원칙 2).
 * ⚠ 여기를 만지면 반드시 두 재질 × 두 자리를 다시 재라. 임계가 둘이라 한쪽만 보면 샌다.
 */
export const BOSS_PHASES = [
  {
    name: '누워 있다',
    until: 0.86,
    emitters: [
      { x: 0, y: 13, angle: -90, count: 5, spread: 72, period: 2.0, radius: 5.6, speed: 26, mass: 70, projectileRadius: 0.34, lifetime: 2.6 },
    ],
    suck: true,
    beam: null,
    wreck: null,
  },
  {
    name: '눈을 뜬다',
    until: 0.72,
    emitters: [
      { x: 0, y: 13, angle: -90, count: 7, spread: 104, period: 1.7, radius: 5.6, speed: 28, mass: 70, projectileRadius: 0.34, lifetime: 2.6 },
      { x: 0, y: 13, angle: -90, count: 3, spread: 26, period: 2.3, phase: 0.8, spin: 22, radius: 5.6, speed: 34, mass: 70, projectileRadius: 0.28, lifetime: 2.4 },
    ],
    suck: true,
    // 레인은 **선언된 수열**을 돈다. 플레이어를 겨누지 않으므로 외울 수 있다.
    beam: { lanes: [2, 0, 4, 1, 3], telegraph: 1.1, fire: 0.7, gap: 2.6, halfWidth: 3, value: 1400 },
    wreck: null,
  },
  {
    name: '삼키려 한다',
    until: 0,
    emitters: [
      { x: 0, y: 13, angle: -90, count: 9, spread: 132, period: 1.4, radius: 5.6, speed: 30, mass: 70, projectileRadius: 0.34, lifetime: 2.4 },
      { x: 0, y: 13, angle: -90, count: 3, spread: 30, period: 1.9, phase: 0.6, spin: -38, radius: 5.6, speed: 36, mass: 70, projectileRadius: 0.28, lifetime: 2.2 },
    ],
    suck: true,
    beam: { lanes: [0, 3, 1, 4, 2], telegraph: 0.9, fire: 0.8, gap: 1.9, halfWidth: 3, value: 1400 },
    wreck: { every: 4.5, max: 6, speed: 14, spread: 54 },
  },
];

/** 빔 레인의 x 좌표 (m). 아레나 폭에 맞춰 고르게 편다. */
export const BEAM_LANES = [-24, -12, 0, 12, 24];

/** 난파선 판자 하나 — 무게중심이 원점인 볼록 사각형 (m). */
const WRECK_PLANK = [
  { x: -2.3, y: -0.7 }, { x: 2.3, y: -0.7 }, { x: 2.0, y: 0.7 }, { x: -2.0, y: 0.7 },
];

/** 조각 무리에서 이 점에 가장 가까운 강체. 핵도 팔도 "원래 자리에 가장 가까운 것"이 뿌리다. */
function nearestTo(parts, at) {
  let best = Infinity;
  let found = null;
  for (const b of parts) {
    const p = b.getPosition();
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < best) { best = d; found = b; }
  }
  return found;
}

/** 다각형 넓이 (양수). `polygonMoments` 를 부르지 않고 면적만 필요할 때. */
function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/**
 * 보스 하나를 만든다.
 *
 * @param {World} world
 * @param {object} spec `map.boss` — `{ core:{x,y,points}, arms:[...], waterY }`
 * @param {object} fields `createFields` 결과. 흡입·빔을 **이름 붙은 오버레이 슬롯**으로 꽂는다
 *   (`setSource`). 맵 데이터는 정적이라 HP 로 구동되는 일정을 담을 수 없고, 그렇다고 화면에
 *   `if (stage==='bulgasari')` 를 넣으면 원칙 1 이 깨진다 — 슬롯이 그 사이를 잇는다.
 * @param {{onFall?:Function, onPhase?:Function, onBeam?:Function}} hooks
 */
export function createBoss(world, spec, fields, hooks = {}) {
  const coreAt = { x: spec.core.x, y: spec.core.y };
  const outline = spec.core.points.map(([x, y]) => ({ x, y }));

  const body = createHullBody(
    world,
    { outline, holes: [], items: [], crew: null, role: BOSS_ROLE, entityId: 'bulgasari' },
    {
      position: coreAt,
      angle: 0,
      material: 'flesh',
      extraMass: 0,
      role: BOSS_ROLE,
      entityId: 'bulgasari',
    },
  );
  if (!body) throw new Error('보스 선체 형상을 만들 수 없습니다.');

  const launchArea = body.getUserData().hull.launchArea;

  /**
   * 팔 — 핵과 **완전히 같은 취급**을 받는 선체다. 폴리곤은 스폰된 그대로 영원히 고정이고
   * (`pin()` 이 매 스텝 원래 자세로 되돌린다), 맞은 자국은 `sail/screen.js#carveBoss` 가
   * `applyDamage()` 로 핵과 같은 체력 풀에만 남긴다 — 핵·팔이 같은 함수를 탄다. 형태가 안
   * 바뀌므로 조각이 갈라질 일도
   * 없어 팔마다 강체 하나씩만 있으면 된다 — 예전에는(2026-08-10 세 번째 라운드) 대포로
   * 실제로 끊어 낼 수 있어 팔마다 조각 Set·"못 박을 뿌리 재선정"이 필요했지만, 형태가 절대
   * 안 바뀌면 **스폰된 자세 자체가 영구히 고정된 뿌리**라 그 장치가 통째로 필요 없어졌다.
   * 스펙의 점 목록은 월드 좌표라 여기서 무게중심 원점으로 옮긴다 (`computeHullParams` ·
   * hydro 회전 클램프가 그걸 전제한다).
   */
  const armGroups = (spec.arms ?? []).map((armSpec, i) => {
    const pts = armSpec.points.map(([x, y]) => ({ x, y }));
    const m = polygonMoments(pts);
    const entityId = `bulgasari:arm:${i}`;
    const armBody = m ? createHullBody(
      world,
      {
        outline: translate(pts, -m.cx, -m.cy),
        holes: [],
        items: [],
        crew: null,
        role: BOSS_ROLE,
        entityId,
      },
      {
        position: { x: m.cx, y: m.cy },
        angle: 0,
        material: armSpec.material ?? 'flesh',
        extraMass: 0,
        role: BOSS_ROLE,
        entityId,
      },
    ) : null;
    if (!armBody) throw new Error(`보스 팔 ${i} 의 형상을 만들 수 없습니다.`);
    return { entityId, body: armBody, at: { x: m.cx, y: m.cy, angle: 0 } };
  });

  const boss = {
    coreAt,
    /** 팔 그룹 — 각각 `{entityId, body, at}`. 렌더·피격은 아래 `armParts` 를 쓴다. */
    armGroups,
    /** 팔 강체 전부. 화면이 그리기·피격 라우팅에 쓴다. 형태가 안 바뀌므로 팔당 하나뿐이다. */
    armParts: new Set(armGroups.map((g) => g.body)),
    /** 콜라이더 없는 장식이 물에 잠기기 시작하는 반경 (m). */
    submergeFrom: spec.submergeFrom ?? 15,
    launchArea,
    /** 핵 강체를 담은 Set. 폴리곤이 절대 안 바뀌므로 창끝에 만든 강체 하나로 영원히 고정이다. */
    parts: new Set([body]),
    /**
     * 잔여 체력 비율 0..1. **더 이상 폴리곤 면적에서 재지 않는다** — 핵은 절대 안 깎이므로
     * 잴 형상 자체가 없다. `applyDamage()` 가 직접 차감하는 독립 자원이다.
     */
    health: 1,
    phaseIndex: 0,
    /** 입이 열려 있는가 — **연출 전용.** 흡입 직후에만 참이지만 피해 판정에는 안 쓰인다. */
    open: false,
    openUntil: 0,
    fallen: false,
    fallAt: null,
    /** 이번 페이즈의 발사 스케줄러. 페이즈가 바뀔 때마다 **새로 만든다** (아래 주석 참조). */
    turrets: null,
    phaseStartedAt: 0,
    sucking: false,
    suckUntil: 0,
    nextSuckAt: BOSS_TUNING.suckEvery,
    /** 빔 상태 — 렌더가 그대로 읽어 경고선을 그린다. */
    beam: null,
    nextBeamAt: Infinity,
    beamStep: 0,
    nextWreckAt: Infinity,
    /** 이번 스텝에 던져 달라는 난파선 요청. 화면이 소비한다 (여기서 강체를 만들지 않는다). */
    wreckRequests: [],

    get phase() {
      return BOSS_PHASES[this.phaseIndex];
    },

    /** 레인 번호 → 월드 x. 렌더와 필드가 **같은 함수**를 써야 그림과 판정이 안 갈라진다. */
    beamLaneX(i) {
      return BEAM_LANES[i] ?? 0;
    },

    /**
     * 피해는 **여기 한 곳으로만** 들어온다. 지금은 플레이어 대포가 부르고(핵·팔 둘 다),
     * 다른 피해원이 생겨도(충각·특수 포탄) 이 문만 두드리면 된다.
     *
     * `delta` 는 `launchArea` 대비 분수(0..1) — 핵이든 팔이든 재질 캡이 정하는 근사 면적
     * (`π·radius²`)이다. 형태가 안 바뀌므로 실제 차감 면적이라는 게 없다 — 둘 다 이 근사뿐.
     * 취약 창 게이트는 없다 — 맞으면(호출되면) 항상 유효타다.
     * @returns {boolean} 실제로 피해가 들어갔는가 (이미 쓰러졌거나 delta 가 0/음수면 false)
     */
    applyDamage(delta) {
      if (this.fallen || !(delta > 0)) return false;
      this.health = Math.max(0, this.health - delta);
      this.syncPhase();
      if (this.health <= BOSS_TUNING.fallAt) this.fall();
      return true;
    },

    /**
     * 잔여 체력이 다음 문턱을 넘었으면 페이즈를 옮긴다.
     *
     * ⚠ 페이즈마다 `createTurrets` 를 **새로 만드는 것이 필수**다. 스케줄러는 발사 시각을
     *   `startedAt + phase + n × period` 로 세는데, 켜 두고 안 부르면 `while` 백스톱이 밀린
     *   발사를 한 스텝에 몰아 쏜다 (turrets.js). 새로 만들면 n 이 1 부터 다시 센다.
     */
    syncPhase() {
      let next = this.phaseIndex;
      while (next < BOSS_PHASES.length - 1 && this.health <= BOSS_PHASES[next].until) next++;
      if (next === this.phaseIndex && this.turrets) return;
      this.phaseIndex = next;
      this.enterPhase(this.clock);
      hooks.onPhase?.(this.phase, next);
    },

    enterPhase(now) {
      const p = this.phase;
      this.phaseStartedAt = now;
      this.turrets = createTurrets(p.emitters, now);
      this.beamStep = 0;
      this.nextBeamAt = p.beam ? now + p.beam.gap : Infinity;
      this.nextWreckAt = p.wreck ? now + p.wreck.every : Infinity;
      this.setBeam(null);
    },

    // ------------------------------------------------------------ 필드 오버레이

    setSuck(on) {
      if (this.sucking === on) return;
      this.sucking = on;
      if (on) hooks.onSuck?.();
      fields.setSource('current', 'boss:suck', on ? {
        shape: 'disc',
        mode: 'radial',
        at: this.coreAt,
        radius: BOSS_TUNING.suckRadius,
        falloff: BOSS_TUNING.suckFalloff,
        strength: BOSS_TUNING.suckStrength,
      } : null);
    },

    /**
     * 빔을 켜고 끈다. `state` 는 `{lane, phase:'telegraph'|'fire', until}` 또는 null.
     *
     * 온도 띠는 **발사 중에만** 꽂는다 — 경고선은 그림일 뿐이고 판정이 없어야 "먼저 빨간 선,
     * 그 다음 레이저"가 성립한다.
     * ⚠ 그려지는 띠와 꽂히는 띠가 **같은 [from,to]** 여야 한다. 규칙 엔진은 무게중심 한 점만
     *   보므로(engine.js), 화면이 조금이라도 넓게/좁게 그리면 플레이어가 배우는 회피 거리가
     *   틀린 값이 된다.
     */
    setBeam(state) {
      this.beam = state;
      const firing = state?.phase === 'fire';
      const cfg = this.phase.beam;
      fields.setSource('temperature', 'boss:beam', firing && cfg ? {
        shape: 'band',
        axis: 'x',
        from: this.beamLaneX(state.lane) - cfg.halfWidth,
        to: this.beamLaneX(state.lane) + cfg.halfWidth,
        value: cfg.value,
      } : null);
      // 경고와 발사 **둘 다** 알린다 — 소리를 어느 쪽에 붙일지는 화면이 정한다.
      if (state) hooks.onBeam?.(state);
    },

    // ------------------------------------------------------------ 시계

    /**
     * 보스 시계를 `now` 로 옮기고 이번 스텝의 발사 요청을 돌려준다.
     *
     * ⚠ `now` 는 `simTime` 이 아니라 **보스 전용 시계**여야 한다 — 설정창이 열린 동안 멈춰야
     *   하고(창은 물리를 멈추지 않는다), 멈춘 채 흘려보내면 재개 순간 볼리가 폭발한다.
     */
    step(now) {
      this.clock = now;
      if (this.fallen) return [];
      if (!this.turrets) this.enterPhase(now);

      // ── 흡입 ── 위협이면서 동시에 취약 창까지 데려다주는 유일한 탈것이다.
      if (this.phase.suck) {
        if (!this.sucking && now >= this.nextSuckAt) {
          this.setSuck(true);
          this.suckUntil = now + BOSS_TUNING.suckFor;
        } else if (this.sucking && now >= this.suckUntil) {
          this.setSuck(false);
          this.nextSuckAt = now + BOSS_TUNING.suckEvery;
          // 숨을 고른다 — 빨아들인 직후에만 입이 열린다.
          this.open = true;
          this.openUntil = now + BOSS_TUNING.openFor;
        }
      }
      if (this.open && now >= this.openUntil) this.open = false;

      // ── 빔 ── 경고 → 발사 → 쉼. 레인은 선언된 수열을 돈다 (조준 아님).
      const beamCfg = this.phase.beam;
      if (beamCfg) {
        if (this.beam && now >= this.beam.until) {
          if (this.beam.phase === 'telegraph') {
            this.setBeam({ lane: this.beam.lane, phase: 'fire', until: now + beamCfg.fire });
          } else {
            this.setBeam(null);
            this.nextBeamAt = now + beamCfg.gap;
          }
        } else if (!this.beam && now >= this.nextBeamAt) {
          const lane = beamCfg.lanes[this.beamStep % beamCfg.lanes.length];
          this.beamStep += 1;
          this.setBeam({ lane, phase: 'telegraph', until: now + beamCfg.telegraph });
        }
      }

      // ── 난파선 ── 방향은 고정 부채다. 화면이 실제 강체를 만든다.
      const wreckCfg = this.phase.wreck;
      if (wreckCfg && now >= this.nextWreckAt) {
        this.nextWreckAt = now + wreckCfg.every;
        const k = this.wreckSeq++ % 5;
        const spread = wreckCfg.spread;
        const angle = (-90 + (k - 2) * (spread / 4)) * (Math.PI / 180);
        this.wreckRequests.push({
          x: this.coreAt.x + Math.cos(angle) * 8,
          y: this.coreAt.y + Math.sin(angle) * 8,
          angle,
          speed: wreckCfg.speed,
          max: wreckCfg.max,
          outline: WRECK_PLANK,
        });
      }

      return this.turrets.step(now);
    },

    wreckSeq: 0,
    clock: 0,

    /** 이번 스텝의 난파선 요청을 비우며 돌려준다. */
    drainWrecks() {
      const out = this.wreckRequests.slice();
      this.wreckRequests.length = 0;
      return out;
    },

    /** 흡입 중 삼켜야 할 거리인가 — 난파선 정리에 쓴다. */
    swallows(at) {
      if (!this.sucking || !at) return false;
      return Math.hypot(at.x - this.coreAt.x, at.y - this.coreAt.y) <= BOSS_TUNING.swallowWithin;
    },

    /**
     * 매 스텝 제자리에 못 박는다 (`stepPirateMotion` 과 같은 수법).
     * 누워만 있으므로 경로조차 없다 — 위치가 시간의 함수가 아니라 상수다.
     *
     * 핵도 팔도 폴리곤이 절대 안 바뀌므로(그래서 조각이 갈라질 일도 없다) 스폰 자세를
     * 매 스텝 그대로 되돌리는 것만으로 충분하다 — 충돌·흡입 항력이 밀어내도 다음 스텝에
     * 원위치한다.
     */
    pin() {
      // ── 핵 ── `coreAt` 에 스냅한다. 입·흡입·도착 지점이 전부 그 상수를 보므로 핵은
      //          반드시 거기 있어야 한다.
      const core = nearestTo(this.parts, this.coreAt);
      if (core) {
        core.setPosition(new Vec2(this.coreAt.x, this.coreAt.y));
        core.setAngle(0);
        core.setLinearVelocity(new Vec2(0, 0));
        core.setAngularVelocity(0);
      }
      this.anchor = core;

      // ── 팔 ── 스폰된 자세(`g.at`)로 매 스텝 되돌린다. 형태가 안 바뀌므로 무게중심이
      //          옮겨갈 일도 없어 핵처럼 상수 하나로 스냅해도 안전하다.
      for (const g of this.armGroups) {
        g.body.setPosition(new Vec2(g.at.x, g.at.y));
        g.body.setAngle(g.at.angle);
        g.body.setLinearVelocity(new Vec2(0, 0));
        g.body.setAngularVelocity(0);
      }
    },

    fall() {
      if (this.fallen) return;
      this.fallen = true;
      this.fallAt = this.clock;
      this.open = false;
      this.turrets = null;
      this.setSuck(false);
      this.setBeam(null);
      hooks.onFall?.(this);
    },
  };

  boss.enterPhase(0);
  return boss;
}

/** 난파선 판자의 면적 — 벤치가 질량을 검산할 때 쓴다. */
export const WRECK_AREA = ringArea(WRECK_PLANK);
export { WRECK_PLANK };
