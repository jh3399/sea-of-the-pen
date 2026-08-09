// 항해 화면의 픽셀 렌더 — `render/view.js` 의 카메라(월드 좌표, Y-up)를 그대로 쓰고, 그
// 안에서 벡터 대신 `ctx.fillRect` 픽셀 그리드만 채운다. 새 그래픽 자산은 0개다: 선체·바위·
// 물은 전부 절차적으로(폴리곤 래스터화·시드 해시) 찍고, 아이템·주인공은 `draw/icons.js` 의
// 기존 픽셀 아이콘 헬퍼를 그대로 재사용한다.
import { bounds, pointInPolygon } from '../geom/poly.js';
import { MATERIALS } from '../hull/params.js';
import { drawItemMarker, drawCrewSprite } from '../draw/icons.js';

/** 선체 폴리곤을 몇 칸 그리드로 래스터화할 것인가 (긴 변 기준). */
const HULL_PIXEL_COLS = 28;
/** 바위 하나를 몇 칸 그리드로 그릴 것인가 (지름 기준). */
const ROCK_PIXEL_COLS = 18;
/** 물 표면의 반짝임 타일 크기 (m). */
const WATER_CELL = 1.6;
/** 반짝임 한 칸의 깜빡임 각속도 기준 (rad/s) — 칸마다 해시로 흔든다. */
const GLINT_SPEED = 1.9;
const TAU = Math.PI * 2;
/** 아이템·주인공 아이콘의 한 칸 크기 (m) — `draw/icons.js` 는 화면 고정 픽셀(CSS px)로 쓰지만
 *  여기는 월드 좌표라 선체 스케일에 맞는 작은 값을 쓴다. */
const ITEM_PIXEL = 0.06;
const CREW_PIXEL = 0.05;

const WATER_BASE = '#1c4fae';
const WATER_DEEP = 'rgba(6, 22, 64, 0.28)';
const SHOAL_RING = 'rgba(214, 244, 240, 0.5)';

/** 결정론적 의사난수 (0..1) — 좌표를 시드로 쓰므로 프레임마다 깜빡이지 않는다. */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** #rrggbb 를 amt(-1..1) 만큼 어둡게/밝게. icons.js 의 두 톤(W/w) 관례를 절차적으로 낸다. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const rr = clamp(f(r), 0, 255);
  const gg = clamp(f(g), 0, 255);
  const bb = clamp(f(b), 0, 255);
  return `#${((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1)}`;
}

function at(grid, cols, rows, r, c) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return 0;
  return grid[r * cols + c];
}

/** 카메라가 지금 보고 있는 월드 사각형. */
function visibleWorldRect(view) {
  const halfW = view.width / 2 / view.ppm;
  const halfH = view.height / 2 / view.ppm;
  return {
    x0: view.center.x - halfW,
    x1: view.center.x + halfW,
    y0: view.center.y - halfH,
    y1: view.center.y + halfH,
  };
}

/**
 * 바다 — 단색 베이스 + 월드에 고정된 반짝임/그림자 타일(카메라를 따라 "흐르지" 않는다).
 *
 * 반짝임은 타이틀 화면(`menu/screen.js` 의 `stars`·`glitter`)과 같은 방식이다: 자리는 시드
 * 해시로 **고정**하고 알파와 미세한 위아래 흔들림만 시간의 함수로 둔다. 자리까지 난수로
 * 흔들면 프레임마다 다른 곳이 튀어 물결이 아니라 노이즈가 된다.
 *
 * ★ 위상·주기를 칸마다 해시로 흩뿌리는 것이 핵심이다 — 같으면 화면 전체가 한 몸으로
 *   깜빡여 "바다"가 아니라 "화면이 점멸한다"로 보인다 (타이틀 등불 둘과 같은 이유).
 *
 * @param {number} sec 경과 시간(초). 물리 시각(`simTime`)을 넣으면 일시정지도 따라 멈춘다.
 */
export function drawWater(ctx, view, sec = 0) {
  const pad = WATER_CELL * 2;
  const { x0, x1, y0, y1 } = visibleWorldRect(view);

  ctx.fillStyle = WATER_BASE;
  ctx.fillRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);

  const gx0 = Math.floor((x0 - pad) / WATER_CELL) * WATER_CELL;
  const gy0 = Math.floor((y0 - pad) / WATER_CELL) * WATER_CELL;
  for (let y = gy0; y <= y1 + pad; y += WATER_CELL) {
    for (let x = gx0; x <= x1 + pad; x += WATER_CELL) {
      const h = hash2(x, y);
      if (h < 0.1) {
        ctx.fillStyle = WATER_DEEP;
        ctx.fillRect(x, y, WATER_CELL * 0.6, WATER_CELL * 0.6);
        continue;
      }
      if (h < 0.6) continue; // 아무것도 서지 않는 칸

      const phase = hash2(x * 1.7, y * 1.7) * TAU;
      const speed = GLINT_SPEED * (0.6 + hash2(x * 2.9, y * 2.9) * 0.9);
      const blink = Math.sin(sec * speed + phase);
      if (blink < -0.1) continue; // 가라앉은 물결 — 대부분의 칸이 여기서 빠진다

      // 찰랑임: 깜빡임의 절반 주기로 위아래로 조금 뜬다. 칸 크기의 12% 를 넘기면
      // 도트가 격자를 벗어나 "떠다니는 점"으로 읽힌다.
      const bob = Math.sin(sec * speed * 0.5 + phase) * WATER_CELL * 0.12;
      const yy = y + bob;

      if (h < 0.72) {
        // ★ 점과 잔물결은 **해시 대역이 갈라져 있어** 한 칸에 같이 설 수 없다. 겹치면
        //   가로 막대 위에 점이 얹혀 T 자로 읽힌다 (실제로 그렇게 보였다). 그릴 때
        //   위치를 비켜 놓는 것보다 애초에 표현 불가능하게 두는 편이 낫다.
        //   점 자리는 칸 안에서 다시 해시로 흩는다 — 칸 원점에 두면 격자가 드러난다.
        if (blink < 0.55) continue; // 마루에서만 잠깐 튄다
        const px = x + hash2(x * 4.1, y * 4.1) * WATER_CELL * 0.7;
        ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.5 * blink).toFixed(3)})`;
        ctx.fillRect(px, yy, WATER_CELL * 0.18, WATER_CELL * 0.18);
        continue;
      }

      ctx.fillStyle = `rgba(255,255,255,${(0.08 + 0.26 * blink).toFixed(3)})`;
      ctx.fillRect(x, yy, WATER_CELL * 0.55, WATER_CELL * 0.22);
    }
  }
}

/**
 * 암초 하나 — 원을 그대로 찍지 않고 각도별 반경을 시드로 흔들어 들쭉날쭉한 실루엣을 낸다.
 * 가장자리 바깥으로는 성긴 여울 고리(얕은 청록 점묘)를 둔다.
 * @param {{x:number,y:number,radius:number}} spec 월드 좌표 (obstacle 강체와 같은 자리)
 */
export function drawRock(ctx, spec) {
  const { x, y, radius } = spec;
  const cell = clamp((radius * 2) / ROCK_PIXEL_COLS, 0.15, 0.6);
  const cols = Math.max(4, Math.ceil((radius * 2.8) / cell));
  const half = (cols * cell) / 2;
  const x0 = x - half;
  const y0 = y - half;

  const mid = MATERIALS.rock.color;
  const dark = shade(mid, -0.35);
  const light = shade(mid, 0.14);

  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (c + 0.5) * cell;
      const cy = y0 + (r + 0.5) * cell;
      const dx = cx - x;
      const dy = cy - y;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const jitter = 1 + (hash2(Math.cos(ang) * 5.1 + x, Math.sin(ang) * 5.1 + y) - 0.5) * 0.32;
      const edgeR = radius * jitter;
      if (d <= edgeR) {
        const t = hash2(cx * 3.3, cy * 3.3);
        ctx.fillStyle = d > edgeR * 0.72 ? dark : (t > 0.78 ? light : mid);
        ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
      } else if (d <= edgeR * 1.4 && hash2(cx * 5.7, cy * 5.7) > 0.58) {
        ctx.fillStyle = SHOAL_RING;
        ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
      }
    }
  }
}

/**
 * 선체 로컬 폴리곤을 픽셀 그리드로 래스터화. 호출 전 `ctx.translate/rotate` 로 강체 자세를
 * 걸어 두면(§main.js renderSail 관례) 좌표 변환 코드가 따로 필요 없다.
 */
function drawHullPixels(ctx, outline, materialKey) {
  const mat = MATERIALS[materialKey] ?? MATERIALS.wood;
  const bb = bounds(outline);
  const span = Math.max(bb.width, bb.height, 0.4);
  const cell = clamp(span / HULL_PIXEL_COLS, 0.05, 0.3);
  const cols = Math.max(1, Math.ceil(bb.width / cell) + 2);
  const rows = Math.max(1, Math.ceil(bb.height / cell) + 2);
  const x0 = bb.minX - cell;
  const y0 = bb.minY - cell;

  const inside = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (c + 0.5) * cell;
      const cy = y0 + (r + 0.5) * cell;
      if (pointInPolygon({ x: cx, y: cy }, outline)) inside[r * cols + c] = 1;
    }
  }

  const dark = shade(mat.color, -0.32);
  const bowLight = shade(mat.color, 0.16);
  const bowBand = bb.maxX - span * 0.14;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!inside[r * cols + c]) continue;
      const edge = !at(inside, cols, rows, r - 1, c) || !at(inside, cols, rows, r + 1, c)
        || !at(inside, cols, rows, r, c - 1) || !at(inside, cols, rows, r, c + 1);
      const cx = x0 + (c + 0.5) * cell;
      ctx.fillStyle = edge ? dark : (cx > bowBand ? bowLight : mat.color);
      ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
    }
  }
}

/**
 * `draw/icons.js` 의 아이콘 헬퍼는 화면 좌표계(Y-down)로 작성돼 있다. 월드(Y-up) 안에서 그대로
 * 부르면 위아래가 뒤집히므로, 그리려는 점을 원점으로 옮긴 뒤 로컬 Y 만 뒤집어 되돌린다.
 */
function drawUprightIcon(ctx, x, y, draw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  draw();
  ctx.restore();
}

/** 강체 하나(선체 로컬 좌표계 안에서) — 선체 + 부착 아이템 + 주인공. */
export function drawHullBody(ctx, hull) {
  drawHullPixels(ctx, hull.outline, hull.params.material.key);
  for (const item of hull.items) {
    drawUprightIcon(ctx, item.x, item.y, () => drawItemMarker(ctx, item.type, 0, 0, ITEM_PIXEL));
  }
  if (hull.crew) {
    drawUprightIcon(ctx, hull.crew.x, hull.crew.y, () => drawCrewSprite(ctx, 0, 0, CREW_PIXEL));
  }
}

/** 항적 — 최근 위치를 옅어지는 픽셀 점으로. `points` 는 최신이 배열 끝. */
export function drawWake(ctx, points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = (i + 1) / n; // 오래될수록 0에 가깝다
    ctx.fillStyle = `rgba(255,255,255,${(0.22 * t).toFixed(3)})`;
    const s = 0.12 + 0.1 * t;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
}
