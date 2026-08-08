// 로고 시트(2×2) → 배포용 PNG. 의존성 없음.
//
//   node scripts/logo-cut.mjs <시트.png> --quad 1 --out assets/logo/title.png
//
// 하는 일 셋:
//   ① 사분면 잘라내기
//   ② 배경 투명화 — 테두리에서 플러드 필. 전역 색 매칭이 아니라 플러드 필인 이유는
//      글자·펜 **안쪽**의 어두운 픽셀을 지키기 위해서다. 바깥에서 닿을 수 없으면 살아남는다.
//   ③ 픽셀 그리드 스냅 — N×N 블록의 **최빈색**으로 축소한다. 평균이 아니라 최빈색이라
//      경계가 뭉개지지 않고, 배경 대비 규칙(CLAUDE.md 도트 규칙)이 깨지지 않는다.
//      알파도 블록 안 불투명 픽셀 수의 다수결이라 반투명 헤일로가 생기지 않는다.
//
// AI 생성 래스터라 블록 경계가 정확히 맞지 않는다(런 길이가 2~5px 로 흩어진다).
// 그래서 --scale 은 "정확한 블록 크기"가 아니라 "얼마나 단순화할 것인가"의 노브다.

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
  console.error('용법: node scripts/logo-cut.mjs <원본.png> --out <경로.png> [--grid 160 | --scale 4] [--cut 48] [--cols 1] [--rows 1] [--quad 1] [--preview] [--zoom 4]');
  process.exit(1);
}

const quad = Number(flag('quad', 1));
const cut = Number(flag('cut', 48));       // 배경으로 볼 최대 채널값
const cols = Number(flag('cols', 2));
const rows = Number(flag('rows', 2));
const outPath = flag('out', 'logo.png');
const preview = argv.includes('--preview'); // 밝은/어두운 배경 위에 얹은 확인용 시트도 같이 낸다

const sheet = decodePng(fs.readFileSync(srcPath));
const qw = Math.floor(sheet.w / cols);
const qh = Math.floor(sheet.h / rows);
const qx = ((quad - 1) % cols) * qw;
const qy = Math.floor((quad - 1) / cols) * qh;

// ① 사분면 잘라내기
const crop = Buffer.alloc(qw * qh * 4);
for (let y = 0; y < qh; y++) {
  sheet.rgba.copy(crop, y * qw * 4, ((qy + y) * sheet.w + qx) * 4, ((qy + y) * sheet.w + qx + qw) * 4);
}

// ② 테두리에서 플러드 필 — 어두운 배경만 먹는다
const isBg = (i) => Math.max(crop[i], crop[i + 1], crop[i + 2]) <= cut;
const clear = new Uint8Array(qw * qh);
const stack = [];
for (let x = 0; x < qw; x++) { stack.push(x, (qh - 1) * qw + x); }
for (let y = 0; y < qh; y++) { stack.push(y * qw, y * qw + qw - 1); }
while (stack.length) {
  const p = stack.pop();
  if (clear[p] || !isBg(p * 4)) continue;
  clear[p] = 1;
  const x = p % qw, y = (p / qw) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < qw - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - qw);
  if (y < qh - 1) stack.push(p + qw);
}
// --holes: 글자 안쪽 구멍(A·P 의 카운터)까지 비운다. 플러드 필은 바깥에서 못 닿는다.
// 원본이 이 배경색 위에서 그려졌으므로 그 색은 그림이 아니라 "비어 있음"이다 —
// 남겨 두면 애니메이션 배경 위에서 살짝 다른 색 사각형으로 뜬다.
// 펜 몸통·글자 그림자는 cut 보다 밝아서 살아남는다.
if (argv.includes('--holes')) {
  for (let p = 0; p < qw * qh; p++) if (isBg(p * 4)) clear[p] = 1;
}
let cleared = 0;
for (let p = 0; p < qw * qh; p++) if (clear[p]) { crop[p * 4 + 3] = 0; cleared++; }

// ③ 블록 최빈색으로 축소
//    --grid 로 목표 가로 도트 수를 준다. AI 가 160×107 격자로 그려 1536×1024 로 올린
//    그림은 도트 하나가 9.6px 이라 정수가 아니다 — 그래서 블록 경계를 실수로 잡고
//    반올림한다. 정수 배율만 되면 9 나 10 으로 반올림하게 되고, 오차가 누적돼
//    화면 오른쪽으로 갈수록 도트가 반 칸씩 밀린다.
const dw = Number(flag('grid', 0)) || Math.ceil(qw / Number(flag('scale', 4)));
const scale = qw / dw;
const dh = Math.round(qh / scale);
const edge = (n, span) => Math.round(n * span);
const small = Buffer.alloc(dw * dh * 4);
for (let by = 0; by < dh; by++) {
  for (let bx = 0; bx < dw; bx++) {
    const tally = new Map();
    let opaque = 0, total = 0;
    for (let y = edge(by, scale); y < Math.min(edge(by + 1, scale), qh); y++) {
      for (let x = edge(bx, scale); x < Math.min(edge(bx + 1, scale), qw); x++) {
        const i = (y * qw + x) * 4;
        total++;
        if (crop[i + 3] === 0) continue;
        opaque++;
        const key = (crop[i] << 16) | (crop[i + 1] << 8) | crop[i + 2];
        tally.set(key, (tally.get(key) || 0) + 1);
      }
    }
    const o = (by * dw + bx) * 4;
    if (opaque * 2 <= total) continue; // 다수결에서 지면 투명
    let best = 0, bestN = -1;
    for (const [k, n] of tally) if (n > bestN) { best = k; bestN = n; }
    small[o] = (best >> 16) & 0xff; small[o + 1] = (best >> 8) & 0xff;
    small[o + 2] = best & 0xff; small[o + 3] = 255;
  }
}

// 투명 여백 잘라내기
let x0 = dw, y0 = dh, x1 = -1, y1 = -1;
for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
  if (small[(y * dw + x) * 4 + 3]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
if (x1 < 0) { console.error('전부 투명해졌다 — --cut 을 낮춰라'); process.exit(1); }
const tw = x1 - x0 + 1, th = y1 - y0 + 1;
const out = Buffer.alloc(tw * th * 4);
for (let y = 0; y < th; y++) {
  small.copy(out, y * tw * 4, ((y + y0) * dw + x0) * 4, ((y + y0) * dw + x0 + tw) * 4);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePng(tw, th, out));
console.log(`${qw}×${qh} → 격자 ${dw}×${dh} (도트 ${scale.toFixed(2)}px) → 여백 제거 ${tw}×${th}  ·  배경 제거 ${(cleared / (qw * qh) * 100).toFixed(1)}%  → ${outPath}`);

// 확인용: 밝은 배경·어두운 배경·체커 위에 나란히 얹는다. 헤일로와 먹힌 외곽선이 여기서 보인다.
if (preview) {
  const pad = 8, band = tw + pad * 2;
  const pw = band * 3, ph = th + pad * 2;
  const prev = Buffer.alloc(pw * ph * 4);
  const bands = [[10, 16, 38], [224, 224, 230], null];
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const b = Math.min(2, (x / band) | 0);
    const bg = bands[b] || (((x >> 3) + (y >> 3)) % 2 ? [255, 0, 220] : [90, 0, 80]);
    const i = (y * pw + x) * 4;
    prev[i] = bg[0]; prev[i + 1] = bg[1]; prev[i + 2] = bg[2]; prev[i + 3] = 255;
  }
  for (let b = 0; b < 3; b++) for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const s = (y * tw + x) * 4;
    if (!out[s + 3]) continue;
    const i = ((y + pad) * pw + b * band + pad + x) * 4;
    prev[i] = out[s]; prev[i + 1] = out[s + 1]; prev[i + 2] = out[s + 2]; prev[i + 3] = 255;
  }
  // 니어리스트로 확대해 낸다 — 등배로는 사람 눈이 도트 하나를 판정하지 못한다
  const z = Number(flag('zoom', 3));
  const zw = pw * z, zh = ph * z;
  const zoomed = Buffer.alloc(zw * zh * 4);
  for (let y = 0; y < zh; y++) for (let x = 0; x < zw; x++) {
    const s = (((y / z) | 0) * pw + ((x / z) | 0)) * 4;
    const d = (y * zw + x) * 4;
    zoomed[d] = prev[s]; zoomed[d + 1] = prev[s + 1]; zoomed[d + 2] = prev[s + 2]; zoomed[d + 3] = 255;
  }
  const pp = outPath.replace(/\.png$/, '.preview.png');
  fs.writeFileSync(pp, encodePng(zw, zh, zoomed));
  console.log(`확인용 → ${pp}  ${zw}×${zh} (×${z}) — 남색 / 흰색 / 마젠타 체커`);
}
