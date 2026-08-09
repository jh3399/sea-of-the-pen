// 항해 화면의 픽셀 렌더 — `render/view.js` 의 카메라(월드 좌표, Y-up)를 그대로 쓰고, 그
// 안에서 벡터 대신 `ctx.fillRect` 픽셀 그리드만 채운다. 새 그래픽 자산은 0개다: 선체·바위·
// 물은 전부 절차적으로(폴리곤 래스터화·시드 해시) 찍고, 아이템·주인공은 `draw/icons.js` 의
// 기존 픽셀 아이콘 헬퍼를 그대로 재사용한다.
import { MATERIALS } from '../hull/params.js';
import { surfaceCellKey, surfaceCellPoint } from '../hull/raster.js';
import { cannonMuzzleLocal, CANNON_TUNING } from '../items/cannon.js';
import {
  drawItemMarker, drawRudderMarker, drawCrewSprite, drawPixelGrid,
  markerAngleToward, itemMarkerSize, OAR_PUSH,
} from '../draw/icons.js';

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
const CANNON_BARREL_WIDTH = 0.18;

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

/**
 * 결정론적 의사난수 (0..1) — 좌표를 시드로 쓰므로 프레임마다 깜빡이지 않는다.
 *
 * export 인 이유: `sail/bossart.js` 가 **같은 해시**를 써야 보스 표면 무늬가 이 파일이 그리는
 * 물·바위와 같은 규약(자리는 월드 좌표에 고정, 시간은 알파에만)을 따른다. `scene/bgkit.js` 의
 * `hash(i, salt)` 는 인덱스 기반이라 월드에 고정되지 않으므로 쓰면 안 된다.
 */
export function hash2(x, y) {
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
 * @param {{flow?:{x,y}, flowAt?:(x:number,y:number)=>{x,y}}} options
 *   `flow` 는 화면 전체가 한 방향으로 흐를 때의 상수 벡터다 (3장 용암류처럼).
 *   `flowAt` 은 **칸마다** 흐름을 묻는다 — 자리마다 방향이 다른 필드(보스의 방사 흡입)를
 *   그리려면 이쪽이어야 한다. 카메라 중심 한 점만 재서 상수로 쓰면 화면 전체가 같은 쪽으로
 *   미끄러져, **물이 어디로 가는지 화면이 거짓말을 한다** — 흐름 자체가 기믹인 맵에서는
 *   치명적이다. 둘 다 없으면 잔잔한 바다(위아래 찰랑임)로 그린다.
 */
export function drawWater(ctx, view, sec = 0, {
  gloom = 0, surface = null, flow = { x: 0, y: 0 }, flowAt = null,
} = {}) {
  const pad = WATER_CELL * 2;
  const { x0, x1, y0, y1 } = visibleWorldRect(view);
  const dim = clamp(gloom, 0, 1);
  const base = surface?.base ?? WATER_BASE;
  const deep = surface?.deep ?? WATER_DEEP;
  const glint = surface?.glint ?? '#ffffff';
  // 상수 흐름은 루프 밖에서 한 번만 접는다 — 기존 세 바다의 출력이 비트 단위로 그대로여야 한다.
  const constMag = Math.hypot(flow.x, flow.y);
  const constFlowing = !flowAt && constMag > 1e-6;
  const cDriftX = constFlowing ? ((flow.x * sec * 0.35) % WATER_CELL) : 0;
  const cDriftY = constFlowing ? ((flow.y * sec * 0.35) % WATER_CELL) : 0;

  ctx.fillStyle = dim > 0 ? shade(base, -0.42 * dim) : base;
  ctx.fillRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);

  const gx0 = Math.floor((x0 - pad) / WATER_CELL) * WATER_CELL;
  const gy0 = Math.floor((y0 - pad) / WATER_CELL) * WATER_CELL;
  for (let y = gy0; y <= y1 + pad; y += WATER_CELL) {
    for (let x = gx0; x <= x1 + pad; x += WATER_CELL) {
      const h = hash2(x, y);
      // 칸별 흐름은 **칸의 월드 좌표**로 묻는다. 흐르는 칸은 그 방향으로 미끄러지고,
      // 흐름이 0 인 칸은 잔잔한 바다와 똑같이 찰랑인다 — 흡입 원 바깥이 저절로 고요해진다.
      let cell = flow;
      let flowing = constFlowing;
      let driftX = cDriftX;
      let driftY = cDriftY;
      if (flowAt) {
        cell = flowAt(x, y);
        flowing = Math.hypot(cell.x, cell.y) > 1e-6;
        driftX = flowing ? ((cell.x * sec * 0.35) % WATER_CELL) : 0;
        driftY = flowing ? ((cell.y * sec * 0.35) % WATER_CELL) : 0;
      }
      const xx = x + driftX;
      const yy0 = y + driftY;
      if (h < 0.1) {
        ctx.fillStyle = deep;
        ctx.fillRect(xx, yy0, WATER_CELL * 0.6, WATER_CELL * 0.6);
        continue;
      }
      if (h < 0.6) continue; // 아무것도 서지 않는 칸

      const phase = hash2(x * 1.7, y * 1.7) * TAU;
      const speed = GLINT_SPEED * (0.6 + hash2(x * 2.9, y * 2.9) * 0.9);
      const blink = Math.sin(sec * speed + phase);
      if (blink < -0.1) continue; // 가라앉은 물결 — 대부분의 칸이 여기서 빠진다

      // 잔잔한 수면은 위아래로 찰랑이고, 흐르는 표면은 필드 벡터를 따라 월드 위를 이동한다.
      const bob = flowing ? 0 : Math.sin(sec * speed * 0.5 + phase) * WATER_CELL * 0.12;
      const yy = yy0 + bob;

      if (h < 0.72) {
        // ★ 점과 잔물결은 **해시 대역이 갈라져 있어** 한 칸에 같이 설 수 없다. 겹치면
        //   가로 막대 위에 점이 얹혀 T 자로 읽힌다 (실제로 그렇게 보였다). 그릴 때
        //   위치를 비켜 놓는 것보다 애초에 표현 불가능하게 두는 편이 낫다.
        if (blink < 0.55) continue; // 마루에서만 잠깐 튄다
        const px = xx + hash2(x * 4.1, y * 4.1) * WATER_CELL * 0.7;
        ctx.fillStyle = rgba(glint, 0.25 + 0.5 * blink);
        ctx.fillRect(px, yy, WATER_CELL * 0.18, WATER_CELL * 0.18);
        continue;
      }

      ctx.fillStyle = rgba(glint, 0.08 + 0.26 * blink);
      if (flowing && Math.abs(cell.y) > Math.abs(cell.x)) {
        ctx.fillRect(xx, yy, WATER_CELL * 0.22, WATER_CELL * 0.55);
      } else {
        ctx.fillRect(xx, yy, WATER_CELL * 0.55, WATER_CELL * 0.22);
      }
    }
  }
}

/** 폭풍 비 — 화면에 고정된 시드와 물리 시각만 써 프레임 드랍에도 같은 장면을 낸다. */
export function drawWeather(ctx, view, { sec = 0, rain = 0, wind = { x: 0, y: 0 } } = {}) {
  const amount = clamp(rain, 0, 1);
  if (amount <= 0) return;

  const count = Math.round(45 + amount * 85);
  const speed = 430;
  const windMag = Math.hypot(wind.x, wind.y);
  const wx = windMag > 1e-6 ? wind.x / windMag : 0;
  const wy = windMag > 1e-6 ? wind.y / windMag : 0;
  const slantX = wx * 22;
  const slantY = 34 - wy * 12;
  const travel = Math.hypot(slantX, slantY) || 1;
  const ux = slantX / travel;
  const uy = slantY / travel;

  view.screenSpace((c) => {
    c.strokeStyle = `rgba(186, 220, 239, ${(0.2 + amount * 0.35).toFixed(3)})`;
    c.lineWidth = 2;
    c.beginPath();
    const spanX = view.width + 100;
    const spanY = view.height + 100;
    for (let i = 0; i < count; i++) {
      const phase = hash2(i * 3.17, i * 7.91);
      const drift = (sec * speed * (0.75 + hash2(i, 19) * 0.5) + phase * spanY) % spanY;
      const x = ((hash2(i, 31) * spanX + drift * ux) % spanX + spanX) % spanX - 50;
      const y = ((hash2(i, 47) * spanY + drift * uy) % spanY + spanY) % spanY - 50;
      const len = 7 + hash2(i, 59) * 9;
      c.moveTo(Math.round(x), Math.round(y));
      c.lineTo(Math.round(x - ux * len), Math.round(y - uy * len));
    }
    c.stroke();
  });
}

/** 어둠 — 캔버스만 덮어 HUD·클리어 창·목표 나침반은 계속 읽을 수 있게 한다. */
export function drawDarkness(ctx, view, darkness = 0) {
  const amount = clamp(darkness, 0, 1);
  if (amount <= 0) return;

  view.screenSpace((c) => {
    c.fillStyle = `rgba(4, 10, 29, ${(amount * 0.56).toFixed(3)})`;
    c.fillRect(0, 0, view.width, view.height);
    const r = Math.max(view.width, view.height) * 0.72;
    const vignette = c.createRadialGradient(
      view.width / 2, view.height / 2, r * 0.18,
      view.width / 2, view.height / 2, r,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, `rgba(0, 3, 14, ${(amount * 0.72).toFixed(3)})`);
    c.fillStyle = vignette;
    c.fillRect(0, 0, view.width, view.height);
  });
}

/**
 * 암초 하나 — 원을 그대로 찍지 않고 각도별 반경을 시드로 흔들어 들쭉날쭉한 실루엣을 낸다.
 * 가장자리 바깥으로는 성긴 여울 고리(얕은 청록 점묘)를 둔다.
 * @param {{x:number,y:number,radius:number}} spec 월드 좌표 (obstacle 강체와 같은 자리)
 */
export function drawRock(ctx, spec, { shoal = SHOAL_RING } = {}) {
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
        ctx.fillStyle = shoal;
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
function drawReefWall(ctx, view, spec, box, { shoal = SHOAL_RING } = {}) {
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
        ctx.fillStyle = shoal;
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
export function drawObstacle(ctx, view, spec, options = {}) {
  if (!spec) return;
  const vis = visibleWorldRect(view);
  if (spec.shape === 'circle') {
    const r = spec.radius * 1.4 + SHOAL_BAND;
    if (spec.x + r < vis.x0 || spec.x - r > vis.x1) return;
    if (spec.y + r < vis.y0 || spec.y - r > vis.y1) return;
    drawRock(ctx, spec, options);
    return;
  }
  if (spec.shape === 'poly') drawReefWall(ctx, view, spec, polyBox(spec), options);
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
 * 출항 때 고정한 선체 표면 셀을 그린다. 파손 이벤트가 기존 셀만 걷어내므로 매 프레임 폴리곤을
 * 다시 래스터화하지 않고, 남은 도트의 크기와 위치도 절대 재배치되지 않는다.
 */
function drawHullPixels(ctx, hull, target = false) {
  const surface = hull.surface;
  if (!surface?.cells?.length) return;

  const mat = hull.params?.material ?? MATERIALS.wood;
  const occupied = new Set(surface.cells.map(surfaceCellKey));
  let minX = Infinity;
  let maxX = -Infinity;
  for (const cell of surface.cells) {
    const { x } = surfaceCellPoint(surface, cell);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const span = Math.max(maxX - minX + surface.cell, 0.4);
  const bowBand = maxX - span * 0.14;
  const dark = target ? '#7c302f' : shade(mat.color, -0.32);
  const bowLight = target ? shade(mat.color, 0.06) : shade(mat.color, 0.16);

  for (const pixel of surface.cells) {
    const { col, row } = pixel;
    const edge = !occupied.has(`${col - 1},${row}`) || !occupied.has(`${col + 1},${row}`)
      || !occupied.has(`${col},${row - 1}`) || !occupied.has(`${col},${row + 1}`);
    const center = surfaceCellPoint(surface, pixel);
    ctx.fillStyle = edge ? dark : (center.x > bowBand ? bowLight : mat.color);
    ctx.fillRect(
      surface.originX + col * surface.cell,
      surface.originY + row * surface.cell,
      surface.cell,
      surface.cell,
    );
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

/** 대포 — 포구 계산과 같은 방향·외곽 교점을 써서 보이는 포신과 실제 발사선이 일치한다. */
function drawCannon(ctx, hull, item) {
  const muzzle = cannonMuzzleLocal(hull.outline, item);
  const angle = item.angle ?? 0;
  const full = Math.hypot(muzzle.x - item.x, muzzle.y - item.y);
  const length = Math.max(0.28, full - CANNON_TUNING.radius - CANNON_TUNING.margin * 0.5);
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#182233';
  ctx.fillRect(0, -CANNON_BARREL_WIDTH / 2, length, CANNON_BARREL_WIDTH);
  ctx.fillStyle = '#65758a';
  ctx.fillRect(length - 0.12, -CANNON_BARREL_WIDTH * 0.72, 0.12, CANNON_BARREL_WIDTH * 1.44);
  ctx.restore();
  drawUprightIcon(ctx, item.x, item.y, () => drawItemMarker(ctx, 'cannon', 0, 0, ITEM_PIXEL));
}

/** 강체 하나(선체 로컬 좌표계 안에서) — 선체 + 부착 아이템 + 주인공. */
export function drawHullBody(ctx, hull, { target = false } = {}) {
  drawHullPixels(ctx, hull, target);
  const rudderAngle = hull.control?.rudder ?? 0;
  for (const item of hull.items) {
    if (item.type === 'oar' && item.side) { drawOar(ctx, item); continue; }
    if (item.type === 'rudder') { drawRudder(ctx, item, rudderAngle); continue; }
    if (item.type === 'cannon') { drawCannon(ctx, hull, item); continue; }
    drawUprightIcon(ctx, item.x, item.y, () => drawItemMarker(ctx, item.type, 0, 0, ITEM_PIXEL));
  }
  if (hull.crew) {
    drawUprightIcon(ctx, hull.crew.x, hull.crew.y, () => drawCrewSprite(ctx, 0, 0, CREW_PIXEL));
  }
}

/** 포탄과 유계 섬광. 반경·잔상 길이는 월드 단위라 보이는 궤적과 실제 충돌 크기가 일치한다. */
export function drawCombatEffects(ctx, view, projectiles, sparks, now, sparkLife = 0.35) {
  for (const body of projectiles) {
    const shot = body.getUserData()?.projectile;
    if (!shot) continue;
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    ctx.strokeStyle = 'rgba(255, 211, 92, 0.58)';
    ctx.lineWidth = view.px(2);
    ctx.beginPath();
    ctx.moveTo(p.x - v.x * 0.05, p.y - v.y * 0.05);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    // ⚠ 포탄만은 **콜라이더 크기가 곧 게임플레이 정보**라 `view.px()` 로 부풀리면 안 된다
    // (d3_handoff §⑧). 아슬아슬한 회피가 거짓말이 된다. 멀리서도 보이게 하는 일은 채워진
    // 몸통이 아니라 **바깥쪽 후광**이 맡는다 — 후광은 반투명이라 경계가 콜라이더로 읽히지 않는다.
    const glow = view.px(2.5);
    if (glow > shot.radius) {
      ctx.fillStyle = 'rgba(255, 211, 92, 0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, glow, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath();
    ctx.arc(p.x, p.y, shot.radius, 0, TAU);
    ctx.fill();
  }

  for (const spark of sparks) {
    const age = (now - spark.at) / sparkLife;
    if (age < 0 || age > 1) continue;
    const fade = 1 - age;
    const glance = spark.kind === 'glance';
    ctx.globalAlpha = fade;
    ctx.strokeStyle = glance ? '#b9f2ff' : '#ffd35c';
    ctx.lineWidth = view.px(1 + 3 * fade);
    ctx.beginPath();
    if (glance) {
      const r = 0.35 + age * 1.1;
      ctx.moveTo(spark.x - r, spark.y - r * 0.35);
      ctx.lineTo(spark.x + r, spark.y + r * 0.35);
      ctx.moveTo(spark.x - r * 0.35, spark.y + r);
      ctx.lineTo(spark.x + r * 0.35, spark.y - r);
    } else {
      ctx.arc(spark.x, spark.y, 0.45 + age * 1.5, 0, TAU);
    }
    ctx.stroke();
    ctx.globalAlpha = fade * fade;
    ctx.fillStyle = glance ? '#effcff' : '#fff6d8';
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, Math.max(spark.radius * 1.6, view.px(2)), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** 항적 — 최근 위치를 옅어지는 픽셀 점으로. `points` 는 최신이 배열 끝. */
export function drawWake(ctx, points, { color = '#ffffff' } = {}) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = (i + 1) / n; // 오래될수록 0에 가깝다
    ctx.fillStyle = rgba(color, 0.22 * t);
    const s = 0.12 + 0.1 * t;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
}
