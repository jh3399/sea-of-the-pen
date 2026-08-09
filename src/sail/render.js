// 항해 화면의 픽셀 렌더 — `render/view.js` 의 카메라(월드 좌표, Y-up)를 그대로 쓰고, 그
// 안에서 벡터 대신 `ctx.fillRect` 픽셀 그리드만 채운다. 새 그래픽 자산은 0개다: 선체·바위·
// 물은 전부 절차적으로(폴리곤 래스터화·시드 해시) 찍고, 아이템·주인공은 `draw/icons.js` 의
// 기존 픽셀 아이콘 헬퍼를 그대로 재사용한다.
import { bounds, pointInPolygon } from '../geom/poly.js';
import { MATERIALS } from '../hull/params.js';
import {
  drawItemMarker, drawRudderMarker, drawCrewSprite, drawPixelGrid,
  markerAngleToward, itemMarkerSize, OAR_PUSH,
} from '../draw/icons.js';

/** 선체 폴리곤을 몇 칸 그리드로 래스터화할 것인가 (긴 변 기준). */
const HULL_PIXEL_COLS = 28;
/** 바위 하나를 몇 칸 그리드로 그릴 것인가 (지름 기준). */
const ROCK_PIXEL_COLS = 18;
/** 경계 암초 벽의 픽셀 한 칸 (m). 벽 하나가 200 m 를 넘으므로 낱개 바위보다 굵게 찍는다. */
const WALL_CELL = 0.7;
/** 벽의 바다 쪽 면이 들쭉날쭉해지는 폭 (m). 이 폭은 **바깥으로만** 파고든다 —
 *  안쪽으로 흔들면 배가 지나갈 수 있는 자리에 바위가 그려져 판정과 어긋난다. */
const WALL_JAG = 2.4;
/** 벽·바위의 바다 쪽에 여울 점묘가 뻗는 거리 (m). 충돌 전에 눈으로 먼저 경고한다. */
const SHOAL_BAND = 3.2;
/** 물 표면의 반짝임 타일 크기 (m). */
const WATER_CELL = 1.6;
/** 반짝임 한 칸의 깜빡임 각속도 기준 (rad/s) — 칸마다 해시로 흔든다. */
const GLINT_SPEED = 1.9;
const TAU = Math.PI * 2;
/** 아이템·주인공 아이콘의 한 칸 크기 (m) — `draw/icons.js` 는 화면 고정 픽셀(CSS px)로 쓰지만
 *  여기는 월드 좌표라 선체 스케일에 맞는 작은 값을 쓴다. */
const ITEM_PIXEL = 0.06;
const RUDDER_PIXEL = ITEM_PIXEL * 2;
const CREW_PIXEL = 0.05;
/** 노는 선체 밖으로 뻗는 장치라 다른 마커보다 크다 (22칸 × 0.09 = 약 2 m 짜리 노). */
const OAR_PIXEL = 0.09;

const WATER_BASE = '#1c4fae';
const WATER_DEEP = 'rgba(6, 22, 64, 0.28)';
const SHOAL_RING = 'rgba(214, 244, 240, 0.5)';

/** 도착 지점 색 — 하니스(`main.js#drawGoal`)와 같은 두 톤을 쓴다 (도착 전 금색 / 클리어 초록). */
const GOAL_GOLD = '#ffd35c';
const GOAL_CLEAR = '#8ce99a';
const GOAL_INK = '#2a1f14';
/** 도착 부표 — 깃대(K) + 깃발·부표 몸체(G). G 는 상태에 따라 금색/초록으로 갈아 끼운다. */
const GOAL_GRID = [
  '.....KGGGG..',
  '.....KGGGG..',
  '.....KGG....',
  '.....K......',
  '.....K......',
  '....GGGG....',
  '...GGKKGG...',
  '...GKKKKG...',
  '...GGKKGG...',
  '....GGGG....',
  '............',
  '............',
];
/** 화면 밖 도착 지점을 가리키는 화살표가 가장자리에서 떨어져 있을 거리 (CSS px). */
const COMPASS_MARGIN = 56;
/** 화살표 몸통 — 회전 중심에서 화살촉 끝(+)과 꽁무니(−)까지 (CSS px). 라벨은 꽁무니 뒤로 물러난다. */
const ARROW_TIP = 16;
const ARROW_BACK = 9;
/** 거리 라벨 판의 좌우 여백 · 반높이 · 화살표와의 간격 (CSS px). */
const LABEL_PAD = 7;
const LABEL_HALF_H = 11;
const LABEL_GAP = 8;

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

/** #rrggbb + 알파 → rgba(). */
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
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

/** poly 장애물 스펙의 월드 AABB (points 는 몸체 로컬 좌표다). */
function polyBox(spec) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [px, py] of spec.points ?? []) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const ox = spec.x ?? 0;
  const oy = spec.y ?? 0;
  return { minX: minX + ox, maxX: maxX + ox, minY: minY + oy, maxY: maxY + oy };
}

/**
 * 해역 경계를 막는 암초 벽 — 긴 띠 하나.
 *
 * 바다 쪽 면만 해시로 흔들어 톱니를 낸다. 흔들림은 **바깥 방향으로만** 파고들므로 그려진
 * 바위는 언제나 정적 강체 안에 있다 — 눈에 보이는 가장자리가 곧 배가 멈추는 자리다
 * (`drawGoal` 이 고리를 판정 반경 그대로 그리는 것과 같은 이유).
 *
 * 벽 하나가 200 m 를 넘으므로 화면과 겹치는 칸만 훑는다. 통째로 찍으면 한 프레임에
 * 수천 칸을 채우게 되고, 그것도 대부분 화면 밖이다.
 */
function drawReefWall(ctx, view, spec, box) {
  const [ix, iy] = spec.reef?.inward ?? [0, 1];
  const horizontal = Math.abs(iy) >= Math.abs(ix);
  const vis = visibleWorldRect(view);
  const lx = Math.max(box.minX - SHOAL_BAND, vis.x0);
  const hx = Math.min(box.maxX + SHOAL_BAND, vis.x1);
  const ly = Math.max(box.minY - SHOAL_BAND, vis.y0);
  const hy = Math.min(box.maxY + SHOAL_BAND, vis.y1);
  if (hx <= lx || hy <= ly) return;

  // 바다 쪽 면의 좌표와, 거기서 벽 속으로 파고드는 방향의 부호.
  const sign = horizontal ? Math.sign(iy) : Math.sign(ix);
  const face = horizontal
    ? (sign > 0 ? box.maxY : box.minY)
    : (sign > 0 ? box.maxX : box.minX);
  const thick = horizontal ? box.maxY - box.minY : box.maxX - box.minX;

  const mid = MATERIALS.rock.color;
  const dark = shade(mid, -0.35);
  const light = shade(mid, 0.14);

  // 격자는 월드 원점에 못 박는다 — 화면 기준으로 잡으면 카메라가 움직일 때 벽이 아른거린다.
  const gx0 = Math.floor(lx / WALL_CELL) * WALL_CELL;
  const gy0 = Math.floor(ly / WALL_CELL) * WALL_CELL;
  for (let y = gy0; y <= hy; y += WALL_CELL) {
    for (let x = gx0; x <= hx; x += WALL_CELL) {
      const cx = x + WALL_CELL / 2;
      const cy = y + WALL_CELL / 2;
      const along = horizontal ? cx : cy;
      const across = horizontal ? cy : cx;
      // 바다 쪽 면에서 벽 속으로 얼마나 들어왔는가. 음수면 아직 바다다.
      const depth = (face - across) * sign;
      if (depth > thick) continue;
      const jag = hash2(along * 2.3, sign * 7.7 + (horizontal ? 0 : 31.4)) * WALL_JAG;
      if (depth >= jag) {
        const t = hash2(cx * 3.3, cy * 3.3);
        ctx.fillStyle = depth < jag + 1.4 ? dark : (t > 0.78 ? light : mid);
        ctx.fillRect(x, y, WALL_CELL, WALL_CELL);
      } else if (depth > -SHOAL_BAND && hash2(cx * 5.7, cy * 5.7) > 0.62) {
        ctx.fillStyle = SHOAL_RING;
        ctx.fillRect(x, y, WALL_CELL, WALL_CELL);
      }
    }
  }
}

/**
 * 장애물 하나 — 모양에 따라 낱개 암초/경계 벽으로 갈라 그리고, 화면 밖이면 아무것도 안 한다.
 *
 * 컬링이 렌더 쪽에 있는 이유: 맵이 넓어질수록 장애물 수가 늘어나는데 그중 화면에 걸치는
 * 것은 늘 몇 개뿐이다. 호출자(`sail/screen.js`)는 전부 넘기고 여기서 거른다.
 */
export function drawObstacle(ctx, view, spec) {
  if (!spec) return;
  const vis = visibleWorldRect(view);
  if (spec.shape === 'circle') {
    const r = spec.radius * 1.4 + SHOAL_BAND;
    if (spec.x + r < vis.x0 || spec.x - r > vis.x1) return;
    if (spec.y + r < vis.y0 || spec.y - r > vis.y1) return;
    drawRock(ctx, spec);
    return;
  }
  if (spec.shape === 'poly') drawReefWall(ctx, view, spec, polyBox(spec));
}

/**
 * 도착 지점 — 판정 반경 그대로의 고리 + 한가운데 부표.
 *
 * 고리를 **판정 반경 그대로** 그리는 것이 핵심이다. `game/goal.js` 의 판정은 주인공 점 하나가
 * 이 원에 들어왔는지만 보므로, 원을 크게/작게 그리면 "배는 걸쳤는데 클리어가 안 된다"가
 * 화면과 어긋나 보인다 — 눈에 보이는 원이 곧 판정선이어야 한다.
 *
 * 점묘·깜빡임은 `drawWater` 와 같은 방식이다: 자리는 월드 좌표 해시로 **고정**하고 알파만
 * 시간의 함수로 둔다. 자리를 흔들면 물결과 구분이 안 되는 노이즈가 된다.
 *
 * @param {{x:number,y:number,radius:number}} goal `createGoal` 결과
 * @param {{cleared?:boolean, sec?:number}} opts sec 은 물리 시각(`simTime`) — 벽시계로 두면
 *        일시정지·프레임 드랍에서 표식만 따로 흐른다 (drawWater 와 같은 이유).
 */
export function drawGoal(ctx, view, goal, { cleared = false, sec = 0 } = {}) {
  if (!goal) return;
  const { x, y, radius } = goal;
  const tone = cleared ? GOAL_CLEAR : GOAL_GOLD;
  const cell = clamp(radius / 9, 0.15, 0.6);

  // 안쪽 수면 — 성긴 점묘. 채워 버리면 바다 위 물감이 되고, 비워 두면 고리만 떠서 "선"으로 읽힌다.
  const step = cell * 2;
  const pulse = 0.5 + 0.5 * Math.sin(sec * 1.6);
  const gx0 = Math.floor((x - radius) / step) * step;
  const gy0 = Math.floor((y - radius) / step) * step;
  for (let gy = gy0; gy <= y + radius; gy += step) {
    for (let gx = gx0; gx <= x + radius; gx += step) {
      if (Math.hypot(gx - x, gy - y) > radius * 0.92) continue;
      const h = hash2(gx * 1.3, gy * 1.3);
      if (h < 0.6) continue;
      ctx.fillStyle = rgba(tone, 0.08 + 0.18 * pulse * h);
      ctx.fillRect(gx, gy, cell, cell);
    }
  }

  // 고리 — 도트 하나씩 찍은 점선. 빈 칸이 시간에 따라 한 칸씩 돌아 "살아 있는" 표식이 된다.
  const seg = Math.max(20, Math.round((TAU * radius) / (cell * 1.8)));
  const spin = Math.floor(sec * 4);
  ctx.fillStyle = tone;
  for (let i = 0; i < seg; i++) {
    if ((i + spin) % 4 === 0) continue;
    const a = (i / seg) * TAU;
    ctx.fillRect(x + Math.cos(a) * radius - cell / 2, y + Math.sin(a) * radius - cell / 2, cell, cell);
  }

  // 부표 — 물결에 맞춰 위아래로 흔들린다. 밑동이 원의 중심에 오도록 그리드 아래쪽을 기준으로 잡는다.
  const pixel = clamp(radius / 26, 0.1, 0.3);
  const rows = GOAL_GRID.length;
  const cols = GOAL_GRID[0].length;
  const bob = Math.sin(sec * 1.4) * pixel * 0.8;
  const palette = { K: GOAL_INK, G: tone };
  drawUprightIcon(ctx, x, y + bob, () => {
    drawPixelGrid(ctx, GOAL_GRID, palette, -(cols * pixel) / 2, -(rows - 3) * pixel, pixel);
  });
}

/**
 * 도착 지점이 화면 밖일 때 화면 가장자리에 띄우는 방향 화살표 + 남은 거리.
 *
 * 이게 없으면 도착 지점은 **항해 대부분의 시간 동안 존재하지 않는 것과 같다** — 20 px/m 줌에서
 * 화면에 담기는 폭은 60 m 남짓인데 데모 맵의 골은 150 m 앞에 있다.
 *
 * @param {{x:number,y:number}|null} from 주인공 월드 좌표. 거리 표기에만 쓴다 (방향은 카메라 기준).
 */
export function drawGoalCompass(ctx, view, goal, from, { cleared = false } = {}) {
  if (!goal) return;
  const s = view.worldToScreen(goal);
  const m = COMPASS_MARGIN;
  if (s.x >= m && s.x <= view.width - m && s.y >= m && s.y <= view.height - m) return;

  const cx = view.width / 2;
  const cy = view.height / 2;
  const dx = s.x - cx;
  const dy = s.y - cy;
  // 방향은 그대로 두고 길이만 줄여 여백 사각형 위로 끌어온다 (성분별로 clamp 하면 각도가 틀어진다).
  const t = Math.min(
    (view.width / 2 - m) / Math.max(Math.abs(dx), 1e-6),
    (view.height / 2 - m) / Math.max(Math.abs(dy), 1e-6),
  );
  const ax = cx + dx * t;
  const ay = cy + dy * t;
  const ang = Math.atan2(dy, dx);
  const tone = cleared ? GOAL_CLEAR : GOAL_GOLD;
  const dist = from ? Math.hypot(goal.x - from.x, goal.y - from.y) : Infinity;

  view.screenSpace((c) => {
    c.save();
    c.translate(ax, ay);
    c.rotate(ang);
    c.beginPath();
    c.moveTo(ARROW_TIP, 0);
    c.lineTo(-ARROW_BACK, -11);
    c.lineTo(-4, 0);
    c.lineTo(-ARROW_BACK, 11);
    c.closePath();
    c.fillStyle = tone;
    c.strokeStyle = 'rgba(8, 20, 32, 0.85)';
    c.lineWidth = 3;
    c.stroke();
    c.fill();
    c.restore();

    // 라벨은 회전시키지 않는다 — 화면 아래·왼쪽 가장자리에서 글자가 뒤집혀 읽을 수 없게 된다.
    if (!Number.isFinite(dist)) return;
    const label = `${goal.label ?? '도착'} ${dist.toFixed(0)} m`;
    c.font = "14px 'NeoDunggeunmo', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const hw = c.measureText(label).width / 2 + LABEL_PAD;
    const hh = LABEL_HALF_H;
    // ★ 판을 밀어내는 거리는 **방향마다 다르다.** 반폭으로만 물러나면 위아래 방향에서는
    //   판이 훨씬 얕아(높이 11) 화살표를 그대로 덮고, 반높이로만 물러나면 좌우에서 덮인다.
    //   방향 위에서 중심→테두리까지의 실제 거리(사각형의 지지 함수)를 구해 그만큼 물러난다.
    const ux = Math.abs(Math.cos(ang));
    const uy = Math.abs(Math.sin(ang));
    const reach = Math.min(
      ux > 1e-6 ? hw / ux : Infinity,
      uy > 1e-6 ? hh / uy : Infinity,
    );
    const back = ARROW_BACK + LABEL_GAP + reach;
    const lx = ax - Math.cos(ang) * back;
    const ly = ay - Math.sin(ang) * back;
    c.fillStyle = 'rgba(8, 20, 32, 0.75)';
    c.fillRect(lx - hw, ly - hh, hw * 2, hh * 2);
    c.fillStyle = tone;
    c.fillText(label, lx, ly);
  });
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

/**
 * 노 — 유일하게 **방향과 바깥쪽이 있는** 마커다.
 *
 * 노깃이 현측 밖 물에 놓여야 "양쪽에서 젓는다"가 그림에서 읽힌다. 좌현은 로컬 +Y 가
 * 바깥이고 우현은 −Y 라, 좌우 스프라이트를 따로 두지 않고 부호 하나로 가른다.
 * drawUprightIcon 안은 Y 가 한 번 뒤집힌 프레임이므로 각도의 부호도 그에 맞춰 넘긴다.
 */
function drawOar(ctx, item) {
  const outward = item.side === 'port' ? 1 : -1;
  const push = itemMarkerSize('oar', OAR_PIXEL).h * OAR_PUSH;
  drawUprightIcon(ctx, item.x, item.y + outward * push,
    () => drawItemMarker(ctx, 'oar', 0, 0, OAR_PIXEL, markerAngleToward(0, -outward)));
}

/** 키 — 하니스와 같이 부착 축은 고정하고 막대만 실제 타각만큼 좌우로 움직인다. */
function drawRudder(ctx, item, angle) {
  // drawUprightIcon 안에서는 Y가 뒤집히므로 월드 타각과 같은 방향으로 보이게 부호를 뒤집는다.
  drawUprightIcon(ctx, item.x, item.y,
    () => drawRudderMarker(ctx, 0, 0, RUDDER_PIXEL, -angle));
}

/** 강체 하나(선체 로컬 좌표계 안에서) — 선체 + 부착 아이템 + 주인공. */
export function drawHullBody(ctx, hull) {
  drawHullPixels(ctx, hull.outline, hull.params.material.key);
  const rudderAngle = hull.control?.rudder ?? 0;
  for (const item of hull.items) {
    if (item.type === 'oar' && item.side) { drawOar(ctx, item); continue; }
    if (item.type === 'rudder') { drawRudder(ctx, item, rudderAngle); continue; }
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
