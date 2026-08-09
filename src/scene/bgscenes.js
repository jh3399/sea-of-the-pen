// 씬별 배경 정의. 각 씬은 draw(ctx, { w, h, sec })로 한 프레임을 전부 그린다.
// 레이어 순서는 항상 [하늘] → [먼 배경] → [중간] → [바다] → [앞] → [효과/보정].
// 키 목록은 CLAUDE.md의 배경 표와 1:1로 맞춰져 있다.

import {
  hash, fill, blob, overlay, vignette, skyGradient, stars, moon, sun, clouds, hills, palm,
  seaBands, waves, glitter, tallShip, lighthouse, pier, gulls, particles, rain, fogBands,
  lightning, wreckage, blight, crystal, goldCrack, BLIGHT,
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
// life: 0 = 완전히 굳은 상태, 1 = 색이 돌아온 상태.
// 오염은 검정도 바램도 아니라 **자주빛 결정화**다 — 색 자체가 피가 섞였다는 증거다.
// blight()가 원본의 명도를 유지한 채 색상만 자주로 밀어주므로, 굳어도 구성은 그대로 읽힌다.

function drawVillage(ctx, { w, h, sec }, life) {
  const hz = R(h * 0.62);
  const C = (alive) => blight(alive, life);
  const gone = 1 - life;   // 얼마나 굳었나

  skyGradient(ctx, w, 0, hz, [C('#3f8fc4'), C('#63aed6'), C('#8ecbe4'), C('#bde3ef'), C('#e2f4f7')]);
  sun(ctx, w * 0.78, hz * 0.22, 8, sec, { core: C('#fff3c4'), rim: C('#ffd977'), glow: C('#ffbe5c') });
  clouds(ctx, w, sec, { y: hz * 0.24, color: C('#ffffff'), alpha: 0.7, count: 5, speed: 2, scale: 1.4, seed: 181 });

  // 뒤편 언덕
  hills(ctx, w, hz + 2, C('#4f8a3e'), { amp: 18, freq: 1.1, seed: 182 });
  hills(ctx, w, hz + 8, C('#3a6b2e'), { amp: 12, freq: 1.8, seed: 183, offsetX: 50, base: 4 });

  // 바다
  const bands = seaBands(ctx, w, h, hz + 8, [
    C('#2f8fb0'), C('#2a80a0'), C('#25728f'), C('#20647e'), C('#1a556d'), C('#15465b'),
  ]);
  waves(ctx, w, bands, sec, C('#9fe0ee'), { alpha: 0.4, speed: 6, seed: 184 });

  // 마을 집들 (앞 레이어)
  const ground = R(h * 0.82);
  fill(ctx, 0, ground, w, h - ground, C('#6b5a3a'));
  fill(ctx, 0, ground, w, 2, C('#8a7448'));

  const houses = [
    { x: 0.08, s: 1.1, roof: '#c8443c' }, { x: 0.26, s: 0.9, roof: '#d98a2b' },
    { x: 0.46, s: 1.2, roof: '#3f7ab8' }, { x: 0.68, s: 1.0, roof: '#c8443c' },
    { x: 0.86, s: 0.85, roof: '#5aa84a' },
  ];
  houses.forEach((ho, i) => {
    const hx = R(w * ho.x);
    const bw = R(26 * ho.s);
    const bh = R(20 * ho.s);
    const by = ground - bh;
    fill(ctx, hx - bw / 2, by, bw, bh, C('#e6d9b8'));          // 벽
    fill(ctx, hx - bw / 2, by, bw, 2, C('#c9bb96'));
    fill(ctx, hx - bw / 2 - 2, by - R(7 * ho.s), bw + 4, R(7 * ho.s), C(ho.roof)); // 지붕
    fill(ctx, hx - 3, by + bh - R(9 * ho.s), 6, R(9 * ho.s), C('#6b4a24'));        // 문
    // 창 — 굳을수록 불이 꺼진다. 마지막까지 켜져 있는 한 집이 루의 집이다
    const lit = life > 0.5 || i === 2;
    fill(ctx, hx + bw / 4, by + 5, 4, 4, lit ? C('#ffe07a') : BLIGHT.dark);

    // 벽을 타고 오르는 결정 — 굳을수록 높이 자란다
    if (gone > 0.15) {
      const grow = gone * bh * 0.75;
      crystal(ctx, hx - bw / 2 + 2, ground, 5, 4 + grow * 0.8, { lean: -0.4 });
      crystal(ctx, hx + bw / 2 - 3, ground, 4, 3 + grow, { lean: 0.3 });
      // 금 간 자국은 아주 옅게. 여기서 세게 쓰면 금빛이 흔해져서
      // 정작 유리 숲 신전과 엔딩의 금빛이 안 산다
      if (gone > 0.7) goldCrack(ctx, hx - bw / 2 + 3, by + 4, R(bh * 0.4), { seed: 187 + i, alpha: 0.28 });
    }
  });

  // 꽃 — 굳으면 자주빛 결정만 남는다
  for (let i = 0; i < 26; i++) {
    const fx = hash(i, 185) * w;
    const fy = ground + 3 + hash(i, 186) * (h - ground - 5);
    if (gone > 0.55 && hash(i, 188) > 0.45) crystal(ctx, fx, fy + 2, 3, 3 + hash(i, 189) * 3, { lean: (hash(i, 190) - 0.5) * 1.2 });
    else fill(ctx, fx, fy, 2, 2, C(['#ff7a9c', '#ffd24a', '#9a6cff'][i % 3]));
  }

  // 땅에서 돋는 결정 — 마을이 발밑부터 굳는다
  if (gone > 0.2) {
    const n = R(gone * 14);
    for (let i = 0; i < n; i++) {
      const cx = hash(i, 191) * w;
      const cy = ground + 4 + hash(i, 192) * (h - ground - 6);
      crystal(ctx, cx, cy, 4 + hash(i, 193) * 4, 5 + hash(i, 194) * 9 * gone, { lean: (hash(i, 195) - 0.5) });
    }
  }

  if (life < 0.99) overlay(ctx, w, h, BLIGHT.dark, gone * 0.14);
  vignette(ctx, w, h, 0.05);
}

// 0.22 — 아직 원래 색이 남아 있는 게 보이지만 자주가 확실히 이긴 상태.
// 이 마을은 "굳었다"가 아니라 "굳어가는 중"이라 0이 아니다.
function village_pale(ctx, env) { drawVillage(ctx, env, 0.22); }
function village_alive(ctx, env) { drawVillage(ctx, env, 1); }

// ---------------- crystal_forest — 유리 숲 (오염의 진원지) ----------------
// 통째로 자주빛 결정이 된 숲. 던진 병이 깨진 자리가 여기다.
// 아무것도 움직이지 않는다 — 안개와, 결정 사이를 떠도는 티끌만 움직인다.
// 나무는 원통이 아니라 **각진 결정 기둥**이어야 한다. 둥글면 그냥 겨울 숲이 된다.

function crystal_forest(ctx, { w, h, sec }) {
  const hz = R(h * 0.72);
  // 하늘은 위가 어둡고 지평선이 밝다 — 그래야 나무 실루엣이 읽힌다.
  // 바닥(hz+10)까지 그려서 틈을 남기지 않는다 (틈이 있으면 검은 띠가 뜬다)
  skyGradient(ctx, w, 0, hz + 12, ['#1a0e20', '#2a1630', '#3f2246', '#5e3363', '#9a6a9c']);

  // 안개 — 유일하게 움직이는 것. 열린 하늘에 띄우면 판때기로 보여서 숲 바닥에 붙인다
  fogBands(ctx, w, sec, { y0: hz * 0.72, y1: h * 0.96, color: '#a878aa', alpha: 0.14, count: 6, speed: 2.5, thick: 6, seed: 191 });

  // 결정 나무 — 뒤에서 앞으로. 줄기를 사다리꼴로 좁히고 가지를 위로 꺾어 각지게 만든다
  const trees = (count, base, scale, body, lightC, seed) => {
    for (let i = 0; i < count; i++) {
      const tx = R(w * ((i + 0.5) / count) + (hash(i, seed) - 0.5) * (w / count));
      const th = R((30 + hash(i, seed + 1) * 26) * scale);
      const tw = Math.max(2, R(3.5 * scale));
      for (let y = 0; y < th; y++) {                       // 위로 갈수록 좁아지는 기둥
        const t = y / th;
        const cw = Math.max(1, R(tw * (1 - t * 0.55)));
        fill(ctx, tx, base - y, cw, 1, body);
        fill(ctx, tx, base - y, Math.max(1, R(cw * 0.5)), 1, lightC);   // 왼쪽 면이 밝다
      }
      // 가지 — 비스듬히 위로 꺾인다
      for (let k = 0; k < 3; k++) {
        const by = base - th + (k + 1) * (th / 4);
        const dir = hash(i * 4 + k, seed + 2) > 0.5 ? 1 : -1;
        const bl = R((5 + hash(i * 4 + k, seed + 3) * 7) * scale);
        for (let s = 0; s < bl; s++) {
          fill(ctx, tx + (dir > 0 ? s : -s), by - R(s * 0.55), Math.max(1, R(scale)), Math.max(1, R(scale)), body);
        }
      }
      // 끝에 하이라이트 — 결정이 빛을 문다
      fill(ctx, tx, base - th, Math.max(1, R(scale)), 2, BLIGHT.lit);
    }
  };
  // 멀수록 하늘빛에 가깝게(대기 원근), 가까울수록 어둡게 — 겹이 안 갈리면 숲이 아니라 벽지가 된다
  trees(14, hz + 4, 0.8, '#6b4370', '#82558a', 192);
  trees(10, hz + 14, 1.15, '#46264c', '#5a3560', 193);

  // 바닥 — 굳은 지면
  fill(ctx, 0, hz + 10, w, h - hz - 10, '#2e1833');
  fill(ctx, 0, hz + 10, w, 2, '#4a2850');

  // 무너진 신전 — 400년 전 형제가 살던 집. 화면에서 제일 밝아야 눈이 여기로 온다
  const sx = R(w * 0.5);
  const sy = hz + 12;
  fill(ctx, sx - 30, sy - 30, 60, 30, '#7a4a7c');            // 벽
  fill(ctx, sx - 30, sy - 30, 60, 2, '#a878aa');
  fill(ctx, sx - 34, sy - 36, 68, 6, '#5a2f5e');             // 처마
  fill(ctx, sx - 34, sy - 36, 68, 1, '#8a5a8c');
  fill(ctx, sx - 10, sy - 20, 20, 20, '#120a16');            // 열린 문 (안은 아무것도 없다)
  for (let i = 0; i < 4; i++) {
    fill(ctx, sx - 26 + i * 16, sy - 26, 3, 22, '#8a5a8c');  // 기둥
    fill(ctx, sx - 26 + i * 16, sy - 26, 1, 22, '#c9a0cf');
  }
  fill(ctx, sx + 22, sy - 8, 14, 8, '#5a2f5e');              // 무너진 잔해
  fill(ctx, sx - 40, sy - 6, 10, 6, '#5a2f5e');
  goldCrack(ctx, sx - 18, sy - 30, 26, { seed: 196, alpha: 0.75 });   // 벽을 가르는 금
  goldCrack(ctx, sx + 12, sy - 28, 20, { seed: 197, alpha: 0.6 });

  // 신전 앞 결정 무리 — 병이 깨진 자리. 여기서부터 세상이 굳기 시작했다
  for (let i = 0; i < 9; i++) {
    const cx = sx + (hash(i, 198) - 0.5) * 96;
    crystal(ctx, cx, sy + 2 + hash(i, 199) * 6, 5 + hash(i, 200) * 6, 9 + hash(i, 201) * 16, {
      lean: (hash(i, 202) - 0.5) * 1.4,
    });
  }

  // 바닥 전체로 퍼진 결정 — 앞쪽일수록 크고 어둡다
  for (let i = 0; i < 16; i++) {
    const cx = hash(i, 208) * w;
    const t = hash(i, 209);
    const cy = hz + 14 + t * (h - hz - 16);
    const near = 0.5 + t;
    crystal(ctx, cx, cy, R(3 * near) + 2, R(5 * near) + 3, {
      lean: (hash(i, 210) - 0.5) * 1.2,
      body: t > 0.6 ? '#2a1630' : BLIGHT.mid,
      light: t > 0.6 ? '#3f2246' : BLIGHT.pale,
      edge: t > 0.6 ? BLIGHT.pale : BLIGHT.lit,
    });
  }

  // 앞쪽 결정 나무 (가장 크고 가장 어둡다)
  trees(6, h + 6, 1.9, '#160b1a', '#241228', 194);

  // 떠도는 티끌 — 굳은 숲에서 유일하게 반짝인다
  particles(ctx, w, h, sec, { count: 26, color: BLIGHT.lit, speed: 4, dir: -1, sway: 8, alpha: 0.5, seed: 203, y0: 0.15, y1: 1, twinkle: true });

  vignette(ctx, w, h, 0.12);
}

// ---------------- fog_pale — 굳히며 밀려오는 자주빛 안개 (프롤로그 습격) ----------------
// 배는 실루엣만. 얼굴은 절대 안 보인다 (핵심 규칙).
// 돛이 '검게' 보이지만 실은 짙은 자주다 — 가까운 쪽 돛에만 자주가 비쳐서 그걸 흘린다.

function fog_pale(ctx, { w, h, sec }) {
  const hz = R(h * 0.58);
  // 지평선만 환하게 남긴다 — 배가 역광으로 검게 떠야 실루엣이 산다.
  // 위아래를 다 같은 중간 자주로 깔면 배가 안개에 먹혀서 아무것도 안 보인다.
  skyGradient(ctx, w, 0, hz, ['#1a0e1e', '#2a1630', '#432648', '#6b3d6e', '#a06ea2']);

  const bands = seaBands(ctx, w, h, hz, ['#3a2340', '#331e38', '#2c1a31', '#251529', '#1e1122', '#170c1a']);
  waves(ctx, w, bands, sec, '#8a5a8c', { alpha: 0.3, speed: 10, seed: 201 });

  // 안개 속 검은 돛의 배 — 멀리서 검게 보이는 자주. 얼굴은 절대 안 보인다
  const sx = w * 0.66 + Math.sin(sec * 0.4) * 3;
  ctx.globalAlpha = 0.88;
  tallShip(ctx, sx, hz - 2, 1.8, { hull: '#140b18', deck: '#1c1020', sail: '#241329', mast: '#0e070f', flag: '#3a1f3f' });
  ctx.globalAlpha = 1;

  // 밀려오는 안개 — 닿는 곳이 굳는다. 배 앞을 지나가되 다 덮지는 않는다
  fogBands(ctx, w, sec, { y0: hz * 0.55, y1: h * 0.95, color: '#7a4a7c', alpha: 0.2, count: 8, speed: 9, thick: 7, seed: 202 });
  fogBands(ctx, w, sec, { y0: hz * 0.9, y1: h, color: '#a878aa', alpha: 0.16, count: 5, speed: 15, thick: 10, seed: 203 });

  // 안개가 지나간 수면에 결정이 돋는다 — 물조차 굳는다는 신호
  for (let i = 0; i < 7; i++) {
    const cx = hash(i, 204) * w;
    const cy = hz + 8 + hash(i, 205) * (h - hz - 12);
    const grow = 0.5 + 0.5 * Math.sin(sec * 0.7 + i * 1.3);   // 느리게 솟았다 잠긴다
    crystal(ctx, cx, cy, 4 + hash(i, 206) * 3, 4 + grow * 9, { lean: (hash(i, 207) - 0.5) });
  }

  overlay(ctx, w, h, '#2a1630', 0.08 + 0.03 * Math.sin(sec * 1.5));
  vignette(ctx, w, h, 0.14, 7);
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

// ---------------- sickroom — S-01 병상 (미오의 방) ----------------
// 프롤로그에서 유일한 사적 공간이다. 지금까지 S-01 은 village_alive(야외 마을 전경) 위에서
// 돌았는데, 실내 장면을 야외 그림에 얹은 것이라 대사와 그림이 서로 딴 데를 봤다.
//
// ★ 창밖에 바다가 보이는 것이 이 방의 전부다 — 누워서 그것만 보고 있었으니 미오가 그린 것이
//   배다. 인과를 대사로 설명하지 않고 그림이 만든다. 수평선의 돛 하나가 그 연장이다.
// ★ 미오는 여기 있지만 얼굴은 없다. 논리 해상도가 짧은 쪽 200px 이라 머리가 7~8px 이고
//   그 크기에는 이목구비가 물리적으로 안 들어간다 — STORY.md §2 의 "얼굴은 에필로그에서
//   처음 나온다"가 연출 의도가 아니라 **구조상** 지켜진다. 흉상을 새로 그릴 필요가 없다.
function sickroom(ctx, { w, h, sec }) {
  // 벽 — 가로 판자. 창 쪽이 밝다.
  // 작업장(#2e2015)보다 밝고 따뜻하게 잡는다 — 여기는 헛간이 아니라 사람이 자는 방이다.
  fill(ctx, 0, 0, w, h, '#5b4a3b');
  for (let y = 0; y < h; y += 13) {
    fill(ctx, 0, y, w, 1, '#43362a');
    fill(ctx, 0, y + 1, w, 1, '#6b5847');
  }
  // 창에서 먼 쪽(왼쪽)을 어둡게 깔아 광원 방향을 한쪽으로 고정한다.
  // overlay() 는 화면 전체 전용이라 여기서는 못 쓴다 — 알파를 직접 걸고 되돌린다.
  ctx.globalAlpha = 0.18;
  fill(ctx, 0, 0, R(w * 0.45), h, '#1a140e');
  ctx.globalAlpha = 1;

  // ---- 창 + 창밖 바다 ----
  const wx = R(w * 0.56), wy = R(h * 0.13);
  const ww = R(w * 0.32), wh = R(h * 0.34);
  fill(ctx, wx - 3, wy - 3, ww + 6, wh + 6, '#2a2016');           // 창틀
  fill(ctx, wx - 2, wy - 2, ww + 4, wh + 4, '#6b5641');
  const hz = R(wh * 0.52);                                         // 수평선
  fill(ctx, wx, wy, ww, hz, '#cfe0ea');                            // 창 안쪽 하늘
  fill(ctx, wx, wy + R(hz * 0.55), ww, R(hz * 0.45), '#dfeaf0');
  fill(ctx, wx, wy + hz, ww, wh - hz, '#5d86a4');                  // 바다
  fill(ctx, wx, wy + hz, ww, 1, '#8fb2c8');
  for (let i = 0; i < 14; i++) {                                   // 물결 반짝임
    const t = hash(i, 311);
    const ly = wy + hz + 2 + R(t * (wh - hz - 3));
    const lx = wx + R(hash(i, 312) * (ww - 8));
    fill(ctx, lx, ly, 2 + R(hash(i, 313) * 3), 1, '#7ea6c2');
  }
  // ★ 수평선의 돛 하나 — 미오가 배를 그린 이유이자 S-05 의 예고.
  //   작으면 아무도 못 보고, 크면 창밖이 아니라 이 방의 주인공이 된다. 6px 이 그 사이다.
  const shx = wx + R(ww * 0.66);
  fill(ctx, shx - 4, wy + hz + 1, 9, 1, '#2f3c46');       // 선체
  fill(ctx, shx - 3, wy + hz, 7, 1, '#465866');
  fill(ctx, shx, wy + hz - 6, 1, 6, '#2f3c46');           // 돛대
  fill(ctx, shx - 3, wy + hz - 5, 3, 5, '#f4f8fa');       // 돛
  fill(ctx, shx + 1, wy + hz - 4, 3, 4, '#dfe8ee');
  // 창살
  fill(ctx, wx + R(ww / 2) - 1, wy, 2, wh, '#6b5641');
  fill(ctx, wx, wy + R(wh / 2) - 1, ww, 2, '#6b5641');

  // ---- 창에서 들어오는 빛기둥 (왼쪽 아래로) ----
  // 침대 위로 떨어지게 각도를 잡는다. 방에서 유일하게 밝은 것이 바다에서 온 빛이어야 한다.
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#fff3d4';
  for (let i = 0; i < h; i++) fill(ctx, wx - i * 0.95, wy + i, ww + i * 0.5, 1);
  ctx.globalAlpha = 1;

  // ---- 침대 ----
  const bx = R(w * 0.06), by = R(h * 0.60);
  const bw = R(w * 0.50), bh = R(h * 0.22);
  fill(ctx, bx - 4, by - R(h * 0.16), 5, R(h * 0.16) + bh, '#4a3524');      // 머리판
  fill(ctx, bx - 4, by - R(h * 0.16), 5, 2, '#6b5033');
  fill(ctx, bx, by + bh, bw, 4, '#3b2a1c');                                 // 침대틀
  fill(ctx, bx, by + bh + 4, bw, 3, '#2a1d13');
  fill(ctx, bx + 3, by + bh + 7, 3, R(h * 0.07), '#2a1d13');                // 다리
  fill(ctx, bx + bw - 6, by + bh + 7, 3, R(h * 0.07), '#2a1d13');

  // 숨 — 이불이 1px 오르내린다. 이 방에서 움직이는 것은 이것과 먼지뿐이다
  const breath = R(Math.sin(sec * 1.5) * 1);

  // 이불 — **윗선(실루엣)으로** 사람을 보여준다. 평평한 판 위에 둔덕을 얹는 방식은
  // 이 해상도에서 회색 타원 하나로 뭉쳐 사람으로 안 읽힌다 (실제로 그렇게 나왔다).
  // 어깨에서 솟고 허리에서 꺼지고 무릎에서 다시 솟는 윤곽 자체를 그린다.
  // 몸이 이불 폭의 절반 안에 들어가는 것이 곧 "작은 아이"다.
  const bt = by + 4 + breath;
  const bBot = by + bh;
  const bump = (t, c, r) => Math.max(0, 1 - ((t - c) / r) ** 2);
  for (let x = 0; x < bw; x++) {
    const t = x / bw;
    const rise = 6 * bump(t, 0.17, 0.15) + 4.5 * bump(t, 0.46, 0.13);
    const top = R(bt + 5 - rise);
    fill(ctx, bx + x, top, 1, bBot - top, '#8f9aa6');
    fill(ctx, bx + x, top, 1, 2, '#a8b3be');                                // 윗면 하이라이트
  }
  fill(ctx, bx, bBot - 3, bw, 3, '#6d7783');                                // 이불 그늘
  for (let i = 0; i < 4; i++) {                                             // 발치 쪽 주름
    const fx = bx + R(bw * (0.64 + i * 0.09));
    fill(ctx, fx, bt + 7, 1, bBot - bt - 9, '#7d8894');
  }
  // 베개와 머리 — 창을 등지고 돌아누웠다. 얼굴은 이 해상도에 물리적으로 들어가지 않는다
  fill(ctx, bx + 1, by - 2, R(bw * 0.24), 8, '#dfe4ea');
  fill(ctx, bx + 1, by - 2, R(bw * 0.24), 2, '#f2f5f8');
  blob(ctx, bx + R(bw * 0.12), by + 1, 6, 5, '#5a3d29');                    // 머리카락
  blob(ctx, bx + R(bw * 0.12) - 1, by, 4, 3, '#6b4a33');                    // 좌상단 광원

  // ---- 머리맡 걸상 + 미오가 그린 종이 ----
  const stx = bx + bw + R(w * 0.03), sty = by + R(bh * 0.55);
  fill(ctx, stx, sty, R(w * 0.11), 3, '#5a4430');
  fill(ctx, stx + 2, sty + 3, 2, R(h * 0.13), '#3b2a1c');
  fill(ctx, stx + R(w * 0.09), sty + 3, 2, R(h * 0.13), '#3b2a1c');
  fill(ctx, stx + 2, sty - 5, R(w * 0.08), 5, '#efe9d8');                   // ★ 그 종이
  fill(ctx, stx + 3, sty - 4, R(w * 0.06), 1, '#8a90a0');                   // 그려진 선 (배의 흔적)
  fill(ctx, stx + 4, sty - 3, R(w * 0.04), 1, '#9aa0a8');

  // 빛기둥 속 먼지 — 방이 멈춰 있다는 것을 먼지만 부정한다
  particles(ctx, w, h, sec, {
    count: 30, color: '#fff3d4', speed: 3, dir: 1, sway: 4,
    alpha: 0.3, seed: 314, twinkle: true, y0: 0.1, y1: 0.9,
  });
  vignette(ctx, w, h, 0.2, 8);
}

// ---------------- bulgasari_name — S-02 不可殺伊 (이름 풀이) ----------------
// 이름 자체가 이 괴물의 성격이라 화면이 이름만 보여준다.
//
// ★ **그림이 아니라 코드로 찍는다.** 이유 둘:
//   ① 게임 폰트(NeoDunggeunmo)에 한자 글리프가 없다 — 브라우저가 조용히 시스템 폰트로
//      대체한다 (`不`·`可` 는 없는 폰트로 그린 것과 잉크량이 정확히 일치했다). 그러니
//      어차피 다른 폰트를 지정해야 하고, 지정할 바에는 획이 정확한 명조가 맞다.
//   ② AI 그림은 한자 자획을 자주 틀린다. 한자를 아는 사람이 보면 바로 드러난다.
//
// 논리 캔버스가 356×200 이라 여기 그린 글자는 CSS 확대(image-rendering: pixelated)를
// 거치며 저절로 도트가 된다 — 따로 도트화할 필요가 없다.
function bulgasari_name(ctx, { w, h, sec }) {
  // 물 밑. 위쪽만 아주 옅게 밝다
  fill(ctx, 0, 0, w, h, '#04070f');
  const lit = R(h * 0.55);
  for (let y = 0; y < lit; y++) {
    ctx.globalAlpha = 0.06 * (1 - y / lit);
    fill(ctx, 0, y, w, 1, '#1d3a5c');
  }
  ctx.globalAlpha = 1;
  particles(ctx, w, h, sec, {
    count: 26, color: '#6f8fae', speed: 2, dir: -1, sway: 3, alpha: 0.22, seed: 401,
  });

  // 헤드리스 렌더러(archive/dev/bg-shot.mjs)의 ctx 셰임에는 fillText 가 없다.
  // 배경까지만 그리고 조용히 빠진다 — 개발 도구 때문에 씬이 죽으면 안 된다.
  if (typeof ctx.fillText !== 'function') { vignette(ctx, w, h, 0.3, 10); return; }

  const glyphs = ['不', '可', '殺', '伊'];
  const size = R(h * 0.34);
  const gap = R(size * 1.16);
  const cx = R(w / 2);
  const cy = R(h * 0.42);        // 아래 1/4 은 대화창이 덮으므로 위로 올린다
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px "Batang","BatangChe","Apple Myungjo","Nanum Myeongjo","Noto Serif KR",serif`;

  glyphs.forEach((g, i) => {
    const x = cx + (i - 1.5) * gap;
    ctx.fillStyle = '#5e1520';                 // 새겨진 깊이 — 붉은 그림자 한 겹
    ctx.fillText(g, x + 2, cy + 2);
    ctx.fillStyle = '#e6dcc4';                 // 낡은 뼈 빛
    ctx.fillText(g, x, cy);
  });

  // 한 글자씩 훑고 지나가는 붉은 빛 — 누가 소리 내어 읽고 있는 것처럼.
  // sec 는 씬이 시작된 시각이 아니라 절대 시각이라 한 번만 도는 연출은 못 쓴다.
  // 대신 계속 도는 것으로 두면 어느 시점에 들어와도 같은 그림이 된다.
  const n = Math.floor((sec * 0.85) % 4);
  ctx.globalAlpha = 0.4 + 0.25 * Math.sin(sec * 4);
  ctx.fillStyle = '#c8404e';
  ctx.fillText(glyphs[n], cx + (n - 1.5) * gap, cy);
  ctx.globalAlpha = 1;

  vignette(ctx, w, h, 0.3, 10);
}

// ---------------- mio_drawing — S-01 미오가 그린 배 (책상 위 종이) ----------------
// 실제로 화면에 뜨는 것은 assets/scene/mio-drawing.png 다 (bgphotos.js). 이 함수는
// **그림이 못 뜰 때의 받침**이자, 모든 씬 키가 SCENES 에 있어야 한다는 규약을 지키는 자리다.
// 그래서 크레용 질감까지 흉내 내지 않고 구도만 맞춘다 — 나무 위에 기울어진 밝은 종이.
function mio_drawing(ctx, { w, h, sec }) {
  fill(ctx, 0, 0, w, h, '#4a3c2f');
  for (let y = 0; y < h; y += 14) {
    fill(ctx, 0, y, w, 1, '#372c22');
    fill(ctx, 0, y + 1, w, 1, '#57473a');
  }
  const px = R(w * 0.17), py = R(h * 0.12);
  const pw = R(w * 0.66), ph = R(h * 0.74);
  ctx.globalAlpha = 0.3;
  fill(ctx, px + 6, py + 8, pw, ph, '#241b14');      // 종이 그림자
  ctx.globalAlpha = 1;
  // 살짝 기울어 보이게 행마다 좌우로 1px 씩 민다 (실제 그림이 기울어 있다)
  for (let y = 0; y < ph; y++) {
    const skew = R((y / ph - 0.5) * 10);
    fill(ctx, px + skew, py + y, pw, 1, y < 3 || y > ph - 4 ? '#d6cbb4' : '#e6dcc6');
  }
  // 배 한 척 — 붉은 선체, 노란 돛, 파란 물결
  const bx = R(px + pw * 0.5), by = R(py + ph * 0.66);
  fill(ctx, bx - R(pw * 0.26), by, R(pw * 0.52), R(ph * 0.14), '#c1584f');
  fill(ctx, bx - 2, by - R(ph * 0.34), 3, R(ph * 0.34), '#7a5636');
  for (let i = 0; i < R(ph * 0.26); i++) fill(ctx, bx - 4 - i * 0.7, by - R(ph * 0.3) + i, i * 0.7 + 2, 1, '#e0a940');
  for (let i = 0; i < 3; i++) {
    const wy = by + R(ph * 0.16) + i * 4;
    for (let x = 0; x < pw * 0.6; x += 2) {
      fill(ctx, px + pw * 0.2 + x, wy + Math.round(Math.sin(x * 0.15 + i) * 2), 2, 1, '#4f7fa8');
    }
  }
  vignette(ctx, w, h, 0.22, 8);
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
  crystal_forest,
  fog_pale,
  jungle_green,
  jungle_gold,
  volcano,
  night_storm,
  iceberg,
  mirror_fog,
  shipyard_grave,
  workshop,
  sickroom,
  mio_drawing,
  bulgasari_name,
  world_end,
  golden_isle,
};

export const DEFAULT_SCENE = 'night_sea';
