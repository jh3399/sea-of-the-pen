// 플레이어 대포 — 포구 기하 · 반동 봉투 · 포탄 발사 요청.
//
// ★ 포탄 생성 자체는 damage/projectile.js 가 맡는다. 이 모듈은 선체 로컬의 대포를 월드 좌표
// 발사 요청으로 바꾸기만 하므로, devices.js 의 고정 스텝 힘 계산과 강체 생명주기가 섞이지 않는다.
import { itemWorldAngle, itemWorldPoint } from './attach.js';

export const CANNON_TUNING = {
  /** 발사 사이의 최소 간격 (s). 재장전 중 들어온 입력은 버퍼링하지 않는다. */
  reload: 0.8,
  /** 반동을 나누어 가하는 시간 (s). 순간 임펄스 대신 예측 가능한 연속력으로 만든다. */
  recoilDuration: 0.2,
  /** 포탄 사양 — 포탑 탄과 같은 에너지 표를 쓴다. */
  speed: 55,
  mass: 12,
  radius: 0.15,
  lifetime: 6,
  /** 선체 외곽에서 추가로 띄우는 여유. planck 접촉 여유보다 충분히 크다. */
  margin: 0.10,
  material: 'iron',
};

/** sin² 반동 봉투 0..1. 시작·끝의 힘과 미분이 모두 이어진다. */
export function cannonEnvelope(t) {
  const D = CANNON_TUNING.recoilDuration;
  if (!(t >= 0) || t >= D) return 0;
  const s = Math.sin((Math.PI * t) / D);
  return s * s;
}

/**
 * 카탈로그에 적힌 반동 총충격량을 sin² 봉투로 나누어 가하는 피크 힘 (N).
 * sin² 의 시간 적분은 D/2 이므로 `peak × D/2 = impulse` 다.
 */
export function cannonPeakForce(impulse) {
  return (2 * Math.max(0, impulse ?? 0)) / CANNON_TUNING.recoilDuration;
}

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/**
 * 부착점에서 발사 방향으로 쏜 반직선이 선체 외곽을 빠져나가는 **가장 먼** 교점 거리.
 *
 * 오목 선체는 반직선이 외곽을 여러 번 드나들 수 있으므로 첫 교점을 쓰면 포탄이 뒤쪽 로브 안에
 * 태어난다. 정점 접촉과 반직선에 공선인 변도 처리해, 단순한 선분 교차의 0 나눗셈에 기대지 않는다.
 */
export function furthestRayOutlineHit(outline, origin, angle) {
  if (!Array.isArray(outline) || outline.length < 3 || !origin) return null;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const EPS = 1e-9;
  let furthest = -Infinity;

  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const ax = a.x - origin.x;
    const ay = a.y - origin.y;
    const den = cross(dx, dy, ex, ey);

    if (Math.abs(den) <= EPS) {
      // 평행 중에서도 같은 직선 위인 변은 양 끝점의 양의 투영을 후보로 삼는다.
      if (Math.abs(cross(ax, ay, dx, dy)) > EPS) continue;
      const ta = ax * dx + ay * dy;
      const tb = (b.x - origin.x) * dx + (b.y - origin.y) * dy;
      if (ta >= -EPS) furthest = Math.max(furthest, Math.max(0, ta));
      if (tb >= -EPS) furthest = Math.max(furthest, Math.max(0, tb));
      continue;
    }

    const t = cross(ax, ay, ex, ey) / den;
    const u = cross(ax, ay, dx, dy) / den;
    if (t >= -EPS && u >= -EPS && u <= 1 + EPS) furthest = Math.max(furthest, Math.max(0, t));
  }

  return Number.isFinite(furthest) ? furthest : null;
}

/** 선체 로컬 포구. 외곽 교점에서 포탄 반경 + 여유만큼 더 전진시킨다. */
export function cannonMuzzleLocal(outline, item) {
  const angle = item?.angle ?? 0;
  const origin = { x: item?.x ?? 0, y: item?.y ?? 0 };
  const hit = furthestRayOutlineHit(outline, origin, angle);
  const clearance = CANNON_TUNING.radius + CANNON_TUNING.margin;
  // 정상 부착점은 선체 안이라 반드시 교점이 있다. 잘못된 외부 데이터도 자기 충돌 쪽으로
  // 실패하지 않게, 교점이 없으면 부착점에서 최소 여유만큼은 띄운다.
  const reach = (hit ?? 0) + clearance;
  return {
    x: origin.x + Math.cos(angle) * reach,
    y: origin.y + Math.sin(angle) * reach,
  };
}

/**
 * 선체의 대포 하나 → spawnProjectile 에 바로 넘길 월드 발사 요청.
 *
 * ⚠ `bornAt` 은 **필수**다 — 호출자의 고정 스텝 시각. 없으면 `spawnProjectile` 이 요청을
 * 거절한다 (수명·무장 지연이 통째로 NaN 이 되기 때문). 선택 인자가 아니다.
 */
export function cannonShotRequest(body, item, bornAt) {
  const hull = body?.getUserData?.()?.hull;
  if (!hull || !item) return null;
  const local = cannonMuzzleLocal(hull.outline, item);
  // 포구는 부착점과 같은 변환을 탄다 — `itemWorldPoint` 를 재사용하면 이 모듈이 물리 엔진을
  // 직접 import 하지 않는다 (엔진 의존은 physics/world.js·body.js 에만).
  const muzzle = itemWorldPoint(body, local);
  const request = {
    cannon: item.key ?? null,
    entityId: hull.entityId ?? null,
    x: muzzle.x,
    y: muzzle.y,
    angle: itemWorldAngle(body, item),
    speed: CANNON_TUNING.speed,
    radius: CANNON_TUNING.radius,
    mass: CANNON_TUNING.mass,
    material: CANNON_TUNING.material,
    lifetime: CANNON_TUNING.lifetime,
  };
  if (Number.isFinite(bornAt)) request.bornAt = bornAt;
  return request;
}
