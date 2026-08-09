// 항해 해도 — 세렌이 시작의 섬에서 주는 종이 지도.
//
// 두 군데에 같은 그림이 뜬다: [S-06] 의 컷 배경(`bgscenes.js` 의 `voyage_map` 씬)과
// 항해 중 Tab 으로 여는 장비창(`sail.html` 의 #voyage-map). 그래서 씬도 UI 도 아닌
// scene/ 에 둔다 — 둘 다 여기를 부른다.
//
// ★ 노선은 여기서 정하지 않는다. `game/progress.js` 의 `ROUTE` 를 읽어 그릴 뿐이라,
//   바다를 더해도 이 파일은 안 고친다. 각 노드의 `kind` 가 어떤 지형으로 그릴지 고른다.
// ★ 아직 못 가는 바다도 그린다. [S-02] 에서 포포가 셋을 다 말했으므로 루도 플레이어도
//   갈 곳을 이미 안다 — 지도에 없으면 오히려 이상하다. 대신 **색이 빠진다.**
//   (도형까지 감추면 "여정이 얼마나 남았나"를 못 읽는다.)
//
// 도트 규칙은 씬들과 같다: 좌표는 논리 픽셀, 난수는 전부 `hash` 로 고정, `Math.random` 금지.

import { hash, fill, blob, vignette } from './bgkit.js';

const R = Math.round;

const PAL = {
  sea: '#17417a', seaDark: '#102f5c', seaLit: '#2a5c9c', seaFoam: '#7fb6e0',
  frame: '#7a5a33', frameLit: '#b08a4e', frameDark: '#4a3520', frameGem: '#5fd6e8',
  sand: '#e8d29a', grass: '#4f9a3e', grassDark: '#2f6b2a', trunk: '#7a4a2a',
  rock: '#8e9aa8', rockLit: '#c3ccd6', rockDark: '#4d5766',
  cloud: '#3a3f5c', cloudDark: '#22263c', bolt: '#ffe25a', swirl: '#63c8f0',
  // ⚠ 재·심연을 너무 어둡게 두면 안 된다. 바다(#17417a)와 명도가 붙어 검은 얼룩이 된다.
  lava: '#ff6a1e', lavaLit: '#ffd24a', ash: '#6a5f72', ashDark: '#443c4c',
  abyss: '#241640', abyssRim: '#6a3fb0', eye: '#f2ccff',
  route: '#f0c987', routeDim: '#5d6f8c',
  ink: '#f7ecd2', dim: '#93a9c6', here: '#8ce99a',
};

/**
 * 잠긴 바다는 채도를 뺀다 — 색만 죽이고 모양은 남긴다.
 *
 * ⚠ 명도를 그대로 두면 안 된다. 화산의 재(#3b3540)나 심연처럼 **원래 어두운** 지형이
 *   그대로 검은 얼룩이 되어 바다에 묻힌다 (한 번 그렇게 나왔다). 60~200 구간으로 끌어올려
 *   실루엣이 읽히게 한다 — 잠긴 것은 "안 보이는 것"이 아니라 "아직 색이 없는 것"이다.
 */
function grey(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const v = 62 + (r * 0.32 + g * 0.5 + b * 0.18) * 0.55;
  // 완전한 회색이면 종이처럼 뜬다. 푸른 기를 조금 남겨 물 위의 물체로 읽히게 한다.
  const c = (n) => Math.min(255, Math.max(0, R(n))).toString(16).padStart(2, '0');
  return `#${c(v * 0.80)}${c(v * 0.86)}${c(v)}`;
}

// ---------------------------------------------------------------- 지형 다섯

/** 야자수 선 초록 섬 — 여정의 출발점. 모래·풀·나무 세 층. */
function isle(P, x, y, s) {
  const F = (a, b, w, h, c) => fill(P.ctx, R(x + a * s), R(y + b * s), Math.max(1, R(w * s)), Math.max(1, R(h * s)), P.c(c));
  blob(P.ctx, x, R(y + s * 2), R(s * 9), R(s * 3.4), P.c(PAL.sand));
  blob(P.ctx, x, R(y + s * 1), R(s * 7), R(s * 2.6), P.c(PAL.grassDark));
  blob(P.ctx, R(x - s), R(y + s * 0.4), R(s * 5), R(s * 1.8), P.c(PAL.grass));
  // 야자수 둘 — 기둥 하나에 잎 넷. 이만한 크기에서 나무로 읽히는 최소 구성이다.
  for (const [tx, ty] of [[-4, -1], [2.5, -0.4]]) {
    F(tx, ty - 3.4, 0.9, 3.6, PAL.trunk);
    F(tx - 2, ty - 4, 2.2, 0.9, PAL.grass);
    F(tx + 0.9, ty - 4, 2.2, 0.9, PAL.grass);
    F(tx - 1.2, ty - 4.7, 1.4, 0.8, PAL.grassDark);
    F(tx + 0.6, ty - 4.7, 1.4, 0.8, PAL.grassDark);
  }
}

/** 뾰족한 바위 무리 — 섬이 아니라 암초라는 것이 한눈에 보여야 한다. */
function reef(P, x, y, s) {
  for (let i = 0; i < 5; i++) {
    const ox = (hash(i, 21) - 0.5) * s * 13;
    const oy = (hash(i, 22) - 0.5) * s * 6;
    const hgt = s * (3.2 + hash(i, 23) * 2.8);
    const wid = s * (1.6 + hash(i, 24) * 1.4);
    const bx = R(x + ox);
    const by = R(y + oy);
    // 삼각형을 가로 줄로 쌓는다 — 위로 갈수록 좁아지는 것이 곧 뾰족함이다.
    const rows = Math.max(2, R(hgt));
    for (let r0 = 0; r0 < rows; r0++) {
      const t = r0 / rows;
      const w = Math.max(1, R(wid * 2 * (1 - t)));
      fill(P.ctx, R(bx - w / 2), R(by - r0), w, 1, P.c(t > 0.62 ? PAL.rockLit : PAL.rock));
    }
    fill(P.ctx, R(bx - wid), R(by), R(wid * 2), 1, P.c(PAL.rockDark));
    // 물결 고리 — 바위가 물 밖으로 나와 있다는 표시
    fill(P.ctx, R(bx - wid * 1.8), R(by + 1), R(wid * 3.6), 1, P.c(PAL.seaFoam));
  }
}

/** 먹구름 + 번개 + 소용돌이 — 역풍 협곡. */
function storm(P, x, y, s, sec) {
  for (let i = 0; i < 7; i++) {
    const ox = (hash(i, 31) - 0.5) * s * 13;
    const oy = -s * (4.2 + hash(i, 32) * 1.8);
    blob(P.ctx, R(x + ox), R(y + oy), R(s * (2.6 + hash(i, 33) * 1.8)), R(s * 1.9),
      P.c(hash(i, 34) > 0.5 ? PAL.cloud : PAL.cloudDark));
  }
  // 구름 윗면 — 한 겹 밝게 얹어야 덩어리가 구름으로 읽힌다.
  for (let i = 0; i < 4; i++) {
    blob(P.ctx, R(x + (hash(i, 37) - 0.5) * s * 10), R(y - s * (5.4 + hash(i, 38) * 1.2)),
      R(s * 1.9), R(s * 1.1), P.c(PAL.rockDark));
  }
  // 번개 — 지그재그 한 줄. 깜빡임은 sec 으로 (Math.random 금지)
  // ⚠ 어두울 때의 하한을 너무 낮추면 "번개가 없는 지도"가 된다. 0.55 아래로 내리지 말 것.
  const flash = Math.sin(sec * 2.7) > 0.55 ? 1 : 0.55;
  P.ctx.globalAlpha = flash;
  let bx = R(x + s);
  for (let r0 = 0; r0 < R(s * 5); r0++) {
    bx += r0 % 3 === 0 ? (r0 % 6 === 0 ? 1 : -1) : 0;
    fill(P.ctx, bx, R(y - s * 3 + r0), 2, 1, P.c(PAL.bolt));
  }
  P.ctx.globalAlpha = 1;
  // 소용돌이 셋 — 나선 대신 동심 호(弧)로. 이 크기에서는 그게 더 잘 읽힌다.
  for (let i = 0; i < 3; i++) {
    const cx = R(x + (hash(i, 35) - 0.5) * s * 12);
    const cy = R(y + s * (1 + hash(i, 36) * 2));
    for (let k = 1; k <= 2; k++) {
      const rr = s * k * 1.3;
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * Math.PI * 2 + sec * 0.6 + i;
        fill(P.ctx, R(cx + Math.cos(ang) * rr), R(cy + Math.sin(ang) * rr * 0.5), 1, 1, P.c(PAL.swirl));
      }
    }
  }
}

/** 분화하는 화산섬 — 불의 바다. */
function volcano(P, x, y, s) {
  const h = R(s * 7);
  // 원뿔을 가로 줄로 쌓는다. 왼쪽 한 칸을 밝게 둬서 광원(좌상단)이 씬들과 같아진다.
  for (let r0 = 0; r0 < h; r0++) {
    const t = r0 / h;
    const w = Math.max(2, R(s * 10 * (1 - t * 0.8)));
    const yy = R(y + s * 2.5 - r0);
    fill(P.ctx, R(x - w / 2), yy, w, 1, P.c(PAL.ashDark));
    fill(P.ctx, R(x - w / 2), yy, Math.max(1, R(w * 0.34)), 1, P.c(PAL.ash));
  }
  // 용암 — 분화구에서 갈라져 흘러내린다. 두 줄기면 충분하다 (셋은 이 크기에서 뭉갠다).
  for (const dir of [-1, 1]) {
    for (let r0 = 0; r0 < R(h * 0.85); r0++) {
      const drift = R(dir * (r0 / h) * s * 2.6);
      fill(P.ctx, R(x + drift), R(y + s * 2.5 - r0), Math.max(1, R(s * 0.7)), 1,
        P.c(r0 > h * 0.55 ? PAL.lavaLit : PAL.lava));
    }
  }
  // 분화구
  fill(P.ctx, R(x - s * 1.6), R(y + s * 2.5 - h), R(s * 3.2), Math.max(1, R(s * 0.8)), P.c(PAL.lavaLit));
  // 물결 고리
  blob(P.ctx, x, R(y + s * 3.1), R(s * 7), R(s * 1.2), P.c(PAL.seaFoam));
}

/** 눈을 뜬 검은 소용돌이 — 불가사리의 바다. 여정의 끝. */
function abyss(P, x, y, s, sec) {
  for (let k = 4; k >= 1; k--) {
    blob(P.ctx, x, y, R(s * k * 2.1), R(s * k * 1.1), P.c(k > 2 ? PAL.abyss : PAL.abyssRim));
  }
  blob(P.ctx, x, y, R(s * 3.4), R(s * 1.7), P.c(PAL.abyss));
  // 눈 둘. 숨 쉬듯 밝아진다 — 살아 있다는 표시가 이 지도에서 여기뿐이다.
  const puls = 0.55 + 0.45 * Math.sin(sec * 1.8);
  P.ctx.globalAlpha = P.locked ? 0.5 : puls;
  fill(P.ctx, R(x - s * 1.8), R(y - s * 0.4), R(s * 1.3), R(s * 0.8), P.c(PAL.eye));
  fill(P.ctx, R(x + s * 0.6), R(y - s * 0.4), R(s * 1.3), R(s * 0.8), P.c(PAL.eye));
  P.ctx.globalAlpha = 1;
}

const TERRAIN = { isle, reef, storm, volcano, abyss };

// ---------------------------------------------------------------- 액자 · 나침반

/** 종이 지도의 테두리. 이 한 겹이 "화면"을 "물건"으로 바꾼다. */
function frame(ctx, w, h) {
  fill(ctx, 0, 0, w, 4, PAL.frameDark);
  fill(ctx, 0, h - 4, w, 4, PAL.frameDark);
  fill(ctx, 0, 0, 4, h, PAL.frameDark);
  fill(ctx, w - 4, 0, 4, h, PAL.frameDark);
  fill(ctx, 1, 1, w - 2, 2, PAL.frame);
  fill(ctx, 1, h - 3, w - 2, 2, PAL.frame);
  fill(ctx, 1, 1, 2, h - 2, PAL.frame);
  fill(ctx, w - 3, 1, 2, h - 2, PAL.frame);
  fill(ctx, 4, 4, w - 8, 1, PAL.frameLit);
  fill(ctx, 4, h - 5, w - 8, 1, PAL.frameLit);
  fill(ctx, 4, 4, 1, h - 8, PAL.frameLit);
  fill(ctx, w - 5, 4, 1, h - 8, PAL.frameLit);
  // 네 귀퉁이의 보석 — 세부 하나가 값싼 테두리를 세공품으로 만든다.
  for (const [cx, cy] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) {
    fill(ctx, cx - 1, cy - 1, 3, 3, PAL.frameDark);
    fill(ctx, cx, cy, 1, 1, PAL.frameGem);
  }
}

/** 나침반 장미 — 오른쪽 아래. 지도라는 것을 말없이 알리는 관습이다. */
function compass(ctx, x, y, s) {
  for (let i = 0; i < 4; i++) {
    const dx = i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 0 : -1;
    const dy = i === 0 ? -1 : i === 1 ? 0 : i === 2 ? 1 : 0;
    for (let k = 1; k <= s; k++) {
      const wgt = Math.max(1, R((s - k) / 2.2));
      fill(ctx, R(x + dx * k - (dx ? 0 : wgt / 2)), R(y + dy * k - (dy ? 0 : wgt / 2)),
        dx ? 1 : Math.max(1, wgt), dy ? 1 : Math.max(1, wgt),
        i === 0 ? PAL.ink : PAL.frameLit);
    }
  }
  fill(ctx, x - 1, y - 1, 3, 3, PAL.frame);
  fill(ctx, x, y, 1, 1, PAL.frameGem);
}

// ---------------------------------------------------------------- 본체

/** 노선을 화면 안에 흩어 놓는다. 일부러 일직선을 피한다 — 직선이면 지도가 아니라 진행 바다. */
function nodePoints(n, w, h) {
  const out = [];
  const padX = R(w * 0.13);
  const span = w - padX * 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const wob = (hash(i, 91) - 0.5) * h * 0.08;
    out.push({
      x: R(padX + span * t),
      y: R(h * 0.44 + Math.sin(t * Math.PI * 1.15 - 0.5) * h * 0.26 + wob),
    });
  }
  return out;
}

/**
 * 해도 한 장.
 *
 * @param ctx 2D 컨텍스트 (캔버스 크기 = w×h 논리 픽셀)
 * @param route `progress.js` 의 ROUTE
 * @param at    지금 있는 노드 인덱스 — **여기만 살아 움직인다**
 * @param sec   초 (깜빡임·소용돌이용)
 */
export function drawVoyageMap(ctx, { w, h, route, at, sec = 0 }) {
  fill(ctx, 0, 0, w, h, PAL.sea);
  // 바다 결 — 짧은 가로 획. 시드 고정이라 열 때마다 같은 바다다.
  for (let i = 0; i < 220; i++) {
    const x = R(hash(i, 11) * w);
    const y = R(hash(i, 12) * h);
    fill(ctx, x, y, 1 + R(hash(i, 13) * 4), 1, hash(i, 14) > 0.5 ? PAL.seaLit : PAL.seaDark);
  }

  const pts = nodePoints(route.length, w, h);
  const s = Math.max(1, w / 150);   // 지형 배율 — 356 폭에서 s≈2.4

  // 항로 — 점선. 지난 구간은 금색, 앞으로 갈 구간은 흐리다.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const steps = Math.max(2, R(Math.hypot(b.x - a.x, b.y - a.y) / 6));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      fill(ctx, R(a.x + (b.x - a.x) * t), R(a.y + (b.y - a.y) * t), 2, 2,
        i < at ? PAL.route : PAL.routeDim);
    }
  }

  for (let i = 0; i < route.length; i++) {
    const node = route[i];
    const p = pts[i];
    const locked = Boolean(node.locked);
    // `P.c` 하나로 잠김을 처리한다 — 지형 함수들은 잠김을 몰라도 된다.
    const P = { ctx, locked, c: (hex) => (locked ? grey(hex) : hex) };
    (TERRAIN[node.kind] ?? isle)(P, p.x, p.y, s, sec);

    // ★ 지금 있는 자리만 움직인다 — 숨 쉬는 고리 + 까딱이는 배. 지도를 열자마자
    //   눈이 여기로 와야 하고, 다른 섬이 같이 움직이면 그 기능을 잃는다.
    if (i === at) {
      const puls = 0.5 + 0.5 * Math.sin(sec * 2.4);
      const rr = s * 8 + R(puls * s * 1.6);
      ctx.globalAlpha = 0.45 + 0.55 * puls;
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        fill(ctx, R(p.x + Math.cos(ang) * rr), R(p.y + Math.sin(ang) * rr * 0.62), 3, 2, PAL.here);
      }
      ctx.globalAlpha = 1;
      const bob = R(Math.sin(sec * 2.1) * s * 0.8);
      const bx = R(p.x + s * 7);
      const by = R(p.y - s * 5 + bob);
      fill(ctx, bx - R(s * 2), by, R(s * 4), R(s), PAL.ink);          // 선체
      fill(ctx, bx, by - R(s * 3), 1, R(s * 3), PAL.ink);             // 돛대
      fill(ctx, bx, by - R(s * 3), R(s * 2), R(s * 2), PAL.route);    // 돛
    }

  }

  // ── 이름표 ─────────────────────────────────────────────────
  // ⚠ 지형을 **다 그린 뒤에** 한꺼번에 얹는다. 섬마다 그리면 다음 섬의 지형이 앞 섬의
  //   이름표를 덮는다.
  // ⚠ 서로 겹치면 아래로 민다. 「불의 바다」와 「불가사리의 바다」가 한 줄에서 포개져
  //   글자가 서로를 먹었던 자리다 — 마지막 이름표는 오른쪽 끝에 붙느라 제자리를 못 지킨다.
  ctx.textBaseline = 'top';
  // ⚠ 8px 에서는 NeoDunggeunmo 의 숫자가 뭉개져 4 가 9 로, 5 가 s 로 읽혔다. 12px 부터 산다.
  ctx.font = '12px "NeoDunggeunmo", monospace';
  const LH = 15;
  const placed = [];
  for (let i = 0; i < route.length; i++) {
    const p = pts[i];
    const label = `${i + 1}. ${route[i].name}`;
    const tw = ctx.measureText(label).width;
    // 양끝 섬의 이름이 액자 밖으로 나가지 않게 가둔다 (마지막 섬 이름이 제일 길다).
    const tx = Math.min(w - tw - 8, Math.max(8, R(p.x - tw / 2)));
    // 위아래로 엇갈린다 — 다섯을 전부 아래에 붙이면 다음 섬의 지형과 겹친다.
    let ty = i % 2 === 0 ? R(p.y + s * 7) : R(p.y - s * 10);
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((q) => Math.abs(q.y - ty) < LH
        && tx < q.x + q.w + 6 && q.x < tx + tw + 6);
      if (!hit) break;
      ty = hit.y + LH;
    }
    ty = Math.min(h - 20, Math.max(8, ty));
    placed.push({ x: tx, y: ty, w: tw });
    ctx.fillStyle = route[i].locked ? PAL.dim : PAL.ink;
    ctx.fillText(label, tx, ty);
  }

  compass(ctx, R(w - 30), R(h - 30), R(s * 7));
  vignette(ctx, w, h, 0.14);
  frame(ctx, w, h);
}
