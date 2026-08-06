// 충돌 → 파손. planck 의 `post-solve` 를 물어 **큐에만 쌓는다.**
//
// ★ 콜백 안에서 강체를 만들거나 부수면 안 된다. planck 이 명시적으로 금지한다
//   ("You cannot create/destroy world entities inside these callbacks").
//   소비는 `stepper.advance()` 가 끝난 뒤 스텝 밖에서 한다 — 규칙 엔진의 `drain()` 과
//   똑같은 규약이고, 파라미터 재계산을 이벤트 시점에만 하는 §7.5 와도 같은 자리다.
import { carveRadiusFromImpact, reducedMass, DAMAGE_TUNING } from './impact.js';

export const CONTACT_TUNING = {
  /**
   * 같은 강체를 다시 깎기까지의 최소 간격 (s).
   *
   * ★ post-solve 는 접촉이 **지속되는 한 매 스텝** 불린다. 임계와 쿨다운이 없으면
   *   암초에 붙은 배가 초당 60번 깎여 즉사한다. D2 의 "같은 틱에 붙었다 꺼진 상태는
   *   사건이 아니다"와 정확히 같은 종류의 함정이다.
   */
  cooldown: 0.2,
  /** 발사체가 무장하기까지 (s). 총구가 발사원 안에 있어도 자기 편을 안 깎게 한다. */
  armDelay: 0.1,
};

/**
 * @typedef {{body, at:{x,y}, radius:number, energy:number,
 *            source:'reef'|'shot'|'hull', other, projectile}} Impact
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

    consider(a, b, total, point, now);
    consider(b, a, total, point, now);
  });

  /** 한쪽 강체가 이 충격으로 깎이는지 판정해 큐에 넣는다. */
  function consider(body, other, impulse, point, now) {
    const hull = body.getUserData()?.hull;
    if (!hull) return;                                   // 암초·포탄은 안 깎인다

    const shot = other.getUserData()?.projectile;
    if (shot && now - shot.bornAt < CONTACT_TUNING.armDelay) return;   // 아직 무장 전

    if (!offCooldown(hull, now)) return;

    const mu = shot
      ? other.getMass()                                  // 포탄은 배에 비해 가벼워 μ ≈ 포탄 질량
      : reducedMass(body.getMass(), other.getMass());
    const radius = carveRadiusFromImpact({
      impulse,
      effectiveMass: mu,
      material: hull.params.material,
      hullArea: hull.params.area,
    });
    // 임계 아래는 **큐에 넣지도 않는다.** 넣으면 형상은 그대로인데 재구성 비용만 나간다.
    if (radius < DAMAGE_TUNING.minCarveRadius) return;

    const prev = pending.get(body);
    if (prev && prev.radius >= radius) return;
    pending.set(body, {
      body,
      at: { x: point.x, y: point.y },
      radius,
      energy: (impulse * impulse) / (2 * mu),
      source: shot ? 'shot' : (other.getUserData()?.obstacle ? 'reef' : 'hull'),
      other,
      projectile: shot ? other : null,
    });
  }

  return {
    size: () => pending.size,
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
