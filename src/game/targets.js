// 수동 표적 — 조준·발사·이동 로직이 없는 일반 선체.
//
// ★ `createHullBody` 를 그대로 쓰므로 포탄 접촉·재질 내구·파손 조각·유체 저항이 플레이어 배와
// 같은 경로를 탄다. 표적 전용 HP나 피탄 분기는 없고, `hull.role/entityId` 만 게임 계층의 표식이다.
import { MATERIALS } from '../hull/params.js';
import { createHullBody } from '../physics/body.js';

const SPEC_KEYS = new Set([
  'entityId', 'x', 'y', 'angle', 'width', 'height', 'outline', 'holes', 'material',
]);

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
 * 검증된 표적 스펙 하나 → 동적 나무 선체.
 * `outline` 을 생략하면 width×height 직사각형을 만들고, angle 은 월드 라디안이다.
 */
export function createPassiveTarget(world, raw, index = 0) {
  const at = `수동 표적 #${index}`;
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
  const body = createHullBody(
    world,
    { outline, holes, items: [], crew: null, role: 'target', entityId },
    {
      position: { x: finite(raw.x, at, 'x'), y: finite(raw.y, at, 'y') },
      angle: finite(raw.angle, at, 'angle', 0),
      material,
      extraMass: 0,
      role: 'target',
      entityId,
    },
  );
  if (!body) throw new Error(`${at}: 선체 형상을 만들 수 없습니다.`);
  return body;
}

/** 스펙 배열을 한꺼번에 만든다. entityId 중복은 조각·점수 귀속을 모호하게 하므로 거부한다. */
export function createPassiveTargets(world, specs) {
  if (!Array.isArray(specs)) throw new Error('수동 표적 스펙 형식 오류: 배열이 아닙니다.');
  const ids = new Set();
  return specs.map((spec, i) => {
    if (ids.has(spec?.entityId)) throw new Error(`수동 표적 #${i}: 중복 entityId '${spec.entityId}'.`);
    ids.add(spec?.entityId);
    return createPassiveTarget(world, spec, i);
  });
}
