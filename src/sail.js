// 항해 엔진 — 플레이어가 그린 배를 방향키/포인터로 몰아 바다를 건너 섬에 상륙하는 화면.
// pixelbg.js와 같은 저해상도 규칙(짧은 쪽 200 논리px), 카메라는 배를 따라가되 월드 경계에서 클램프.
// 탑다운이 아니라 "약간 비스듬한 항해도" 느낌 — 화면 전체가 바다이고 섬이 타원으로 떠 있다.
//
//   const { islandKey, x, y } = await runSail({ canvas, promptEl, objectiveEl, shipImage, sea, islands, start, targetKey, onMove, sfx });
//
// 디버그: window.__sail.pos → 현재 좌표, window.__sail.dock('gar') → 상륙 강제 (통합 테스트용)

import { hash, fill, blob, seaBands, waves, glitter, gulls, palm, vignette } from './bgkit.js';

const R = Math.round;

const MIN_SIDE = 200;    // 논리 해상도 — 짧은 쪽 픽셀 수 (pixelbg.js와 동일 규칙)
const MAX_SPEED = 85;    // 최고 속도 (논리px/초)
const ACCEL = 150;       // 가속 (논리px/초²)
const DRAG = 2.4;        // 입력 없을 때 감속 계수
const DOCK_RANGE = 18;   // 섬 반지름 + 이 값 이내면 상륙 프롬프트
const SHIP_W = 30;       // 배 표시 폭 (논리px)

// 항해도 바다 팔레트 — sea_day 계열 낮 톤
const SEA_ROWS = ['#3990b8', '#2f83ab', '#2a769c', '#24688b', '#1e5a7a', '#184c68'];

// 섬 bg 키별 색 (모래톱 / 땅 / 능선)
const ISLAND_STYLES = {
  jungle_gold:    { beach: '#e5c878', land: '#7a8f2a', ridge: '#4f6a1e' },
  jungle_green:   { beach: '#dcc9a0', land: '#3f7a3a', ridge: '#1a3a1c' },
  // 굳은 섬은 회색이 아니라 자주다 (bgkit.BLIGHT 램프와 같은 색)
  village_pale:   { beach: '#7a4a7c', land: '#5a2f5e', ridge: '#3a1f3f' },
  village_alive:  { beach: '#e6d9b8', land: '#4f8a3e', ridge: '#3a6b2e' },
  crystal_forest: { beach: '#7a4a7c', land: '#4a2850', ridge: '#2a1630' },
  golden_isle:    { beach: '#ffe8a8', land: '#c9962e', ridge: '#9a7020' },
  volcano:        { beach: '#8a6a52', land: '#5a4038', ridge: '#33241f' },
  night_storm:    { beach: '#4a5470', land: '#2c3550', ridge: '#1d2438' },
  iceberg:        { beach: '#e8f6fa', land: '#cfe8f2', ridge: '#9cc8dc' },
  mirror_fog:     { beach: '#b8c0c8', land: '#8a94a0', ridge: '#67707c' },
  shipyard_grave: { beach: '#5a4c3a', land: '#3c3228', ridge: '#241c14' },
  workshop:       { beach: '#c8b088', land: '#6a5a40', ridge: '#493d2b' },
  world_end:      { beach: '#54387a', land: '#3a2450', ridge: '#241636' },
};
const DEFAULT_STYLE = { beach: '#dcc47e', land: '#5f8a3c', ridge: '#41682a' };

// ---------------- 섬 장식 (bg 키별) ----------------
// 모든 위상(phase)은 isl.x(월드 좌표)로 고정 — 카메라가 움직여도 애니메이션이 안 튄다.

const DECOS = {
  jungle_gold(ctx, sx, sy, r, sec) {
    palm(ctx, sx - r * 0.26, sy - r * 0.08, 1, '#5f4514', '#2f4a14');
    palm(ctx, sx + r * 0.2, sy + r * 0.02, 0.8, '#5f4514', '#3f5a18');
    // 금빛 반짝임
    ctx.fillStyle = '#ffe89a';
    for (let i = 0; i < 6; i++) {
      const tw = Math.sin(sec * 3 + i * 2.4);
      if (tw < 0.2) continue;
      ctx.globalAlpha = 0.8 * tw;
      ctx.fillRect(R(sx + (hash(i, 88) - 0.5) * r * 0.9), R(sy - r * 0.1 - hash(i, 89) * r * 0.3), 1, 1);
    }
    ctx.globalAlpha = 1;
  },
  volcano(ctx, sx, sy, r, sec, isl) {
    const ph = isl.x * 0.07;
    const cx = sx - r * 0.12;
    const cy = sy - r * 0.5;
    const fl = 0.55 + 0.45 * Math.sin(sec * 5.3 + ph);
    ctx.globalAlpha = 0.35 * fl;
    blob(ctx, cx, cy, 6, 3, '#ff9440');   // 분화구 빛무리
    ctx.globalAlpha = 1;
    blob(ctx, cx, cy, 3, 1.5, '#ffb35c'); // 용암 심
    // 솟는 불티
    ctx.fillStyle = '#ffd27a';
    for (let i = 0; i < 5; i++) {
      const t = (sec * 9 + i * 5 + hash(i, 91) * 7) % 13;
      ctx.globalAlpha = Math.max(0, 1 - t / 13) * 0.8;
      ctx.fillRect(R(cx + (hash(i, 92) - 0.5) * 10 + Math.sin(sec + i) * 2), R(cy - t), 1, 1);
    }
    ctx.globalAlpha = 1;
  },
  night_storm(ctx, sx, sy, r, sec, isl) {
    const cy = sy - r * 0.72;
    ctx.globalAlpha = 0.85;
    blob(ctx, sx - 4, cy, 10, 3, '#232a3e');   // 먹구름
    blob(ctx, sx + 6, cy + 1, 8, 2.5, '#1b2233');
    ctx.globalAlpha = 1;
    // 국지성 비
    ctx.fillStyle = '#8fa6d8';
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 6; i++) {
      const t = (sec * 30 + i * 4 + hash(i, 93) * 9) % 10;
      ctx.fillRect(R(sx - 8 + i * 3), R(cy + 3 + t), 1, 2);
    }
    ctx.globalAlpha = 1;
    // 주기적인 번쩍임
    const cyc = (sec + hash(R(isl.x), 94) * 3) % 3.7;
    if (cyc < 0.09) {
      ctx.globalAlpha = 0.5;
      blob(ctx, sx, cy, 12, 4, '#e6ecff');
      ctx.globalAlpha = 1;
    }
  },
  iceberg(ctx, sx, sy, r, sec) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 7; i++) {
      const px = sx + (hash(i, 95) - 0.5) * r * 0.9;
      const py = sy - r * 0.15 - hash(i, 96) * r * 0.35;
      const tw = Math.sin(sec * 2.5 + i * 1.9);
      ctx.globalAlpha = tw > 0.3 ? 0.9 : 0.35;
      ctx.fillRect(R(px), R(py), 2, 1);
    }
    ctx.globalAlpha = 1;
  },
  mirror_fog(ctx, sx, sy, r, sec) {
    // 섬을 감아 도는 안개 덩이
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283 + sec * 0.18;
      ctx.globalAlpha = 0.2 + 0.1 * Math.sin(sec + i * 2.1);
      blob(ctx, sx + Math.cos(a) * r * 0.85, sy + Math.sin(a) * r * 0.5, 5, 2, '#cdd5dc');
    }
    ctx.globalAlpha = 1;
  },
  shipyard_grave(ctx, sx, sy, r) {
    // 부러진 돛대들
    for (let i = 0; i < 3; i++) {
      const px = sx + (i - 1) * r * 0.3 + (hash(i, 97) - 0.5) * 6;
      const hh = 8 + hash(i, 98) * 7;
      const py = sy - r * 0.1 - hash(i, 99) * r * 0.2;
      fill(ctx, px, py - hh, 1, hh, '#151009');
      fill(ctx, px - 3, py - hh + 2 + (i % 2) * 3, 7, 1, '#151009');
    }
  },
  workshop(ctx, sx, sy, r, sec) {
    const bx = sx - 4;
    const by = sy - r * 0.28;
    fill(ctx, bx, by, 9, 6, '#6d5138');            // 오두막 몸체
    fill(ctx, bx - 1, by - 1, 11, 1, '#402c1c');   // 지붕 3단
    fill(ctx, bx + 1, by - 2, 7, 1, '#402c1c');
    fill(ctx, bx + 3, by - 3, 3, 1, '#402c1c');
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(sec * 3);
    fill(ctx, bx + 3, by + 2, 2, 2, '#ffd977');    // 흔들리는 창불
    ctx.globalAlpha = 1;
    // 굴뚝 연기
    ctx.fillStyle = '#b9b3a8';
    for (let i = 0; i < 3; i++) {
      const t = (sec * 6 + i * 4) % 12;
      ctx.globalAlpha = Math.max(0, 0.5 - t / 24);
      ctx.fillRect(R(bx + 7 + Math.sin(sec * 1.5 + i) * 1.5), R(by - 4 - t), 2, 1);
    }
    ctx.globalAlpha = 1;
  },
  world_end(ctx, sx, sy, r, sec) {
    // 보라 소용돌이
    ctx.fillStyle = '#b16be0';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283 * 2 + sec * 0.9;
      const d = r * (0.25 + (i / 16) * 0.85);
      ctx.globalAlpha = 0.55 - (i / 16) * 0.3;
      ctx.fillRect(R(sx + Math.cos(a) * d), R(sy + Math.sin(a) * d * 0.6), 2, 1);
    }
    ctx.globalAlpha = 1;
  },
};

/** 섬 능선 실루엣 — 컬럼 노이즈. dx(섬 로컬 좌표)로 시드해서 카메라와 무관하게 고정 */
function ridge(ctx, cx, baseY, halfW, ampH, color, seed) {
  ctx.fillStyle = color;
  const hw = Math.max(2, R(halfW));
  for (let dx = -hw; dx <= hw; dx++) {
    const u = dx / hw;
    const edge = Math.sqrt(Math.max(0, 1 - u * u));       // 가장자리로 갈수록 낮게
    const n = 0.62 + Math.sin(u * 5.2 + seed) * 0.22 + (hash(dx, seed) - 0.5) * 0.3;
    const hgt = Math.max(1, R(ampH * edge * n));
    ctx.fillRect(R(cx + dx), R(baseY - hgt), 1, hgt + 1);
  }
}

/** 픽셀 화살촉 — tip에서 ang 방향을 가리키는 작은 삼각형 */
function arrowHead(ctx, tipX, tipY, ang, color) {
  ctx.fillStyle = color;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let k = 0; k <= 4; k++) {
    const bx = tipX - ca * k;
    const by = tipY - sa * k;
    const hw = k * 0.55;
    for (let j = -hw; j <= hw; j += 0.5) {
      ctx.fillRect(R(bx - sa * j), R(by + ca * j), 1, 1);
    }
  }
}

export function runSail(opts) {
  const { canvas, promptEl, objectiveEl, shipImage, sea, islands, start, targetKey, onMove, sfx } = opts;

  return new Promise((resolvePromise) => {
    const ctx = canvas.getContext('2d');

    // ---------- 상태 ----------
    const ship = { x: start.x, y: start.y, vx: 0, vy: 0, facing: 1 };
    let vw = MIN_SIDE;         // 뷰포트 논리 크기
    let vh = MIN_SIDE;
    let camX = 0;
    let camY = 0;
    let done = false;          // resolve 1회 보장
    let rafId = 0;
    let lastT = 0;
    let nearIsland = null;     // 현재 상륙 가능 범위의 섬
    let lastReport = 0;        // onMove 스로틀
    const pressed = new Set();
    let pointer = null;        // 포인터 조타 목표 (논리 화면 좌표)
    const wake = [];           // 항적 입자
    let wakeSeed = 0;          // 일회성 카운터 (프레임 난수 아님)
    let wakeAcc = 0;

    const target = targetKey ? islands.find((i) => i.key === targetKey) : null;
    objectiveEl.textContent = target ? `목표: ${target.name}` : '';

    // ---------- 배 스프라이트 (플레이어가 그린 도트 이미지) ----------
    const shipImg = new Image();
    let shipReady = false;
    let shipH = 18;
    shipImg.onload = () => {
      const sc = SHIP_W / (shipImg.width || SHIP_W);
      shipH = Math.max(8, R(shipImg.height * sc));
      shipReady = true;
    };
    if (shipImage) shipImg.src = shipImage;

    // ---------- 크기/카메라 ----------
    function resize() {
      const iw = window.innerWidth || 800;
      const ih = window.innerHeight || 600;
      if (iw >= ih) {
        vh = MIN_SIDE;
        vw = R((MIN_SIDE * iw) / ih);
      } else {
        vw = MIN_SIDE;
        vh = R((MIN_SIDE * ih) / iw);
      }
      canvas.width = vw;
      canvas.height = vh;
    }

    function axisCam(pos, view, world) {
      if (world <= view) return (world - view) / 2;   // 월드가 화면보다 작으면 가운데
      return Math.min(Math.max(pos - view / 2, 0), world - view);
    }

    function updateCamera() {
      camX = axisCam(ship.x, vw, sea.w);
      camY = axisCam(ship.y, vh, sea.h);
    }

    // ---------- 입력 ----------
    const KEYS = {
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
    };

    function onKeyDown(e) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!e.repeat) attemptDock();
        return;
      }
      const dir = KEYS[e.code];
      if (!dir) return;
      e.preventDefault();
      pressed.add(dir);
    }

    function onKeyUp(e) {
      const dir = KEYS[e.code];
      if (dir) pressed.delete(dir);
    }

    function toLogical(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * vw,
        y: ((e.clientY - rect.top) / rect.height) * vh,
      };
    }

    function onPointerDown(e) {
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 무해 */ }
      }
      pointer = toLogical(e);
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (pointer) pointer = toLogical(e);
    }
    function onPointerUp() {
      pointer = null;
    }

    function onPromptClick() {
      promptEl.blur();   // Space가 버튼 재클릭으로 새는 것 방지
      attemptDock();
    }

    // ---------- 상륙 ----------
    function attemptDock() {
      if (done || !nearIsland) return;
      if (nearIsland.locked) {
        if (sfx) sfx('cancel');
        return;
      }
      finish(nearIsland);
    }

    function finish(isl) {
      if (done) return;
      done = true;
      if (sfx) sfx('dock');
      cleanup();
      resolvePromise({ islandKey: isl.key, x: ship.x, y: ship.y });
    }

    // ---------- 정리 ----------
    function cleanup() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      promptEl.removeEventListener('click', onPromptClick);
      promptEl.hidden = true;
      promptEl.classList.remove('locked');
      if (window.__sail === dbg) delete window.__sail;
    }

    // ---------- 물리/진행 ----------
    function step(dt, now) {
      // 입력 방향
      let ax = 0;
      let ay = 0;
      if (pressed.has('left')) ax -= 1;
      if (pressed.has('right')) ax += 1;
      if (pressed.has('up')) ay -= 1;
      if (pressed.has('down')) ay += 1;
      if (!ax && !ay && pointer) {
        // 포인터 조타 — 누른 지점(월드 좌표)을 향해
        const wx = camX + pointer.x;
        const wy = camY + pointer.y;
        const dx = wx - ship.x;
        const dy = wy - ship.y;
        const d = Math.hypot(dx, dy);
        if (d > 8) { ax = dx / d; ay = dy / d; }
      }

      if (ax || ay) {
        const len = Math.hypot(ax, ay);
        ship.vx += (ax / len) * ACCEL * dt;
        ship.vy += (ay / len) * ACCEL * dt;
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > MAX_SPEED) {
          ship.vx = (ship.vx / sp) * MAX_SPEED;
          ship.vy = (ship.vy / sp) * MAX_SPEED;
        }
      } else {
        const decay = Math.max(0, 1 - DRAG * dt);
        ship.vx *= decay;
        ship.vy *= decay;
        if (Math.hypot(ship.vx, ship.vy) < 1) { ship.vx = 0; ship.vy = 0; }
      }

      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;

      // 월드 경계
      if (ship.x < 10) { ship.x = 10; ship.vx = Math.max(0, ship.vx); }
      if (ship.x > sea.w - 10) { ship.x = sea.w - 10; ship.vx = Math.min(0, ship.vx); }
      if (ship.y < 10) { ship.y = 10; ship.vy = Math.max(0, ship.vy); }
      if (ship.y > sea.h - 10) { ship.y = sea.h - 10; ship.vy = Math.min(0, ship.vy); }

      // 섬 중심부는 통과 불가 — 타원 경계 밖으로 밀어낸다
      for (let i = 0; i < islands.length; i++) {
        const isl = islands[i];
        const dx = ship.x - isl.x;
        const dy = (ship.y - isl.y) / 0.62;   // 타원 보정
        const d = Math.hypot(dx, dy);
        const min = isl.r * 0.72;
        if (d < min && d > 0.001) {
          const push = min - d;
          ship.x += (dx / d) * push;
          ship.y += (dy / d) * push * 0.62;
        }
      }

      if (Math.abs(ship.vx) > 4) ship.facing = ship.vx < 0 ? -1 : 1;

      // 항적 입자 — 속도에 비례해 생성 (카운터 기반 일회성이라 hash 시드로 안전)
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > 15) {
        wakeAcc += dt * (speed / 9);
        while (wakeAcc >= 1) {
          wakeAcc -= 1;
          const j1 = hash(wakeSeed, 71) - 0.5;
          const j2 = hash(wakeSeed, 72) - 0.5;
          wakeSeed += 1;
          wake.push({
            x: ship.x - (ship.vx / speed) * SHIP_W * 0.4 + j1 * 4,
            y: ship.y - (ship.vy / speed) * SHIP_W * 0.4 * 0.62 + 3 + j2 * 3,
            vx: -ship.vx * 0.06 + j1 * 5,
            vy: -ship.vy * 0.06 + j2 * 3,
            life: 0,
            max: 0.7 + hash(wakeSeed, 73) * 0.6,
          });
          if (wake.length > 90) wake.shift();
        }
      }
      for (let i = wake.length - 1; i >= 0; i--) {
        const p = wake[i];
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life >= p.max) wake.splice(i, 1);
      }

      updateCamera();

      // 상륙 가능 섬 탐색 → 프롬프트 갱신 (바뀔 때만 DOM 접근)
      let near = null;
      let best = Infinity;
      for (let i = 0; i < islands.length; i++) {
        const isl = islands[i];
        const d = Math.hypot(ship.x - isl.x, ship.y - isl.y) - isl.r;
        if (d <= DOCK_RANGE && d < best) { best = d; near = isl; }
      }
      if (near !== nearIsland) {
        nearIsland = near;
        if (!near) {
          promptEl.hidden = true;
        } else {
          promptEl.hidden = false;
          promptEl.classList.toggle('locked', !!near.locked);
          promptEl.textContent = near.locked
            ? '🔒 검은 안개가 가로막는다'
            : `⚓ ${near.name}에 상륙한다 (Space)`;
        }
      }

      // 위치 저장 콜백 (~1초 스로틀)
      if (onMove && now - lastReport >= 1000) {
        lastReport = now;
        onMove(R(ship.x), R(ship.y));
      }
    }

    // ---------- 렌더 ----------

    /** 월드 좌표에 고정된 잔물결 — 카메라가 움직이면 같이 흘러가 이동감을 준다 */
    function worldWaves(sec) {
      const T = 26;
      const tx0 = Math.floor(camX / T);
      const tx1 = Math.floor((camX + vw) / T);
      const ty0 = Math.floor(camY / T);
      const ty1 = Math.floor((camY + vh) / T);
      ctx.fillStyle = '#a8e6f5';
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const id = tx * 131 + ty * 733;
          for (let k = 0; k < 2; k++) {
            if (hash(id, 60 + k) < 0.4) continue;   // 빈 타일도 섞어 자연스럽게
            const px = tx * T + hash(id, 62 + k) * T + Math.sin(sec * 1.4 + id + k * 3) * 2;
            const py = ty * T + hash(id, 63 + k) * T;
            const blink = Math.sin(sec * 2 + hash(id, 64 + k) * 6.283);
            if (blink < -0.2) continue;
            ctx.globalAlpha = 0.26 + blink * 0.18;
            ctx.fillRect(R(px - camX), R(py - camY), hash(id, 65 + k) > 0.7 ? 4 : 2, 1);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawIsland(isl, sec) {
      const sx = isl.x - camX;
      const sy = isl.y - camY;
      const r = isl.r;
      if (sx < -r * 1.4 || sx > vw + r * 1.4 || sy < -r * 1.4 || sy > vh + r * 1.4) return;

      const style = ISLAND_STYLES[isl.bg] || DEFAULT_STYLE;
      const seed = R(isl.x * 0.13 + isl.y * 0.07);   // 섬마다 고정된 노이즈 시드

      // 얕은 물 링
      ctx.globalAlpha = 0.45;
      blob(ctx, sx, sy, r * 1.12, r * 0.7, '#5fb6d4');
      ctx.globalAlpha = 1;
      // 모래톱 → 땅
      blob(ctx, sx, sy, r * 0.92, r * 0.58, style.beach);
      blob(ctx, sx, sy - r * 0.06, r * 0.78, r * 0.46, style.land);
      // 능선 실루엣 2겹
      ridge(ctx, sx - r * 0.12, sy - r * 0.02, r * 0.55, r * 0.52, style.ridge, seed);
      ridge(ctx, sx + r * 0.24, sy + r * 0.1, r * 0.32, r * 0.3, style.ridge, seed + 3);

      // bg 키별 장식
      const deco = DECOS[isl.bg];
      if (deco) deco(ctx, sx, sy, r, sec, isl);

      // 해안 포말 — 타원 둘레를 도는 점멸 점선
      ctx.fillStyle = '#dff4fb';
      const n = Math.max(14, R(r * 0.45));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283;
        const tw = Math.sin(sec * 2 + i * 1.31 + seed);
        if (tw < 0) continue;
        ctx.globalAlpha = 0.5 * tw;
        ctx.fillRect(R(sx + Math.cos(a) * r * 1.0), R(sy + Math.sin(a) * r * 0.63), 2, 1);
      }
      ctx.globalAlpha = 1;

      if (isl.cleared) {
        // 클리어 깃발
        const fx = R(sx - r * 0.05);
        const fy = R(sy - r * 0.55);
        fill(ctx, fx, fy - 8, 1, 8, '#3a2a1c');
        fill(ctx, fx + 1, fy - 8, Math.sin(sec * 4) > 0 ? 4 : 3, 3, '#ffd15c');
      }

      if (isl.locked) {
        // 채도 낮추기 — 어두운 반투명 덮개
        ctx.globalAlpha = 0.5;
        blob(ctx, sx, sy - r * 0.05, r * 1.02, r * 0.64, '#0c0e18');
        ctx.globalAlpha = 1;
        // 검은 안개 링
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * 6.283 + sec * 0.28;
          ctx.globalAlpha = 0.35 + 0.15 * Math.sin(sec * 1.3 + i * 2.7);
          blob(ctx, sx + Math.cos(a) * r * 1.18, sy + Math.sin(a) * r * 0.74, 5, 2.2, '#0a0a12');
        }
        ctx.globalAlpha = 1;
      }
    }

    function drawShipSprite(sec) {
      const sx = ship.x - camX;
      const sy = ship.y - camY;
      const bob = Math.sin(sec * 2.2) * 1.2;   // 상하 바빙

      // 항적 (배보다 먼저 = 배 아래)
      for (let i = 0; i < wake.length; i++) {
        const p = wake[i];
        const a = 1 - p.life / p.max;
        ctx.globalAlpha = 0.55 * a;
        ctx.fillStyle = '#e8f8ff';
        ctx.fillRect(R(p.x - camX), R(p.y - camY), a > 0.5 ? 2 : 1, 1);
      }
      ctx.globalAlpha = 1;

      // 배 그림자
      ctx.globalAlpha = 0.25;
      blob(ctx, sx, sy + 3, SHIP_W * 0.42, 2, '#08283a');
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(R(sx), R(sy + bob));
      if (ship.facing < 0) ctx.scale(-1, 1);
      if (shipReady) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(shipImg, R(-SHIP_W / 2), R(-shipH * 0.75), SHIP_W, shipH);
      } else {
        // 이미지 로드 전/실패 시 예비 돛단배
        fill(ctx, -7, -2, 14, 4, '#4a2f1a');
        fill(ctx, -6, 2, 12, 2, '#3a2413');
        fill(ctx, -1, -12, 1, 10, '#2a1d11');
        fill(ctx, 0, -11, 6, 7, '#e6dcc4');
      }
      ctx.restore();
    }

    function drawCompass(sec) {
      if (!target) return;
      const sx = target.x - camX;
      const sy = target.y - camY;
      const onScreen = sx > 0 && sx < vw && sy > 0 && sy < vh;
      const pulse = 0.6 + 0.4 * Math.sin(sec * 3);

      if (onScreen) {
        // 목표 섬 머리 위 마커
        const my = sy - target.r * 0.8 - 6 + Math.sin(sec * 3) * 2;
        arrowHead(ctx, sx, my, Math.PI / 2, '#ffd977');   // 아래를 가리키는 삼각형
        ctx.globalAlpha = pulse;
        fill(ctx, sx - 1, my - 8, 2, 2, '#ffefad');       // 금색 점
        ctx.globalAlpha = 1;
        return;
      }

      // 화면 가장자리 화살표
      const ang = Math.atan2(target.y - ship.y, target.x - ship.x);
      const tx = Math.cos(ang);
      const ty = Math.sin(ang);
      const cx = vw / 2;
      const cy = vh / 2;
      const m = 10;
      const kx = Math.abs(tx) > 1e-6 ? ((tx > 0 ? vw - m - cx : m - cx) / tx) : Infinity;
      const ky = Math.abs(ty) > 1e-6 ? ((ty > 0 ? vh - m - cy : m - cy) / ty) : Infinity;
      const k = Math.min(kx, ky);
      const ex = cx + tx * k;
      const ey = cy + ty * k;
      arrowHead(ctx, ex, ey, ang, '#ffd977');
      ctx.globalAlpha = pulse;
      fill(ctx, ex - tx * 7 - 1, ey - ty * 7 - 1, 2, 2, '#ffefad');
      ctx.globalAlpha = 1;
    }

    function render(sec) {
      // 바다 밑색 — 위가 멀고 아래가 가까운 항해도 원근 밴드
      const bands = seaBands(ctx, vw, vh, 0, SEA_ROWS);
      glitter(ctx, vw * 0.72, 0, vh, sec, '#fff8d8', { alpha: 0.16, count: 60, spread: 0.3, seed: 3 });
      worldWaves(sec);
      waves(ctx, vw, bands, sec, '#a8e6f5', { alpha: 0.14, speed: 9, density: 5, seed: 41 });

      // 섬 — 위(멀리)부터 그려 겹침을 자연스럽게
      const sorted = islands.slice().sort((a, b) => a.y - b.y);
      for (let i = 0; i < sorted.length; i++) drawIsland(sorted[i], sec);

      drawShipSprite(sec);
      gulls(ctx, vw, sec, { y: vh * 0.12, count: 3, speed: 10, seed: 44 });
      vignette(ctx, vw, vh, 0.04);
      drawCompass(sec);
    }

    // ---------- 루프 ----------
    function frame(now) {
      rafId = requestAnimationFrame(frame);
      let dt = (now - lastT) / 1000;
      lastT = now;
      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;   // 탭 전환 등 큰 점프 방지
      step(dt, now);
      render(now / 1000);
    }

    // ---------- 디버그 ----------
    const dbg = {
      get pos() { return { x: ship.x, y: ship.y }; },
      dock(key) {
        const isl = islands.find((i) => i.key === key);
        if (!isl) {
          console.warn(`[sail] 알 수 없는 섬: ${key}`);
          return;
        }
        ship.x = isl.x;
        ship.y = isl.y + isl.r * 0.85;
        finish(isl);
      },
    };
    window.__sail = dbg;

    // ---------- 시작 ----------
    resize();
    updateCamera();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    promptEl.addEventListener('click', onPromptClick);
    promptEl.hidden = true;

    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  });
}
