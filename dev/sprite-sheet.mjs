// 스프라이트를 PNG 시트로 뽑는 개발용 스크립트 (의존성 없음, node dev/sprite-sheet.mjs).
// 브라우저 없이 도트를 확인/리뷰하려고 만들었다. 결과: dev/out/sprites.png
//
//   node dev/sprite-sheet.mjs            전체
//   node dev/sprite-sheet.mjs ru nail    일부만
//   node dev/sprite-sheet.mjs --scale 10

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITES } from '../src/sprites.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- 최소 PNG 인코더 (RGBA, filter 0) ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 캔버스 유틸 ----

const hex = (c) => {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

function makeSheet(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  return {
    buf,
    px(x, y, [r, g, b], a = 255) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    },
    rect(x0, y0, rw, rh, rgb) {
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) this.px(x, y, rgb);
    },
  };
}

// ---- 시트 그리기 ----

const args = process.argv.slice(2);
const scaleArg = args.indexOf('--scale');
const SCALE = scaleArg >= 0 ? Number(args[scaleArg + 1]) : 8;
const names = args.filter((a, i) => !a.startsWith('--') && i !== scaleArg + 1);
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
