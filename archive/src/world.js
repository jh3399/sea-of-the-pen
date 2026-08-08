// 세계 데이터 (STORY.md v5) — 바다, 섬 3곳 + 고향 + 황금섬, 도안 3장, 마을, 수호자.
//
// 진행: 나루 마을(고향) → 덩굴섬 → 거울섬 → 얼음섬 → [바람호 건조 → 돌풍] → 황금섬 → 고향 귀환
// 도안이 3장인 건 실제 선박 도면(선도)이 측면도·반폭도·정면도 3면으로 이뤄지기 때문이다.
// 세 장이 다 모여야 선체 형태가 완전히 정의된다 — 수집 동기가 신화가 아니라 공학적 사실이다.

export const SEA = { w: 1400, h: 900 };
export const START = { x: 210, y: 760 };   // 나루 마을 앞바다

// 도안 세 장 = 선도 3면
export const PIECES = [
  {
    id: 'sheer',
    icon: '📐',
    name: '측면도',
    en: 'Sheer Plan',
    view: '옆에서 본 그림',
    effect: '갑판 곡선과 뱃머리·고물의 형태가 정해진다',
  },
  {
    id: 'halfbreadth',
    icon: '🪞',
    name: '반폭도',
    en: 'Half-Breadth Plan',
    view: '위에서 본 그림',
    effect: '배는 좌우가 같아 절반만 그린다. 나머지는 거울로 뜬다',
  },
  {
    id: 'body',
    icon: '🧊',
    name: '정면도',
    en: 'Body Plan',
    view: '앞뒤에서 본 그림',
    effect: '여러 위치의 단면을 겹쳐 그려 배의 속을 정한다',
  },
];

// 펜 — 실력이 아니라 재료를 정한다. 같은 그림이 펜에 따라 다른 배가 된다.
export const PENS = {
  none: { name: '낡은 펜',  ink: '#8a8a8a', ship: '(실체가 되지 않는다)',
          desc: '잉크에 절어 본 적이 없어 그림이 종이에만 남는다.' },
  wood: { name: '나무 펜',  ink: '#c89a5c', ship: '목선(木船)',
          desc: '세렌의 몸을 깎아 만들었다. 가볍고 빠르지만 큰 바람은 못 견딘다.' },
  iron: { name: '철 펜',    ink: '#9fb4c4', ship: '철갑선(鐵甲船)',
          desc: '얼어붙은 배들의 철을 녹여 만들었다. 무겁지만 부서지지 않는다.' },
  gold: { name: '황금 펜',  ink: '#ffd24a', ship: '―',
          desc: '펜촉에 바다의 잉크가 그대로 차올랐다.' },
};
export const penInk = (key) => (PENS[key] || PENS.wood).ink;

export const ISLANDS = [
  // ── 고향. 항상 열려 있고 언제든 돌아올 수 있다 ─────────────────
  {
    key: 'naru',
    name: '나루 마을',
    kind: 'home',
    x: 210, y: 760, r: 58,
    bg: 'village_pale',
    music: 'village',
    piece: null,
    village: {
      key: 'naru',
      name: '나루 마을',
      bg: 'village_pale',
      width: 720,
      groundColor: '#4a4238',
      groundTop: '#6b5a3a',
      props: [
        { type: 'sign', x: 90 },
        { type: 'house', x: 170 }, { type: 'house', x: 300 },
        { type: 'crate', x: 250 }, { type: 'barrel', x: 268 },
        { type: 'house', x: 450 },
        { type: 'palm', x: 540 }, { type: 'torch', x: 620 },
      ],
      npcs: [
        {
          id: 'chief', name: '촌장', bust: 'examiner', x: 200,
          chibi: { base: 'capy', tint: '#9a8b98' },
          linesKey: 'NARU_CHIEF',
        },
        {
          id: 'kid', name: '마을 아이', x: 380,
          chibi: { base: 'parrot', tint: '#e8cba4' },
          linesKey: 'NARU_KID',
        },
      ],
      gate: {
        x: 670,
        label: '🌫 유리 숲으로',
        action: 'boss',
        requires: [],
        lockedMsg: '',
      },
    },
    boss: null,
  },

  // ── 1막. 덩굴섬 — 측면도 / 가르 / 땅 ──────────────────────────
  {
    key: 'vine',
    name: '덩굴섬',
    kind: 'island',
    act: 1,
    x: 520, y: 640, r: 60,
    bg: 'jungle_green',
    music: 'village',
    piece: 'sheer',
    village: {
      key: 'vine',
      name: '덩굴섬 — 덩굴 마을',
      bg: 'jungle_green',
      width: 780,
      groundColor: '#2e2a12',
      groundTop: '#5f4d16',
      props: [
        { type: 'sign', x: 96 },
        { type: 'palm', x: 150 }, { type: 'palm', x: 205 },
        { type: 'house', x: 285 },
        { type: 'crate', x: 345 }, { type: 'barrel', x: 364 },
        { type: 'house', x: 470 },
        { type: 'palm', x: 548 },
        { type: 'torch', x: 610 }, { type: 'torch', x: 700 },
      ],
      npcs: [
        {
          id: 'riko', name: '리코', x: 300,
          chibi: { base: 'parrot', tint: '#3fd27f' },
          linesKey: 'VINE_RIKO',
        },
        {
          id: 'popo', name: '포포 장로', bust: 'examiner', x: 495,
          chibi: { base: 'capy', tint: '#b98a5a' },
          linesKey: 'VINE_POPO',
        },
      ],
      gate: {
        x: 730,
        label: '⚔ 가르의 신전으로',
        action: 'boss',
        requires: ['popo'],
        lockedMsg: '포포 장로: "그리는 법부터 배우게. 지금 실력으론 문턱도 못 넘어."',
      },
    },
    boss: {
      name: '가르',
      title: '수풀의 파수꾼',
      sprite: 'gar',
      maxHp: 280,
      weaknesses: ['weapon', 'light'],
      resists: [],
      bg: 'jungle_green',
      drawPrompt: '🎨 결정을 깨고 색을 되돌려라!',
      introLog: '세렌: "죽이지 마. 결정을 깨. 뭐든 그려서 저 안에 색을 넣어."',
      attackName: '할퀴기',
      attackMin: 10,
      attackMax: 22,
      situation: '수호자 가르 — 자주빛 결정에 덮여 미쳐 있다. 플레이어에게 색을 되돌릴 그림을 그리라고 요청함',
      reward: { id: 'gar_fur', icon: '✨', name: '가르의 금빛 털', desc: '색이 돌아온 가르가 남겨 준 털 한 줌.' },
    },
  },

  // ── 2막. 거울섬 — 반폭도 / 나르 / 바다 ────────────────────────
  {
    key: 'mirror',
    name: '거울섬',
    kind: 'island',
    act: 2,
    x: 880, y: 430, r: 58,
    bg: 'mirror_fog',
    music: 'tension',
    piece: 'halfbreadth',
    village: {
      key: 'mirror',
      name: '거울섬 — 물가 마을',
      bg: 'mirror_fog',
      width: 720,
      groundColor: '#4a4f52',
      groundTop: '#7d8489',
      props: [
        { type: 'sign', x: 90 },
        { type: 'house', x: 200 }, { type: 'barrel', x: 265 },
        { type: 'house', x: 380 }, { type: 'crate', x: 445 },
        { type: 'torch', x: 540 },
      ],
      npcs: [
        {
          id: 'mira', name: '미라', x: 260,
          chibi: { base: 'bird', tint: '#cfe0ea' },
          linesKey: 'MIRROR_MIRA',
        },
      ],
      gate: {
        x: 665,
        label: '⚔ 거울 물가로',
        action: 'boss',
        requires: ['mira'],
        lockedMsg: '세렌: "잠깐. 마을 사람 얘기부터 듣고 가자."',
      },
    },
    boss: {
      name: '나르',
      title: '거울 물의 수호자',
      sprite: 'nar',
      maxHp: 340,
      weaknesses: ['light', 'wind'],
      resists: ['water'],
      bg: 'mirror_fog',
      drawPrompt: '🎨 결정을 깨고 색을 되돌려라!',
      introLog: '세렌: "두 마리 아니야. 하나야. 물에 비친 거."',
      attackName: '물결치기',
      attackMin: 14,
      attackMax: 26,
      situation: '수호자 나르 — 물에 비친 자신과 한 쌍으로 움직이는 거대한 흰 가오리',
      reward: { id: 'nar_scale', icon: '🪞', name: '나르의 비늘', desc: '보는 각도에 따라 색이 바뀐다.' },
    },
  },

  // ── 3막. 얼음섬 — 정면도 / 툰 / 하늘 ──────────────────────────
  {
    key: 'ice',
    name: '얼음섬',
    kind: 'island',
    act: 3,
    x: 1180, y: 200, r: 60,
    bg: 'iceberg',
    music: 'tension',
    piece: 'body',
    village: {
      key: 'ice',
      name: '얼음섬 — 얼음 나루',
      bg: 'iceberg',
      width: 700,
      groundColor: '#3d5766',
      groundTop: '#7fb3c4',
      props: [
        { type: 'sign', x: 90 },
        { type: 'house', x: 210 }, { type: 'crate', x: 280 },
        { type: 'barrel', x: 300 }, { type: 'house', x: 420 },
        { type: 'torch', x: 500 },
      ],
      npcs: [
        {
          id: 'kori', name: '코리', x: 250,
          chibi: { base: 'capy', tint: '#a8c4d4' },
          linesKey: 'ICE_KORI',
        },
      ],
      gate: {
        x: 650,
        label: '⚔ 빙벽 꼭대기로',
        action: 'boss',
        requires: ['kori'],
        lockedMsg: '세렌: "저 위는 위험해. 먼저 얘기 좀 듣고 가자."',
      },
    },
    boss: {
      name: '툰',
      title: '흰 하늘의 수호자',
      sprite: 'tun',
      maxHp: 400,
      weaknesses: ['fire', 'light'],
      resists: ['ice'],
      bg: 'iceberg',
      drawPrompt: '🎨 결정을 깨고 색을 되돌려라!',
      introLog: '툰: "내가 무슨 색이었는지 나도 잊었다. 400년이나 이러고 있었으니."',
      attackName: '내리치기',
      attackMin: 16,
      attackMax: 30,
      situation: '수호자 툰 — 빙벽 꼭대기의 거대한 새. 결정에 덮여 원래 모습을 알 수 없다',
      reward: { id: 'tun_feather', icon: '🪶', name: '툰의 깃털', desc: '결정이 깨지고 나온 첫 깃털. 툰도 잊었던 색이다.' },
    },
  },

  // ── 5막. 황금섬 — 최종전. 도안 3장을 다 모아야 열린다 ─────────
  {
    key: 'golden',
    name: '황금섬',
    kind: 'final',
    x: 1100, y: 690, r: 66,
    bg: 'golden_isle',
    music: 'tension',
    piece: null,
    village: null,
    boss: {
      name: '네일',
      title: '검은 함장',
      sprite: 'nail',
      maxHp: 520,
      weaknesses: [],
      resists: [],
      bg: 'golden_isle',
      drawPrompt: '✏️ 새로운 것을 그려라!',
      introLog: '세렌: "조심해! 저 자식 네 그림을 그대로 따라 해!"',
      attackName: '베끼기',
      attackMin: 18,
      attackMax: 34,
      situation: '최종전 — 상대는 스스로 그리지 못하고 베끼기만 한다. 플레이어는 매번 새로운 것을 그려야 한다',
      /** 이번 판에 이미 쓴 그림은 복제당해 무효가 된다 (창조 vs 약탈) */
      copycat: true,
      reward: null,
    },
  },
];

export const islandByKey = (key) => ISLANDS.find((i) => i.key === key);
export const pieceById = (id) => PIECES.find((p) => p.id === id);

/** 도안을 얻는 순서대로 나열한 섬 (고향·최종전 제외) */
export const ACT_ISLANDS = ISLANDS.filter((i) => i.kind === 'island');

/** 진행 상태를 반영해 sail.js에 넘길 섬 목록 */
export function islandsWithProgress(cleared, pieceCount) {
  return ISLANDS.map((isl) => {
    let locked = false;
    if (isl.kind === 'final') {
      locked = pieceCount < PIECES.length;          // 도안 3장을 다 모아야 열린다
    } else if (isl.kind === 'island') {
      const idx = ACT_ISLANDS.findIndex((a) => a.key === isl.key);
      locked = idx > 0 && !cleared.includes(ACT_ISLANDS[idx - 1].key);
    }
    return { ...isl, locked, cleared: cleared.includes(isl.key) };
  });
}

/** 다음 목적지 */
export function nextTargetKey(cleared, pieceCount) {
  if (pieceCount >= PIECES.length) return 'golden';
  const next = ACT_ISLANDS.find((i) => !cleared.includes(i.key));
  return next ? next.key : 'golden';
}
