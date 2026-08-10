// 불가사리 그림 — 절차적 픽셀만 쓴다. 새 그래픽 자산 0개는 `sail/render.js` 와 같은 규약이고,
// 난수도 같은 것을 쓴다 (`hash2` — 자리는 월드 좌표에 고정, 시간은 알파에만).
//
// ★ **멈추는 픽셀은 전부 물 위에 그린다.** 반투명 물 밑에 콜라이더를 두면 플레이어가
//   지나갈 수 있다고 읽고 보이지 않는 것에 부딪힌다 — 경계 암초의 톱니가 바깥으로만
//   파고들어야 하는 것(`render.js`), 도착 고리를 판정 반경 그대로 그려야 하는 것과 같은
//   불변식이다. 그래서 "반쯤 잠겼다"는 **수면선이 아니라 콜라이더 유무**로 나눈다:
//     pass 'deep'  — 콜라이더 없는 장식 덩어리. 그 위에 수몰 베일을 덮는다.
//     pass 'solid' — `createHullBody` 에 넘긴 **바로 그 폴리곤** (팔도 핵도 선체다).
//
// ★ 팔레트는 분홍이되 **지도 노드의 `abyss` 보라 계열**에 못 박혀 있다
//   (`scene/voyagemap.js`: abyss #241640 · abyssRim #6a3fb0 · eye #f2ccff).
//   연속성을 지는 것은 몸이 아니라 **입 색**이다 — `MAW_GLOW` 가 지도의 `eye` 와 같은 값이라,
//   몸이 분홍이어도 "지도에서 눈을 뜬 그것"으로 읽힌다.
import { hash2 } from './render.js';

/** 살덩이 픽셀 한 칸 (m). 물 타일(1.6 m)보다 잘아야 생물의 표면으로 읽힌다. */
const CELL = 0.55;

const ARM_DARK = '#3d1440';   // 팔 밑·그림자 — abyss 보라를 유지한다
const ARM_MID = '#9c2f6e';    // 팔 중간 (MATERIALS.flesh.color 와 같은 값)
const ARM_LIT = '#f06fa8';    // 윗면 림에만 쓰는 진분홍
const TUBERCLE = '#ffc2dd';   // 돌기 점묘
const CORE_INK = '#2a0f33';   // 핵 — 팔보다 어둡게. 대포 표적이 읽혀야 한다
const MAW_GLOW = '#f2ccff';   // ★ 지도 노드의 `eye` 와 같은 색
const BEAM_WARN = '#ff3b30';
const BEAM_FIRE = '#fff1a8';

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}

/** 볼록 폴리곤 안인가 (점 목록은 시계/반시계 무관). */
function inside(pts, x, y) {
  let neg = false;
  let pos = false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const z = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (z < 0) neg = true;
    else if (z > 0) pos = true;
    if (neg && pos) return false;
  }
  return true;
}

function bbox(pts) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * 폴리곤 하나를 살덩이 픽셀로 채운다.
 *
 * 위쪽(+Y) 가장자리에 밝은 림, 아래쪽에 그림자 — 광원이 위에 있다는 한 가지 규약만 지키면
 * 다섯 팔이 저절로 입체로 보인다. 무늬는 `hash2` 라 프레임마다 안 튄다.
 */
function fillFlesh(ctx, pts, { tint = 0 } = {}) {
  const { x0, y0, x1, y1 } = bbox(pts);
  const gx = Math.floor(x0 / CELL) * CELL;
  const gy = Math.floor(y0 / CELL) * CELL;
  for (let y = gy; y <= y1; y += CELL) {
    for (let x = gx; x <= x1; x += CELL) {
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      if (!inside(pts, cx, cy)) continue;
      // 위·아래 가장자리 판정 — 한 칸 위가 밖이면 림, 한 칸 아래가 밖이면 그림자.
      const openUp = !inside(pts, cx, cy + CELL);
      const openDown = !inside(pts, cx, cy - CELL);
      const h = hash2(x * 3.1, y * 3.1);
      let color = ARM_MID;
      if (openUp) color = ARM_LIT;
      else if (openDown) color = ARM_DARK;
      else if (h > 0.93) color = TUBERCLE;      // 드문 돌기
      else if (h < 0.22) color = ARM_DARK;      // 살결
      ctx.fillStyle = tint > 0 ? rgba(color, 1 - tint) : color;
      ctx.fillRect(x, y, CELL, CELL);
    }
  }
}

/**
 * 보스를 그린다.
 *
 * @param {{sec:number, pass:'deep'|'solid', surface:object}} options
 *   `pass:'deep'`  — 콜라이더 **없는** 장식 하반신 + 수몰 베일
 *   `pass:'solid'` — 팔과 핵의 살아 있는 선체 조각들. 판정과 1:1 이다.
 */
export function drawBoss(ctx, view, boss, { sec = 0, pass = 'solid', surface = null } = {}) {
  if (!boss) return;
  if (pass === 'deep') return drawSubmerged(ctx, boss, sec, surface);

  // ── 팔과 핵 ── **완전히 같은 그리기다.** 팔이 암초였을 때는 스펙의 점 목록을 상수처럼
  //   깔았지만, 이제 둘 다 선체 강체라 각자의 변환으로 그린다 — 폴리곤은 스폰된 그대로
  //   고정이라(§"보스 형태 전체가 안 부서지게") 매 프레임 같은 모양이 나올 뿐이다.
  //   순서는 팔이 먼저다 — 뿌리가 핵에 겹쳐 있어 핵이 위로 와야 입이 안 가린다.
  for (const set of [boss.armParts, boss.parts]) {
    for (const body of set ?? []) {
      const hull = body.getUserData()?.hull;
      if (!hull) continue;
      const p = body.getPosition();
      const a = body.getAngle();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      fillFlesh(ctx, hull.outline.map((q) => [q.x, q.y]));
      ctx.restore();
    }
  }

  drawMaw(ctx, view, boss, sec);
}

/**
 * 수면 아래의 나머지 — **콜라이더가 없다.** 팔 끝 너머로 퍼지는 덩어리를 옅게 깔고 수몰
 * 베일을 덮어, "이건 일부일 뿐"이라는 크기를 준다. 위에서 내려다보는 화면이라 수몰은
 * 가로 수면선이 아니라 **중심에서 먼 쪽이 잠긴다**로 표현한다.
 */
function drawSubmerged(ctx, boss, sec, surface) {
  const { x: cx, y: cy } = boss.coreAt;
  const from = boss.submergeFrom ?? 15;
  const outer = from * 1.85;
  const veil = surface?.base ?? '#101a3a';
  const gx = Math.floor((cx - outer) / CELL) * CELL;
  const gy = Math.floor((cy - outer * 0.62) / CELL) * CELL;
  // 아주 느린 맥동 — **알파만** 흔든다. 자리를 흔들면 프레임마다 노이즈가 된다.
  const pulse = 0.5 + 0.5 * Math.sin(sec * 0.45);

  for (let y = gy; y <= cy + outer * 0.62; y += CELL) {
    for (let x = gx; x <= cx + outer; x += CELL) {
      // 세로를 눌러 비스듬히 내려다보는 단축을 맞춘다 (맵의 SQUASH 와 같은 0.6 계열).
      const d = Math.hypot(x - cx, (y - cy) / 0.62);
      if (d < from || d > outer) continue;
      const t = (d - from) / (outer - from);          // 0 = 팔 끝, 1 = 가장 깊은 곳
      const h = hash2(x * 1.9, y * 1.9);
      if (h > 1 - t * 0.92) continue;                 // 멀수록 성기게 — 물에 녹아든다
      ctx.fillStyle = rgba(ARM_DARK, (1 - t) * 0.5 * (0.75 + 0.25 * pulse));
      ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = rgba(veil, 0.55 * t + 0.2);     // 수몰 베일
      ctx.fillRect(x, y, CELL, CELL);
    }
  }
}

/**
 * 입 — **취약 창의 유일한 표시다.** 조준이 없는 대신 플레이어가 할 일은 "열렸을 때 쏘기"라,
 * 이게 안 보이면 보스는 퍼즐이 아니라 무작위 피해가 된다 (`turrets.js#charge` 와 같은 이유).
 */
function drawMaw(ctx, view, boss, sec) {
  const { x: cx, y: cy } = boss.coreAt;
  const open = boss.open;
  const r = open ? 3.4 + Math.sin(sec * 6) * 0.22 : 2.0;

  ctx.fillStyle = CORE_INK;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();

  if (boss.fallen) {
    // 쓰러졌다 — 죽은 것이 아니라 벌어진 채 늘어졌다. 그 안이 곧 도착 지점이다.
    ctx.fillStyle = rgba(MAW_GLOW, 0.55);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.25, r * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (!open) return;

  // 열린 동안만 빛난다. 지도 노드의 눈과 같은 색이라 "그것"으로 읽힌다.
  const glow = 0.35 + 0.25 * Math.sin(sec * 5);
  ctx.fillStyle = rgba(MAW_GLOW, glow);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.72, r * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(MAW_GLOW, 0.8);
  ctx.lineWidth = view.px(2);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * 빔 — 경고(빨강)와 발사(흰빛)를 **같은 사각형**으로 그린다.
 *
 * ⚠ 폭은 반드시 필드에 꽂히는 띠와 같은 `[from, to]` 여야 한다. 규칙 엔진은 무게중심 한 점만
 *   보므로(`rules/engine.js`), 화면이 조금이라도 넓거나 좁게 그리면 플레이어가 배우는 회피
 *   거리가 틀린 값이 된다 — 도착 고리를 판정 반경 그대로 그리는 것과 같은 이유다.
 */
export function drawBeam(ctx, view, boss, { sec = 0 } = {}) {
  const state = boss?.beam;
  if (!state) return;
  const cfg = boss.phase?.beam;
  if (!cfg) return;
  const lane = boss.beamLaneX(state.lane);
  const half = cfg.halfWidth;
  const y0 = view.center.y - view.height / view.ppm;
  const y1 = view.center.y + view.height / view.ppm;

  if (state.phase === 'telegraph') {
    // 점멸은 알파만 — 폭이 흔들리면 어디가 안전한지 못 배운다.
    const blink = 0.28 + 0.30 * Math.abs(Math.sin(sec * 9));
    ctx.fillStyle = rgba(BEAM_WARN, blink);
    ctx.fillRect(lane - half, y0, half * 2, y1 - y0);
    ctx.fillStyle = rgba(BEAM_WARN, 0.85);
    ctx.fillRect(lane - half, y0, view.px(2), y1 - y0);
    ctx.fillRect(lane + half - view.px(2), y0, view.px(2), y1 - y0);
    return;
  }

  ctx.fillStyle = rgba(BEAM_FIRE, 0.85);
  ctx.fillRect(lane - half, y0, half * 2, y1 - y0);
  ctx.fillStyle = rgba(MAW_GLOW, 0.9);
  ctx.fillRect(lane - half * 0.45, y0, half * 0.9, y1 - y0);
}
