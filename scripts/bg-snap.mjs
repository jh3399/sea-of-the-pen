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
  console.error('      --preview N    니어리스트 N배 확대본도 같이 낸다 (.preview.png)');
  process.exit(1);
}

const src = decodePng(fs.readFileSync(srcPath));

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
