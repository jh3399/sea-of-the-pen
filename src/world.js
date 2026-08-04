// 세계 지도 데이터 — 바다 크기, 섬 7곳 + 최종전, 도안 조각, 마을(NPC·소품), 보스.
// 항해(sail.js)와 섬 탐험(island.js)은 이 데이터를 받아서 그대로 렌더한다.
// 진행 규칙: 섬 N은 섬 N-1을 클리어해야 열린다. 최종전은 조각 7개를 모아야 열린다.

export const SEA = { w: 1500, h: 1000 };
export const START = { x: 190, y: 830 };   // 출항 부두 앞바다

// 도안 조각 7개 (docs/STORY.md의 표와 1:1)
export const PIECES = [
  { id: 'hull',       icon: '🛡', name: '강한 선체',   effect: '배 체력 증가' },
  { id: 'sail',       icon: '🌬', name: '순풍의 돛',   effect: '회피율 증가' },
  { id: 'rudder',     icon: '⏱', name: '키',          effect: '그리기 시간 연장' },
  { id: 'anchor',     icon: '⚓', name: '닻',          effect: '보스를 한 턴 묶는다' },
  { id: 'cannon',     icon: '💥', name: '대포',        effect: '공격력 증가' },
  { id: 'lantern',    icon: '🏮', name: '등불',        effect: '어둠·안개 기믹 무효' },
  { id: 'figurehead', icon: '⭐', name: '뱃머리',      effect: '세렌 부활 · 힌트 강화' },
];

export const ISLANDS = [
  {
    key: 'gar',
    name: '황금 수풀섬',
    x: 420, y: 700, r: 62,
    bg: 'jungle_gold',
    music: 'village',
    piece: 'hull',
    village: {
      key: 'gar',
      name: '황금 수풀섬 — 야자 마을',
      bg: 'jungle_gold',
      width: 780,
      groundColor: '#3a300f',
      groundTop: '#5f4d16',
      props: [
        { type: 'sign', x: 96, label: '야자 마을' },
        { type: 'palm', x: 150 }, { type: 'palm', x: 205 },
        { type: 'house', x: 280 },
        { type: 'crate', x: 342 }, { type: 'barrel', x: 362 },
        { type: 'house', x: 470 },
        { type: 'palm', x: 545 },
        { type: 'torch', x: 600 }, { type: 'torch', x: 700 },
      ],
      npcs: [
        {
          id: 'seren', name: '세렌', bust: 'seren', x: 130,
          chibi: { base: 'bird', tint: '#f2f6fb' },
          lines: [
            { speaker: '세렌', sprite: 'seren', text: '여기가 황금 수풀섬이야. 공기에서 잉크 냄새가 나… 도안 조각이 가까워.' },
            { speaker: '세렌', sprite: 'seren', text: '무작정 쳐들어가는 건 초보 항해사나 하는 짓이야. 마을 사람들 얘기부터 들어보자.' },
            { speaker: '세렌', sprite: 'seren', text: '준비되면 섬 안쪽 — 가르의 신전으로 가.' },
          ],
        },
        {
          id: 'riko', name: '리코', x: 310,
          chibi: { base: 'parrot', tint: '#3fd27f' },
          lines: [
            { speaker: '리코', text: '어서 와! 못 보던 얼굴이네. 그 배… 직접 그렸어? 요즘 보기 드문 정직한 선이야.' },
            { speaker: '리코', text: '가르 님? 원래는 섬을 지키는 착한 수호자였어. 검은 배가 다녀간 뒤로 눈이 붉어졌지만….' },
            { speaker: '리코', text: '빈손으로 신전에 가지 마. 뭐든 "그려서" 들고 가라구. 여기 바다에선 그림이 곧 물건이니까.' },
          ],
        },
        {
          id: 'popo', name: '포포 장로', x: 500,
          chibi: { base: 'capy', tint: '#b98a5a' },
          lines: [
            { speaker: '포포 장로', text: '허허, 모루 영감의 잉크 냄새가 나는구먼. 자네, 펜을 쓰는 아이인가.' },
            { speaker: '포포 장로', text: '신전 제단에 반짝이는 종이가 있다는 소문이야. 도안 조각… 영감이 남긴 것이지.' },
            { speaker: '포포 장로', text: '가르를 미워하진 말게. 저 아이도 검은 잉크의 피해자라네.' },
          ],
        },
      ],
      gate: {
        x: 730,
        label: '⚔ 가르의 신전으로',
        action: 'boss',
        requires: ['seren'],
        lockedMsg: '세렌: "잠깐! 먼저 나랑 얘기 좀 해. 부두 쪽에 있어."',
      },
    },
    boss: {
      name: '황금 재규어 가르',
      sprite: 'gar',
      maxHp: 300,
      weaknesses: ['weapon'],
      resists: [],
      bg: 'jungle_gold',
      drawPrompt: '⚔️ 무기를 그려라!',
      introLog: '세렌: "저 재규어는 무기에 약해! 뭐든 무기를 그려봐!"',
      attackName: '할퀴기',
      attackMin: 12,
      attackMax: 26,
      situation: '보스전(황금 재규어) — 플레이어에게 무기를 그리라고 요청함',
      reward: { id: 'gar_whisker', icon: '✨', name: '가르의 금빛 수염', desc: '제정신을 찾은 가르가 뽑아 준 수염. 반짝인다.' },
      winLines: [
        { speaker: '', text: '검은 잉크가 걷히고, 가르의 눈이 금빛으로 돌아온다.' },
        { speaker: '세렌', sprite: 'seren', text: '해냈어! 제단의 종이 — 그게 도안 조각이야!' },
      ],
    },
  },
  { key: 'pira', name: '불뱀 화산섬', x: 760, y: 780, r: 58, bg: 'volcano', music: 'village', piece: 'sail', village: null, boss: null },
  { key: 'nar', name: '해 없는 바다', x: 1050, y: 660, r: 55, bg: 'night_storm', music: 'tension', piece: 'rudder', village: null, boss: null },
  { key: 'tun', name: '얼음 무덤섬', x: 1250, y: 420, r: 58, bg: 'iceberg', music: 'village', piece: 'anchor', village: null, boss: null },
  { key: 'echo', name: '거울 안개섬', x: 950, y: 300, r: 55, bg: 'mirror_fog', music: 'tension', piece: 'cannon', village: null, boss: null },
  { key: 'muna', name: '배들의 무덤', x: 620, y: 220, r: 58, bg: 'shipyard_grave', music: 'tension', piece: 'lantern', village: null, boss: null },
  { key: 'workshop', name: '모루의 공방', x: 300, y: 260, r: 55, bg: 'workshop', music: 'village', piece: 'figurehead', village: null, boss: null },
  { key: 'final', name: '세계의 끝', x: 130, y: 70, r: 65, bg: 'world_end', music: 'tension', piece: null, village: null, boss: null },
];

export const islandByKey = (key) => ISLANDS.find((i) => i.key === key);
export const pieceById = (id) => PIECES.find((p) => p.id === id);

/** 진행 상태(cleared 목록)를 반영해 sail.js에 넘길 섬 목록을 만든다 */
export function islandsWithProgress(cleared, pieceCount) {
  return ISLANDS.map((isl, i) => {
    let locked;
    if (isl.key === 'final') locked = pieceCount < 7;
    else locked = i > 0 && !cleared.includes(ISLANDS[i - 1].key);
    return { ...isl, locked, cleared: cleared.includes(isl.key) };
  });
}

/** 다음 목적지 — 아직 클리어하지 않은 첫 섬 */
export function nextTargetKey(cleared, pieceCount) {
  const list = islandsWithProgress(cleared, pieceCount);
  const next = list.find((i) => !i.cleared && !i.locked);
  return next ? next.key : 'final';
}
