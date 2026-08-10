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

// 서양 대포를 위에서 내려다본 실루엣 — 몸체는 검은 무쇠(K) 하나로, 포구(+X, 오른쪽)
// 끝에만 철 테두리(I/i)를 얹어 포신임을 읽게 한다. 위아래 한 칸 튀어나온 부분은 포이(砲耳,
// trunnion) — 포가에 걸리는 축이라 위에서 봐도 옆으로 도드라진다.
const CANNON_GRID = [
  '....KK...........',
  '..KKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKK..',
  'KKKKKKKKKKKKKKKKi',
  'KKKKKKKKKKKKKKKKI',
  '.KKKKKKKKKKKKKK..',
  '..KKKKKKKKKKKK...',
  '....KK...........',
];

// 키 — 오른쪽의 철제 축을 부착점에 두고, 나무 막대가 선미(-X) 쪽으로 뻗는 틸러 형태다.
// 항해 화면에서는 이 축을 중심으로 `control.rudder` 만큼 회전한다.
const RUDDER_GRID = [
  '............',
  '............',
  '............',
  '............',
  'WW..........',
  'WWWWWWWWWI..',
  'wwwwwwwwwI..',
  '.........ii.',
  '............',
  '............',
  '............',
  '............',
];
const RUDDER_PIVOT = { x: 9.5, y: 6.5 };

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

// ★ 그리드 기준 방향(+Y, 아래)이 곧 추진 방향이다(`markerAngleToward` 가 이 축을 부착
//   각도로 돌린다). 로켓은 코가 향하는 쪽으로 밀리고 불꽃은 그 반대(뒤)로 뿜는다 —
//   그래서 몸체를 아래(+Y), 불꽃을 위(−Y)에 둔다.
const BOOSTER_GRID = [
  '............',
  '....F..F....',
  '...FfFfFf...',
  '....FfFf....',
  '...R....R...',
  '...RRCCRR...',
  '....RCCR....',
  '....RCCR....',
  '....RCCR....',
  '....RCCR....',
  '....RRRR....',
  '.....RR.....',
];

// 노 — 기본 장치라 카탈로그에는 없지만 그리기 화면·항해 화면이 마커로 쓴다.
//
// ★ 기준 방향은 **노깃(둥근 면)이 아래(+Y)** 다. 좌현·우현 노는 이 그리드를 회전시켜
//   노깃이 현측 바깥을 향하게 그린다 (`drawItemMarker` 의 angle). 그리드를 좌우 두 벌로
//   두지 않는 이유는 §4.1 과 같다 — 방향은 데이터지 별도 에셋이 아니다.
// 자루 15칸 : 노깃 7칸. 호출부가 그리드를 부착점보다 **바깥으로 밀어** 그리므로(OAR_PUSH),
// 자루 안쪽 끝만 선체 안에 남고 노깃은 통째로 물에 나간다.
const OAR_GRID = [
  '....ww....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '....WW....',
  '...wWWw...',
  '..wWWWWw..',
  '..WWWWWW..',
  '.WWWWWWWW.',
  '.WWWWWWWW.',
  '..wWWWWw..',
  '...wwww...',
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

/** 아이템 카탈로그 id → 아이콘 그리드. `draw/screen.js` 의 PALETTE_ITEMS 순서와 맞춰 둔다.
 *  `oar` 만 카탈로그가 아닌 기본 장치(items/defaults.js)다. */
export const ITEM_ICON_GRIDS = {
  cannon: CANNON_GRID,
  rudder: RUDDER_GRID,
  sail: SAIL_GRID,
  booster: BOOSTER_GRID,
  oar: OAR_GRID,
};

export function itemIconSVG(type, opts) {
  const grid = ITEM_ICON_GRIDS[type];
  if (!grid) return '';
  return pixelIconSVG(grid, ICON_PALETTE, opts);
}

export function crewIconSVG(opts) {
  return pixelIconSVG(CREW_GRID, ICON_PALETTE, opts);
}

/**
 * 아이템 마커를 캔버스에 (cx, cy) 중심으로 직접 찍는다.
 *
 * @param {number} angle 그리드를 돌릴 각 (rad). 노가 현측 바깥을 향하게 하는 데 쓴다 —
 *   기준(0)은 그리드가 쓰인 그대로, 즉 노깃이 +Y 쪽이다. 세로가 긴 그리드가 있으므로
 *   중심은 폭이 아니라 **행 수로도** 잡는다 (정사각 그리드에서는 결과가 같다).
 */
export function drawItemMarker(ctx, type, cx, cy, pixel = 3, angle = 0) {
  const grid = ITEM_ICON_GRIDS[type];
  if (!grid) return;
  const w = grid[0].length * pixel;
  const h = grid.length * pixel;
  if (!angle) {
    drawPixelGrid(ctx, grid, ICON_PALETTE, cx - w / 2, cy - h / 2, pixel);
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  drawPixelGrid(ctx, grid, ICON_PALETTE, -w / 2, -h / 2, pixel);
  ctx.restore();
}

/** 키의 철제 축을 (cx, cy)에 고정하고 막대만 `angle` 만큼 회전시킨다. */
export function drawRudderMarker(ctx, cx, cy, pixel = 3, angle = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  drawPixelGrid(ctx, RUDDER_GRID, ICON_PALETTE,
    -RUDDER_PIVOT.x * pixel, -RUDDER_PIVOT.y * pixel, pixel);
  ctx.restore();
}

/**
 * ★ 그리드의 +Y(노 기준 방향 = 노깃)가 (dx, dy) 를 향하게 하는 회전각.
 *
 * 좌현·우현 노가 같은 방향으로 그려지면 "양쪽에서 물을 젓는다"가 그림에서 읽히지 않는다.
 * 좌우 스프라이트를 따로 두는 대신 **방향 벡터 하나**로 가른다 (§4.1 과 같은 이유 —
 * 방향은 데이터지 별도 에셋이 아니다).
 *
 * 좌표계는 **호출부의 현재 프레임**이다. 그래서 그리기 화면(캔버스 Y-down)과 항해 화면
 * (drawUprightIcon 이 Y 를 뒤집어 둔 프레임) 양쪽이 같은 함수를 쓴다.
 */
export function markerAngleToward(dx, dy) {
  return Math.atan2(-dx, dy);
}

/** 마커 스프라이트의 실제 크기 (px 또는 m — pixel 단위를 따라간다). */
export function itemMarkerSize(type, pixel = 3) {
  const grid = ITEM_ICON_GRIDS[type];
  if (!grid) return { w: 0, h: 0 };
  return { w: grid[0].length * pixel, h: grid.length * pixel };
}

/**
 * 노를 부착점보다 바깥으로 미는 비율 (스프라이트 길이 기준).
 *
 * 마커를 부착점에 그대로 **중심 정렬하면 노가 배 안에 처박힌다** — 부착점은 반폭의 0.8
 * 지점이라 현측까지 남은 여유가 반폭의 20% 뿐이고, 스프라이트 절반은 그보다 훨씬 길다.
 * 0.25 를 밀면 자루 안쪽 끝은 선체 안(노잡이 자리)에 남고 노깃은 현측 밖 물에 놓인다.
 */
export const OAR_PUSH = 0.25;

/** 주인공 스프라이트를 캔버스에 (cx, cy) 중심으로 직접 찍는다. */
export function drawCrewSprite(ctx, cx, cy, pixel = 3) {
  const size = CREW_GRID[0].length * pixel;
  drawPixelGrid(ctx, CREW_GRID, ICON_PALETTE, cx - size / 2, cy - size / 2, pixel);
}
