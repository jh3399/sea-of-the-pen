// 포탄 — 날아가는 동적 강체.
//
// ★ **피탄 파손 코드는 0줄이다.** `contact.js` 의 post-solve 리스너가 `{hull, projectile}` 쌍을
//   이미 처리한다 — `armDelay` 무장 판정, `μ = 포탄 질량`, `source:'shot'` 태그까지. 그러니 이
//   파일이 하는 일은 "제대로 생긴 강체를 만들고 제때 치우는 것"뿐이고, 암초 충돌과 포탑 피탄이
//   **한 코드 경로로 합쳐지는 것**이 이 설계의 절약이다 (§2 와 §3 이 같은 큐를 쓴다).
//
// ★ userData 에 `hull` 키가 **없다.** 그 사실 하나로 hydro(`hydro.js`)·fields(`fields.js`)·
//   규칙 엔진(`engine.js`)·devices 가 전부 자동으로 건너뛴다 — 항력 0, 바람 0, 규칙 0 이라
//   탄도가 직선이 된다. 암초(`physics/obstacle.js`)가 안 깎이는 것과 정확히 같은 원리이고,
//   포탄을 위한 예외 분기가 물리 어디에도 필요 없다.
import { Circle, Vec2 } from 'planck';
import { MATERIALS } from '../hull/params.js';

export const PROJECTILE_TUNING = {
  /**
   * 동시 생존 상한. 누수 백스톱이다 — 수명·경계·접촉 셋 중 하나라도 새면 여기서 걸린다.
   * 정상 경로에서는 닿지 않는다 (포탑 2문 × 수명 6s ÷ 주기 1.5s = 8발).
   */
  maxAlive: 64,
  /** 경계 밖 이 거리까지는 봐 준다 (m). 경계에 딱 붙은 탄이 깜빡이며 사라지는 것을 막는다. */
  boundsPad: 20,
};

/**
 * 포탄 하나를 스폰한다.
 *
 * @param {World} world
 * @param {{x, y, angle, speed, radius, mass, material?, bornAt, lifetime}} req
 *   `angle` 은 **라디안**이다 (`createTurrets` 가 도 → 라디안 변환을 끝낸 뒤 넘긴다).
 * @returns {Body|null}
 */
export function spawnProjectile(world, req) {
  const { x, y, angle, speed, radius, mass, bornAt, lifetime } = req;
  // 스텝 안에서는 강체를 못 만든다. `onPreStep` 은 `world.step()` **밖**이라 안 걸리지만,
  // 계약을 코드로 남겨 둔다 — 나중에 post-solve 안에서 부르고 싶어지는 순간이 온다.
  if (world.isLocked()) return null;
  if (!(radius > 0) || !(mass > 0)) return null;
  // ⚠ `bornAt` 이 없으면 `expiresAt` 이 NaN 이 되어 **수명 컬링이 영영 안 걸리고**(`now >= NaN`
  //   은 항상 false) `contact.js` 의 무장 지연도 그냥 통과한다. 조용히 새는 대신 여기서 거절해
  //   "시각을 안 넘긴 호출자"가 첫 발에서 드러나게 한다.
  if (!Number.isFinite(bornAt) || !Number.isFinite(lifetime)) return null;

  const material = MATERIALS[req.material] ?? MATERIALS.iron;

  const body = world.createBody({
    type: 'dynamic',
    position: new Vec2(x, y),
    // ★ CCD. 55 m/s × 1/60 = 0.92 m/step 이고 탄 반경은 0.15 m 라, 이게 없으면 얇은 선체를
    //   그냥 지나간다. planck 은 동적↔동적에서 `isBullet() || !isDynamic()` 일 때만 TOI 를
    //   돌리므로(선체가 동적이다) 탄 쪽에 반드시 붙어야 한다.
    bullet: true,
    // I = 0. 피탄 임펄스가 순수 선형이 되어 J ≈ mΔv 가 유지된다 — 탄이 스핀을 먹으면
    // 에너지 일부가 회전으로 새고 carveRadiusFromImpact 의 전제가 어긋난다.
    fixedRotation: true,
    // 항력이 붙으면 55 m/s 전제가 무너지고 E = J²/2μ 가 통째로 달라진다. hull 이 없어
    // hydro 는 애초에 안 걸리지만, 여기서도 0 으로 못 박아 둔다.
    linearDamping: 0,
    angularDamping: 0,
  });

  body.createFixture({
    shape: new Circle(radius),
    // getMass() 가 정확히 mass 가 되게. `contact.js` 가 이 값을 μ 로 **직접** 읽으므로
    // 여기가 틀리면 피탄 에너지 스케일 전체가 조용히 어긋난다.
    density: mass / (Math.PI * radius * radius),
    friction: 0,
    // 튕기면 J = μΔv 가 커져 재질 내구 표가 산정한 반경(나무 0.50 · 철 0.13)이 어긋난다.
    restitution: 0,
    // ★ 포탄끼리는 절대 충돌하지 않는다. 음수 groupIndex 는 **같은 그룹끼리만** 무조건
    //   비충돌이고 선체·암초(groupIndex 0)와는 기본 규칙을 그대로 탄다. 이게 없으면 두 포탑의
    //   빔이 교차할 때 서로의 탄을 지우는데, 맵 제작자가 예측할 수 없는 종류의 창발이라
    //   원칙 1 이 지키려는 것과 반대다.
    filterGroupIndex: -1,
  });

  body.setLinearVelocity(new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed));
  body.setUserData({
    projectile: {
      bornAt,
      expiresAt: bornAt + lifetime,
      material, mass, radius, speed,
      /**
       * 이 탄이 **가지고 있는** 총 운동에너지 (J). `carveRadiusFromImpact` 의 입사각 감쇠가
       * 이 값을 쓴다 — 솔버가 주는 것은 법선분뿐이라 흘려보낸 접선분을 알 길이 없다.
       * 항력이 0 이라 속력이 안 변하므로 태어날 때 한 번 재면 끝까지 정확하다.
       */
      strikeEnergy: 0.5 * mass * speed * speed,
      /** 임무를 마쳤는가. `installProjectileContacts` 가 찍고 `cullProjectiles` 가 치운다. */
      spent: false,
      turret: req.turret ?? null,
    },
  });
  return body;
}

/**
 * 접촉한 포탄에 소진 표시를 남긴다. **월드마다 한 번만** 건다 (`world.on` 은 push 라
 * 출항할 때마다 걸면 리스너가 쌓인다).
 *
 * ★ 소멸 규칙을 접촉 하나로 통일한 것이 §3 의 "암초 = 엄폐물"을 **코드 0줄로** 만든다.
 *   선체 명중(임계 이상·이하 둘 다)·암초·포탑이 전부 같은 규칙을 타므로, 맵 제작자가 암초를
 *   포탑과 항로 사이에 놓기만 하면 엄폐가 성립한다. 관통하는 탄을 원하면 이 규칙을 재질
 *   조건으로 바꾸는 것이 확장 방향이지, 맵에 예외를 다는 것이 아니다.
 *
 * 콜백 안에서 하는 일이 **userData 쓰기뿐**이라 planck 의 "강체를 만들거나 부수지 말 것"
 * 금지에 걸리지 않는다. 실제 파괴는 스텝 밖의 `cullProjectiles` 가 한다.
 */
export function installProjectileContacts(world) {
  world.on('begin-contact', (contact) => {
    for (const fixture of [contact.getFixtureA(), contact.getFixtureB()]) {
      const shot = fixture.getBody().getUserData()?.projectile;
      if (shot) shot.spent = true;
    }
  });
}

/**
 * 수명이 다했거나, 경계를 벗어났거나, 이미 무언가에 맞은 포탄을 치운다.
 *
 * ⚠ **스텝 밖에서**, 그리고 충격 큐를 소비한 **뒤에** 부른다. `contact.js` 의 Impact 가
 *   `projectile` 강체 참조를 들고 있어서, 큐를 소비하기 전에 부수면 댕글링이 된다.
 *
 * @param {number} now 시뮬레이션 시각 (s)
 * @param {{minX,minY,maxX,maxY}|null} bounds 맵 경계. 없으면 수명·접촉만 본다.
 * @returns {Array<Body>} 파괴한 강체들 — 호출자가 자기 Set 을 이걸로 동기화한다.
 */
export function cullProjectiles(world, now, bounds = null) {
  const dead = [];
  const alive = [];

  // 연결 리스트를 순회하며 파괴하므로 `getNext()` 를 **부수기 전에** 잡아야 한다.
  for (let body = world.getBodyList(); body;) {
    const next = body.getNext();
    const shot = body.getUserData()?.projectile;
    if (shot) {
      if (shot.spent || now >= shot.expiresAt || outOfBounds(body, bounds)) {
        world.destroyBody(body);
        dead.push(body);
      } else {
        alive.push(body);
      }
    }
    body = next;
  }

  // 백스톱. 여기 걸린다는 것은 위 세 조건 중 하나가 새고 있다는 뜻이므로, 오래된 것부터
  // 버려 프레임을 지키되 수를 유계로 만든다 (스폰 순서 = 월드 리스트 역순).
  for (let i = alive.length - 1; i >= PROJECTILE_TUNING.maxAlive; i--) {
    world.destroyBody(alive[i]);
    dead.push(alive[i]);
  }
  return dead;
}

function outOfBounds(body, bounds) {
  if (!bounds) return false;
  const p = body.getPosition();
  const pad = PROJECTILE_TUNING.boundsPad;
  return p.x < bounds.minX - pad || p.x > bounds.maxX + pad
    || p.y < bounds.minY - pad || p.y > bounds.maxY + pad;
}
