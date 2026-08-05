// 배경 씬을 PNG로 뽑는 개발용 스크립트 (node dev/bg-shot.mjs [키...]).
// 브라우저 없이 배경을 눈으로 확인하려고 만들었다. 결과: dev/out/bg-<키>.png
//
//   node dev/bg-shot.mjs                        기본 3종 (자주빛 결정 계열)
//   node dev/bg-shot.mjs night_sea golden_isle
//   node dev/bg-shot.mjs village_pale --sec 3   특정 시각의 프레임
//
// bgscenes.js는 Canvas2D API를 쓰므로, 여기서 픽셀 버퍼에 직접 그리는
// 최소 ctx 셰임을 끼워 넣는다 (fillRect / fillStyle / globalAlpha 만 쓴다).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng, makeSheet } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const W = 320;
const H = 180;
const SCALE = 3;

// ---- Canvas2D 셰임 ----

function parseColor(s) {
  if (typeof s !== 'string') return [255, 0, 255, 1];
  if (s[0] === '#') {
    const t = s.length === 4
      ? '#' + [1, 2, 3].map((i) => s[i] + s[i]).join('')
      : s;
    return [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16), 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0] | 0, p[1] | 0, p[2] | 0, p[3] === undefined ? 1 : p[3]];
  }
  return [255, 0, 255, 1];
}

function makeCtx(w, h) {
  const buf = new Float64Array(w * h * 3);   // 알파 합성을 위해 부동소수로
  // mirror_fog가 반사를 그리려고 translate/scale을 쓴다 — 최소한의 변환만 흉내낸다
  let tf = { dx: 0, dy: 0, sx: 1, sy: 1 };
  const stack = [];
  const ctx = {
    fillStyle: '#000',
    globalAlpha: 1,
    save() { stack.push({ ...tf }); },
    restore() { if (stack.length) tf = stack.pop(); },
    translate(dx, dy) { tf.dx += dx * tf.sx; tf.dy += dy * tf.sy; },
    scale(sx, sy) { tf.sx *= sx; tf.sy *= sy; },
    fillRect(x, y, rw, rh) {
      const [r, g, b, ca] = parseColor(this.fillStyle);
      const a = ca * this.globalAlpha;
      if (a <= 0) return;
      // 변환 적용 후 정규화 (음수 배율이면 좌우/상하가 뒤집힌다)
      let ax = tf.dx + x * tf.sx;
      let ay = tf.dy + y * tf.sy;
      let aw = rw * tf.sx;
      let ah = rh * tf.sy;
      if (aw < 0) { ax += aw; aw = -aw; }
      if (ah < 0) { ay += ah; ah = -ah; }
      const x0 = Math.max(0, Math.round(ax));
      const y0 = Math.max(0, Math.round(ay));
      const x1 = Math.min(w, Math.round(ax + aw));
      const y1 = Math.min(h, Math.round(ay + ah));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * w + px) * 3;
          buf[i] += (r - buf[i]) * a;
          buf[i + 1] += (g - buf[i + 1]) * a;
          buf[i + 2] += (b - buf[i + 2]) * a;
        }
      }
    },
  };
  return { ctx, buf };
}

// ---- 실행 ----

const args = process.argv.slice(2);
const si = args.indexOf('--sec');
const SEC = si >= 0 ? Number(args[si + 1]) : 1.7;
// si가 -1이면 si+1은 0 — 첫 인자를 삼켜버린다. 플래그가 있을 때만 그 값을 건너뛴다
const keys = args.filter((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1));

const { SCENES } = await import('../src/bgscenes.js');
const targets = (keys.length ? keys : ['village_pale', 'crystal_forest', 'fog_pale']).filter((k) => {
  if (SCENES[k]) return true;
  console.error(`  ! 없는 씬: ${k}`);
  return false;
});

const outDir = path.join(HERE, 'out');
fs.mkdirSync(outDir, { recursive: true });

// 여러 씬을 세로로 이어 붙인 한 장 (비교하기 편하다)
const sheet = makeSheet(W * SCALE, H * SCALE * targets.length);

targets.forEach((key, row) => {
  const { ctx, buf } = makeCtx(W, H);
  SCENES[key](ctx, { w: W, h: H, sec: SEC });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const rgb = [Math.round(buf[i]), Math.round(buf[i + 1]), Math.round(buf[i + 2])];
      sheet.blit(x * SCALE, row * H * SCALE + y * SCALE, SCALE, rgb);
    }
  }
});

const outFile = path.join(outDir, `bg-${targets.join('_')}.png`);
fs.writeFileSync(outFile, encodePng(W * SCALE, H * SCALE * targets.length, sheet.buf));
console.log(`${outFile}  ${targets.join(' / ')}  (sec=${SEC}, ${SCALE}배)`);
