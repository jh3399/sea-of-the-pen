// 배경 원본(AI 생성 고해상도) → 배포용 도트 배경 PNG. 의존성 없음.
//
//   node scripts/bg-snap.mjs assets/menu/source/title-bg-1672.png --grid 418 --out assets/menu/title-bg.png
//
// logo-cut.mjs 와 형제지만 하는 일이 하나뿐이다 — **블록 최빈색 축소**.
// 로고와 달리 전면 배경이라 투명화할 배경도, 잘라낼 여백도 없기 때문이다.
// (그래서 --cut / --holes / --pad 가 없다. 필요해지면 그건 로고지 배경이 아니다.)
//
// --grid 는 "얼마나 줄일까"가 아니라 **원본이 그려진 격자**를 맞추는 값이다.
// 도트 크기가 정수로 떨어지지 않으면 한 블록이 두 도트에 걸쳐 경계가 뭉갠다.
// 모르면 --probe 로 후보를 훑어 정수에 가장 가까운 값을 찾는다.

import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

const srcPath = argv[0];
if (!srcPath || srcPath.startsWith('--')) {
  console.error('용법: node scripts/bg-snap.mjs <원본.png> --grid <가로 도트 수> --out <경로.png>');
  console.error('      --probe        격자 후보를 훑어 도트 크기가 정수에 가까운 것을 찾는다');
  console.error('      --colors N     팔레트를 N 색으로 (원본이 이미 1px 격자면 --grid 는 원본 폭 그대로 두고 이것만 쓴다)');
  console.error('      --aspect 16:9  가장자리를 늘려 비율을 맞춘다 (자르지 않는다). --grid 보다 먼저 적용된다');
  console.error('      --preview N    니어리스트 N배 확대본도 같이 낸다 (.preview.png)');
  process.exit(1);
}

let src = decodePng(fs.readFileSync(srcPath));

// --aspect W:H — 가장자리를 늘려 비율을 맞춘다. **자르지 않고 덧댄다.**
//
// 화면은 16:9 인데 그림이 4:3 으로 오면 object-fit: cover 가 위아래를 잘라 먹는다
// (실측: scene02 는 종이 윗변 9px 이 잘렸다). 미리 덧대 두면 잘릴 것이 없다.
//
// 가장자리 픽셀을 그대로 늘리는 이유: 이 그림들의 배경은 **가로 판자벽**이라 각 행의
// 끝 색을 옆으로 늘리면 판자선이 그대로 이어진다. 세로로 덧대야 할 때는 반대로
// 위아래 끝 행을 늘리는데, 그때는 판자선이 번지므로 결과를 눈으로 볼 것.
const aspect = flag('aspect', null);
if (aspect) {
  const [aw, ah] = aspect.split(':').map(Number);
  const want = aw / ah;
  const have = src.w / src.h;
  let nw = src.w, nh = src.h;
  if (have < want) nw = Math.round(src.h * want);       // 가로가 모자라다 → 좌우로
  else if (have > want) nh = Math.round(src.w / want);  // 세로가 모자라다 → 위아래로
  if (nw !== src.w || nh !== src.h) {
    const ox = Math.floor((nw - src.w) / 2);
    const oy = Math.floor((nh - src.h) / 2);
    const buf = Buffer.alloc(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(src.h - 1, Math.max(0, y - oy));
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(src.w - 1, Math.max(0, x - ox));
        const s = (sy * src.w + sx) * 4, d = (y * nw + x) * 4;
        buf[d] = src.rgba[s]; buf[d + 1] = src.rgba[s + 1];
        buf[d + 2] = src.rgba[s + 2]; buf[d + 3] = 255;
      }
    }
    console.log(`비율 ${aspect}: ${src.w}×${src.h} → ${nw}×${nh} (가장자리 덧댐)`);
    src = { w: nw, h: nh, rgba: buf };
  }
}

// --probe: 어느 격자에 그려졌는지 모를 때. 도트 크기의 소수부가 0 에 가까울수록 좋다.
if (argv.includes('--probe')) {
  const rows = [];
  for (let dw = 200; dw <= 700; dw++) {
    const s = src.w / dw;
    const frac = Math.abs(s - Math.round(s));
    if (s >= 2 && frac < 0.005) rows.push({ dw, s, dh: Math.round(src.h / s) });
  }
  console.log(`원본 ${src.w}×${src.h} — 도트가 정수로 떨어지는 격자:`);
  for (const r of rows) console.log(`  --grid ${r.dw}  →  ${r.dw}×${r.dh}  (도트 ${r.s.toFixed(2)}px)`);
  process.exit(0);
}

const dw = Number(flag('grid', 0));
if (!dw) { console.error('--grid 가 필요하다 (--probe 로 후보를 볼 수 있다)'); process.exit(1); }
const outPath = flag('out', 'bg.png');
const wantColors = Number(flag('colors', 0));

const scale = src.w / dw;
const dh = Math.round(src.h / scale);
const edge = (n) => Math.round(n * scale);

// 블록 최빈색 — 평균이 아니라 최빈색이라 경계가 뭉개지지 않는다 (logo-cut.mjs ③과 같은 이유).
const small = Buffer.alloc(dw * dh * 4);
for (let by = 0; by < dh; by++) {
  for (let bx = 0; bx < dw; bx++) {
    const tally = new Map();
    for (let y = edge(by); y < Math.min(edge(by + 1), src.h); y++) {
      for (let x = edge(bx); x < Math.min(edge(bx + 1), src.w); x++) {
        const i = (y * src.w + x) * 4;
        const key = (src.rgba[i] << 16) | (src.rgba[i + 1] << 8) | src.rgba[i + 2];
        tally.set(key, (tally.get(key) || 0) + 1);
      }
    }
    let best = 0, bestN = -1;
    for (const [k, n] of tally) if (n > bestN) { best = k; bestN = n; }
    const o = (by * dw + bx) * 4;
    small[o] = (best >> 16) & 0xff; small[o + 1] = (best >> 8) & 0xff;
    small[o + 2] = best & 0xff; small[o + 3] = 255;
  }
}

// --colors N: 메디안 컷으로 팔레트를 N 색까지 줄인다.
//
// ★ **축소(--grid)와 색 줄이기는 다른 문제다.** AI 가 뱉는 "픽셀아트"는 모양은 1px 로
//   그려 놓고 색은 3만 개인 경우가 많다. 그 색의 대부분은 면 안의 미세 노이즈라,
//   축소로 지우려 들면 모양까지 같이 버린다 (실측: scene01 을 --grid 418 로 줄이자
//   벽 결이 줄무늬 노이즈가 되고 고양이 눈·코가 뭉갰다).
//   원본 격자가 1px 인 그림은 **--grid 를 원본 폭 그대로 두고 --colors 로** 정리한다.
//   실측: 1672×941 · 30751색 1290KB → 256색 440KB, 눈으로 구분되지 않는다.
//
// ⚠ 색을 너무 줄이면 **면적은 작지만 결정적인 색**이 큰 면에 흡수된다.
//   64색에서 고양이의 초록 눈이 회색이 됐다. 128 이하로 내릴 때는 반드시 눈으로 확인할 것.
if (wantColors > 0) {
  const counts = new Map();
  const n = dw * dh;
  for (let i = 0; i < n; i++) {
    const k = (small[i * 4] << 16) | (small[i * 4 + 1] << 8) | small[i * 4 + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let boxes = [[...counts.entries()].map(([k, c]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255, c, k])];
  while (boxes.length < wantColors) {
    let bi = -1, brange = -1, bch = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
        // 넓이(색 범위)와 무게(픽셀 수)를 같이 본다. 무게를 로그로 눌러야 큰 단색 면이
        // 팔레트를 독식하지 않는다.
        const r = (hi - lo) * Math.log2(box.reduce((s, p) => s + p[3], 0) + 1);
        if (r > brange) { brange = r; bi = i; bch = ch; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi].slice().sort((a, b) => a[bch] - b[bch]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  const map = new Map();
  for (const box of boxes) {
    let r = 0, g = 0, b = 0, w = 0;
    for (const p of box) { r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; w += p[3]; }
    const rep = [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    for (const p of box) map.set(p[4], rep);
  }
  for (let i = 0; i < n; i++) {
    const k = (small[i * 4] << 16) | (small[i * 4 + 1] << 8) | small[i * 4 + 2];
    const c = map.get(k);
    small[i * 4] = c[0]; small[i * 4 + 1] = c[1]; small[i * 4 + 2] = c[2];
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePng(dw, dh, small));

const cols = new Set();
for (let p = 0; p < dw * dh; p++) cols.add((small[p * 4] << 16) | (small[p * 4 + 1] << 8) | small[p * 4 + 2]);
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`${src.w}×${src.h} → ${dw}×${dh} (도트 ${scale.toFixed(2)}px) · 색 ${cols.size} · ${kb}KB → ${outPath}`);

// 확인용 확대본 — 등배로는 사람 눈이 도트 하나를 판정하지 못한다. 커밋하지 않는다.
const zoom = Number(flag('preview', 0));
if (zoom > 1) {
  const zw = dw * zoom, zh = dh * zoom;
  const z = Buffer.alloc(zw * zh * 4);
  for (let y = 0; y < zh; y++) {
    for (let x = 0; x < zw; x++) {
      const s = (((y / zoom) | 0) * dw + ((x / zoom) | 0)) * 4;
      const d = (y * zw + x) * 4;
      z[d] = small[s]; z[d + 1] = small[s + 1]; z[d + 2] = small[s + 2]; z[d + 3] = 255;
    }
  }
  const pp = outPath.replace(/\.png$/, '.preview.png');
  fs.writeFileSync(pp, encodePng(zw, zh, z));
  console.log(`확인용 → ${pp}  ${zw}×${zh} (×${zoom})`);
}
