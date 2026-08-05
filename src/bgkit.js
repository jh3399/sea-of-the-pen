// 배경 픽셀 드로잉 툴킷 — bgscenes.js의 씬들이 공유하는 레이어 프리미티브.
// 규칙 1: 난수는 전부 시드 해시로 고정한다 (프레임마다 별·구름이 튀면 안 된다).
// 규칙 2: 좌표는 w/h 비율로 받는다 (해상도가 화면 비율에 따라 바뀐다).
// 규칙 3: globalAlpha를 쓴 함수는 반드시 1로 되돌린다.

export function hash(i, salt = 0) {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const R = Math.round;

export function fill(ctx, x, y, w, h, color) {
  if (color) ctx.fillStyle = color;
  ctx.fillRect(R(x), R(y), Math.max(1, R(w)), Math.max(1, R(h)));
}

/** 픽셀 타원 (돌·구름·달의 기본 덩어리) */
export function blob(ctx, cx, cy, rx, ry, color) {
  if (color) ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const t = dy / ry;
    const hw = R(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if (hw > 0) ctx.fillRect(R(cx - hw), R(cy + dy), hw * 2, 1);
  }
}

/** 반투명 전면 오버레이 (섬광·색조 보정) */
export function overlay(ctx, w, h, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

/** 화면 가장자리를 살짝 어둡게 — 픽셀 계단으로 만든 비네트 */
export function vignette(ctx, w, h, alpha = 0.05, steps = 5) {
  ctx.fillStyle = '#000';
  for (let i = 0; i < steps; i++) {
    ctx.globalAlpha = alpha;
    const p = i * 2;
    ctx.fillRect(0, p, w, 1);
    ctx.fillRect(0, h - 1 - p, w, 1);
    ctx.fillRect(p, 0, 1, h);
    ctx.fillRect(w - 1 - p, 0, 1, h);
  }
  ctx.globalAlpha = 1;
}

/**
 * 다단 하늘 그라데이션. 밴드 경계는 체커 디더링으로 이어 붙여
 * "2단 밴드처럼 뚝 끊기는" 문제를 없앤다.
 */
export function skyGradient(ctx, w, y0, y1, colors) {
  const n = colors.length;
  const bandH = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = R(y0 + i * bandH);
    const b = R(y0 + (i + 1) * bandH);
    ctx.fillStyle = colors[i];
    ctx.fillRect(0, a, w, b - a + 1);
  }
  for (let i = 1; i < n; i++) {
    const y = R(y0 + i * bandH);
    ctx.fillStyle = colors[i - 1];
    for (let x = 0; x < w; x += 2) {
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
    ctx.fillStyle = colors[i];
    for (let x = 0; x < w; x += 2) {
      ctx.fillRect(x + 1, y - 1, 1, 1);
      ctx.fillRect(x, y - 2, 1, 1);
    }
  }
}

export function stars(ctx, w, yMax, sec, { count = 90, color = '#cfe0ff', seed = 0, bright = 1 } = {}) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = R(hash(i, seed) * w);
    const y = R(hash(i, seed + 1) * yMax);
    const phase = hash(i, seed + 2) * Math.PI * 2;
    const tw = Math.sin(sec * 1.7 + phase);
    ctx.globalAlpha = (tw > 0.55 ? 1 : tw > -0.2 ? 0.6 : 0.28) * bright;
    ctx.fillRect(x, y, 1, 1);
    // 큰 별은 십자 반짝임
    if (hash(i, seed + 3) > 0.93 && tw > 0.6) {
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
}

export function moon(ctx, cx, cy, r, { light = '#f5e6c8', shade = '#d9c9a3', glow = '#cbd8ff' } = {}) {
  // 헤일로 (3겹, 점점 옅게)
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.05 * i;
    blob(ctx, cx, cy, r + i * 3, r + i * 3, glow);
  }
  ctx.globalAlpha = 1;
  blob(ctx, cx, cy, r, r, light);
  // 크레이터
  blob(ctx, cx - r * 0.3, cy - r * 0.25, Math.max(1, r * 0.22), Math.max(1, r * 0.18), shade);
  blob(ctx, cx + r * 0.25, cy + r * 0.3, Math.max(1, r * 0.18), Math.max(1, r * 0.15), shade);
  blob(ctx, cx + r * 0.35, cy - r * 0.4, 1, 1, shade);
}

export function sun(ctx, cx, cy, r, sec, { core = '#fff3c4', rim = '#ffd977', glow = '#ffbe5c' } = {}) {
  for (let i = 4; i >= 1; i--) {
    ctx.globalAlpha = 0.045 * i;
    blob(ctx, cx, cy, r + i * 4, r + i * 4, glow);
  }
  ctx.globalAlpha = 1;
  blob(ctx, cx, cy, r, r, rim);
  blob(ctx, cx, cy, r - 2, r - 2, core);
  // 느리게 도는 빛살
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = glow;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + sec * 0.08;
    const d = r + 4;
    ctx.fillRect(R(cx + Math.cos(a) * d), R(cy + Math.sin(a) * d), 2, 2);
  }
  ctx.globalAlpha = 1;
}

/** 시차(parallax) 구름 띠. speed가 작을수록 멀리 있는 층. */
export function clouds(ctx, w, sec, { y, color, alpha = 0.5, count = 5, speed = 3, scale = 1, seed = 0 } = {}) {
  ctx.globalAlpha = alpha;
  const span = w + 120;
  for (let i = 0; i < count; i++) {
    const base = hash(i, seed) * span;
    const x = ((base + sec * speed * (0.6 + hash(i, seed + 1) * 0.8)) % span) - 60;
    const cy = y + hash(i, seed + 2) * 14 - 7;
    const s = scale * (0.7 + hash(i, seed + 3) * 0.8);
    blob(ctx, x, cy, 13 * s, 3.5 * s, color);
    blob(ctx, x - 7 * s, cy + 1.5 * s, 8 * s, 2.5 * s, color);
    blob(ctx, x + 8 * s, cy + 1 * s, 9 * s, 3 * s, color);
    blob(ctx, x + 2 * s, cy - 2.5 * s, 7 * s, 3 * s, color);
  }
  ctx.globalAlpha = 1;
}

/**
 * 능선 실루엣 — 섬·화산·빙산의 뼈대. 컬럼 단위로 그려서 자연스러운 곡선.
 * base: 굴곡과 무관하게 항상 채우는 두께 (능선을 겹쳐 쌓을 때 사이가 비지 않게).
 */
export function hills(ctx, w, baseY, color, { amp = 20, freq = 1.6, seed = 0, offsetX = 0, from = 0, to = 1, base = 0 } = {}) {
  ctx.fillStyle = color;
  const x0 = R(w * from);
  const x1 = R(w * to);
  for (let x = x0; x < x1; x++) {
    const u = (x + offsetX) / w;
    const n =
      Math.sin(u * freq * 6.283 + hash(seed, 1) * 6.283) * 0.5 +
      Math.sin(u * freq * 13.1 + hash(seed, 2) * 6.283) * 0.3 +
      Math.sin(u * freq * 27.7 + hash(seed, 3) * 6.283) * 0.2;
    const top = baseY - base - amp * Math.max(0, 0.45 + n * 0.55);
    ctx.fillRect(x, R(top), 1, R(baseY - top) + 1);
  }
}

/** 야자수 실루엣 (금빛 정글·황금섬) */
export function palm(ctx, x, baseY, s, trunk, leaf) {
  ctx.fillStyle = trunk;
  for (let i = 0; i < 12 * s; i++) {
    ctx.fillRect(R(x + Math.sin(i / (7 * s)) * 2.5 * s), R(baseY - i), Math.max(1, R(s)), 1);
  }
  const tx = x + Math.sin((12 * s) / (7 * s)) * 2.5 * s;
  const ty = baseY - 12 * s;
  ctx.fillStyle = leaf;
  for (let k = 0; k < 5; k++) {
    const dir = k < 2 ? -1 : k > 2 ? 1 : 0;
    const len = (5 + (k % 2) * 3) * s;
    for (let i = 0; i < len; i++) {
      const dx = dir * i + (dir === 0 ? Math.sin(i) : 0);
      const dy = -Math.sqrt(i) * 1.4 + i * i * 0.055;
      ctx.fillRect(R(tx + dx), R(ty + dy), Math.max(1, R(s)), Math.max(1, R(s)));
    }
  }
}

/**
 * 바다 밴드. 아래로 갈수록 밴드가 두꺼워져 원근감이 생긴다.
 * 반환값: [ [y0,y1], ... ] — waves()에 그대로 넘긴다.
 */
export function seaBands(ctx, w, h, horizon, rows) {
  const n = rows.length;
  const total = (n * (n + 1)) / 2;
  const bands = [];
  let y = R(horizon);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += i + 1;
    const yEnd = R(horizon + ((h - horizon) * acc) / total);
    ctx.fillStyle = rows[i];
    ctx.fillRect(0, y, w, yEnd - y + 1);
    bands.push([y, yEnd]);
    y = yEnd;
  }
  // 수평선 하이라이트 한 줄
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = rows[0];
  ctx.fillRect(0, R(horizon) - 1, w, 1);
  ctx.globalAlpha = 1;
  return bands;
}

/** 밴드마다 다른 속도/크기의 파도 하이라이트 — 가까울수록 크고 빠르다. */
export function waves(ctx, w, bands, sec, color, { alpha = 0.4, speed = 7, density = 6, seed = 0 } = {}) {
  ctx.fillStyle = color;
  for (let b = 0; b < bands.length; b++) {
    const [y0, y1] = bands[b];
    const rows = Math.max(1, y1 - y0);
    const n = density + b * 3;
    const len = 2 + b * 2;
    const v = speed * (0.35 + b * 0.42);
    ctx.globalAlpha = alpha * (0.55 + b * 0.12);
    for (let i = 0; i < n; i++) {
      const base = hash(i + b * 40, seed) * (w + 40);
      const x = ((base + sec * v) % (w + 40)) - 20;
      const y = y0 + R(hash(i + b * 40, seed + 1) * rows);
      const wob = Math.sin(sec * 2 + i) > 0 ? 0 : 1;
      ctx.fillRect(R(x), y, len + wob, 1);
    }
  }
  ctx.globalAlpha = 1;
}

/** 달빛/햇빛 물기둥 — 딱딱한 세로 띠 대신 아래로 퍼지는 반짝임 무리. */
export function glitter(ctx, cx, horizon, h, sec, color, { spread = 0.9, alpha = 0.55, count = 90, seed = 0 } = {}) {
  ctx.fillStyle = color;
  const depth = h - horizon;
  for (let i = 0; i < count; i++) {
    const t = hash(i, seed);            // 0=수평선, 1=화면 아래
    const y = horizon + t * depth;
    const halfW = (3 + t * t * depth * spread) * 0.9;
    const drift = Math.sin(sec * (0.8 + hash(i, seed + 2)) + i) * halfW * 0.35;
    const x = cx + (hash(i, seed + 1) * 2 - 1) * halfW + drift;
    const blink = Math.sin(sec * 3 + hash(i, seed + 3) * 6.283);
    if (blink < -0.1) continue;
    ctx.globalAlpha = alpha * (0.35 + blink * 0.65) * (1 - t * 0.35);
    ctx.fillRect(R(x), R(y), 1 + R(t * 2), 1);
  }
  ctx.globalAlpha = 1;
}

/** 3돛대 범선 실루엣. s=1이면 약 24×22px. */
export function tallShip(ctx, x, y, s, { hull = '#0a0d20', deck = '#151a35', sail = '#1c2440', mast = '#0a0d20', flag = '#e5484d' } = {}) {
  const P = (a, b, c, d, col) => fill(ctx, x + a * s, y + b * s, c * s, d * s, col);
  // 돛대 + 활대
  P(5, -10, 1, 12, mast); P(11, -14, 1, 16, mast); P(17, -8, 1, 10, mast);
  P(2, -9, 7, 1, mast); P(8, -13, 7, 1, mast);
  // 돛 (2단)
  P(2, -8, 7, 4, sail); P(3, -4, 5, 3, sail);
  P(8, -12, 7, 5, sail); P(9, -7, 5, 4, sail);
  P(16, -7, 5, 5, sail);
  // 선체
  P(1, 0, 21, 3, hull); P(2, 3, 19, 2, hull); P(4, 5, 15, 1, hull);
  P(2, 0, 19, 1, deck);
  P(0, -1, 2, 2, hull);   // 뱃머리
  P(21, -2, 2, 3, hull);  // 선미
  P(12, -16, 4, 2, flag);
}

/** 등대 — 회전 불빛 포함 */
export function lighthouse(ctx, x, baseY, sec, { body = '#e8e2d4', stripe = '#c8443c', dark = '#2a2f45', light = '#ffe9a8' } = {}) {
  const H = 34;
  fill(ctx, x - 6, baseY - 6, 13, 7, dark);           // 바위 기단
  fill(ctx, x - 4, baseY - H, 9, H - 4, body);        // 탑
  for (let i = 0; i < 3; i++) fill(ctx, x - 4, baseY - H + 6 + i * 9, 9, 4, stripe);
  fill(ctx, x - 5, baseY - H - 4, 11, 4, dark);       // 등실 받침
  fill(ctx, x - 3, baseY - H - 9, 7, 5, light);       // 등
  fill(ctx, x - 4, baseY - H - 12, 9, 3, dark);       // 지붕
  // 회전 빔
  const a = sec * 1.1;
  const sweep = Math.sin(a);
  if (sweep > 0.1) {
    ctx.globalAlpha = 0.13 * sweep;
    ctx.fillStyle = light;
    const dir = Math.cos(a) > 0 ? 1 : -1;
    for (let i = 0; i < 60; i++) {
      const yy = baseY - H - 7 + i * 0.35 * (1 - sweep);
      fill(ctx, x + dir * i, yy - i * 0.12, 2, 1 + i * 0.12);
    }
    ctx.globalAlpha = 1;
  }
}

/** 화면 앞 부두 기둥/판자 (가장 가까운 레이어) */
export function pier(ctx, w, h, { wood = '#3a2a1c', dark = '#231810', top = '#503a26' } = {}) {
  const deckY = h - R(h * 0.1);
  fill(ctx, 0, deckY, w, h - deckY, wood);
  fill(ctx, 0, deckY, w, 2, top);
  for (let x = 0; x < w; x += 9) fill(ctx, x, deckY, 1, h - deckY, dark);
  for (let i = 0; i < 4; i++) {
    const px = R(w * (0.08 + i * 0.27));
    fill(ctx, px, deckY - 16, 5, 18, dark);
    fill(ctx, px, deckY - 16, 1, 18, wood);
  }
}

/** 갈매기 — 날갯짓하는 V자 */
export function gulls(ctx, w, sec, { y, count = 4, color = '#f2f4ff', speed = 9, seed = 0, alpha = 0.9 } = {}) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const span = w + 60;
    const x = ((hash(i, seed) * span + sec * speed * (0.7 + hash(i, seed + 1) * 0.6)) % span) - 30;
    const yy = y + hash(i, seed + 2) * 18 + Math.sin(sec * 1.3 + i) * 2;
    const flap = Math.sin(sec * 6 + i * 2) > 0 ? 1 : 2;
    ctx.fillRect(R(x), R(yy), 1, 1);
    ctx.fillRect(R(x) - 2, R(yy) - flap, 2, 1);
    ctx.fillRect(R(x) + 1, R(yy) - flap, 2, 1);
  }
  ctx.globalAlpha = 1;
}

/**
 * 범용 입자 — 눈·재·불티·꽃가루·먼지.
 * dir: 1이면 아래로(눈/재), -1이면 위로(불티/반딧불).
 */
export function particles(ctx, w, h, sec, { count = 60, color = '#fff', size = 1, speed = 12, dir = 1, sway = 6, alpha = 0.8, seed = 0, y0 = 0, y1 = 1, twinkle = false } = {}) {
  ctx.fillStyle = color;
  const top = h * y0;
  const span = h * y1 - top;
  for (let i = 0; i < count; i++) {
    const v = speed * (0.5 + hash(i, seed) * 1.1);
    let t = (hash(i, seed + 1) * span + sec * v * dir) % span;
    if (t < 0) t += span;
    const y = top + t;
    const x = (hash(i, seed + 2) * w + Math.sin(sec * 0.9 + i) * sway) % w;
    ctx.globalAlpha = alpha * (twinkle ? 0.35 + 0.65 * Math.max(0, Math.sin(sec * 3 + i)) : 1);
    const s = size + (hash(i, seed + 3) > 0.85 ? 1 : 0);
    ctx.fillRect(R(x < 0 ? x + w : x), R(y), s, s);
  }
  ctx.globalAlpha = 1;
}

export function rain(ctx, w, h, sec, { count = 110, color = '#8fa6d8', speed = 150, slant = 3, alpha = 0.5, seed = 0 } = {}) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const v = speed * (0.7 + hash(i, seed) * 0.6);
    const y = (hash(i, seed + 1) * h + sec * v) % h;
    const x = (hash(i, seed + 2) * (w + 60) - 30 + y * slant * 0.1) % (w + 60);
    const len = 3 + R(hash(i, seed + 3) * 3);
    for (let k = 0; k < len; k++) ctx.fillRect(R(x + k * 0.4), R(y + k), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** 끊어진 안개 띠가 서로 다른 속도로 흐른다 */
export function fogBands(ctx, w, sec, { y0, y1, color = '#ffffff', alpha = 0.12, count = 6, speed = 5, seed = 0, thick = 4 } = {}) {
  ctx.fillStyle = color;
  const span = w + 160;
  for (let i = 0; i < count; i++) {
    const dir = i % 2 ? 1 : -1;
    const y = y0 + (y1 - y0) * hash(i, seed);
    const bh = 2 + R(hash(i, seed + 1) * thick);
    const base = hash(i, seed + 2) * span;
    let x = (base + sec * speed * (0.4 + hash(i, seed + 3)) * dir) % span;
    if (x < 0) x += span;
    ctx.globalAlpha = alpha * (0.55 + hash(i, seed + 4) * 0.8);
    for (let k = 0; k < 3; k++) {
      const segW = 40 + hash(i * 3 + k, seed + 5) * 90;
      ctx.fillRect(R(x - 80 + k * (span / 3)), R(y + (k % 2)), R(segW), bh);
      ctx.fillRect(R(x - 80 + k * (span / 3) - span), R(y + (k % 2)), R(segW), bh);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * 번개. 주기마다 두 번 번쩍인다.
 * 반환값 0~1 — 씬에서 하늘/바다를 같이 밝힐 때 쓴다.
 */
export function lightning(ctx, w, h, sec, { period = 4.6, color = '#e6ecff', seed = 0 } = {}) {
  const idx = Math.floor(sec / period);
  const t = sec - idx * period;
  const on = t < 0.1 ? 1 : t > 0.2 && t < 0.28 ? 0.6 : 0;
  if (!on) return 0;
  const x0 = w * (0.15 + hash(idx, seed) * 0.7);
  ctx.globalAlpha = 0.9 * on;
  ctx.fillStyle = color;
  let x = x0;
  const bottom = h * (0.35 + hash(idx, seed + 1) * 0.2);
  for (let y = 0; y < bottom; y += 3) {
    x += (hash(idx * 31 + y, seed + 2) - 0.5) * 7;
    ctx.fillRect(R(x), R(y), 2, 4);
    if (hash(idx * 17 + y, seed + 3) > 0.86) {
      const bx = x + (hash(y, seed + 4) > 0.5 ? 2 : -6);
      ctx.fillRect(R(bx), R(y), 5, 1);
    }
  }
  ctx.globalAlpha = 1;
  return on;
}

/** 난파 잔해 — 부서진 판자와 통, 물결에 흔들린다 */
export function wreckage(ctx, w, sec, { y, color = '#2b1f14', accent = '#4a361f', count = 6, seed = 0, s = 1 } = {}) {
  for (let i = 0; i < count; i++) {
    const x = hash(i, seed) * w;
    const bob = Math.sin(sec * 1.1 + i * 1.7) * 1.6;
    const yy = y + hash(i, seed + 1) * 14 + bob;
    const len = (6 + hash(i, seed + 2) * 12) * s;
    const tilt = hash(i, seed + 3) > 0.5 ? 1 : -1;
    fill(ctx, x, yy, len, 2 * s, color);
    fill(ctx, x + len * 0.3, yy + tilt * 2 * s, len * 0.5, 1 * s, accent);
    if (hash(i, seed + 4) > 0.6) fill(ctx, x + len * 0.5, yy - 5 * s, 1 * s, 5 * s, color); // 부러진 돛대
  }
}
