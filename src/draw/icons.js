// 픽셀 아이콘 — 레포에 이미지 자원이 전무하므로(폰트 1개뿐) 작은 문자 그리드를 인라인 SVG
// <rect> 로 찍어내는 헬퍼 하나로 아이템 아이콘·주인공 스프라이트를 전부 만든다. 사진처럼
// 참고 이미지를 복제하지 않고 단순화된 실루엣으로 스코프를 맞춘다.

/**
 * 문자 그리드(행 배열, 모두 같은 길이) → 인라인 SVG 문자열.
 * '.' 는 투명. 그 외 문자는 palette 에서 색을 찾는다.
 */
export function pixelIconSVG(rows, palette, { pixel = 4 } = {}) {
  const cols = rows[0].length;
  const h = rows.length;
  const rects = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < cols; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const color = palette[ch];
      if (!color) continue;
      rects.push(
        `<rect x="${x * pixel}" y="${y * pixel}" width="${pixel}" height="${pixel}" fill="${color}"/>`,
      );
    }
  }
  const w = cols * pixel;
  const hh = h * pixel;
  return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`;
}

/** 도면 보기 썸네일 — 가이드 포인트 배열을 작은 뷰박스에 맞춘 픽셀풍 외곽선 SVG로. */
export function templateThumbSVG(points, { box = 56, pad = 6, color = '#5a4a34' } = {}) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const s = (box - pad * 2) / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pts = points
    .map((p) => `${(box / 2 + (p.x - cx) * s).toFixed(1)},${(box / 2 + (p.y - cy) * s).toFixed(1)}`)
    .join(' ');
  return `<svg viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><polygon points="${pts}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}

/** 그리드를 캔버스에 직접 찍는다 — 렌더 루프에서 매 프레임 그릴 마커·주인공은 SVG/Image
 * 왕복 없이 이걸로 그린다. */
export function drawPixelGrid(ctx, rows, palette, ox, oy, pixel = 3) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * pixel, oy + y * pixel, pixel, pixel);
    }
  }
}

export const ICON_PALETTE = {
  W: '#a8763e', // 나무 (MATERIALS.wood.color)
  w: '#8a5f2f', // 나무 그림자
  I: '#8892a0', // 철 (MATERIALS.iron.color)
  i: '#6b7581', // 철 그림자
  C: '#e8dcc0', // 천 (MATERIALS.cloth.color)
  R: '#c94f3d', // 부스터 몸체 빨강
  F: '#f0a53c', // 불꽃
  f: '#ffd35c', // 불꽃 하이라이트
  K: '#2a1f14', // 잉크 검정
  S: '#f2c48a', // 피부
  B: '#3b6ea5', // 셔츠 파랑
  e: '#2a1f14', // 눈
};

const CANNON_GRID = [
  '............',
  '.......IIIII',
  '.....IIIIIII',
  '...WwIIIIIII',
  '...WwwwwII..',
  '...WwwwwK...',
  '...wKKKKK...',
  '..wKKKKKKw..',
  '..wKKKKKKw..',
  '...wKKKKw...',
  '....wwww....',
  '............',
];

const RUDDER_GRID = [
  '....WWWW....',
  '..WW....WW..',
  '.W..W..W..W.',
  'W...W..W...W',
  'W...WwwW...W',
  'WWWWWwwWWWWW',
  'WWWWWwwWWWWW',
  'W...WwwW...W',
  'W...W..W...W',
  '.W..W..W..W.',
  '..WW....WW..',
  '....WWWW....',
];

const SAIL_GRID = [
  '......C.....',
  '.....CC.....',
  '....CCC.....',
  '....CCCC....',
  '....CCCCC...',
  '....CCCCCC..',
  '....CCCCCCC.',
  '....w.......',
  '....w.......',
  '..WWWWWWW...',
  '............',
  '............',
];

const BOOSTER_GRID = [
  '.....RR.....',
  '....RRRR....',
  '....RCCR....',
  '....RCCR....',
  '....RCCR....',
  '....RCCR....',
  '...RRCCRR...',
  '...R....R...',
  '....FfFf....',
  '...FfFfFf...',
  '....F..F....',
  '............',
];

const CREW_GRID = [
  '....SSSS....',
  '...SSSSSS...',
  '..SSSSSSSS..',
  '..SSeSSSeS..',
  '..SSSSSSSS..',
  '...SSSSSS...',
  '....BBBB....',
  '...BBBBBB...',
  '..BBBBBBBB..',
  '..BBBBBBBB..',
  '..BBBBBBBB..',
  '............',
];

/** 아이템 카탈로그 id → 아이콘 그리드. `draw/screen.js` 의 PALETTE_ITEMS 순서와 맞춰 둔다. */
export const ITEM_ICON_GRIDS = {
  cannon: CANNON_GRID,
  rudder: RUDDER_GRID,
  sail: SAIL_GRID,
  booster: BOOSTER_GRID,
};

export function itemIconSVG(type, opts) {
  const grid = ITEM_ICON_GRIDS[type];
  if (!grid) return '';
  return pixelIconSVG(grid, ICON_PALETTE, opts);
}

export function crewIconSVG(opts) {
  return pixelIconSVG(CREW_GRID, ICON_PALETTE, opts);
}

/** 아이템 마커를 캔버스에 (cx, cy) 중심으로 직접 찍는다. */
export function drawItemMarker(ctx, type, cx, cy, pixel = 3) {
  const grid = ITEM_ICON_GRIDS[type];
  if (!grid) return;
  const size = grid[0].length * pixel;
  drawPixelGrid(ctx, grid, ICON_PALETTE, cx - size / 2, cy - size / 2, pixel);
}

/** 주인공 스프라이트를 캔버스에 (cx, cy) 중심으로 직접 찍는다. */
export function drawCrewSprite(ctx, cx, cy, pixel = 3) {
  const size = CREW_GRID[0].length * pixel;
  drawPixelGrid(ctx, CREW_GRID, ICON_PALETTE, cx - size / 2, cy - size / 2, pixel);
}
