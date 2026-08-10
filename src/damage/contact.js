// 충돌 → 파손. planck 의 `post-solve` 를 물어 **큐에만 쌓는다.**
//
// ★ 콜백 안에서 강체를 만들거나 부수면 안 된다. planck 이 명시적으로 금지한다
//   ("You cannot create/destroy world entities inside these callbacks").
//   소비는 `stepper.advance()` 가 끝난 뒤 스텝 밖에서 한다 — 규칙 엔진의 `drain()` 과
//   똑같은 규약이고, 파라미터 재계산을 이벤트 시점에만 하는 §7.5 와도 같은 자리다.
import {
  carveRadiusFromImpact, resolveImpactEnergy, reducedMass, DAMAGE_TUNING,
} from './impact.js';

export const CONTACT_TUNING = {
  /**
   * 같은 강체를 다시 깎기까지의 최소 간격 (s).
   *
   * ★ post-solve 는 접촉이 **지속되는 한 매 스텝** 불린다. 임계와 쿨다운이 없으면
   *   암초에 붙은 배가 초당 60번 깎여 즉사한다. D2 의 "같은 틱에 붙었다 꺼진 상태는
   *   사건이 아니다"와 정확히 같은 종류의 함정이다.
   */
  cooldown: 0.2,
  /**
   * 발사체가 무장하기까지 (s). 총구가 발사원 안에 있어도 자기 편을 안 깎게 한다.
   *
   * ★ 거리로 체감된다: armGap = armDelay × 포탄 초속. 55 m/s 기준 0.1s → 5.5 m.
   *   2026-08-10: 안전거리를 반으로 줄이라는 요청으로 0.1 → 0.05 (5.5 m → 2.75 m).
   *   근접전의 "무반응 사각지대"가 좁아지는 대신, 자기 배를 못 깎는 여유도 그만큼 줄었다 —
   *   `muzzleMargin`(총구 오프셋)이 자상 방어의 나머지 한 겹이라는 점은 변하지 않는다.
   */
  armDelay: 0.05,
};

/**
 * @typedef {{body, at:{x,y}, radius:number, energy:number, incidence:number|null,
 *            source:'reef'|'shot'|'hull', other, projectile}} Impact
 *   energy 는 재질이 흘려보내지 않고 **실제로 일한** 에너지 (J) — 법선분이 아니다.
 *   incidence 는 입사각 (rad). `E_총` 을 아는 발사체에서만 채워진다.
 */

/**
 * 이 선체를 지금 또 깎아도 되는가 (쿨다운 백스톱).
 *
 * ⚠ **현 튜닝에서 이 가드는 한 번도 닿지 않는다.** 실제로 지속 접촉을 막는 것은 재질의
 *   `impactThreshold` 와 `DAMAGE_TUNING.minCarveRadius` 둘이다 — 벽에 기댄 스텝당 에너지는
 *   약 2.8 J 이라 임계(나무 8 kJ)를 못 넘고, 넘긴다 해도 반경이 0.007 m 로 최소 반경에서
 *   걸린다. 그래서 이건 밸런싱 중에 임계를 낮췄을 때를 위한 백스톱이며, 벤치는 솔버를 통해
 *   억지로 발화시키는 대신 이 판정과 승계를 직접 잰다.
 */
export function offCooldown(hull, now) {
  return now - (hull?.lastCarveAt ?? -Infinity) >= CONTACT_TUNING.cooldown;
}

/**
 * post-solve 를 물어 충격을 큐에 쌓는다.
 *
 * @param {World} world
 * @param {{now: () => number}} clock 시뮬레이션 시각 (s). 쿨다운·무장 지연 판정에 쓴다.
 * @returns {{drain(): Array<Impact>, size(): number}}
 *   drain 은 **강체당 가장 큰 것 하나만** 돌려준다. 한 프레임에 물리 스텝이 여러 번 돌 수
 *   있어(world.js MAX_STEPS_PER_FRAME) 같은 강체의 충격이 여럿 쌓이는데, 소비 쪽에서
 *   `respawnPieces` 가 강체를 바꿔치기하므로 두 번째부터는 **댕글링 참조**가 된다.
 */
export function installImpactListener(world, clock) {
  /** @type {Map<any, Impact>} 이번 회차의 강체별 최대 충격 */
  const pending = new Map();
  /**
   * 이번 **물리 스텝**의 (맞은 강체 → 때린 강체 → 누적) 임펄스.
   *
   * ★ 한 번의 충격이 post-solve 를 **여러 번** 부를 수 있다. 선체는 볼록 분해된 fixture 여럿을
   *   갖고 있어서, 포탄이 두 조각의 이음매에 떨어지면 임펄스가 갈라져 들어온다. 실측:
   *   깨끗이 맞은 탄은 J=689(19.8 kJ) 한 번이었는데, 이음매에 떨어진 탄은 J=398(6.6 kJ)과
   *   J=320(4.3 kJ) 둘로 갈라졌다 — **각각은 나무 임계(8 kJ) 아래라 반경이 0 이 되어 아무
   *   일도 안 일어났다.** 물리적으로는 한 번의 충돌인데 문턱을 못 넘은 것이다.
   *   플레이어에게는 "포탄이 가끔 그냥 안 박힌다"로 보이고, 그 '가끔'의 정체가 눈에 안 보이는
   *   분해 이음매라 학습이 불가능하다.
   *
   *   그래서 **한 스텝 안의 같은 (선체, 상대) 쌍은 임펄스를 합친 뒤** 반경을 낸다.
   *   합치는 단위가 스텝인 이유: 한 프레임은 물리 스텝을 최대 5번 돌리므로 프레임 단위로
   *   합치면 서로 다른 충돌이 한 덩어리가 된다. 쌍 단위인 이유: 포탄 두 발이 같은 배를
   *   같은 스텝에 맞히면 그건 두 번의 충격이지 한 번의 큰 충격이 아니다.
   * @type {Map<any, Map<any, {impulse:number, point:{x,y}, peak:number, shot:object|null}>>}
   */
  const thisStep = new Map();
  /**
   * 맞았는데 아무 일도 안 일어난 **발사체**들. (`{body, at, energy, incidence, material, reason}`)
   *
   * ★ 빗맞아 튕긴 탄은 지금까지 조용히 사라졌다. 그런데 플레이어에게 그 화면은 방금 고친
   *   "이음매에서 갈라져 무해해지던" 버그와 **구분되지 않는다** — 둘 다 "맞았는데 아무 일도
   *   안 남"이다. 경사 장갑이 배울 수 있는 규칙이 되려면 튕겼다는 사실 자체가 보여야 한다.
   *
   * ⚠ **발사체만** 담는다. post-solve 는 접촉이 지속되는 한 매 스텝 불리므로 암초에 기댄
   *   배까지 담으면 초당 60건이 쏟아진다. 탄은 맞는 순간 `spent` 로 죽는 일회성 사건이라
   *   그 문제가 없고, 한 탄이 두 스텝에 걸쳐 접촉해도 `glanced` 래치가 한 번만 통과시킨다.
   */
  const glances = [];
  /** 아무도 안 비울 때를 대비한 상한 (하니스는 매 프레임 비운다). */
  const MAX_GLANCES = 16;

  // ★ 쿨다운 시각은 **강체가 아니라 hull 에** 산다.
  //
  //   강체로 키잉하면 (WeakMap 이든 뭐든) 쿨다운이 통째로 죽는다. `respawnPieces` 가 차감
  //   때마다 강체를 파괴하고 새로 만들기 때문에 **차감하는 순간이 곧 쿨다운 초기화**가 되고,
  //   그러면 쿨다운을 0 으로 둔 것과 결과가 한 치도 다르지 않다 (벤치가 이걸로 잡았다).
  //   hull.lastCarveAt 은 status 와 함께 조각에 승계되므로 강체가 바뀌어도 살아남는다.
  // (판정은 아래 `offCooldown` 하나로 모아 두었다 — 벤치가 직접 부를 수 있어야 한다.)

  world.on('post-solve', (contact, impulse) => {
    if (!contact.isTouching()) return;

    const now = clock.now();
    const a = contact.getFixtureA().getBody();
    const b = contact.getFixtureB().getBody();

    // 임펄스 합과, 가장 세게 맞은 접촉점.
    const normals = impulse.normalImpulses;
    let total = 0;
    let peak = -1;
    let peakIndex = 0;
    for (let i = 0; i < normals.length; i++) {
      total += normals[i];
      if (normals[i] > peak) { peak = normals[i]; peakIndex = i; }
    }
    if (!(total > 0)) return;

    const wm = contact.getWorldManifold(null);
    const point = wm?.points?.[peakIndex] ?? wm?.points?.[0];
    if (!point) return;

    consider(a, b, total, point, peak, now);
    consider(b, a, total, point, peak, now);
  });

  // 스텝이 끝나면 누적분을 하나의 충격으로 환산해 큐에 올린다. planck 이 `post-step` 을
  // `m_locked` 를 푼 **뒤에** 발행하므로 여기는 이미 스텝 밖이지만, 강체를 건드리지는 않는다 —
  // 소비(=차감)는 지금까지처럼 호출자가 `drain()` 으로 가져가서 한다.
  world.on('post-step', () => {
    const now = clock.now();
    for (const [body, byOther] of thisStep) {
      const hull = body.getUserData()?.hull;
      if (!hull) continue;                               // 스텝 중에 파괴됐다
      for (const [other, acc] of byOther) {
        const mu = acc.shot
          ? other.getMass()                              // 포탄은 배에 비해 가벼워 μ ≈ 포탄 질량
          : reducedMass(body.getMass(), other.getMass());
        const material = hull.params.material;
        // 발사체만 자기 총 에너지를 알고 다닌다 → 재질별 입사각 감쇠가 걸린다.
        // 암초·선체끼리는 `E_총` 을 모르므로 법선분 그대로 (= deflection 1 과 같다).
        const strikeEnergy = acc.shot ? acc.shot.strikeEnergy : null;
        // ★ 표시용 에너지는 **실효분**이어야 한다. 법선분을 그대로 내보내면 빗맞은 탄에서
        //   "0.6 kJ 가 반경 0.32 m 를 뜯었습니다" 같은 말이 나온다 — 실제로 일한 것은
        //   경사 감쇠를 되돌린 12.0 kJ 다. 재질이 흘려보내지 않은 만큼이 곧 일한 몫이다.
        const e = resolveImpactEnergy({
          impulse: acc.impulse, effectiveMass: mu, material, strikeEnergy,
        });
        const radius = carveRadiusFromImpact({
          impulse: acc.impulse,
          effectiveMass: mu,
          material,
          hullArea: hull.params.area,
          strikeEnergy,
        });
        // 임계 아래는 **큐에 넣지도 않는다.** 넣으면 형상은 그대로인데 재구성 비용만 나간다.
        if (radius < DAMAGE_TUNING.minCarveRadius) {
          // 다만 조용히 버리지는 않는다 — 탄이 튕겼다는 것은 플레이어가 알아야 할 사건이다.
          if (acc.shot && !acc.shot.glanced && glances.length < MAX_GLANCES) {
            acc.shot.glanced = true;
            glances.push({
              body,
              at: { x: acc.point.x, y: acc.point.y },
              energy: e.effective,
              incidence: e.incidence,
              material,
              radius,
              // 임계를 못 넘었나(튕김), 넘었지만 자국이 너무 작은가(긁힘).
              reason: e.effective < material.impactThreshold ? 'deflected' : 'scratch',
            });
          }
          continue;
        }

        const prev = pending.get(body);
        if (prev && prev.radius >= radius) continue;
        pending.set(body, {
          body,
          at: { x: acc.point.x, y: acc.point.y },
          radius,
          energy: e.effective,
          incidence: e.incidence,
          source: acc.shot ? 'shot' : (other.getUserData()?.obstacle ? 'reef' : 'hull'),
          other,
          projectile: acc.shot ? other : null,
        });
      }
    }
    thisStep.clear();
  });

  /** 한쪽 강체가 이 충격으로 깎이는지 판정해 **이번 스텝 누적**에 더한다. */
  function consider(body, other, impulse, point, peak, now) {
    const hull = body.getUserData()?.hull;
    if (!hull) return;                                   // 암초·포탄은 안 깎인다

    const shot = other.getUserData()?.projectile;
    if (shot && now - shot.bornAt < CONTACT_TUNING.armDelay) return;   // 아직 무장 전

    // ★ 쿨다운은 **지속 접촉**의 백스톱이지 발사 속도 제한이 아니다. 발사체는 맞는 순간
    //   `spent` 로 죽는 **일회성 사건**이라 여기 걸릴 이유가 없다.
    //
    //   실측(나무 둥근 배 · 포탑 4문 14초): 접촉 487건 중 **406건이 쿨다운에 막혀 조용히
    //   사라졌다.** 121발을 쐈는데 차감은 51회뿐이었고, 막힌 접촉의 실효 에너지는 전부
    //   11.8~20.0 kJ 로 나무 임계(8 kJ)를 넉넉히 넘고 있었다. 즉 **뚫려야 할 탄이 뚫리지
    //   않았고**, 아무 메시지도 없어 플레이어에겐 "튕겼다"로 보였다.
    //   (경사 장갑은 무죄다 — 나무의 실효 에너지는 어느 각도에서도 11.8 kJ 아래로 안 간다.)
    //
    //   빼도 안전하다: `pending` 이 강체당 하나만 남기고 `drain()` 은 프레임당 한 번이라,
    //   한 강체가 한 프레임에 두 번 깎이는 일 자체가 구조적으로 불가능하다.
    if (!shot && !offCooldown(hull, now)) return;

    let byOther = thisStep.get(body);
    if (!byOther) thisStep.set(body, byOther = new Map());

    const acc = byOther.get(other);
    if (!acc) {
      byOther.set(other, { impulse, point: { x: point.x, y: point.y }, peak, shot });
      return;
    }
    acc.impulse += impulse;
    // 차감 지점은 **가장 세게 맞은 접촉점**이다 — 갈라진 임펄스의 평균을 내면 이음매 위,
    // 즉 두 조각 사이의 빈 곳을 깎게 된다.
    if (peak > acc.peak) {
      acc.peak = peak;
      acc.point = { x: point.x, y: point.y };
    }
  }

  return {
    size: () => pending.size,
    /** 맞았지만 아무 자국도 안 남긴 탄들. 소비자가 안 부르면 상한에서 조용히 멈춘다. */
    drainGlances() {
      const out = glances.slice();
      glances.length = 0;
      return out;
    },
    drain() {
      const out = [...pending.values()];
      pending.clear();
      const now = clock.now();
      // 소비자가 실제로 깎기 **전에** 찍는다. 깎고 나면 그 hull 은 파괴돼 사라지고,
      // 승계는 respawnPieces 가 이 값을 조각으로 옮겨 주는 것으로 이뤄진다.
      for (const im of out) im.body.getUserData().hull.lastCarveAt = now;
      return out;
    },
  };
}
