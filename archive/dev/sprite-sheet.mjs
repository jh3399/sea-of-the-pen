// 스프라이트를 PNG 시트로 뽑는 개발용 스크립트 (의존성 없음, node dev/sprite-sheet.mjs).
// 브라우저 없이 도트를 확인/리뷰하려고 만들었다. 결과: dev/out/sprites.png
//
//   node dev/sprite-sheet.mjs            전체
//   node dev/sprite-sheet.mjs ru nail    일부만
//   node dev/sprite-sheet.mjs --scale 10

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITES } from '../../src/scene/sprites.js';
import { encodePng, hex, makeSheet } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- 시트 그리기 ----

const args = process.argv.slice(2);
const scaleArg = args.indexOf('--scale');
const SCALE = scaleArg >= 0 ? Number(args[scaleArg + 1]) : 8;
// scaleArg가 -1이면 scaleArg+1은 0 — 첫 인자를 삼켜버린다. 플래그가 있을 때만 건너뛴다
const names = args.filter((a, i) => !a.startsWith('--') && !(scaleArg >= 0 && i === scaleArg + 1));
const keys = (names.length ? names : Object.keys(SPRITES)).filter((k) => SPRITES[k]);

const PAD = 8;
const BG_ROWS = [
  ['#101426', '어두운 배경'],   // 밤바다·최종전
  ['#cfe6ef', '밝은 배경'],     // 부두·낮바다
  ['#b98f22', '금빛 배경'],     // 정글·황금섬
];

const cellW = Math.max(...keys.map((k) => SPRITES[k].rows[0].length)) * SCALE + PAD * 2;
const cellH = Math.max(...keys.map((k) => SPRITES[k].rows.length)) * SCALE + PAD * 2;
const W = cellW * keys.length;
const H = cellH * BG_ROWS.length;
const sheet = makeSheet(W, H);

BG_ROWS.forEach(([bg], row) => {
  sheet.rect(0, row * cellH, W, cellH, hex(bg));
  keys.forEach((key, col) => {
    const def = SPRITES[key];
    const ox = col * cellW + PAD;
    const oy = row * cellH + PAD;
    def.rows.forEach((line, y) => {
      [...line].forEach((ch, x) => {
        const color = def.palette[ch];
        if (ch === '.' || !color) return;
        const rgb = hex(color);
        for (let sy = 0; sy < SCALE; sy++)
          for (let sx = 0; sx < SCALE; sx++) sheet.px(ox + x * SCALE + sx, oy + y * SCALE + sy, rgb);
      });
    });
  });
});

const outDir = path.join(HERE, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'sprites.png');
fs.writeFileSync(outFile, encodePng(W, H, sheet.buf));

// 폭이 어긋난 행이 있으면 바로 잡아준다 (도트 편집 중 제일 흔한 실수)
for (const key of keys) {
  const rows = SPRITES[key].rows;
  const w = rows[0].length;
  rows.forEach((r, i) => {
    if (r.length !== w) console.error(`  ! ${key} row ${i}: 폭 ${r.length} (기준 ${w})`);
  });
}

console.log(`${outFile}  ${W}×${H}  (${keys.join(', ')} · ${SCALE}배)`);
