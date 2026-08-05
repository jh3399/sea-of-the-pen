// 씬별 배경 정의. 각 씬은 draw(ctx, { w, h, sec })로 한 프레임을 전부 그린다.
// 레이어 순서는 항상 [하늘] → [먼 배경] → [중간] → [바다] → [앞] → [효과/보정].
// 키 목록은 CLAUDE.md의 배경 표와 1:1로 맞춰져 있다.

import {
  hash, fill, blob, overlay, vignette, skyGradient, stars, moon, sun, clouds, hills, palm,
  seaBands, waves, glitter, tallShip, lighthouse, pier, gulls, particles, rain, fogBands,
  lightning, wreckage,
} from './bgkit.js';

const R = Math.round;

// ---------------- night_sea — 기본/타이틀 (밤바다) ----------------

function night_sea(ctx, { w, h, sec }) {
  const hz = R(h * 0.6);
  skyGradient(ctx, w, 0, hz, ['#05071a', '#0a0e2a', '#121b41', '#1b2a58', '#25396d']);
  stars(ctx, w, hz * 0.92, sec, { count: 110, seed: 1 });
  const mx = R(w * 0.74);
  const my = R(hz * 0.26);
  moon(ctx, mx, my, 7, {});
  clouds(ctx, w, sec, { y: hz * 0.55, color: '#1a2246', alpha: 0.7, count: 4, speed: 2, scale: 1.3, seed: 4 });
  hills(ctx, w, hz + 1, '#0a0f28', { amp: 9, freq: 0.9, seed: 7, from: 0, to: 0.34 });
  hills(ctx, w, hz + 1, '#0c1230', { amp: 6, freq: 1.4, seed: 9, from: 0.62, to: 1 });
  const bands = seaBands(ctx, w, h, hz, ['#1b3a6b', '#16305c', '#12284e', '#0e2042', '#0b1a37', '#081430']);
  glitter(ctx, mx, hz, h, sec, '#f5e6c8', { alpha: 0.5, count: 110, seed: 3 });
  waves(ctx, w, bands, sec, '#2e5d9e', { alpha: 0.45, speed: 9, seed: 2 });
  tallShip(ctx, w * 0.15, hz - 4 + Math.sin(sec * 1.3) * 1.5, 1, {});
  clouds(ctx, w, sec, { y: h * 0.9, color: '#0a1228', alpha: 0.35, count: 3, speed: 14, scale: 2, seed: 6 });
  vignette(ctx, w, h, 0.06);
}

// ---------------- harbor — S-01 낮 부두 ----------------

function harbor(ctx, { w, h, sec }) {
  const hz = R(h * 0.62);
  skyGradient(ctx, w, 0, hz, ['#4aa6d8', '#6fc0e4', '#96d5ec', '#bce7f2', '#dcf3f4']);
  sun(ctx, w * 0.2, hz * 0.24, 8, sec, {});
  clouds(ctx, w, sec, { y: hz * 0.22, color: '#ffffff', alpha: 0.75, count: 5, speed: 2.2, scale: 1.4, seed: 11 });
  clouds(ctx, w, sec, { y: hz * 0.48, color: '#e8f6ff', alpha: 0.55, count: 4, speed: 4, scale: 1, seed: 12 });
  hills(ctx, w, hz + 1, '#5f86a3', { amp: 14, freq: 1.1, seed: 13, from: 0, to: 0.45 });
  hills(ctx, w, hz + 1, '#7099b2', { amp: 9, freq: 1.7, seed: 14, from: 0.55, to: 1 });
  const bands = seaBands(ctx, w, h, hz, ['#2e7fa8', '#2a739b', '#256788', '#1f5a78', '#1a4d68', '#154058']);
  glitter(ctx, w * 0.2, hz, h, sec, '#fff6d0', { alpha: 0.4, count: 80, seed: 15 });
  waves(ctx, w, bands, sec, '#8fd8ee', { alpha: 0.42, speed: 7, seed: 16 });

  // 중간 레이어: 등대 + 정박한 배들
  lighthouse(ctx, R(w * 0.84), hz + 2, sec, {});
  const dockPal = { hull: '#3b2a1a', deck: '#5b432a', sail: '#e6dcc4', mast: '#2a1d11', flag: '#c8443c' };
  tallShip(ctx, w * 0.1, hz + 6 + Math.sin(sec * 1.1) * 1.2, 1, dockPal);
  tallShip(ctx, w * 0.42, hz + 10 + Math.sin(sec * 1.1 + 1.4) * 1.4, 1.2, dockPal);
  tallShip(ctx, w * 0.66, hz + 4 + Math.sin(sec * 1.1 + 2.6) * 1.1, 0.8, dockPal);

  gulls(ctx, w, sec, { y: hz * 0.35, count: 5, speed: 10, seed: 17 });
  pier(ctx, w, h, {});
  vignette(ctx, w, h, 0.04);
}

// ---------------- sea_day — S-02 맑은 낮 바다 ----------------

function sea_day(ctx, { w, h, sec }) {
  const hz = R(h * 0.55);
  skyGradient(ctx, w, 0, hz, ['#3d9ad4', '#63b7e6', '#8bd2ef', '#b6e8f6', '#e0f6f7']);
  sun(ctx, w * 0.78, hz * 0.2, 9, sec, {});
  clouds(ctx, w, sec, { y: hz * 0.2, color: '#ffffff', alpha: 0.8, count: 6, speed: 2.6, scale: 1.6, seed: 21 });
  clouds(ctx, w, sec, { y: hz * 0.42, color: '#f2fbff', alpha: 0.5, count: 5, speed: 5, scale: 1.1, seed: 22 });
  hills(ctx, w, hz + 1, '#6a94aa', { amp: 7, freq: 1.3, seed: 23, from: 0.05, to: 0.3 });
  const bands = seaBands(ctx, w, h, hz, ['#3990b8', '#2f83ab', '#2a769c', '#24688b', '#1e5a7a', '#184c68']);
  glitter(ctx, w * 0.78, hz, h, sec, '#fff8d8', { alpha: 0.45, count: 100, seed: 24 });
  waves(ctx, w, bands, sec, '#a8e6f5', { alpha: 0.5, speed: 11, density: 8, seed: 25 });
  gulls(ctx, w, sec, { y: hz * 0.3, count: 4, speed: 12, seed: 26 });
  // 앞 물보라
  particles(ctx, w, h, sec, { count: 26, color: '#ffffff', speed: 26, dir: 1, sway: 10, alpha: 0.5, seed: 27, y0: 0.82, y1: 1 });
  vignette(ctx, w, h, 0.04);
}

// ---------------- fog_black — S-02 습격 (검은 안개·붉은 포격) ----------------

function fog_black(ctx, { w, h, sec }) {
  const hz = R(h * 0.58);
  skyGradient(ctx, w, 0, hz, ['#0a0a10', '#12111c', '#1b1822', '#241c26', '#2c2028']);
  // 포격 섬광 (주기적)
  const idx = Math.floor(sec / 2.3);
  const ft = sec - idx * 2.3;
  const flash = ft < 0.14 ? 1 - ft / 0.14 : 0;
  const bands = seaBands(ctx, w, h, hz, ['#1a1218', '#171016', '#140e14', '#110c11', '#0e0a0f', '#0a070b']);
  waves(ctx, w, bands, sec, '#5a2630', { alpha: 0.35, speed: 12, seed: 31 });

  // 안개 속 검은 배 실루엣
  const sx = w * 0.62 + Math.sin(sec * 0.4) * 3;
  ctx.globalAlpha = 0.85;
  tallShip(ctx, sx, hz - 2, 1.7, { hull: '#07060a', deck: '#0d0b12', sail: '#141019', mast: '#07060a', flag: '#8e1d28' });
  ctx.globalAlpha = 1;

  fogBands(ctx, w, sec, { y0: hz * 0.35, y1: h * 0.92, color: '#1d1a24', alpha: 0.5, count: 9, speed: 7, thick: 7, seed: 32 });
  fogBands(ctx, w, sec, { y0: hz * 0.7, y1: h, color: '#0b0a10', alpha: 0.45, count: 5, speed: 13, thick: 9, seed: 33 });

  // 붉은 포탄
  for (let i = 0; i < 4; i++) {
    const t = ((sec * 0.55 + hash(i, 41)) % 1);
    const x = w * (0.62 - t * (0.45 + hash(i, 42) * 0.2));
    const y = hz * 0.4 + t * t * h * 0.35 + hash(i, 43) * 10;
    ctx.globalAlpha = 0.9 - t * 0.4;
    blob(ctx, x, y, 2, 2, '#ff5a3c');
    ctx.globalAlpha = 0.3;
    blob(ctx, x + 4, y - 1, 3, 1, '#8e1d28');
    ctx.globalAlpha = 1;
  }
  if (flash > 0) overlay(ctx, w, h, '#d8402c', 0.22 * flash);
  vignette(ctx, w, h, 0.14, 8);
}

// ---------------- dawn_wreck — S-03 새벽 난파 ----------------

function dawn_wreck(ctx, { w, h, sec }) {
  const hz = R(h * 0.6);
  skyGradient(ctx, w, 0, hz, ['#2b2350', '#4a3466', '#7d4a6a', '#c06a63', '#e79a68', '#f5c98a']);
  stars(ctx, w, hz * 0.35, sec, { count: 30, seed: 51, bright: 0.5 });
  const sx = R(w * 0.5);
  sun(ctx, sx, hz - 3, 7, sec, { core: '#fff0c0', rim: '#ffcf7a', glow: '#ff9d5c' });
  clouds(ctx, w, sec, { y: hz * 0.4, color: '#7a4f6d', alpha: 0.55, count: 5, speed: 1.8, scale: 1.5, seed: 52 });
  clouds(ctx, w, sec, { y: hz * 0.72, color: '#e0906b', alpha: 0.35, count: 4, speed: 3, scale: 1.1, seed: 53 });
  const bands = seaBands(ctx, w, h, hz, ['#5b4a78', '#4d3f68', '#413458', '#362b49', '#2b223b', '#221b2f']);
  glitter(ctx, sx, hz, h, sec, '#ffcf8a', { alpha: 0.55, count: 120, seed: 54 });
  waves(ctx, w, bands, sec, '#8a6f9e', { alpha: 0.35, speed: 5, seed: 55 });
  wreckage(ctx, w, sec, { y: hz + (h - hz) * 0.35, count: 7, seed: 56, color: '#241a24', accent: '#4a3348' });
  wreckage(ctx, w, sec, { y: h * 0.86, count: 4, seed: 57, s: 1.8, color: '#1a121a', accent: '#3a2838' });
  fogBands(ctx, w, sec, { y0: hz - 6, y1: h * 0.8, color: '#e9b48c', alpha: 0.09, count: 5, speed: 3, seed: 58 });
  gulls(ctx, w, sec, { y: hz * 0.42, count: 2, speed: 7, seed: 59, color: '#f3d7c0', alpha: 0.7 });
  vignette(ctx, w, h, 0.07);
}

// ---------------- jungle_gold — 1섬 가르 (금빛 정글) ----------------

function jungle_gold(ctx, { w, h, sec }) {
  const hz = R(h * 0.66);
  skyGradient(ctx, w, 0, hz, ['#4a3a12', '#7a5a18', '#a8801f', '#d4a72c', '#f0cf5e']);
  sun(ctx, w * 0.5, hz * 0.3, 10, sec, { core: '#fff6cf', rim: '#ffe07a', glow: '#e0a828' });
  clouds(ctx, w, sec, { y: hz * 0.3, color: '#f5dd94', alpha: 0.3, count: 4, speed: 2, scale: 1.6, seed: 61 });
  // 정글 능선 3겹 (멀리→가까이)
  hills(ctx, w, hz + 2, '#7a6320', { amp: 26, freq: 1.0, seed: 62 });
  hills(ctx, w, hz + 6, '#4f4415', { amp: 20, freq: 1.6, seed: 63, offsetX: 40, base: 4 });
  hills(ctx, w, hz + 12, '#2e2a0e', { amp: 14, freq: 2.4, seed: 64, offsetX: 90, base: 10 });
  // 야자수 숲
  for (let i = 0; i < 9; i++) {
    const x = w * (0.04 + i * 0.115) + hash(i, 65) * 8;
    const s = 0.9 + hash(i, 66) * 0.7;
    const sway = Math.sin(sec * 0.9 + i) * 1.2;
    palm(ctx, x + sway, hz + 10 + hash(i, 67) * 6, s, '#2a2410', '#1c2a0e');
  }
  const bands = seaBands(ctx, w, h, hz + 12, ['#b98f22', '#a67d1d', '#8f6a18', '#775714', '#5f4510', '#48340c']);
  glitter(ctx, w * 0.5, hz + 12, h, sec, '#ffe89a', { alpha: 0.6, count: 90, seed: 68 });
  waves(ctx, w, bands, sec, '#ffdf7a', { alpha: 0.4, speed: 6, seed: 69 });
  // 금빛 홀씨/반딧불
  particles(ctx, w, h, sec, { count: 45, color: '#ffe89a', speed: 7, dir: -1, sway: 12, alpha: 0.75, seed: 70, y0: 0.2, y1: 1, twinkle: true });
  vignette(ctx, w, h, 0.08);
}

// ---------------- 나루 마을 (루의 고향) ----------------
// life: 0 = 색이 다 빠진 상태, 1 = 색이 돌아온 상태.
// 오염은 검정이 아니라 '바램'이다 — 플레이어가 긋는 선이 검정이라 검정을 악으로 두면 문법이 충돌한다.

/** 두 색을 life 비율로 섞는다 (색 빠짐 표현의 핵심) */
function fade(alive, dead, life) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(alive);
  const d = p(dead);
  const m = a.map((v, i) => R(d[i] + (v - d[i]) * life));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function drawVillage(ctx, { w, h, sec }, life) {
  const hz = R(h * 0.62);
  const C = (alive, dead) => fade(alive, dead, life);

  skyGradient(ctx, w, 0, hz, [
    C('#3f8fc4', '#7c8288'), C('#63aed6', '#8f9499'), C('#8ecbe4', '#a3a7ab'),
    C('#bde3ef', '#bcbfc2'), C('#e2f4f7', '#d6d8da'),
  ]);
  sun(ctx, w * 0.78, hz * 0.22, 8, sec, {
    core: C('#fff3c4', '#e8e8e8'), rim: C('#ffd977', '#d2d2d2'), glow: C('#ffbe5c', '#c0c0c0'),
  });
  clouds(ctx, w, sec, { y: hz * 0.24, color: C('#ffffff', '#c8cacc'), alpha: 0.7, count: 5, speed: 2, scale: 1.4, seed: 181 });

  // 뒤편 언덕
  hills(ctx, w, hz + 2, C('#4f8a3e', '#7d8079'), { amp: 18, freq: 1.1, seed: 182 });
  hills(ctx, w, hz + 8, C('#3a6b2e', '#696c66'), { amp: 12, freq: 1.8, seed: 183, offsetX: 50, base: 4 });

  // 바다
  const bands = seaBands(ctx, w, h, hz + 8, [
    C('#2f8fb0', '#75797d'), C('#2a80a0', '#6c7074'), C('#25728f', '#63676b'),
    C('#20647e', '#5a5e62'), C('#1a556d', '#515559'), C('#15465b', '#484c50'),
  ]);
  waves(ctx, w, bands, sec, C('#9fe0ee', '#9a9da0'), { alpha: 0.4, speed: 6, seed: 184 });

  // 마을 집들 (앞 레이어) — 지붕 색이 제일 먼저 빠진다
  const ground = R(h * 0.82);
  fill(ctx, 0, ground, w, h - ground, C('#6b5a3a', '#77787a'));
  fill(ctx, 0, ground, w, 2, C('#8a7448', '#8b8c8e'));

  const houses = [
    { x: 0.08, s: 1.1, roof: '#c8443c' }, { x: 0.26, s: 0.9, roof: '#d98a2b' },
    { x: 0.46, s: 1.2, roof: '#3f7ab8' }, { x: 0.68, s: 1.0, roof: '#c8443c' },
    { x: 0.86, s: 0.85, roof: '#5aa84a' },
  ];
  for (const ho of houses) {
    const hx = R(w * ho.x);
    const bw = R(26 * ho.s);
    const bh = R(20 * ho.s);
    const by = ground - bh;
    fill(ctx, hx - bw / 2, by, bw, bh, C('#e6d9b8', '#a8a9ab'));          // 벽
    fill(ctx, hx - bw / 2, by, bw, 2, C('#c9bb96', '#95969a'));
    fill(ctx, hx - bw / 2 - 2, by - R(7 * ho.s), bw + 4, R(7 * ho.s), C(ho.roof, '#8e8f92')); // 지붕
    fill(ctx, hx - 3, by + bh - R(9 * ho.s), 6, R(9 * ho.s), C('#6b4a24', '#7a7b7d'));        // 문
    fill(ctx, hx + bw / 4, by + 5, 4, 4, C('#ffe07a', '#b9babc'));                            // 창
  }

  // 꽃 — 색이 빠지면 회색 점만 남는다
  for (let i = 0; i < 26; i++) {
    const fx = hash(i, 185) * w;
    const fy = ground + 3 + hash(i, 186) * (h - ground - 5);
    fill(ctx, fx, fy, 2, 2, C(['#ff7a9c', '#ffd24a', '#9a6cff'][i % 3], '#8d8e90'));
  }

  if (life < 0.99) overlay(ctx, w, h, '#cfd2d4', (1 - life) * 0.16);
  vignette(ctx, w, h, 0.05);
}

function village_pale(ctx, env) { drawVillage(ctx, env, 0.35); }
function village_alive(ctx, env) { drawVillage(ctx, env, 1); }

// ---------------- white_forest — 흰 숲 (오염의 진원지) ----------------
// 색이 완전히 빠진 숲. 어둡지 않고 하얗게 질려 있다. 아무것도 움직이지 않는다.

function white_forest(ctx, { w, h, sec }) {
  const hz = R(h * 0.72);
  skyGradient(ctx, w, 0, hz, ['#c8ccce', '#d3d6d8', '#dee0e1', '#e8e9ea', '#f2f2f2']);

  // 안개 — 유일하게 움직이는 것
  fogBands(ctx, w, sec, { y0: hz * 0.2, y1: h * 0.95, color: '#ffffff', alpha: 0.2, count: 8, speed: 2.5, thick: 8, seed: 191 });

  // 흰 나무들 — 뒤에서 앞으로 3겹
  const trees = (count, base, scale, col, seed) => {
    for (let i = 0; i < count; i++) {
      const tx = R(w * ((i + 0.5) / count) + (hash(i, seed) - 0.5) * (w / count));
      const th = R((30 + hash(i, seed + 1) * 26) * scale);
      const tw = Math.max(2, R(3 * scale));
      fill(ctx, tx, base - th, tw, th, col);
      // 가지
      for (let k = 0; k < 3; k++) {
        const by = base - th + (k + 1) * (th / 4);
        const dir = hash(i * 4 + k, seed + 2) > 0.5 ? 1 : -1;
        const bl = R((5 + hash(i * 4 + k, seed + 3) * 7) * scale);
        fill(ctx, dir > 0 ? tx : tx - bl, by, bl, Math.max(1, R(scale)), col);
      }
    }
  };
  trees(14, hz + 4, 0.8, '#dcdfe0', 192);
  trees(10, hz + 14, 1.15, '#c6cacc', 193);

  // 바닥
  fill(ctx, 0, hz + 10, w, h - hz - 10, '#e4e6e7');
  fill(ctx, 0, hz + 10, w, 2, '#d0d3d5');

  // 무너진 신전 — 400년 전 형제가 살던 집
  const sx = R(w * 0.5);
  const sy = hz + 12;
  fill(ctx, sx - 30, sy - 30, 60, 30, '#b8bcbe');            // 벽
  fill(ctx, sx - 34, sy - 36, 68, 6, '#a9adaf');             // 처마
  fill(ctx, sx - 10, sy - 20, 20, 20, '#8f9497');            // 열린 문 (안이 더 하얗다)
  fill(ctx, sx - 8, sy - 18, 16, 18, '#e8eaeb');
  for (let i = 0; i < 4; i++) fill(ctx, sx - 26 + i * 16, sy - 26, 3, 22, '#a2a6a8'); // 기둥
  fill(ctx, sx + 22, sy - 8, 14, 8, '#c0c4c6');              // 무너진 잔해
  fill(ctx, sx - 40, sy - 6, 10, 6, '#c0c4c6');

  // 앞쪽 흰 나무 (가장 크게)
  trees(6, h + 6, 1.9, '#eceeef', 194);

  overlay(ctx, w, h, '#ffffff', 0.1);
  vignette(ctx, w, h, 0.06);
}

// ---------------- fog_pale — 색을 지우며 밀려오는 안개 (프롤로그 습격) ----------------

function fog_pale(ctx, { w, h, sec }) {
  const hz = R(h * 0.58);
  skyGradient(ctx, w, 0, hz, ['#7d858c', '#8e959b', '#a0a6ab', '#b3b8bc', '#c6cacd']);

  const bands = seaBands(ctx, w, h, hz, ['#5c666e', '#556069', '#4e5962', '#47525b', '#404b54', '#39444d']);
  waves(ctx, w, bands, sec, '#98a2aa', { alpha: 0.35, speed: 10, seed: 201 });

  // 안개 속 검은 돛의 배 — 실루엣만. 얼굴은 절대 안 보인다.
  const sx = w * 0.66 + Math.sin(sec * 0.4) * 3;
  ctx.globalAlpha = 0.7;
  tallShip(ctx, sx, hz - 2, 1.8, { hull: '#2a2e33', deck: '#343940', sail: '#3d434a', mast: '#24282d', flag: '#4a5058' });
  ctx.globalAlpha = 1;

  // 밀려오는 흰 안개 — 닿는 곳의 색이 빠진다
  fogBands(ctx, w, sec, { y0: hz * 0.35, y1: h * 0.95, color: '#e8ebed', alpha: 0.28, count: 10, speed: 9, thick: 9, seed: 202 });
  fogBands(ctx, w, sec, { y0: hz * 0.7, y1: h, color: '#ffffff', alpha: 0.22, count: 6, speed: 15, thick: 12, seed: 203 });

  overlay(ctx, w, h, '#dfe3e6', 0.12 + 0.04 * Math.sin(sec * 1.5));
  vignette(ctx, w, h, 0.1, 7);
}

// ---------------- jungle_green — 1섬 시작의 섬 (초록 수풀) ----------------
// 금빛은 엔딩의 황금섬(=고인 황금 잉크)에만 쓴다. 첫 섬은 평범한 초록 섬이어야
// 마지막에 바다가 금빛으로 물드는 장면이 산다.

function jungle_green(ctx, { w, h, sec }) {
  const hz = R(h * 0.66);
  skyGradient(ctx, w, 0, hz, ['#1f6f9e', '#3a92bd', '#66b3d3', '#98cfe1', '#c8e8ee']);
  sun(ctx, w * 0.72, hz * 0.24, 9, sec, {});
  clouds(ctx, w, sec, { y: hz * 0.2, color: '#ffffff', alpha: 0.7, count: 5, speed: 2.2, scale: 1.4, seed: 161 });
  clouds(ctx, w, sec, { y: hz * 0.44, color: '#e8f6ff', alpha: 0.45, count: 4, speed: 4, scale: 1, seed: 162 });
  // 정글 능선 3겹 (멀리→가까이)
  hills(ctx, w, hz + 2, '#3f7a3a', { amp: 26, freq: 1.0, seed: 163 });
  hills(ctx, w, hz + 6, '#2c5a2a', { amp: 20, freq: 1.6, seed: 164, offsetX: 40, base: 4 });
  hills(ctx, w, hz + 12, '#1a3a1c', { amp: 14, freq: 2.4, seed: 165, offsetX: 90, base: 10 });
  // 야자수 숲
  for (let i = 0; i < 9; i++) {
    const x = w * (0.04 + i * 0.115) + hash(i, 166) * 8;
    const s = 0.9 + hash(i, 167) * 0.7;
    const sway = Math.sin(sec * 0.9 + i) * 1.2;
    palm(ctx, x + sway, hz + 10 + hash(i, 168) * 6, s, '#3b2a16', '#16401a');
  }
  const bands = seaBands(ctx, w, h, hz + 12, ['#2f93a6', '#2a8496', '#257686', '#206776', '#1a5866', '#154956']);
  glitter(ctx, w * 0.72, hz + 12, h, sec, '#dff6ff', { alpha: 0.45, count: 80, seed: 169 });
  waves(ctx, w, bands, sec, '#9fe4ee', { alpha: 0.42, speed: 7, seed: 170 });
  // 숲에서 날리는 홀씨
  particles(ctx, w, h, sec, { count: 34, color: '#eaffd8', speed: 6, dir: -1, sway: 12, alpha: 0.6, seed: 171, y0: 0.3, y1: 1, twinkle: true });
  vignette(ctx, w, h, 0.06);
}

// ---------------- volcano — 2섬 피라 (붉은 화산) ----------------

function volcano(ctx, { w, h, sec }) {
  const hz = R(h * 0.64);
  skyGradient(ctx, w, 0, hz, ['#1a0608', '#330c0c', '#571610', '#7d2412', '#a83a16']);
  // 연기 기둥
  clouds(ctx, w, sec, { y: hz * 0.2, color: '#2a1a18', alpha: 0.7, count: 5, speed: 1.5, scale: 2, seed: 71 });
  clouds(ctx, w, sec, { y: hz * 0.45, color: '#3d2320', alpha: 0.5, count: 4, speed: 3, scale: 1.4, seed: 72 });
  hills(ctx, w, hz + 2, '#3a1a12', { amp: 12, freq: 1.4, seed: 73 });
  // 화산 원뿔
  const vx = R(w * 0.62);
  const vh = R(h * 0.42);
  ctx.fillStyle = '#1e0f0c';
  for (let i = 0; i < vh; i++) {
    const halfW = 6 + i * 0.85;
    ctx.fillRect(R(vx - halfW), R(hz + 4 - vh + i), R(halfW * 2), 1);
  }
  // 분화구 용암 + 흘러내리는 줄기
  fill(ctx, vx - 6, hz + 4 - vh, 12, 3, '#ff7a2c');
  fill(ctx, vx - 3, hz + 3 - vh, 6, 2, '#ffd45e');
  ctx.fillStyle = '#e0431a';
  for (let k = 0; k < 3; k++) {
    let lx = vx + (k - 1) * 5;
    for (let i = 0; i < vh - 4; i += 2) {
      lx += (hash(k * 40 + i, 74) - 0.5) * 2.2;
      const flick = Math.sin(sec * 3 + i * 0.4 + k) > 0 ? '#ff7a2c' : '#e0431a';
      fill(ctx, lx, hz + 4 - vh + i, 2, 2, flick);
    }
  }
  const bands = seaBands(ctx, w, h, hz + 4, ['#4a1712', '#40130f', '#36100d', '#2c0d0b', '#230a09', '#190707']);
  glitter(ctx, vx, hz + 4, h, sec, '#ff8a3c', { alpha: 0.45, count: 80, seed: 75 });
  waves(ctx, w, bands, sec, '#a33a1c', { alpha: 0.4, speed: 8, seed: 76 });
  // 떨어지는 재 + 솟는 불티
  particles(ctx, w, h, sec, { count: 70, color: '#6b5a55', speed: 16, dir: 1, sway: 8, alpha: 0.5, seed: 77 });
  particles(ctx, w, h, sec, { count: 35, color: '#ff9a4c', speed: 22, dir: -1, sway: 10, alpha: 0.8, seed: 78, twinkle: true });
  overlay(ctx, w, h, '#ff4a1a', 0.05 + 0.02 * Math.sin(sec * 2));
  vignette(ctx, w, h, 0.12, 7);
}

// ---------------- night_storm — 3섬 나르 (밤바다 폭풍) ----------------

function night_storm(ctx, { w, h, sec }) {
  const hz = R(h * 0.52);
  skyGradient(ctx, w, 0, hz, ['#04050c', '#080a16', '#0d1022', '#12162e', '#181d3a']);
  clouds(ctx, w, sec, { y: hz * 0.18, color: '#0d1024', alpha: 0.85, count: 6, speed: 6, scale: 2.2, seed: 81 });
  clouds(ctx, w, sec, { y: hz * 0.45, color: '#141a33', alpha: 0.7, count: 5, speed: 9, scale: 1.6, seed: 82 });
  const flash = lightning(ctx, w, h, sec, { period: 4.6, seed: 83 });
  const bands = seaBands(ctx, w, h, hz, ['#122444', '#0f1e3a', '#0c1930', '#0a1428', '#070f1f', '#050a16']);
  waves(ctx, w, bands, sec, '#3f6aa8', { alpha: 0.5, speed: 18, density: 10, seed: 84 });
  // 큰 파도 마루 (앞)
  ctx.fillStyle = '#1b3560';
  for (let k = 0; k < 3; k++) {
    const y = h * (0.78 + k * 0.08);
    const off = sec * (30 + k * 18);
    for (let x = 0; x < w; x++) {
      const yy = y + Math.sin((x + off) * 0.06 + k) * (4 + k * 3);
      ctx.fillRect(x, R(yy), 1, R(h - yy) + 1);
    }
  }
  rain(ctx, w, h, sec, { count: 130, seed: 85 });
  particles(ctx, w, h, sec, { count: 30, color: '#9fb8e0', speed: 30, dir: -1, sway: 14, alpha: 0.4, seed: 86, y0: 0.75, y1: 1 });
  if (flash > 0) overlay(ctx, w, h, '#b9c9ff', 0.16 * flash);
  vignette(ctx, w, h, 0.14, 8);
}

// ---------------- iceberg — 4섬 툰 (빙산) ----------------

function iceberg(ctx, { w, h, sec }) {
  const hz = R(h * 0.6);
  skyGradient(ctx, w, 0, hz, ['#0c1f38', '#153350', '#22506e', '#3a7590', '#6ba6b4', '#a9d6d8']);
  stars(ctx, w, hz * 0.4, sec, { count: 45, seed: 91, bright: 0.7 });
  // 오로라 — 흔들리는 세로 커튼
  for (let k = 0; k < 3; k++) {
    const col = ['#5affc8', '#4ad8ff', '#9a7bff'][k];
    ctx.fillStyle = col;
    for (let x = 0; x < w; x += 2) {
      const p = Math.sin(x * 0.04 + sec * 0.6 + k * 2) * 0.5 + 0.5;
      const top = hz * (0.08 + k * 0.05) + Math.sin(x * 0.07 + sec * 0.9 + k) * 6;
      const len = 10 + p * 26;
      ctx.globalAlpha = 0.06 + p * 0.1;
      ctx.fillRect(x, R(top), 2, R(len));
    }
  }
  ctx.globalAlpha = 1;
  hills(ctx, w, hz + 1, '#2b5c74', { amp: 16, freq: 1.2, seed: 92 });
  const bands = seaBands(ctx, w, h, hz, ['#3d7d95', '#356e85', '#2d5f74', '#255064', '#1e4253', '#173343']);
  waves(ctx, w, bands, sec, '#b6e8f0', { alpha: 0.3, speed: 4, density: 5, seed: 93 });

  // 빙산 3개 (원근)
  const bergs = [[0.16, 1.4, 0.12], [0.5, 2.2, 0.3], [0.82, 1.7, 0.2]];
  for (const [fx, s, depth] of bergs) {
    const bx = w * fx;
    const by = hz + (h - hz) * depth + Math.sin(sec * 0.7 + fx * 9) * 1.2;
    const bw = 14 * s;
    const bh2 = 20 * s;
    ctx.fillStyle = '#cfeef7';
    for (let i = 0; i < bh2; i++) {
      const t = i / bh2;
      const half = bw * (0.15 + t * 0.85);
      ctx.fillRect(R(bx - half), R(by - bh2 + i), R(half * 2), 1);
    }
    ctx.fillStyle = '#8fc4d8';   // 그림자 면
    for (let i = 0; i < bh2; i++) {
      const t = i / bh2;
      const half = bw * (0.15 + t * 0.85);
      ctx.fillRect(R(bx), R(by - bh2 + i), R(half), 1);
    }
    fill(ctx, bx - bw * 0.9, by, bw * 1.8, 2 * s, '#e8f8ff');
    ctx.globalAlpha = 0.25;      // 수면 아래 비침
    fill(ctx, bx - bw, by + 2 * s, bw * 2, 4 * s, '#7fb8cc');
    ctx.globalAlpha = 1;
  }
  // 얼어붙은 배 실루엣
  tallShip(ctx, w * 0.3, hz + (h - hz) * 0.18, 1.1, { hull: '#243f52', deck: '#2f5064', sail: '#cfe6ee', mast: '#1b2f3e', flag: '#6b8fa3' });
  particles(ctx, w, h, sec, { count: 80, color: '#ffffff', speed: 14, dir: 1, sway: 9, alpha: 0.7, seed: 94 });
  vignette(ctx, w, h, 0.06);
}

// ---------------- mirror_fog — 5섬 에코 (거울 안개) ----------------

function mirror_fog(ctx, { w, h, sec }) {
  const hz = R(h * 0.55);
  skyGradient(ctx, w, 0, hz, ['#6e7784', '#828b96', '#98a0a9', '#b0b7be', '#c9ced2']);
  const bands = seaBands(ctx, w, h, hz, ['#c2c7cb', '#b3b9bd', '#a4abaf', '#959da2', '#868f95', '#788187']);

  // 유리 같은 수면 — 위쪽 실루엣을 뒤집어 비춘다
  const drawShipPair = (fx, s, pal) => {
    const x = w * fx;
    const y = hz - 2;
    tallShip(ctx, x, y, s, pal);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(0, hz * 2 + 2);
    ctx.scale(1, -1);
    tallShip(ctx, x, y, s, pal);
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  drawShipPair(0.18, 1.1, { hull: '#5c636b', deck: '#6d747c', sail: '#aeb5bb', mast: '#4b525a', flag: '#8a9098' });
  drawShipPair(0.68, 1.4, { hull: '#525960', deck: '#626971', sail: '#a4abb2', mast: '#434a51', flag: '#7d848c' });

  // 잔물결이 반사를 깨뜨린다
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#d6dade';
  for (let i = 0; i < 40; i++) {
    const y = hz + hash(i, 101) * (h - hz);
    const x = ((hash(i, 102) * w + Math.sin(sec * 0.6 + i) * 6) % w);
    ctx.fillRect(R(x), R(y), 4 + R(hash(i, 103) * 8), 1);
  }
  ctx.globalAlpha = 1;

  fogBands(ctx, w, sec, { y0: hz * 0.2, y1: h * 0.95, color: '#e6eaec', alpha: 0.22, count: 10, speed: 4, thick: 8, seed: 104 });
  fogBands(ctx, w, sec, { y0: hz * 0.6, y1: h, color: '#ffffff', alpha: 0.16, count: 6, speed: 8, thick: 10, seed: 105 });
  overlay(ctx, w, h, '#e8ecee', 0.12);
  vignette(ctx, w, h, 0.05);
}

// ---------------- shipyard_grave — 6섬 무나 (난파선 무덤) ----------------

function shipyard_grave(ctx, { w, h, sec }) {
  const hz = R(h * 0.58);
  skyGradient(ctx, w, 0, hz, ['#05070a', '#080c10', '#0c1116', '#10171c', '#141d23']);
  stars(ctx, w, hz * 0.5, sec, { count: 25, seed: 111, bright: 0.4, color: '#8fa6a0' });
  fogBands(ctx, w, sec, { y0: hz * 0.5, y1: hz, color: '#12201e', alpha: 0.35, count: 5, speed: 3, thick: 6, seed: 112 });

  // 쌓인 난파선 더미 — 기울어진 선체와 부러진 돛대의 숲
  const wreckPile = (x, s, col) => {
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      const yy = hz - i * 7 * s + hash(i + x, 113) * 3;
      const ww = (26 - i * 3) * s;
      const tilt = hash(i + x, 114) > 0.5 ? 1 : -1;
      ctx.fillRect(R(x - ww / 2), R(yy), R(ww), R(4 * s));
      ctx.fillRect(R(x - ww / 2 + tilt * 3), R(yy - 2 * s), R(ww * 0.7), R(2 * s));
      // 부러진 돛대
      const mx = x + tilt * ww * 0.2;
      for (let k = 0; k < 12 * s; k++) ctx.fillRect(R(mx + tilt * k * 0.4), R(yy - k), Math.max(1, R(s)), 1);
    }
  };
  wreckPile(w * 0.18, 1.5, '#0d1512');
  wreckPile(w * 0.52, 2.2, '#0a110f');
  wreckPile(w * 0.85, 1.7, '#0c1411');

  const bands = seaBands(ctx, w, h, hz, ['#0d1a1c', '#0b1618', '#091314', '#071011', '#050c0d', '#04090a']);
  waves(ctx, w, bands, sec, '#1d3a36', { alpha: 0.3, speed: 3, density: 4, seed: 115 });
  wreckage(ctx, w, sec, { y: h * 0.82, count: 6, seed: 116, s: 1.5, color: '#0a100e', accent: '#16261f' });
  // 떠도는 혼불
  particles(ctx, w, h, sec, { count: 24, color: '#5ce0b0', speed: 5, dir: -1, sway: 16, alpha: 0.45, seed: 117, y0: 0.3, y1: 1, twinkle: true });
  overlay(ctx, w, h, '#0a2a22', 0.1);
  vignette(ctx, w, h, 0.16, 8);
}

// ---------------- workshop — 7섬 모루의 공방 (실내) ----------------

function workshop(ctx, { w, h, sec }) {
  // 판자 벽
  fill(ctx, 0, 0, w, h, '#2e2015');
  for (let y = 0; y < h; y += 11) {
    fill(ctx, 0, y, w, 1, '#1d140d');
    fill(ctx, 0, y + 1, w, 1, '#3a2a1b');
    for (let x = R(hash(y, 121) * 20); x < w; x += 34) fill(ctx, x, y + 4, 1, 2, '#1d140d'); // 못
  }
  // 창 + 들어오는 빛
  const wx = R(w * 0.72);
  const wy = R(h * 0.16);
  const ww = R(w * 0.2);
  const wh = R(h * 0.28);
  fill(ctx, wx - 2, wy - 2, ww + 4, wh + 4, '#1a1209');
  fill(ctx, wx, wy, ww, wh, '#c9d8e0');
  fill(ctx, wx, wy + wh * 0.55, ww, wh * 0.45, '#9fb6c4');
  fill(ctx, wx + ww / 2, wy, 2, wh, '#1a1209');
  fill(ctx, wx, wy + wh / 2, ww, 2, '#1a1209');
  // 빛기둥 (창에서 바닥으로 비스듬히)
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffe9b8';
  for (let i = 0; i < h; i++) {
    const x = wx - i * 0.75;
    fill(ctx, x, wy + i, ww + i * 0.5, 1);
  }
  ctx.globalAlpha = 1;

  // 선반 위 공구, 걸린 톱·망치
  fill(ctx, 0, R(h * 0.34), R(w * 0.5), 3, '#4a3520');
  for (let i = 0; i < 6; i++) {
    const x = w * (0.04 + i * 0.075);
    const th = 6 + hash(i, 122) * 9;
    fill(ctx, x, h * 0.34 - th, 3, th, '#6b5a44');
    fill(ctx, x - 1, h * 0.34 - th - 2, 5, 2, '#8a7355');
  }
  for (let i = 0; i < 4; i++) {
    const x = w * (0.1 + i * 0.13);
    fill(ctx, x, 0, 1, h * 0.1 + hash(i, 123) * 12, '#1d140d');       // 걸이줄
    fill(ctx, x - 4, h * 0.1 + hash(i, 123) * 12, 9, 3, '#7a6a52');   // 공구
  }
  // 미완성 배 (뼈대만 있는 선체)
  const sx = R(w * 0.32);
  const sy = R(h * 0.78);
  ctx.fillStyle = '#3f2c1a';
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const rib = 20 - Math.abs(t - 0.5) * 22;
    fill(ctx, sx + i * 7, sy - rib, 3, rib);
  }
  fill(ctx, sx - 4, sy, 70, 4, '#2a1c10');
  fill(ctx, sx - 4, sy + 4, 62, 3, '#1d1209');
  fill(ctx, sx + 30, sy - 34, 2, 34, '#3f2c1a');   // 세워둔 돛대
  // 랜턴 (깜빡임)
  const lf = 0.75 + 0.25 * Math.sin(sec * 6 + Math.sin(sec * 3.1));
  const lx = R(w * 0.12);
  const ly = R(h * 0.2);
  ctx.globalAlpha = 0.1 * lf;
  blob(ctx, lx, ly, 26, 26, '#ffb44a');
  ctx.globalAlpha = 1;
  fill(ctx, lx - 3, ly - 5, 7, 10, '#2a1c10');
  fill(ctx, lx - 2, ly - 3, 5, 6, '#ffcf6a');
  fill(ctx, lx - 1, ly - 2, 3, 4, '#fff2c0');
  fill(ctx, lx, ly - 9, 1, 4, '#2a1c10');
  // 빛기둥 속 먼지
  particles(ctx, w, h, sec, { count: 40, color: '#ffe9b8', speed: 4, dir: 1, sway: 5, alpha: 0.35, seed: 124, twinkle: true });
  vignette(ctx, w, h, 0.16, 8);
}

// ---------------- world_end — 최종전 (세계의 끝) ----------------

function world_end(ctx, { w, h, sec }) {
  const hz = R(h * 0.5);
  skyGradient(ctx, w, 0, hz, ['#05030c', '#0a0616', '#120a22', '#1c0f2e', '#2a1440']);
  stars(ctx, w, hz, sec, { count: 120, seed: 131, color: '#d9c8ff' });
  // 떨어지는 별
  for (let i = 0; i < 3; i++) {
    const t = (sec * 0.35 + hash(i, 132)) % 1;
    const x = w * hash(i, 133) + t * 60;
    const y = hz * t * 1.2;
    ctx.globalAlpha = Math.max(0, 1 - t) * 0.8;
    ctx.fillStyle = '#fff0d0';
    for (let k = 0; k < 6; k++) fill(ctx, x - k * 2, y - k * 1.2, 2, 1);
    ctx.globalAlpha = 1;
  }
  const bands = seaBands(ctx, w, h, hz, ['#2a1e4a', '#241a40', '#1e1536', '#18102c', '#120c22', '#0c0818']);
  waves(ctx, w, bands, sec, '#5a3f96', { alpha: 0.4, speed: 10, seed: 134 });

  // 세계의 끝 — 바다가 잘려 떨어지는 폭포 경계
  const edgeY = hz + (h - hz) * 0.5;
  fill(ctx, 0, edgeY, w, 2, '#8a6fd0');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#3a2a68';
  for (let x = 0; x < w; x++) {
    const d = 6 + Math.sin(x * 0.15 + sec * 3) * 3 + hash(x, 135) * 4;
    ctx.fillRect(x, R(edgeY + 2), 1, R(d));
  }
  ctx.globalAlpha = 1;
  fill(ctx, 0, edgeY + 12, w, h - edgeY - 12, '#05030c');
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 40; i++) {   // 낭떠러지 아래 물보라
    const x = hash(i, 136) * w;
    const y = edgeY + 12 + ((sec * 20 + hash(i, 137) * 40) % 30);
    fill(ctx, x, y, 1, 2, '#8a6fd0');
  }
  ctx.globalAlpha = 1;

  // 검은 손톱호 실루엣 (거대)
  const bx = w * 0.5 + Math.sin(sec * 0.5) * 2;
  tallShip(ctx, bx - 24, hz + 6, 2.6, { hull: '#08060e', deck: '#100a1a', sail: '#170e26', mast: '#08060e', flag: '#a01f3a' });
  ctx.globalAlpha = 0.5 + 0.2 * Math.sin(sec * 2.2);
  blob(ctx, bx + 4, hz + 2, 3, 3, '#e5484d');   // 붉은 등불
  ctx.globalAlpha = 1;

  fogBands(ctx, w, sec, { y0: hz * 0.7, y1: edgeY, color: '#150c26', alpha: 0.3, count: 6, speed: 6, thick: 6, seed: 138 });
  overlay(ctx, w, h, '#2a0a20', 0.08);
  vignette(ctx, w, h, 0.16, 9);
}

// ---------------- golden_isle — 엔딩 (황금섬) ----------------

function golden_isle(ctx, { w, h, sec }) {
  const hz = R(h * 0.62);
  skyGradient(ctx, w, 0, hz, ['#3a2a6a', '#8a4a70', '#d97a52', '#f5b24e', '#ffd97a', '#fff0b8']);
  const sx = R(w * 0.5);
  const sy = R(hz * 0.55);
  sun(ctx, sx, sy, 12, sec, { core: '#fffbe0', rim: '#ffe08a', glow: '#ffb64a' });
  // 빛살 (하늘 전체로 뻗는 부채)
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#ffe8a8';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + sec * 0.05;
    for (let d = 12; d < w; d += 2) {
      const x = sx + Math.cos(a) * d;
      const y = sy + Math.sin(a) * d * 0.6;
      if (y > hz) break;
      ctx.fillRect(R(x), R(y), 2, 2);
    }
  }
  ctx.globalAlpha = 1;
  clouds(ctx, w, sec, { y: hz * 0.3, color: '#ffd08a', alpha: 0.5, count: 5, speed: 2, scale: 1.6, seed: 141 });

  // 금빛 섬
  hills(ctx, w, hz + 3, '#c9962e', { amp: 22, freq: 1.1, seed: 142, from: 0.25, to: 0.78 });
  hills(ctx, w, hz + 5, '#9a7020', { amp: 13, freq: 2.0, seed: 143, from: 0.3, to: 0.72 });
  for (let i = 0; i < 5; i++) {
    palm(ctx, w * (0.34 + i * 0.09), hz + 2, 1.1 + hash(i, 144) * 0.5, '#6b4d16', '#3f5a18');
  }
  const bands = seaBands(ctx, w, h, hz + 4, ['#e8b843', '#d6a736', '#c2952c', '#ad8324', '#96701d', '#7d5c17']);
  glitter(ctx, sx, hz + 4, h, sec, '#fff4c0', { alpha: 0.7, count: 140, seed: 145 });
  waves(ctx, w, bands, sec, '#ffe89a', { alpha: 0.45, speed: 6, seed: 146 });
  gulls(ctx, w, sec, { y: hz * 0.4, count: 4, speed: 8, seed: 147, color: '#fff4d0' });
  particles(ctx, w, h, sec, { count: 40, color: '#fff4c0', speed: 6, dir: -1, sway: 12, alpha: 0.7, seed: 148, y0: 0.3, y1: 1, twinkle: true });
  overlay(ctx, w, h, '#ffcf6a', 0.06);
  vignette(ctx, w, h, 0.05);
}

export const SCENES = {
  night_sea,
  harbor,
  sea_day,
  fog_black,
  dawn_wreck,
  village_pale,
  village_alive,
  white_forest,
  fog_pale,
  jungle_green,
  jungle_gold,
  volcano,
  night_storm,
  iceberg,
  mirror_fog,
  shipyard_grave,
  workshop,
  world_end,
  golden_isle,
};

export const DEFAULT_SCENE = 'night_sea';
