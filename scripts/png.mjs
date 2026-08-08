// 최소 PNG 코덱 (RGBA8). 의존성 없음 — node:zlib 만 쓴다.
//
// 인코더는 archive/dev/png.mjs 에서 가져왔고, 디코더를 새로 붙였다.
// 아카이브 쪽은 절차적으로 "그리기"만 하면 됐지만 여기서는 외부에서 받은
// 로고 PNG 를 "읽어" 가공해야 하기 때문이다 (scripts/logo-cut.mjs).

import zlib from 'node:zlib';

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

export function encodePng(w, h, rgba) {
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

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// PNG → {w, h, rgba}. 8비트 non-interlaced 만 받는다 (그레이/RGB/팔레트/알파 전부).
// 16비트·인터레이스는 throw 한다 — 조용히 깨진 그림을 내놓는 것보다 낫다.
export function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('PNG 시그니처가 아니다');

  let w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];

  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }

  if (depth !== 8) throw new Error(`비트 깊이 ${depth} 은 지원하지 않는다 (8만)`);
  if (interlace !== 0) throw new Error('인터레이스 PNG 는 지원하지 않는다');
  const ch = CHANNELS[color];
  if (!ch) throw new Error(`컬러 타입 ${color} 은 지원하지 않는다`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);

  // 스캔라인 언필터 — 각 행 앞의 1바이트가 필터 타입이다
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (ft !== 0) throw new Error(`알 수 없는 필터 ${ft} (행 ${y})`);
      cur[i] = v & 0xff;
    }
  }

  // 어떤 컬러 타입이든 RGBA 로 펴서 내보낸다 — 호출부가 분기하지 않게
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    let r, g, b, a = 255;
    if (color === 0) { r = g = b = out[i]; }
    else if (color === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else if (color === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (color === 6) { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    else { // 3 = 팔레트
      const idx = out[i];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

export const hex = (c) => {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
