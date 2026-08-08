// 섬 탐험(마을) 엔진 — 배에서 내려 옆스크롤로 마을을 걷고, NPC와 대화하고, 보스 관문으로.
// runIsland(village, ctx) → Promise<{ result: 'boss' | 'leave' }>
//   village: world.js 의 village 객체 { key, name, bg, width, groundColor, groundTop, props, npcs, gate }
//   ctx: { canvas, promptEl, runDialogue, sfx }
//
// 규칙
// - 논리 해상도는 짧은 쪽 200px (pixelbg.js 와 동일 기준). 배경은 bgscenes 의 씬을 백드롭으로 재사용.
// - 애니메이션 난수는 전부 hash(i, seed) — 프레임마다 튀면 안 된다.
// - resolve 전에 이벤트 리스너·rAF·디버그 훅을 전부 정리한다.

import { SCENES, DEFAULT_SCENE } from '../../src/scene/bgscenes.js';
import { hash, fill, blob, palm } from '../../src/scene/bgkit.js';

const R = Math.round;
const MIN_SIDE = 200;      // 논리 해상도: 짧은 쪽 픽셀 수
const WALK_SPEED = 70;     // 플레이어 이동 속도 (논리px/s)
const TALK_DIST = 26;      // NPC 대화 가능 거리
const GATE_DIST = 26;      // 관문 반응 거리
const LEAVE_X = 30;        // 이 지점보다 왼쪽이면 "배로 돌아간다"
const GROUND_RATIO = 0.22; // 지면 띠 높이 (화면 비율)
const LOCKED_MS = 2600;    // 관문 잠김 안내가 떠 있는 시간

// ---------------- 색 유틸 ----------------

function shade(hex, mul) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, R(((n >> 16) & 255) * mul));
  const g = Math.min(255, R(((n >> 8) & 255) * mul));
  const b = Math.min(255, R((n & 255) * mul));
  return `rgb(${r},${g},${b})`;
}

function lighten(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => R(v + (255 - v) * t);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ---------------- 도트 그리드 (sprites.js 와 같은 문자 그리드 방식) ----------------
// 배색은 24×32 흉상(sprites.js)과 동일 팔레트 — 치비와 흉상이 같은 인물로 보여야 한다.

// 루 — 크림 태비 고양이, 빨간 스카프, 초록 눈, 남색 조끼. (14×20 전신 치비)
const PLAYER_PALETTE = {
  k: '#17121c', f: '#e8cba4', d: '#c9a377', l: '#f7e6c8', s: '#a87c4e',
  p: '#e88fa0', w: '#f7f3ea', g: '#46d17f', r: '#e5484d', q: '#a32b30',
  v: '#2b3a63', u: '#1c2848',
};

// 머리~몸통 (다리 제외 16행). 이마 줄무늬 s, 눈 하이라이트 w는 흉상과 같은 배치.
const PLAYER_BASE = [
  '..kk......kk..',
  '.kfpk....kpfk.',
  '.kfppk..kppfk.',
  '.kffkkkkkkffk.',
  '.klffffffffdk.',
  '.klsffffffsdk.',
  '.klffffffffdk.',
  '.klwgffffwgdk.',
  '.klggffffggdk.',
  '.klfwwppwwfdk.',
  '.kdffwwwwffdk.',
  '.kqrrrrrrrrqk.',
  '..krrrrrrrrk..',
  '..kvvvvvvvvkk.',
  '..kvlvvvvuvksk',
  '..kvvvvvvuvkk.',
];

// 다리 4행 — 서있기 / 걷기 2프레임
const PLAYER_LEGS = {
  idle: [
    '..kffk..kffk..',
    '..kffk..kffk..',
    '..kfdk..kfdk..',
    '..kkkk..kkkk..',
  ],
  walkA: [
    '..kffk..kffk..',
    '.kffk....kffk.',
    '.kfdk....kfdk.',
    '.kkkk....kkkk.',
  ],
  walkB: [
    '..kffk..kffk..',
    '...kffkkffk...',
    '...kfdkkfdk...',
    '...kkk..kkk...',
  ],
};

// NPC 실루엣 3종 — t: 주요색(chibi.tint 로 교체), u: 그늘, h: 밝은 면 (t에서 자동 파생).
// 전부 오른쪽을 보는 그림 — 렌더 시 플레이어 쪽으로 플립한다.
const NPC_BASES = {
  // 갈매기형 (세렌 치비 등) — 12×16
  bird: {
    palette: { k: '#14101c', o: '#ffb638', e: '#cf8a1c', g: '#232838' },
    rows: [
      '...kkkk.....',
      '..khtttk....',
      '.khtttttk...',
      '.khtttgttkoo',
      '.khttttttke.',
      '.kttttttttk.',
      'khttttuutttk',
      'khtttuuuuttk',
      'khtttuuuuttk',
      'khttttuuuttk',
      '.kttttttttk.',
      '.kuttttttuk.',
      '..kuttttuk..',
      '..kkkkkkkk..',
      '....ke..ke..',
      '...kee.kee..',
    ],
  },
  // 앵무형 (리코 등) — 12×16, 노란 볏 + 굽은 부리 + 긴 꼬리
  parrot: {
    palette: { k: '#14101c', o: '#e8a13c', e: '#a8681c', g: '#232838', y: '#ffd24a' },
    rows: [
      '.....ky.....',
      '....kyyk....',
      '...kttttk...',
      '..khtttttk..',
      '..khtgtttkoo',
      '..khtttttke.',
      '.khtthhhttk.',
      '.khtthhhttk.',
      '.kttthhhtttk',
      '.kttthhhtttk',
      '.kutthhhttuk',
      '.kutthhhttuk',
      '..kutttttukk',
      '..kkkkkkkutk',
      '....kee..kuk',
      '...keeek.kk.',
    ],
  },
  // 카피바라형 (포포 장로 등) — 15×14, 각진 머리 + 뭉툭한 코
  capy: {
    palette: { k: '#14101c', g: '#232838', n: '#57351f' },
    rows: [
      '..kk......kk...',
      '.kuukkkkkkuuk..',
      '.khttttttttuk..',
      '.khttttttgtuk..',
      '.khtttttttttnk.',
      '.khtttttttttnk.',
      '.khttttttttuk..',
      '..khttttttuk...',
      'khtttttttttuuk.',
      'khtttttttttuuk.',
      'khtttttttttuuk.',
      'kutttttttttuuk.',
      '.kutk...kutk...',
      '.kkkk...kkkk...',
    ],
  },
};

// 개발용 자가 검증 — 행 길이가 하나라도 다르면 도트가 옆으로 민다. 로드 시 1회.
(function checkGrids() {
  const check = (name, rows) => {
    for (const r of rows) {
      if (r.length !== rows[0].length) console.warn(`[island] 그리드 행 길이 불일치: ${name}`);
    }
  };
  check('player', PLAYER_BASE);
  Object.keys(PLAYER_LEGS).forEach((k) => check(`legs.${k}`, [PLAYER_BASE[0]].concat(PLAYER_LEGS[k])));
  Object.keys(NPC_BASES).forEach((k) => check(`npc.${k}`, NPC_BASES[k].rows));
})();

/** 문자 그리드 → 오프스크린 캔버스 (1px = 1도트) */
function gridCanvas(rows, palette) {
  const gw = rows[0].length;
  const gh = rows.length;
  const c = document.createElement('canvas');
  c.width = gw;
  c.height = gh;
  const cg = c.getContext('2d');
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const ch = rows[y][x];
      if (ch === '.' || !palette[ch]) continue;
      cg.fillStyle = palette[ch];
      cg.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function buildPlayerFrames() {
  const make = (legs) => gridCanvas(PLAYER_BASE.concat(legs), PLAYER_PALETTE);
  return { idle: make(PLAYER_LEGS.idle), walkA: make(PLAYER_LEGS.walkA), walkB: make(PLAYER_LEGS.walkB) };
}

function buildNpcCanvas(baseKey, tint) {
  const base = NPC_BASES[baseKey] || NPC_BASES.bird;
  const pal = Object.assign({}, base.palette, {
    t: tint,
    u: shade(tint, 0.62),
    h: lighten(tint, 0.28),
  });
  return gridCanvas(base.rows, pal);
}

// ---------------- 소품 렌더러 ----------------
// 시그니처: (g, x[화면좌표], baseY, sec, wx[월드좌표 — 시드/위상용])

function drawSign(g, x, baseY) {
  // 기둥
  fill(g, x - 1, baseY - 13, 3, 13, '#241708');
  fill(g, x - 1, baseY - 13, 1, 13, '#5a3d1f');
  // 판 (외곽선 → 판자 → 명암)
  fill(g, x - 9, baseY - 22, 19, 11, '#17121c');
  fill(g, x - 8, baseY - 21, 17, 9, '#7a5c33');
  fill(g, x - 8, baseY - 21, 17, 1, '#9a7a44');
  fill(g, x - 8, baseY - 14, 17, 1, '#4a3618');
  // 글자는 못 쓰니 그림 — 야자수 픽토그램 + 금빛 물결
  g.fillStyle = '#2e2210';
  g.fillRect(x - 4, baseY - 19, 1, 4);          // 줄기
  g.fillRect(x - 6, baseY - 20, 2, 1);          // 잎 왼쪽
  g.fillRect(x - 4, baseY - 21, 2, 1);          // 잎 위
  g.fillRect(x - 2, baseY - 20, 2, 1);          // 잎 오른쪽
  g.fillStyle = '#ffd24a';
  g.fillRect(x + 2, baseY - 17, 2, 1);          // 물결
  g.fillRect(x + 5, baseY - 18, 2, 1);
  g.fillRect(x + 3, baseY - 19, 1, 1);
}

function drawPalmProp(g, x, baseY) {
  // 그림자 실루엣을 한 번 깔고 본체를 겹쳐 외곽을 세운다
  palm(g, x + 1, baseY + 1, 1.6, '#241708', '#4a3510');
  palm(g, x, baseY, 1.6, '#5a3a1c', '#b8871f');
}

function drawHouse(g, x, baseY) {
  const x0 = x - 17;
  const y0 = baseY - 22;                        // 벽 윗선
  // 벽 (2톤 판자)
  fill(g, x0 - 1, y0 - 1, 36, 24, '#17121c');   // 외곽선
  fill(g, x0, y0, 34, 22, '#6a4c2c');
  fill(g, x0, y0, 34, 1, '#8a6a3e');
  g.fillStyle = '#54391f';
  for (let i = 1; i < 6; i++) g.fillRect(x0, y0 + i * 4, 34, 1);
  // 지붕 — 위로 갈수록 좁아지는 계단꼴
  for (let j = 0; j < 8; j++) {
    const half = R(3 + 17 * (j / 7));
    fill(g, x - half, y0 - 9 + j, half * 2, 1, j < 2 ? '#17121c' : j % 2 ? '#3a2412' : '#2c1a0c');
  }
  // 문
  fill(g, x + 6, baseY - 13, 8, 13, '#17121c');
  fill(g, x + 7, baseY - 12, 6, 12, '#3a2412');
  fill(g, x + 8, baseY - 7, 1, 1, '#c9b48a');   // 손잡이
  // 창 (따뜻한 불빛 + 창살)
  fill(g, x - 12, y0 + 6, 8, 7, '#17121c');
  fill(g, x - 11, y0 + 7, 6, 5, '#ffd98a');
  fill(g, x - 8, y0 + 7, 1, 5, '#17121c');
  fill(g, x - 11, y0 + 9, 6, 1, '#17121c');
}

function drawCrate(g, x, baseY) {
  const s = 10;
  const x0 = x - 5;
  const y0 = baseY - s;
  fill(g, x0 - 1, y0 - 1, s + 2, s + 1, '#17121c');  // 외곽선
  fill(g, x0, y0, s, s - 1, '#8a6636');
  fill(g, x0, y0, s, 1, '#a8834a');                  // 윗면 하이라이트
  fill(g, x0, y0, 1, s - 1, '#a8834a');
  g.fillStyle = '#5f4423';
  g.fillRect(x0, y0 + s - 2, s, 1);                  // 아래 판자
  for (let i = 1; i < s - 1; i++) g.fillRect(x0 + i, y0 + i, 1, 1);  // 대각 보강재
}

function drawBarrel(g, x, baseY) {
  const bw = 10;
  const bh = 12;
  const x0 = x - 5;
  const y0 = baseY - bh;
  fill(g, x0 - 1, y0 + 1, bw + 2, bh - 2, '#17121c'); // 외곽선 (모서리 둥글림)
  fill(g, x0, y0, bw, 1, '#17121c');
  fill(g, x0, y0 + bh - 1, bw, 1, '#17121c');
  fill(g, x0, y0 + 1, bw, bh - 2, '#7a4a26');
  fill(g, x0 + 1, y0 + 1, 1, bh - 2, '#96613a');      // 왼쪽 하이라이트
  g.fillStyle = '#5a3419';
  g.fillRect(x0 + 4, y0 + 1, 1, bh - 2);              // 널 세로줄
  g.fillRect(x0 + 7, y0 + 1, 1, bh - 2);
  fill(g, x0, y0 + 3, bw, 1, '#2a2a33');              // 쇠테 2줄
  fill(g, x0, y0 + 8, bw, 1, '#2a2a33');
}

function drawTorch(g, x, baseY, sec, wx) {
  // 기둥 + 받침쇠
  fill(g, x - 1, baseY - 14, 3, 14, '#241708');
  fill(g, x - 1, baseY - 14, 1, 14, '#4a3018');
  fill(g, x - 2, baseY - 16, 5, 2, '#17121c');
  // 일렁임 — 시간 양자화 + hash (횃불마다 wx 로 위상이 다르다)
  const fi = Math.floor(sec * 9) + R(wx);
  const f1 = hash(fi, 7);
  const f2 = hash(fi, 8);
  const fh = 4 + R(f1 * 3);           // 불길 높이 4~7
  const sway = R(f2 * 2) - 1;         // -1..1 흔들림
  const fy = baseY - 17;
  // 글로우 → 불꽃 겉 → 속 → 심지 순서
  g.globalAlpha = 0.1 + f1 * 0.05;
  blob(g, x, fy - 2, 9, 7, '#ff9d5c');
  g.globalAlpha = 1;
  blob(g, x + sway * 0.6, fy - fh * 0.5, 2, fh * 0.5 + 1, '#ff7b2e');
  blob(g, x + sway * 0.4, fy - fh * 0.4, 1, fh * 0.4 + 1, '#ffd24a');
  g.fillStyle = '#fff6c8';
  g.fillRect(R(x), fy - 1, 1, 2);
  // 피어오르는 불티
  g.fillStyle = '#ffd24a';
  for (let i = 0; i < 3; i++) {
    const t = (sec * (0.45 + hash(i + R(wx), 11) * 0.4) + hash(i + R(wx), 12)) % 1;
    const ex = x + Math.sin(sec * 2 + i * 2.1 + wx) * 2;
    const ey = fy - 3 - t * 11;
    g.globalAlpha = (1 - t) * 0.8;
    g.fillRect(R(ex), R(ey), 1, 1);
  }
  g.globalAlpha = 1;
}

const PROP_DRAWERS = {
  sign: drawSign,
  palm: drawPalmProp,
  house: drawHouse,
  crate: drawCrate,
  barrel: drawBarrel,
  torch: drawTorch,
};

/** 관문 토템 — 요건 충족 시 룬이 금빛으로 깜빡인다 */
function drawGateTotem(g, x, baseY, sec, ready) {
  fill(g, x - 4, baseY - 24, 9, 24, '#17121c');       // 외곽선
  fill(g, x - 3, baseY - 23, 7, 23, '#4a4455');
  fill(g, x - 3, baseY - 23, 2, 23, '#5f5870');       // 왼쪽 밝은 면
  fill(g, x - 5, baseY - 27, 11, 4, '#17121c');
  fill(g, x - 4, baseY - 26, 9, 2, '#2e2a3a');        // 갓돌
  const on = ready ? 0.7 + Math.sin(sec * 3) * 0.3 : 0.25;
  g.globalAlpha = on;
  g.fillStyle = ready ? '#ffd24a' : '#6a6076';
  g.fillRect(x - 1, baseY - 20, 2, 2);                // 룬 무늬
  g.fillRect(x - 1, baseY - 16, 2, 5);
  g.fillRect(x - 3, baseY - 14, 6, 1);
  g.globalAlpha = 1;
}

/** NPC 머리 위 '…' 말풍선 */
function drawTalkBubble(g, cx, topY, sec) {
  const bob = Math.sin(sec * 3) > 0 ? 0 : 1;
  const x = R(cx - 5);
  const y = topY - 10 + bob;
  fill(g, x, y, 11, 7, '#17121c');                    // 테두리 (밑판)
  fill(g, x + 1, y + 1, 9, 5, '#f7f3ea');
  fill(g, x + 4, y + 7, 2, 1, '#17121c');             // 꼬리
  g.fillStyle = '#17121c';
  g.fillRect(x + 2, y + 3, 1, 1);
  g.fillRect(x + 5, y + 3, 1, 1);
  g.fillRect(x + 8, y + 3, 1, 1);
}

/** 받침 있는 낱말엔 '과', 없는 낱말엔 '와' */
function josa(word) {
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 > 0) return '과';
  return '와';
}

// ---------------- 메인 ----------------

export function runIsland(village, ctx) {
  const canvas = ctx.canvas;
  const promptEl = ctx.promptEl;
  const g = canvas.getContext('2d');
  const sfx = typeof ctx.sfx === 'function' ? ctx.sfx : () => {};
  const screenEl = canvas.closest ? canvas.closest('.screen') : null;

  const npcs = village.npcs || [];
  const props = village.props || [];
  const gate = village.gate || null;

  // 스프라이트 준비
  const playerFrames = buildPlayerFrames();
  const npcCanvases = new Map();
  npcs.forEach((npc) => {
    const chibi = npc.chibi || {};
    npcCanvases.set(npc.id, buildNpcCanvas(chibi.base, chibi.tint || '#cccccc'));
  });

  return new Promise((resolve) => {
    let w = MIN_SIDE;
    let h = MIN_SIDE;
    let rafId = 0;
    let lastT = 0;
    let done = false;

    const player = { x: 40, facing: 1, moving: false, animT: 0 };
    let camX = 0;
    const keys = new Set();
    const talked = new Set();
    let dialogueActive = false;
    let lockedUntil = 0;
    let wasInGate = false;
    let lastPrompt = null;

    function resize() {
      const vw = window.innerWidth || 800;
      const vh = window.innerHeight || 600;
      if (vw >= vh) {
        h = MIN_SIDE;
        w = R((MIN_SIDE * vw) / vh);
      } else {
        w = MIN_SIDE;
        h = R((MIN_SIDE * vh) / vw);
      }
      canvas.width = w;
      canvas.height = h;
      g.imageSmoothingEnabled = false;
    }

    function gateReady() {
      if (!gate) return false;
      return (gate.requires || []).every((id) => talked.has(id));
    }

    /** 지금 Space 로 실행할 수 있는 대상 — NPC > 관문 > 배 복귀 순 */
    function currentTarget() {
      let best = null;
      let bestD = TALK_DIST;
      for (const npc of npcs) {
        const d = Math.abs(player.x - npc.x);
        if (d < bestD) { best = npc; bestD = d; }
      }
      if (best) return { kind: 'npc', npc: best };
      if (gate && Math.abs(player.x - gate.x) < GATE_DIST) return { kind: 'gate' };
      if (player.x < LEAVE_X) return { kind: 'leave' };
      return null;
    }

    /** 대화 오버레이 뒤에서 섬 화면이 꺼졌으면 되살린다 */
    function restoreScreen() {
      if (!screenEl || screenEl.classList.contains('active')) return;
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
      screenEl.classList.add('active');
    }

    function startTalk(npc) {
      dialogueActive = true;
      keys.clear();
      sfx('talk');
      return Promise.resolve(ctx.runDialogue(npc.lines || [])).then(() => {
        talked.add(npc.id);
        dialogueActive = false;
        restoreScreen();
      });
    }

    /** 관문 시도 — 충족이면 보스로 resolve, 아니면 잠김 안내. 반환값: 통과 여부 */
    function tryGate() {
      if (done || !gate) return false;
      if (gateReady()) {
        finish('boss');
        return true;
      }
      lockedUntil = performance.now() + LOCKED_MS;
      sfx('cancel');
      return false;
    }

    function tryInteract() {
      if (done || dialogueActive) return;
      const tgt = currentTarget();
      if (!tgt) return;
      if (tgt.kind === 'npc') startTalk(tgt.npc);
      else if (tgt.kind === 'gate') tryGate();
      else finish('leave');
    }

    // ---- 입력 ----

    function dirOf(key) {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left';
      if (key === 'ArrowRight' || key === 'd' || key === 'D') return 'right';
      return null;
    }

    function onKeyDown(e) {
      const dir = dirOf(e.key);
      if (dir) {
        e.preventDefault();
        keys.add(dir);
        return;
      }
      if (e.key === ' ' || e.code === 'Space' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (!e.repeat) tryInteract();
      }
    }

    function onKeyUp(e) {
      const dir = dirOf(e.key);
      if (dir) keys.delete(dir);
    }

    function onPromptClick(e) {
      e.preventDefault();
      promptEl.blur();
      tryInteract();
    }

    // ---- 갱신/렌더 ----

    function update(dt, now) {
      if (!dialogueActive) {
        let dir = 0;
        if (keys.has('left')) dir -= 1;
        if (keys.has('right')) dir += 1;
        if (dir !== 0) {
          player.x = Math.max(8, Math.min(village.width - 8, player.x + dir * WALK_SPEED * dt));
          player.facing = dir;
          player.animT += dt;
          player.moving = true;
        } else {
          player.moving = false;
        }
      } else {
        player.moving = false;
      }

      // 카메라 — 플레이어 추적 + 마을 경계 클램프
      const camMax = Math.max(0, village.width - w);
      const camTarget = Math.max(0, Math.min(camMax, player.x - w * 0.5));
      camX += (camTarget - camX) * Math.min(1, dt * 6);

      // 관문 접근 — 요건 미충족이면 진입 순간 잠김 안내
      const inGate = !!gate && Math.abs(player.x - gate.x) < GATE_DIST;
      if (inGate && !wasInGate && !gateReady()) {
        lockedUntil = now + LOCKED_MS;
        sfx('cancel');
      }
      wasInGate = inGate;

      // 프롬프트 버튼
      let text = '';
      if (!dialogueActive) {
        if (gate && now < lockedUntil) {
          text = gate.lockedMsg || '';
        } else {
          const tgt = currentTarget();
          if (tgt) {
            if (tgt.kind === 'npc') text = `💬 ${tgt.npc.name}${josa(tgt.npc.name)} 이야기한다 (Space)`;
            else if (tgt.kind === 'gate') text = `${gate.label} (Space)`;
            else text = '⛵ 배로 돌아간다 (Space)';
          }
        }
      }
      if (text !== lastPrompt) {
        lastPrompt = text;
        promptEl.textContent = text;
        promptEl.hidden = !text;
      }
    }

    function drawGround() {
      const groundY = R(h * (1 - GROUND_RATIO));
      const camI = Math.floor(camX);
      fill(g, 0, groundY, w, h - groundY, village.groundColor);
      fill(g, 0, groundY, w, 2, village.groundTop);
      // 윗선 디더 이음 (월드 좌표 기준 — 카메라와 함께 흐른다)
      g.fillStyle = village.groundTop;
      for (let x = 0; x < w; x++) {
        if ((x + camI) % 2 === 0) g.fillRect(x, groundY + 2, 1, 1);
      }
      // 픽셀 텍스처 — 흙 알갱이와 풀포기
      const dark = shade(village.groundColor, 0.62);
      const lite = lighten(village.groundTop, 0.22);
      for (let x = 0; x < w; x++) {
        const wx = x + camI;
        const r1 = hash(wx, 91);
        if (r1 > 0.88) {
          const yy = groundY + 4 + Math.floor(hash(wx, 92) * (h - groundY - 6));
          fill(g, x, yy, 1 + (hash(wx, 94) > 0.7 ? 1 : 0), 1, dark);
        } else if (r1 < 0.05) {
          const yy = groundY + 3 + Math.floor(hash(wx, 95) * (h - groundY - 5));
          fill(g, x, yy, 1, 1, lite);
        }
        if (hash(wx, 96) > 0.93) fill(g, x, groundY - 1, 1, 1, lite); // 풀포기
      }
      return groundY;
    }

    function drawSprite(img, sx, sy, flip) {
      if (flip) {
        g.save();
        g.translate(sx + img.width, sy);
        g.scale(-1, 1);
        g.drawImage(img, 0, 0);
        g.restore();
      } else {
        g.drawImage(img, sx, sy);
      }
    }

    function render(sec) {
      // [배경] bgscenes 씬을 백드롭으로
      const scene = SCENES[village.bg] || SCENES[DEFAULT_SCENE];
      g.save();
      scene(g, { w, h, sec });
      g.restore();

      // [지면]
      const groundY = drawGround();
      const standY = groundY + 5;   // 발이 지면 띠에 살짝 파묻히는 기준선
      const camI = Math.floor(camX);

      // [소품]
      for (const prop of props) {
        const sx = R(prop.x - camI);
        if (sx < -60 || sx > w + 60) continue;
        const fn = PROP_DRAWERS[prop.type];
        if (fn) fn(g, sx, standY, sec, prop.x);
      }

      // [관문 토템]
      if (gate) {
        const gx = R(gate.x - camI);
        if (gx > -30 && gx < w + 30) drawGateTotem(g, gx, standY, sec, gateReady());
      }

      // [NPC] — 미세 바빙, 플레이어 쪽 보기, 근접 시 말풍선
      npcs.forEach((npc, i) => {
        const img = npcCanvases.get(npc.id);
        if (!img) return;
        const sx = R(npc.x - camI) - (img.width >> 1);
        if (sx < -40 || sx > w + 40) return;
        const bob = Math.sin(sec * 2 + i * 1.9) > 0 ? 0 : 1;
        const sy = standY - img.height + bob;
        drawSprite(img, sx, sy, player.x < npc.x);
        if (!dialogueActive && Math.abs(player.x - npc.x) < TALK_DIST) {
          drawTalkBubble(g, R(npc.x - camI), sy, sec);
        }
      });

      // [플레이어]
      let img = playerFrames.idle;
      let hop = 0;
      if (player.moving) {
        const f = Math.floor(player.animT * 6) % 2;
        img = f === 0 ? playerFrames.walkA : playerFrames.walkB;
        hop = f === 1 ? -1 : 0;
      } else {
        hop = Math.sin(sec * 2.4) > 0 ? 0 : 1;
      }
      const px = R(player.x - camI) - (img.width >> 1);
      drawSprite(img, px, standY - img.height + hop, player.facing < 0);
    }

    function frame(t) {
      if (done) return;
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      update(dt, t);
      render(t / 1000);
      rafId = requestAnimationFrame(frame);
    }

    // ---- 종료/정리 ----

    function finish(result) {
      if (done) return;
      done = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      promptEl.removeEventListener('click', onPromptClick);
      promptEl.hidden = true;
      if (window.__island === dbg) delete window.__island;
      resolve({ result });
    }

    // 디버그/통합 테스트 훅 — talk/gate 는 거리와 무관하게 강제 실행
    const dbg = {
      get x() { return player.x; },
      talk(id) {
        const npc = npcs.find((n) => n.id === id);
        if (!npc || dialogueActive || done) return Promise.resolve(false);
        return startTalk(npc).then(() => true);
      },
      gate() { return tryGate(); },
    };
    window.__island = dbg;

    // ---- 시작 ----
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    promptEl.addEventListener('click', onPromptClick);
    promptEl.hidden = true;
    rafId = requestAnimationFrame(frame);
  });
}
