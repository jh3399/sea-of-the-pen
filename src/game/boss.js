// 불가사리 — 4장의 보스. 상태 기계 하나이고, 렌더·DOM·planck 을 모른다.
//
// ★ **보스 전용 물리도 전용 파손도 없다.** 몸통은 `game/pirates.js` 의 해적선과 같은
//   `createHullBody` 선체라, 플레이어의 대포가 이미 있는 `spawnProjectile → contact.js →
//   applyImpact` 한 경로로 그대로 깎는다 (`game/targets.js` 머리말의 원칙 —
//   "표적 전용 HP나 피탄 분기는 없고 role/entityId 만 게임 계층의 표식이다").
//
// ★ **그래서 HP 가 별도 자원이 아니다.** 남은 선체 면적이 곧 HP 다 —
//   `Σ(살아남은 조각 area) / launchArea`. 화면의 바는 새 수치가 아니라 **깎인 정도를 읽어
//   주는 계기판**이고, 페이즈 경계도 같은 값에서 나온다. §7.1 이 "배는 닳는 것이지 체력이
//   줄지 않는다"고 쓴 것과 어긋나지 않는 이유가 이것이다: 닳는 것을 세는 것뿐이다.
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
import { createTurrets } from './turrets.js';

/** 보스 몸통의 게임 계층 표식. `hull.role` 로 들어가 조각에도 그대로 상속된다. */
export const BOSS_ROLE = 'boss';

export const BOSS_TUNING = {
  /**
   * 쓰러지는 잔여 면적 비율. **0 이 아닌 것이 이름값이다** — 不可殺伊(죽일 수 없는 것)라
   * 몸이 사라지지 않는다. 2할 채 안 되게 뜯겨도 싸움을 그만두고 늘어진다.
   *
   * ★ 체력을 절반으로 낮춘 값이다 (0.62 → 0.81). 원래는 38%(1 − 0.62)를 깎아야 쓰러졌는데,
   *   그 절반인 19%(1 − 0.81)만 깎으면 쓰러지도록 문턱을 올렸다 — 필요 피해량이 절반이 된다.
   */
  fallAt: 0.81,
  /**
   * 흡입이 끝난 뒤 입이 열려 있는 시간 (s). 이때만 핵에 포탄이 박힌다.
   *
   * ★ **이 값이 싸움의 길이를 정한다.** 재장전이 0.8s(`CANNON_TUNING.reload`)이니 창 하나에
   *   최대 7발이고, 발당 1.33%(살의 파임 캡)라 창 하나가 약 9%다. 쓰러지는 문턱까지 19%면
   *   **창 둘**, 주기 11s 이니 대략 22~30초로 줄었다 (`fallAt` 을 0.62 → 0.81 로 올려 체력을
   *   절반으로 깎은 결과 — 원래는 38%·창 넷·45~60초였다). 늘리려면 `fallAt` 을 같이 낮춰야 한다.
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
 *   3배 — 노 종단이 4.66 → 2.69 m/s 라 **흡입에서 훨씬 불리하다** (원칙 2).
 * ⚠ 여기를 만지면 반드시 두 재질 × 두 자리를 다시 재라. 임계가 둘이라 한쪽만 보면 샌다.
 */
export const BOSS_PHASES = [
  {
    name: '누워 있다',
    until: 0.93,
    emitters: [
      { x: 0, y: 13, angle: -90, count: 5, spread: 72, period: 2.0, radius: 5.6, speed: 26, mass: 70, projectileRadius: 0.34, lifetime: 2.6 },
    ],
    suck: true,
    beam: null,
    wreck: null,
  },
  {
    name: '눈을 뜬다',
    until: 0.86,
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

  const boss = {
    coreAt,
    /** 팔의 장애물 스펙 — 렌더가 **판정에 넘긴 바로 그 점 목록**을 그리도록 그대로 들고 있는다. */
    arms: spec.arms ?? [],
    /** 콜라이더 없는 장식이 물에 잠기기 시작하는 반경 (m). */
    submergeFrom: spec.submergeFrom ?? 15,
    launchArea,
    /** 살아 있는 몸통 조각들. 깎여 갈라지면 화면이 이 Set 을 갈아 끼운다. */
    parts: new Set([body]),
    /** 잔여 면적 비율 0..1 — **이것이 HP 다.** */
    health: 1,
    phaseIndex: 0,
    /** 입이 열려 있는가. 흡입 직후에만 참이고, 이때만 핵에 피해가 들어간다. */
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

    /** 지금 살아 있는 조각 면적의 합 / 출항 면적. */
    measure() {
      let area = 0;
      for (const b of this.parts) area += b.getUserData()?.hull?.params?.area ?? 0;
      this.health = launchArea > 0 ? Math.max(0, Math.min(1, area / launchArea)) : 0;
      return this.health;
    },

    /**
     * 피해는 **여기 한 곳으로만** 들어온다. 지금은 플레이어 대포가 부르고, 다른 피해원이
     * 생겨도(충각·특수 포탄) 이 문만 두드리면 된다.
     *
     * 실제로 깎는 것은 호출자다 (`carveMember` → `applyImpact`) — 이 함수는 **결과를 읽고**
     * 페이즈를 옮길 뿐이라 파손 로직이 두 벌이 되지 않는다.
     * @returns {boolean} 이번 타격이 유효했는가 (입이 닫혀 있으면 false)
     */
    takeHit() {
      if (this.fallen) return false;
      // 입이 닫혀 있으면 몸은 이미 깎였어도 페이즈를 옮기지 않는다 — 취약 창이 유일한 진행 수단.
      if (!this.open) return false;
      this.measure();
      this.syncPhase();
      if (this.health <= BOSS_TUNING.fallAt) this.fall();
      return true;
    },

    /**
     * 잔여 면적이 다음 문턱을 넘었으면 페이즈를 옮긴다.
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
     * ⚠ **갈라져 나온 조각은 놓아준다.** 못 박는 것은 아직 핵을 품은(= 원래 자리에 가장 가까운)
     *   조각 하나뿐이고, 뜯긴 살점은 흘러가야 "뜯겨 나갔다"로 읽힌다.
     */
    pin() {
      if (this.parts.size === 0) return;
      let anchor = null;
      let best = Infinity;
      for (const b of this.parts) {
        const p = b.getPosition();
        const d = Math.hypot(p.x - this.coreAt.x, p.y - this.coreAt.y);
        if (d < best) { best = d; anchor = b; }
      }
      if (!anchor) return;
      anchor.setPosition(new Vec2(this.coreAt.x, this.coreAt.y));
      anchor.setAngle(0);
      anchor.setLinearVelocity(new Vec2(0, 0));
      anchor.setAngularVelocity(0);
      this.anchor = anchor;
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

  boss.measure();
  boss.enterPhase(0);
  return boss;
}

/** 난파선 판자의 면적 — 벤치가 질량을 검산할 때 쓴다. */
export const WRECK_AREA = ringArea(WRECK_PLANK);
export { WRECK_PLANK };
