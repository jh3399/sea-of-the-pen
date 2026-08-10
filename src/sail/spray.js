// 물보라 — 뱃머리가 물을 가를 때, 노깃이 물을 밀 때, 부스터를 켤 때 튀는 픽셀 입자.
//
// ★ **입자는 물리 스텝에서 태어나고 물리 시각으로 늙는다.** 렌더 프레임에서 뿌리면 240Hz
//   장비에서 네 배로 튀고(추력을 렌더에 넣었을 때와 같은 함정, D0), 일시정지·프레임 드랍에서
//   물보라만 따로 흐른다. 태어난 뒤에는 상태를 갱신하지 않는다 — 자리는 `at` 부터의 나이에서
//   해석적으로 나온다 (`sparks` 와 같은 규약).
// ★ 난수는 `hash2` 다. `Math.random()` 은 같은 스텝을 다시 그릴 때마다 값이 바뀌어 되감기가
//   불가능해지고, 프로젝트의 나머지 절차적 그림과 규약이 어긋난다.
// ★ 새 상태는 이 파일 밖에 하나도 없다. 얼마나 뿌릴지는 **이미 계산된 값**(강체 속도,
//   스트로크 봉투, `control.held`)에서 그대로 읽는다 — 설계 원칙 3. 부스터 이펙트가
//   `deviceForcesLocal` 과 같은 `control.held[item.bind]` 판정을 그대로 재사용하는 것도 같은
//   이유다 — "언제 켜져 있는가"를 렌더가 다시 정의하면 힘과 그림이 어긋날 수 있다.
import { FIXED_DT } from '../physics/world.js';
import { strokeProgress } from '../physics/devices.js';
import { hash2, rgba, oarBladeLocal } from './render.js';

export const SPRAY_TUNING = {
  /** 뱃머리가 물을 가르기 시작하는 속도 (m/s). 이 아래는 잔잔히 미끄러진다. */
  minSpeed: 1.0,
  /** 초과 속도 1 m/s 당 초당 입자 수 — "빠를수록 더 많이"가 여기 한 줄이다. */
  bowRate: 10,
  /** 뱃머리 물보라가 물려받는 배 속도의 비율. */
  bowKick: 0.32,
  /** 좌우로 밀려나는 속도 (기본 + 배 속도 비례, m/s). */
  bowSideBase: 0.5,
  bowSideGain: 0.22,
  /** 노깃이 최대로 물을 밀 때의 초당 입자 수 (봉투 세기에 비례해 줄어든다). */
  oarRate: 28,
  /** 노깃이 밀어낸 물이 튀는 속도 (m/s). */
  oarKick: 1.7,
  /** 입자 수명 (s). */
  life: 0.62,
  /** 부스터가 켜져 있는 동안 노즐 하나가 내는 초당 입자 수. 노깃보다 진하다 — 9000 N 은
   *  노 한 자루 피크의 열 배가 넘고, 그 세기 차이가 그림에서도 읽혀야 한다. */
  boosterRate: 55,
  /** 배기가 뿜어 나가는 속도 (m/s). 노깃 물보라(1.7)보다 빠르다 — 물을 미는 것과 불을
   *  내뿜는 것은 다른 세기의 그림이어야 한다. */
  boosterKick: 4.8,
  /** 노즐 중심에서 좌우로 퍼지는 폭 (m). */
  boosterSpread: 0.22,
  /** 노즐이 부착점에서 배기 반대 방향으로 물러난 거리 (m) — 불꽃이 선체 안이 아니라
   *  아이템 뒤에서 뿜어져 나오게 한다. */
  boosterOffset: 0.18,
  /** 부스터 입자 수명 (s). 물보라보다 짧다 — 불꽃은 물방울처럼 오래 날지 않는다. */
  boosterLife: 0.4,
  /** 부스터 입자 한 칸의 크기 배율 — 노즐 불꽃은 물방울보다 굵게 찍는다. */
  boosterSize: 1.125,
  /** 픽셀 한 칸 (m). 항해 화면 20 px/m 에서 약 3 px — 물 반짝임과 같은 눈금이다. */
  cell: 0.15,
  /** 동시에 살아 있는 입자 상한. 넘으면 오래된 것부터 버린다. */
  max: 320,
};

/** 부스터 배기 팔레트 — `draw/icons.js` 의 BOOSTER_GRID(F/f) 와 같은 톤이라, 부착 아이콘과
 *  뿜는 불꽃이 같은 재질처럼 보인다. */
const FLAME_CORE = '#ffd35c';
const FLAME_MID = '#f0a53c';
const FLAME_SMOKE = '#6b7581';

/** 물보라 상태 — 입자 배열 하나뿐이다. */
export function createSpray() {
  return { particles: [] };
}

function push(spray, p) {
  spray.particles.push(p);
  if (spray.particles.length > SPRAY_TUNING.max) {
    spray.particles.splice(0, spray.particles.length - SPRAY_TUNING.max);
  }
}

/**
 * 이 스텝에 `want` 개(소수 가능)를 뿌린다 — 정수부는 그대로, 소수부는 해시 확률로.
 * 누산기를 두지 않는 이유는 강체가 파손마다 새로 태어나기 때문이다 (누산기를 어디에 걸어도
 * 조각과 함께 사라지거나, 죽은 강체의 것이 남는다).
 */
function spawnCount(want, seed) {
  const whole = Math.floor(want);
  return whole + (hash2(seed * 12.9898, seed * 78.233) < want - whole ? 1 : 0);
}

/** 선체 로컬 점 → 월드. Vec2 를 만들지 않으려고 손으로 돌린다 (스텝마다 수십 번 불린다). */
function toWorld(pos, cos, sin, lx, ly) {
  return { x: pos.x + lx * cos - ly * sin, y: pos.y + lx * sin + ly * cos };
}

/**
 * 뱃머리 물보라 — 진행 방향으로 가장 멀리 나간 외곽점에서 좌우로 뿌린다.
 *
 * "앞"은 뱃머리(+x)가 아니라 **속도 방향**이다. 뒤로 젓거나 옆으로 떠밀릴 때 반대쪽 끝이
 * 물을 가르는 것이 맞고, 그래야 해류에 휩쓸리는 4장에서도 그림이 거짓말을 하지 않는다.
 */
function emitBow(spray, hull, pos, cos, sin, vx, vy, speed, sec, seed, dt) {
  const T = SPRAY_TUNING;
  const rate = (speed - T.minSpeed) * T.bowRate;
  if (rate <= 0) return;

  // 속도 방향을 선체 로컬로 되돌려 외곽점을 고른다 (외곽선은 로컬 좌표다).
  const ux = vx / speed;
  const uy = vy / speed;
  const lx = ux * cos + uy * sin;
  const ly = -ux * sin + uy * cos;
  let bow = null;
  let best = -Infinity;
  for (const p of hull.outline) {
    const proj = p.x * lx + p.y * ly;
    if (proj > best) { best = proj; bow = p; }
  }
  if (!bow) return;

  const count = spawnCount(rate * dt, seed);
  for (let i = 0; i < count; i++) {
    const h1 = hash2(seed + i * 3.7, seed * 1.3 - i * 2.1);
    const h2 = hash2(seed * 2.7 - i * 1.9, seed + i * 5.3);
    const side = h1 < 0.5 ? -1 : 1;
    // 뱃머리 점에서 옆으로 조금 물러난 자리 — 한 점에서만 나오면 분수처럼 보인다.
    const off = (0.15 + h2 * 0.5) * side;
    const px = bow.x - lx * off * 0.35 - ly * off;
    const py = bow.y - ly * off * 0.35 + lx * off;
    const at = toWorld(pos, cos, sin, px, py);
    const sideSpeed = (T.bowSideBase + T.bowSideGain * speed) * (0.6 + h2 * 0.8);
    // 앞으로 딸려 가면서 옆으로 갈라진다 — 배보다 느리므로 결과적으로 뒤로 흘러 항적에 붙는다.
    push(spray, {
      x: at.x,
      y: at.y,
      vx: vx * T.bowKick + (-uy * side) * sideSpeed,
      vy: vy * T.bowKick + (ux * side) * sideSpeed,
      at: sec,
      life: T.life * (0.7 + h1 * 0.6),
      size: T.cell * (speed > 3.2 && h2 > 0.55 ? 2 : 1),
    });
  }
}

/**
 * 노깃 물보라 — 노가 물을 미는 세기(`strokeProgress` = 힘 봉투)에 그대로 비례한다.
 *
 * 세기를 렌더가 따로 재지 않으므로 `oarStrokeDuration` 노브를 돌리면 힘·그림·물보라가
 * 한꺼번에 따라온다. 뿌리는 방향은 젓는 방향(`stroke[side]`)의 반대 — 물은 밀린 쪽으로 간다.
 */
function emitOars(spray, hull, pos, cos, sin, vx, vy, sec, seed, dt) {
  const T = SPRAY_TUNING;
  const control = hull.control;
  if (!control?.stroke) return;

  let n = 0;
  for (const item of hull.items ?? []) {
    if (item.type !== 'oar' || !item.side) continue;
    const power = strokeProgress(control, item.side);
    if (power <= 0.05) continue;
    const dir = control.stroke[item.side] ?? 0;
    if (!dir) continue;
    const outward = item.side === 'port' ? 1 : -1;
    const blade = oarBladeLocal(item, control);
    n += 1;
    const count = spawnCount(T.oarRate * power * dt, seed + n * 17.3);
    for (let i = 0; i < count; i++) {
      const h1 = hash2(seed + n * 4.1 + i * 2.3, seed - n * 1.7 + i * 3.1);
      const h2 = hash2(seed * 1.9 - i * 4.7, seed + n * 6.1 + i * 1.3);
      const px = blade.x + (h1 - 0.5) * 0.5;
      const py = blade.y + outward * (h2 * 0.35);
      const at = toWorld(pos, cos, sin, px, py);
      // 로컬 −dir 방향(물이 밀려나는 쪽) + 바깥으로 조금. 배 속도도 일부 물려받는다.
      const kick = T.oarKick * (0.55 + power * 0.75);
      const kx = -dir * kick;
      const ky = outward * kick * (0.15 + h1 * 0.35);
      push(spray, {
        x: at.x,
        y: at.y,
        vx: vx * 0.35 + kx * cos - ky * sin,
        vy: vy * 0.35 + kx * sin + ky * cos,
        at: sec,
        life: T.life * (0.55 + h2 * 0.5),
        size: T.cell * (power > 0.6 && h1 > 0.5 ? 2 : 1),
      });
    }
  }
}

/**
 * 부스터 배기 — 켜져 있는 동안(`control.held[item.bind]`) 부착 반대 방향(배기구)으로 뿜는다.
 *
 * 힘이 미는 방향은 `item.angle`(§4.1 "방향")이고, 불꽃은 그 반대로 나가야 뉴턴 3법칙이
 * 그림에서도 읽힌다 — `draw/icons.js` 의 BOOSTER_GRID 가 몸체·불꽃을 반대쪽에 두는 것과
 * 같은 규약이다. 세기(발사 여부)는 `physics/devices.js#deviceForcesLocal` 이 힘을 낼 때 보는
 * 바로 그 판정(`control.held[bind]`)을 그대로 읽는다 — 렌더가 "켜졌다"를 다시 정의하지 않는다.
 */
function emitBooster(spray, hull, pos, cos, sin, vx, vy, sec, seed, dt) {
  const T = SPRAY_TUNING;
  const held = hull.control?.held;
  if (!held) return;

  let n = 0;
  for (const item of hull.items ?? []) {
    if (item.type !== 'booster' || !item.bind || !held[item.bind]) continue;
    n += 1;
    const bx = Math.cos(item.angle ?? 0);
    const by = Math.sin(item.angle ?? 0);
    // 노즐 = 부착점에서 배기 방향(추력의 반대)으로 조금 물러난 자리.
    const nx = item.x - bx * T.boosterOffset;
    const ny = item.y - by * T.boosterOffset;

    const count = spawnCount(T.boosterRate * dt, seed + n * 23.1);
    for (let i = 0; i < count; i++) {
      const h1 = hash2(seed + n * 5.3 + i * 2.9, seed - n * 2.1 + i * 4.3);
      const h2 = hash2(seed * 2.3 - i * 3.7, seed + n * 7.9 + i * 1.7);
      const spread = (h1 - 0.5) * T.boosterSpread;
      // 배기 방향으로 조금 더 밀어내고(h2), 그 축에 수직으로 퍼뜨린다(spread).
      const px = nx - bx * h2 * 0.25 - by * spread;
      const py = ny - by * h2 * 0.25 + bx * spread;
      const at = toWorld(pos, cos, sin, px, py);
      const kick = T.boosterKick * (0.6 + h2 * 0.6);
      const kx = -bx * kick;
      const ky = -by * kick;
      push(spray, {
        x: at.x,
        y: at.y,
        vx: vx * 0.2 + kx * cos - ky * sin,
        vy: vy * 0.2 + kx * sin + ky * cos,
        at: sec,
        life: T.boosterLife * (0.6 + h1 * 0.5),
        size: T.cell * T.boosterSize * (h2 > 0.55 ? 2 : 1),
        kind: 'booster',
      });
    }
  }
}

/**
 * 물리 스텝 하나 — 살아 있는 강체들이 물보라를 뿌리고, 수명이 다한 입자를 걷어낸다.
 *
 * @param {Iterable<object>} bodies 선체 강체 (플레이어 조각·해적선 등 `hull` 을 가진 것)
 * @param {number} sec 물리 시각(`simTime`)
 * @param {number} stepIndex 고정 스텝 번호 — 해시 시드다 (같은 스텝은 언제나 같은 물보라).
 * @param {number} dt 고정 스텝 간격 (s)
 */
export function stepSpray(spray, bodies, sec, stepIndex, dt = FIXED_DT) {
  let seed = stepIndex * 0.6180339887;
  for (const body of bodies) {
    const hull = body.getUserData?.()?.hull;
    if (!hull?.outline?.length) continue;
    const v = body.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y);
    const pos = body.getPosition();
    const angle = body.getAngle();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    seed += 7.13;
    if (speed > SPRAY_TUNING.minSpeed) {
      emitBow(spray, hull, pos, cos, sin, v.x, v.y, speed, sec, seed, dt);
    }
    emitOars(spray, hull, pos, cos, sin, v.x, v.y, sec, seed + 3.31, dt);
    emitBooster(spray, hull, pos, cos, sin, v.x, v.y, sec, seed + 5.77, dt);
  }

  // 수명이 지난 입자를 버린다. 상한이 320 이라 매 스텝 훑어도 무시할 만하다.
  const alive = spray.particles.filter((p) => sec - p.at <= p.life);
  if (alive.length !== spray.particles.length) spray.particles = alive;
}

/**
 * 물보라·배기를 찍는다 — 알파와 색을 **세 단계로 끊어** 픽셀 그림의 규약을 지킨다.
 * 매끄럽게 페이드하면 안티에일리어스된 물감처럼 보여 나머지 화면과 재질이 어긋난다.
 * 자리는 픽셀 격자에 스냅해 물 반짝임과 같은 눈금 위에 선다.
 *
 * 부스터 입자(`kind:'booster'`)는 물 팔레트 대신 불꽃 팔레트(`FLAME_*`)로 갈아 끼운다 — 같은
 * 감쇠 곡선(밝게 → 중간 → 옅게)을 쓰되 물이 아니라 불이 식어 가는 그림이 된다.
 */
export function drawSpray(ctx, spray, sec, { surface = null } = {}) {
  const T = SPRAY_TUNING;
  const foam = '#ffffff';
  const mid = surface?.glint ?? '#cfe6ff';
  const late = surface?.wake ?? '#9fb4f0';

  for (const p of spray.particles) {
    const age = (sec - p.at) / p.life;
    if (age < 0 || age > 1) continue;
    // 던져진 뒤 물(또는 공기)에 잡혀 멎는다 — 등속이면 영영 미끄러져 물 위 이물질로 보인다.
    const drift = p.life * (age - 0.5 * age * age);
    // 연기(늦은 단계)는 이전까지 p.size 를 버리고 물 칸 크기로 되돌아갔다 — 부스터 연기도
    // boosterSize 를 그대로 따르게 한다. 물보라(late)는 원래 규약을 유지한다.
    const lateSize = p.kind === 'booster' ? T.cell * T.boosterSize : T.cell;
    const size = age < 0.66 ? p.size : lateSize;
    const x = Math.round((p.x + p.vx * drift) / T.cell) * T.cell;
    const y = Math.round((p.y + p.vy * drift) / T.cell) * T.cell;
    if (p.kind === 'booster') {
      if (age < 0.32) ctx.fillStyle = rgba(FLAME_CORE, 0.95);
      else if (age < 0.66) ctx.fillStyle = rgba(FLAME_MID, 0.72);
      else ctx.fillStyle = rgba(FLAME_SMOKE, 0.4);
    } else if (age < 0.32) ctx.fillStyle = rgba(foam, 0.92);
    else if (age < 0.66) ctx.fillStyle = rgba(mid, 0.62);
    else ctx.fillStyle = rgba(late, 0.34);
    ctx.fillRect(x, y, size, size);
  }
}
