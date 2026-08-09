// 해적선 — 정해진 항로를 도는 파손 가능한 선체 + 주기 대포.
//
// ★ 이동도 `game/turrets.js` 와 같은 원칙을 따른다: 위치는 경과 시간의 **순수 함수**로
//   정해지고, 플레이어를 쫓거나 피하는 판단은 없다 (이 프로젝트는 "게임 안에 AI 는 없다"를
//   전제로 선다). 난도는 조준이 아니라 항로 모양·발사 리듬(맵 데이터)으로 만든다.
//
// ★ 선체·파손은 `game/targets.js` 의 수동 표적과 같은 경로(`createHullBody`)를 타고, 발사는
//   플레이어와 완전히 같은 `items/cannon.js` + `physics/devices.js` 파이프라인을 탄다.
//   새로 짠 것은 오직 "경로를 따라 걷는 시계"뿐이다.
import { Vec2 } from 'planck';
import { MATERIALS } from '../hull/params.js';
import { createHullBody } from '../physics/body.js';
import { attachItem, canAttachAt, itemsExtraMass } from '../items/attach.js';
import { CANNON_TUNING } from '../items/cannon.js';

export const PIRATE_TUNING = {
  /** 대포 발사 주기 기본값 (s). 재장전 바닥(`CANNON_TUNING.reload`)보다 여유 있게 잡는다. */
  period: 2.0,
  /** 사이클 내 오프셋 기본값 (s). 대포가 여럿이면 위상을 어긋내 교대로 쏘게 한다. */
  phase: 0,
  /** 항로를 따라가는 속도 기본값 (m/s). */
  speed: 3.0,
};

const SPEC_KEYS = new Set([
  'entityId', 'width', 'height', 'outline', 'holes', 'material', 'path', 'loop', 'speed', 'cannons',
]);
const CANNON_SPEC_KEYS = new Set(['x', 'y', 'angle', 'period', 'phase']);

function finite(v, at, key, fallback = undefined) {
  const n = v ?? fallback;
  if (!Number.isFinite(n)) throw new Error(`${at}: ${key} 가 유한수가 아닙니다.`);
  return n;
}

function ring(raw, at, key) {
  if (!Array.isArray(raw) || raw.length < 3) throw new Error(`${at}: ${key} 는 점 3개 이상이어야 합니다.`);
  return raw.map((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error(`${at}: ${key}[${i}] 좌표가 유효하지 않습니다.`);
    }
    return { x: p.x, y: p.y };
  });
}

/**
 * 경로(점 배열) → 누적 거리 표.
 * `loop:true` 는 마지막 점에서 첫 점으로 이어지는 가상 구간을 표에 포함시켜 순환시킨다.
 * `loop:false` 는 원본 구간만 담고, 왕복(핑퐁)은 `pathProgress` 가 거리 쪽에서 접는다.
 */
export function buildPathTable(path, loop) {
  const points = loop ? [...path, path[0]] : path;
  const cumLens = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    cumLens.push(cumLens[i] + Math.hypot(dx, dy));
  }
  return { points, cumLens, total: cumLens[cumLens.length - 1] };
}

function pointAtDistance(table, d, reversed) {
  const { points, cumLens, total } = table;
  const clamped = Math.max(0, Math.min(total, d));
  let i = 0;
  while (i < cumLens.length - 2 && cumLens[i + 1] < clamped) i++;
  const segLen = cumLens[i + 1] - cumLens[i];
  const t = segLen > 1e-9 ? (clamped - cumLens[i]) / segLen : 0;
  const a = points[i];
  const b = points[i + 1];
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (reversed) angle += Math.PI;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
}

/**
 * 경과 시간(`elapsed`, s) → 항로 위 위치·방향. **순수 함수**다 — `turrets.js` 의 `fireTime` 과
 * 같은 이유로, 호출 간격이 바뀌어도(프레임 히치) 같은 시각엔 같은 자리가 나와야 한다.
 *
 * `loop:false` 는 끝에서 되짚어 오는 왕복이다 — 한 바퀴 길이가 `total × 2` 인 셈이다.
 * `loop:true` 는 표(`buildPathTable`)에 이미 닫힌 구간이 들어 있으므로 그냥 순환한다.
 */
export function pathProgress(table, loop, speed, elapsed) {
  const { total } = table;
  const dist = Math.max(0, elapsed) * speed;
  if (total <= 1e-9) return pointAtDistance(table, 0, false);
  if (loop) {
    const d = ((dist % total) + total) % total;
    return pointAtDistance(table, d, false);
  }
  const cycle = total * 2;
  const d0 = ((dist % cycle) + cycle) % cycle;
  const forward = d0 <= total;
  return pointAtDistance(table, forward ? d0 : cycle - d0, !forward);
}

/**
 * 검증된 해적 스펙 하나 → 파손 가능한 동적 선체 + 이동·발사 컨트롤러.
 *
 * 스폰 위치·방향은 별도로 받지 않는다 — `path[0]` 과 `path[0]→path[1]` 방향에서 그대로
 * 파생한다. 중복 데이터로 스폰 자리와 항로가 어긋날 여지를 아예 없앤다.
 */
export function createPirate(world, raw, index = 0) {
  const at = `해적 #${index}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${at}: 객체가 아닙니다.`);
  for (const key of Object.keys(raw)) {
    if (!SPEC_KEYS.has(key)) throw new Error(`${at}: 모르는 키 '${key}'.`);
  }

  const entityId = raw.entityId;
  if (typeof entityId !== 'string' || entityId.trim() === '') {
    throw new Error(`${at}: entityId 는 빈 문자열이 아닌 문자열이어야 합니다.`);
  }
  const material = raw.material ?? 'wood';
  if (!MATERIALS[material]) throw new Error(`${at}: 모르는 재질 '${material}'.`);

  if (!Array.isArray(raw.path) || raw.path.length < 2) {
    throw new Error(`${at}: path 는 점 2개 이상이어야 합니다.`);
  }
  const path = raw.path.map((p, i) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error(`${at}: path[${i}] 좌표가 유효하지 않습니다.`);
    }
    return { x: p.x, y: p.y };
  });
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    if (!(len > 1e-6)) throw new Error(`${at}: path[${i}] 와 path[${i + 1}] 이 사실상 같은 점입니다.`);
  }

  const loop = raw.loop ?? false;
  if (typeof loop !== 'boolean') throw new Error(`${at}: loop 는 boolean 이어야 합니다.`);

  const speed = raw.speed ?? PIRATE_TUNING.speed;
  if (!(Number.isFinite(speed) && speed > 0)) throw new Error(`${at}: speed 는 0보다 커야 합니다.`);

  let outline;
  if (raw.outline != null) {
    if (raw.width != null || raw.height != null) {
      throw new Error(`${at}: outline 과 width/height 를 함께 쓸 수 없습니다.`);
    }
    outline = ring(raw.outline, at, 'outline');
  } else {
    const width = finite(raw.width, at, 'width');
    const height = finite(raw.height, at, 'height');
    if (!(width > 0) || !(height > 0)) throw new Error(`${at}: width/height 는 0보다 커야 합니다.`);
    const hx = width / 2;
    const hy = height / 2;
    outline = [
      { x: -hx, y: -hy }, { x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy },
    ];
  }
  const holes = (raw.holes ?? []).map((h, i) => ring(h, at, `holes[${i}]`));

  if (!Array.isArray(raw.cannons) || raw.cannons.length === 0) {
    throw new Error(`${at}: cannons 는 1개 이상이어야 합니다.`);
  }

  const stub = { items: [] };
  const cannons = raw.cannons.map((c, i) => {
    const cat = `${at} 대포 #${i}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(`${cat}: 객체가 아닙니다.`);
    for (const key of Object.keys(c)) {
      if (!CANNON_SPEC_KEYS.has(key)) throw new Error(`${cat}: 모르는 키 '${key}'.`);
    }
    const x = finite(c.x, cat, 'x');
    const y = finite(c.y, cat, 'y');
    const angle = finite(c.angle, cat, 'angle');
    if (!canAttachAt(outline, holes, { x, y })) {
      throw new Error(`${cat}: 부착점이 선체 밖입니다.`);
    }

    const period = c.period ?? PIRATE_TUNING.period;
    if (!(Number.isFinite(period) && period >= CANNON_TUNING.reload)) {
      throw new Error(`${cat}: period 는 ${CANNON_TUNING.reload}s 이상이어야 합니다 (받은 값 ${period}).`);
    }
    const phase = c.phase ?? PIRATE_TUNING.phase;
    if (!(Number.isFinite(phase) && phase >= 0)) throw new Error(`${cat}: phase 는 음수일 수 없습니다.`);

    // bind 는 키보드 코드가 아니라 이 스케줄러 전용 내부 식별자다 — devices.js 는 pressed 오브젝트의
    // 키로만 쓰므로 실제 트리거 키 풀과 겹칠 걱정이 없다.
    const bind = `${entityId}-cannon-${i}`;
    attachItem(stub, 'cannon', { x, y, angle, bind });
    return { bind, period, phase, n: 1 };
  });

  const start = path[0];
  const facing = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);

  const body = createHullBody(
    world,
    { outline, holes, items: stub.items, crew: null, role: 'pirate', entityId },
    {
      position: { x: start.x, y: start.y },
      angle: facing,
      material,
      extraMass: itemsExtraMass(stub.items),
      role: 'pirate',
      entityId,
    },
  );
  if (!body) throw new Error(`${at}: 선체 형상을 만들 수 없습니다.`);

  return {
    entityId,
    body,
    table: buildPathTable(path, loop),
    loop,
    speed,
    cannons,
  };
}

/** 스펙 배열을 한꺼번에 만든다. entityId 중복은 조각·점수 귀속을 모호하게 하므로 거부한다. */
export function createPirates(world, specs) {
  if (!Array.isArray(specs)) throw new Error('해적 스펙 형식 오류: 배열이 아닙니다.');
  const ids = new Set();
  return specs.map((spec, i) => {
    if (ids.has(spec?.entityId)) throw new Error(`해적 #${i}: 중복 entityId '${spec.entityId}'.`);
    ids.add(spec?.entityId);
    return createPirate(world, spec, i);
  });
}

/**
 * 컨트롤러 목록을 이번 `now` 시각의 항로 위 자리로 직접 옮긴다.
 *
 * 위치를 강제로 못 박으므로(적분이 아니라 대입) 충돌·유체 저항이 이 시계를 흔들 수 없다 —
 * 해적선은 들이받혀도 다음 스텝에 다시 항로 위로 돌아온다. 대신 순간 이동 속도를
 * `setLinearVelocity` 로 남겨, 플레이어가 들이받았을 때 상대속도 기반 충격 반응은 자연스럽게 난다.
 */
export function stepPirateMotion(pirates, now, startedAt = 0) {
  const elapsed = now - startedAt;
  for (const p of pirates) {
    if (!p.body) continue;
    const { x, y, angle } = pathProgress(p.table, p.loop, p.speed, elapsed);
    p.body.setPosition(new Vec2(x, y));
    p.body.setAngle(angle);
    p.body.setLinearVelocity(new Vec2(Math.cos(angle) * p.speed, Math.sin(angle) * p.speed));
    p.body.setAngularVelocity(0);
  }
}

/**
 * 이번 스텝에 쏠 대포가 있는 해적들의 `body → pressed` 맵을 만든다.
 *
 * 대포별 스케줄은 `turrets.js` 의 `fireTime(n) = phase + n × period` 와 같은 식이다(누산 없음,
 * `while` 로 누락 방지). `pressed` 는 그대로 `applyDevices` 의 입력에 넣으면 된다 — 실제
 * 발사 여부는 재장전 시계(`CANNON_TUNING.reload`)가 다시 한 번 검사한다.
 */
export function stepPirateCannons(pirates, now, startedAt = 0) {
  const elapsed = now - startedAt;
  const out = new Map();
  for (const p of pirates) {
    if (!p.body) continue;
    let pressed = null;
    for (const sched of p.cannons) {
      while (elapsed >= sched.phase + sched.n * sched.period) {
        pressed ??= {};
        pressed[sched.bind] = true;
        sched.n += 1;
      }
    }
    if (pressed) out.set(p.body, pressed);
  }
  return out;
}

/**
 * 파손으로 선체가 갈라졌을 때 이동·발사 컨트롤러를 새 강체로 옮긴다.
 *
 * 항로·발사 리듬은 §7.5 소속 판정과 무관한 "정체성"이라 `role`/`tag` 와 같은 급으로 모든
 * 생존 조각에 그대로 남긴다(물리 코어의 `respawnPieces` 를 건드리지 않고 화면 레이어에서
 * 처리한다). 대포 시계(`n`)는 조각마다 독립으로 진행해야 하므로 얕은 복제가 아니라 각
 * 스케줄을 새로 복사한다.
 *
 * `devices.js#fireCannons` 가 탈락한 대포의 재장전 시계를 지우는 것과 같은 이유로, 이 조각의
 * `hull.items` 에 없는 대포(§7.5 판정으로 다른 조각에 갔거나 아예 사라진 대포)의 스케줄도
 * 함께 버린다 — 안 지우면 죽은 대포가 영원히 `pressed` 를 찍어 대는 유령 시계가 된다
 * (매치할 아이템이 없어 실제로 쏘지는 않지만, 스케줄이 하는 일이 없어야 정직하다).
 */
export function rebindPirate(ctrl, body) {
  const liveBinds = new Set(
    (body.getUserData()?.hull?.items ?? [])
      .filter((it) => it.type === 'cannon')
      .map((it) => it.bind),
  );
  return {
    ...ctrl,
    body,
    cannons: ctrl.cannons.filter((s) => liveBinds.has(s.bind)).map((s) => ({ ...s })),
  };
}
