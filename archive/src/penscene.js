// 펜 맞대기 — 이 게임에서 가장 중요한 한 컷.
//
// 400년 전 형제가 쓰던 신호다. 펜촉을 위로 세워 내밀면 상대가 자기 펜촉을 톡 맞댄다.
// 네일은 펜을 버린 사람이라 400년간 이 동작을 할 수 없었고, S-21에서 그걸 보고 알아본다.
// 그래서 이 컷은 대사창 초상화가 아니라 **화면 한가운데에 크게** 뜬다.
//
// 구성: 40×44 그리드를 왼쪽 20 + 오른쪽 20으로 쪼개서 조립한다.
//   왼쪽  = 루의 주먹 + 세렌이 깎아준 나무 펜 (항상 같다)
//   오른쪽 = 세렌의 부리 끝 / 네일의 오래된 펜 (변주)
// 접점의 불꽃만 코드로 그린다 — 매 프레임 맥이 뛰어야 '통했다'는 느낌이 난다.
//
// 펜은 **거의 세워서** 쥔다 (STORY.md 9절: 펜촉을 위로 세워 내민다).
// 눕히면 낚싯대가 되고, 주먹을 프레임 바깥쪽에 두면 두 펜이 지붕(∧)이 된다 —
// 둘 다 실제로 겪었다. 그래서 주먹을 가운데로 바짝 붙이고 펜을 80°로 세웠다.
// 네일 변주는 왼쪽 그리드를 **좌우로 뒤집어** 쓴다. 같은 동작이라는 게 도트에서 그대로 읽힌다.

// 루의 주먹 + 나무 펜. 펜촉은 오른쪽 위(접점)를 향해 세워져 있다.
// 주먹은 엄지 덩어리(왼쪽, l) + 손가락 마디 3개(e 주름)로 읽히게 — 그냥 타원이면 빵이 된다.
const PAW_PEN = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '..................gg',
  '.................ygg',
  '................yggk',
  '................yggk',
  '................ymbk',
  '...............nmbk.',
  '...............nmbk.',
  '...............nmbk.',
  '...............nmbk.',
  '..............nmbk..',
  '..............nmbk..',
  '..............nmbk..',
  '..............nmbk..',
  '.............nmbk...',
  '.............nmbk...',
  '.............nmbk...',
  '.............nmbk...',
  '............nmbk....',
  '............nmbk....',
  '............nmbk....',
  '........kkllffdk....',
  '.....kkllffffffddk..',
  '....kkllffefffdddk..',
  '...klllfefffffdddk..',
  '...kllffefeeeefddk..',
  '...kllffeffffffddk..',
  '...klfffefeeeefddk..',
  '...klfffeffffffddk..',
  '...kdfffefeeefddk...',
  '....kddfffffffddk...',
  '....kddffffffddek...',
  '....kvvvvvuuuuuuk...',
  '....kvvvvvuuuuuuk...',
  '....kkkkkkkkkkkkk...',
];

// 세렌 — 뱃머리 정령. 고개를 들어 부리 끝을 왼쪽 위(접점)로 내민다.
// 흉상(sprites.js seren)과 같은 팔레트를 써서 같은 인물로 읽히게 한다.
const SEREN_BEAK = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  'oo..................',
  'oox.................',
  '.ooxk...............',
  '.oooxk...kwwwwwcck..',
  '..oooxk.kwwwwwwwcck.',
  '..oooxxkkwwkkkwwccak',
  '...oooxxkkwkwkwwccak',
  '...ooooxxkkkkwwccak.',
  '....ooooxxkwwwwccak.',
  '.....kwwwwwwwwwwccak',
  '....kwwwwwwwwwwwccak',
  '....kwwwwwwwwwwwccak',
  '...kwwwwwwwwwwwwccak',
  '...kwwwwwwwwwwwwccak',
  '...kwwwwwwwwwwwwccak',
  '....kwwwwwwwwwwccak.',
  '.....kwwwwwwwwccak..',
  '....kbwwwwwwwwdcak..',
  '...kbbwwwwwwwwddak..',
  '..kbbbwwwwwwwwdddak.',
  '..kbbbbwwwwwwddddak.',
  '.kbbbbbwwwwwdddddak.',
  '.kbbbbbbwwwddddddak.',
  'kbbbbbbbwwddddddddak',
  'kbbbbbbbdddddddddddk',
  'knnnnnnnnnnnnnnnmmmk',
  'kmnnnnnnnnnnnnnmmmmk',
  'knnnnnnnnnmmnnnnnmmk',
  'kmmmmmmmmmmmmmmmmmmk',
  'kmmmmmmmmmmmmmmmmmmk',
  'kkkkkkkkkkkkkkkkkkkk',
  '....................',
  '....................',
  '....................',
];

const PAL_RU = {
  k: '#140f1c', l: '#fbeccb', f: '#eccfa2', d: '#c39a6e', e: '#7a5340',
  n: '#b98b52', m: '#8a5d2e', b: '#54341a', g: '#ffd24a', y: '#fff0a0',
  v: '#3c518a', u: '#26335e',
};

const PAL_SEREN = {
  k: '#141020', w: '#f6f9fd', c: '#d3dfec', a: '#a6bad2', b: '#5088c4',
  d: '#33619c', o: '#f5a63c', x: '#c47a20', n: '#8a5a30', m: '#5e3a1e',
};

// 네일 — 400년 만에 쥔 펜. 같은 그리드를 뒤집고 색만 자주빛으로 바꾼다.
// 펜촉만 금빛 그대로 — 굳었던 게 갈라지고 색이 돌아오는 순간이라서.
const PAL_NAIL = {
  k: '#0d0a14', l: '#8a5590', f: '#63356a', d: '#44254a', e: '#2a1630',
  n: '#7a4a7c', m: '#5a2f5e', b: '#3a1f3f', g: '#ffd24a', y: '#fff0a0',
  v: '#252c4e', u: '#161933',
};

const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));

/** variant → [왼쪽 그리드·팔레트, 오른쪽 그리드·팔레트] */
function halves(variant) {
  const left = [PAW_PEN, PAL_RU];
  if (variant === 'nail') return [left, [mirror(PAW_PEN), PAL_NAIL]];
  return [left, [SEREN_BEAK, PAL_SEREN]];
}

const W = 40;
const H = 44;
const CX = 20;   // 접점 x — 두 그리드가 맞닿는 자리
const CY = 10;   // 접점 y — 펜촉 높이

// 불꽃: 접점에서 뻗는 8방향 빛살. t(0~1)로 맥이 뛴다.
// 세로·가로 살은 길게, 대각선은 짧게 — 길이가 다 같으면 별이 아니라 바퀴처럼 보인다.
const RAYS = [
  [0, -1, 9], [0, 1, 5], [-1, 0, 7], [1, 0, 7],
  [-1, -1, 4], [1, -1, 4], [-1, 1, 3], [1, 1, 3],
];

function drawSpark(ctx, t) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 3.4);       // 숨쉬듯 느리게
  const flare = Math.max(0, 1 - t / 0.55);             // 처음 0.55초만 확 터진다

  for (const [dx, dy, len] of RAYS) {
    const reach = Math.round(len * pulse + len * flare * 0.9);
    for (let i = 2; i < reach; i++) {
      const x = CX + dx * i - (dx < 0 ? 1 : 0);
      const y = CY + dy * i;
      // 끝으로 갈수록 얇고 어둡게 — 살이 뾰족해야 빛으로 읽힌다
      ctx.fillStyle = i < reach * 0.45 ? '#fff0a0' : '#ffd24a';
      ctx.globalAlpha = Math.max(0, 1 - i / reach) * 0.95;
      ctx.fillRect(x, y, dx === 0 ? 2 : 1, dy === 0 ? 2 : 1);
    }
  }

  ctx.globalAlpha = 1;
  // 코어 — 흰 심 + 금빛 테두리
  const r = 1 + Math.round(pulse + flare * 2);
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(CX - r, CY - r, r * 2, r * 2 + 1);
  ctx.fillStyle = '#fffdf2';
  ctx.fillRect(CX - 1, CY - 1, 2, 3);
}

function paint(ctx, variant, t) {
  ctx.clearRect(0, 0, W, H);
  const [[lRows, lPal], [rRows, rPal]] = halves(variant);

  [[lRows, lPal, 0], [rRows, rPal, CX]].forEach(([rows, pal, ox]) => {
    rows.forEach((line, y) => {
      [...line].forEach((ch, x) => {
        const color = pal[ch];
        if (ch === '.' || !color) return;
        ctx.fillStyle = color;
        ctx.fillRect(ox + x, y, 1, 1);
      });
    });
  });

  drawSpark(ctx, t);
}

/**
 * 펜 맞대기 컷을 캔버스로 만들어 돌려준다. 불꽃은 스스로 움직인다.
 * canvas.stop() 으로 애니메이션을 멈춘다 (대사 줄이 넘어갈 때 호출).
 */
export function penTouchCanvas(variant = 'seren', scale = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.classList.add('pixel', 'pen-touch');
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;

  const ctx = canvas.getContext('2d');
  const t0 = performance.now();
  let raf = 0;

  const frame = (now) => {
    paint(ctx, variant, (now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  canvas.stop = () => cancelAnimationFrame(raf);
  return canvas;
}

// dev/pen-scene.mjs 가 도트만 검사할 수 있게 그리드도 내보낸다
export const PEN_GRIDS = { PAW_PEN, SEREN_BEAK, PAL_RU, PAL_SEREN, PAL_NAIL, mirror, W, H };
