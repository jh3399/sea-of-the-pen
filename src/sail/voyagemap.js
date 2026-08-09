// 항해 지도 — 아이템창 안에 뜨는 도트 지도.
//
// ★ 노선은 여기서 정하지 않는다. `game/progress.js` 의 `ROUTE` 를 읽어 그릴 뿐이라,
//   바다를 더해도 이 파일은 안 고친다 (배경 씬이 `bgscenes.js` 를 안 고치고 늘어나는 것과 같다).
// ★ 아직 못 가는 바다도 그린다. [S-02] 에서 포포가 셋을 다 말했으므로 루도 플레이어도
//   갈 곳을 이미 안다 — 지도에 없으면 오히려 이상하다. 대신 흐리게 그린다.
//
// 좌표계는 논리 픽셀 W×H 고, CSS 가 image-rendering: pixelated 로 확대한다 (씬들과 같은 방식).

import { hash, fill, blob, vignette } from '../scene/bgkit.js';

const R = Math.round;

const PAL = {
  sea: '#12325a', seaDark: '#0d2545', seaLit: '#1c4677',
  land: '#c7a05a', landLit: '#e6c98a', landDark: '#8a6b34',
  locked: '#4a5a72', lockedDark: '#39465a',
  route: '#f0c987', routeDim: '#5d6f8c',
  ink: '#f5e6c8', dim: '#8ea6c4',
  here: '#8ce99a',
};

/** 노선을 화면 안에 흩어 놓는다. 일부러 일직선을 피한다 — 직선이면 지도가 아니라 진행 바다. */
function nodePoints(n, w, h) {
  const out = [];
  const padX = R(w * 0.12);
  const span = w - padX * 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    // 사인 한 굽이 + 시드 흔들림. 흔들림은 hash 로 고정한다 (Math.random 은 열 때마다 튄다).
    const wob = (hash(i, 91) - 0.5) * h * 0.1;
    out.push({
      x: R(padX + span * t),
      y: R(h * 0.5 + Math.sin(t * Math.PI * 1.15 - 0.5) * h * 0.24 + wob),
    });
  }
  return out;
}

/** 섬 하나 — 가운데가 밝고 가장자리가 어두운 덩어리. locked 면 색이 빠진다. */
function island(ctx, x, y, r, locked, seed) {
  const body = locked ? PAL.locked : PAL.land;
  const lit = locked ? PAL.locked : PAL.landLit;
  const dark = locked ? PAL.lockedDark : PAL.landDark;
  // 원 하나로 두면 다섯 섬이 전부 같은 모양이 된다. 시드로 세 덩이를 겹쳐 실루엣을 흔든다.
  for (let i = 0; i < 3; i++) {
    const ox = (hash(i, seed) - 0.5) * r * 0.9;
    const oy = (hash(i, seed + 7) - 0.5) * r * 0.9;
    blob(ctx, R(x + ox), R(y + oy), R(r * (0.7 + hash(i, seed + 3) * 0.5)), R(r * (0.6 + hash(i, seed + 5) * 0.5)), dark);
  }
  blob(ctx, x, y, r, R(r * 0.82), body);
  blob(ctx, R(x - r * 0.2), R(y - r * 0.25), R(r * 0.5), R(r * 0.34), lit);
}

/**
 * 지도 한 장.
 *
 * @param ctx 2D 컨텍스트 (캔버스 크기 = w×h 논리 픽셀)
 * @param route `progress.js` 의 ROUTE
 * @param at    지금 있는 노드 인덱스
 * @param sec   초 (깜빡임용). 정지 지도면 0 을 준다.
 */
export function drawVoyageMap(ctx, { w, h, route, at, sec = 0 }) {
  fill(ctx, 0, 0, w, h, PAL.sea);
  // 바다 결 — 가로 점선. 시드 고정이라 열 때마다 같은 바다다.
  for (let i = 0; i < 150; i++) {
    const x = R(hash(i, 11) * w);
    const y = R(hash(i, 12) * h);
    fill(ctx, x, y, 1 + R(hash(i, 13) * 3), 1, hash(i, 14) > 0.55 ? PAL.seaLit : PAL.seaDark);
  }

  const pts = nodePoints(route.length, w, h);

  // 항로 — 점선. 이미 지난 구간은 밝고, 앞으로 갈 구간은 흐리다.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const done = i < at;
    const steps = Math.max(2, R(Math.hypot(b.x - a.x, b.y - a.y) / 5));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      fill(ctx, R(a.x + (b.x - a.x) * t), R(a.y + (b.y - a.y) * t), 2, 2,
        done ? PAL.route : PAL.routeDim);
    }
  }

  ctx.textBaseline = 'top';
  // ⚠ 8px 에서는 NeoDunggeunmo 의 숫자가 뭉개져 4 가 9 로, 5 가 s 로 읽혔다. 12px 부터 산다.
  ctx.font = '12px "NeoDunggeunmo", monospace';

  for (let i = 0; i < route.length; i++) {
    const node = route[i];
    const p = pts[i];
    const locked = Boolean(node.locked);
    island(ctx, p.x, p.y, 9, locked, i * 13 + 5);

    // 지금 있는 자리 — 숨 쉬는 고리. 지도를 열자마자 눈이 여기로 가야 한다.
    if (i === at) {
      const puls = 0.5 + 0.5 * Math.sin(sec * 2.4);
      const rr = 13 + R(puls * 2);
      ctx.globalAlpha = 0.5 + 0.5 * puls;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        fill(ctx, R(p.x + Math.cos(ang) * rr), R(p.y + Math.sin(ang) * rr * 0.8), 2, 2, PAL.here);
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = locked ? PAL.dim : PAL.ink;
    const label = `${i + 1}. ${node.name}`;
    const tw = ctx.measureText(label).width;
    // 양끝 섬의 이름이 화면 밖으로 나가지 않게 가둔다 (마지막 섬 이름이 제일 길다).
    ctx.fillText(label, Math.min(w - tw - 4, Math.max(4, R(p.x - tw / 2))), p.y + 12);
  }

  vignette(ctx, w, h, 0.1);
}
