// 펜 맞대기 컷을 PNG로 뽑는 개발용 스크립트 (node dev/pen-scene.mjs).
// 브라우저 없이 도트를 확인하려고 만들었다. 결과: dev/out/pen-scene.png
//
//   node dev/pen-scene.mjs              세렌 + 네일 두 변주
//   node dev/pen-scene.mjs --scale 12
//
// 불꽃은 penscene.js가 캔버스에 코드로 그리므로 여기선 재현하지 않는다.
// 대신 접점 자리에 십자 표시를 찍어 펜촉 두 개가 실제로 만나는지 검사한다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, hex, makeSheet } from './png.mjs';
import { PEN_GRIDS } from '../src/penscene.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { PAW_PEN, SEREN_BEAK, PAL_RU, PAL_SEREN, PAL_NAIL, mirror, W, H } = PEN_GRIDS;

const args = process.argv.slice(2);
const si = args.indexOf('--scale');
const SCALE = si >= 0 ? Number(args[si + 1]) : 10;
const MARK = args.includes('--mark');   // 접점 십자 표시

const VARIANTS = [
  ['세렌', [PAW_PEN, PAL_RU], [SEREN_BEAK, PAL_SEREN]],
  ['네일', [PAW_PEN, PAL_RU], [mirror(PAW_PEN), PAL_NAIL]],
];
const BG_ROWS = [['#101426', '어두운 배경'], ['#b98f22', '금빛 배경']];

const PAD = 6;
const cellW = W * SCALE + PAD * 2;
const cellH = H * SCALE + PAD * 2;
const sheet = makeSheet(cellW * VARIANTS.length, cellH * BG_ROWS.length);

BG_ROWS.forEach(([bg], row) => {
  sheet.rect(0, row * cellH, cellW * VARIANTS.length, cellH, hex(bg));
  VARIANTS.forEach(([, left, right], col) => {
    const ox = col * cellW + PAD;
    const oy = row * cellH + PAD;
    [[...left, 0], [...right, W / 2]].forEach(([rows, pal, gx]) => {
      rows.forEach((line, y) => {
        [...line].forEach((ch, x) => {
          const color = pal[ch];
          if (ch === '.' || !color) return;
          sheet.blit(ox + (gx + x) * SCALE, oy + y * SCALE, SCALE, hex(color));
        });
      });
    });
    if (MARK) {
      for (let i = -6; i <= 6; i++) {
        sheet.blit(ox + (28 + i) * SCALE, oy + 12 * SCALE, SCALE, hex('#ff00ff'));
        sheet.blit(ox + 28 * SCALE, oy + (12 + i) * SCALE, SCALE, hex('#ff00ff'));
      }
    }
  });
});

const outDir = path.join(HERE, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'pen-scene.png');
fs.writeFileSync(outFile, encodePng(cellW * VARIANTS.length, cellH * BG_ROWS.length, sheet.buf));

// 행 폭이 어긋나면 조립이 어긋난다 — 바로 잡아준다
for (const [name, rows] of [['PAW_PEN', PAW_PEN], ['SEREN_BEAK', SEREN_BEAK]]) {
  if (rows.length !== H) console.error(`  ! ${name}: 행 ${rows.length}개 (기준 ${H})`);
  rows.forEach((r, i) => {
    if (r.length !== W / 2) console.error(`  ! ${name} row ${i}: 폭 ${r.length} (기준 ${W / 2})`);
  });
}

console.log(`${outFile}  (세렌·네일 × 배경 2종 · ${SCALE}배)`);
