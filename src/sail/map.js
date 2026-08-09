// 항해 화면의 임시 맵 데이터 — `docs/d3_handoff.md` §S4 의 `src/maps/maps.json` 이 아직
// 구현 전이라, `main.js` 의 `DEMO_GOAL`/`startTurretDrill` 과 같은 처지의 하드코딩이다.
// S4 가 `session.js` + `maps.json` 을 갖추면 이 파일은 그 맵 하나를 읽는 걸로 대체된다.
//
// 이 화면은 손상 파이프라인을 연결하지 않는다 — 암초는 `physics/obstacle.js` 의 정적 강체라
// `hull` 이 없고, 배는 부딪히면 물리적으로만 막힌다 (파손 없음).
//
// ★ 암초는 **화면 한 폭보다 넓게** 깔아야 한다. 항해 화면의 줌은 20 px/m 이라 한 화면에
//   담기는 것이 대략 70 m × 40 m 다 — 골까지의 항로(x=0→150) 주변에만 깔면 y 로 스무 걸음만
//   벗어나도 텅 빈 바다가 나오고, 그러면 "암초 사이를 지난다"가 아니라 "옆으로 돌아가면
//   끝"이 된다. 아래 암초밭은 해역 전체(±75 m)를 덮어 우회에도 대가가 있게 만든다.

/** 항해 가능한 해역. 이 사각형 밖은 `boundaryWalls` 가 만드는 암초 벽으로 막혀 있다. */
export const SEA_BOUNDS = { minX: -45, maxX: 178, minY: -75, maxY: 75, thickness: 14 };

/**
 * 0장 「연습 해역」 — 시작의 섬으로 가는 첫 구간.
 *
 * ★ **튜토리얼 스테이지가 아니라 항해의 첫 구간이다.** 그리기 튜토리얼(`draw/tutorial.js`)이
 *   설계 화면을 가르치는 동안 항해 조작은 한 글자도 안 가르치는데, 그 다음이 곧바로 암초
 *   열한 개였다. 여기는 그 사이를 메운다 — 다만 화면에 "연습"이라고 쓰지 않는다.
 *   S-05 에서 출항한 배가 첫 섬에 닿는 것이고, 그래서 제4의 벽이 안 생긴다.
 *
 * ★ **골을 정면에 두지 않는 것이 이 맵의 전부다.** (40, 34) 는 뱃머리에서 40° 옆이라
 *   ↑ 만 눌러서는 절대 닿지 않는다. 조작을 설명하는 대신 **하게 만든다** —
 *   이 게임이 "자기 자리를 안 남긴 배는 못 태운다"를 말로만 하고 규칙으로 막는 것과 같다.
 *   덤으로 세 조작의 차이를 여기서 몸으로 겪는다 (CLAUDE.md D3 의 실측):
 *     ↑        양쪽 노 → 직진
 *     ← 단독   제자리 선회 (반경 2.5 m · 1.69 m/s — 느리다)
 *     ↑ + ←    넓은 선회 (반경 10.5 m · 3.67 m/s — 빠르다)  ← 아무도 안 알려주는 핵심
 *
 * ★ 암초는 **다섯 개뿐이고 항로를 막지 않는다.** 골로 가는 호(弧) 바깥에 놓아서, 부딪히려면
 *   일부러 가야 한다. "피한다"는 감각만 주고 벌은 주지 않는다 — 연습에서 1별을 받으면
 *   배우는 게 아니라 혼나는 것이다. 별 기준을 넉넉하게 둔 것도 같은 이유다.
 *
 * ★ 해역이 좁다 (±48). 넓은 바다에서 방향을 잃는 것 자체가 초반 좌절의 큰 몫이고,
 *   경계가 암초 벽이라 벗어나려 하면 지형이 알아서 돌려보낸다 (경계 전용 코드 0줄).
 */
export const PRACTICE_BOUNDS = { minX: -40, maxX: 80, minY: -48, maxY: 62, thickness: 12 };

export const PRACTICE_MAP = {
  goal: { x: 40, y: 34, radius: 7, label: '시작의 섬' },
  // 노만 단 배의 종단이 4.66 m/s 이고 여기까지가 53 m 다. 직선으로 가도 12초는 걸리는데,
  // 돌면서 가느라 훨씬 더 든다 — 45초는 "돌 줄 몰라 헤매도 3별"이 되는 값이다.
  scoring: { threeStarMaxSeconds: 45, twoStarMaxSeconds: 75 },
  bounds: PRACTICE_BOUNDS,
  obstacles: [
    // 골로 가는 호의 **바깥**. 지나는 길에 보이지만 부딪히려면 일부러 가야 한다.
    { shape: 'circle', x: 8, y: 30, radius: 5 },
    { shape: 'circle', x: 22, y: -14, radius: 4.5 },
    { shape: 'circle', x: 58, y: 6, radius: 5 },
    { shape: 'circle', x: 62, y: 48, radius: 4 },
    { shape: 'circle', x: -18, y: 12, radius: 4.5 },
  ].map((o) => ({ ...o, material: 'rock' })),
};

/** 출항 지점(원점) 기준. 뱃머리(+X) 방향으로 흩어진 암초 사이를 지나 도착점까지. */
export const DEMO_MAP = {
  goal: { x: 150, y: 0, radius: 6, label: '도착' },
  scoring: { threeStarMaxSeconds: 60, twoStarMaxSeconds: 90 },
  bounds: SEA_BOUNDS,
  obstacles: [
    // 항로 위 (원래 11개) — 골까지의 직선을 막아 지그재그를 강요하는 핵심 배치.
    { shape: 'circle', x: 25, y: 10, radius: 4 },
    { shape: 'circle', x: 35, y: -12, radius: 3 },
    { shape: 'circle', x: 50, y: 6, radius: 5 },
    { shape: 'circle', x: 60, y: 22, radius: 3 },
    { shape: 'circle', x: 65, y: -8, radius: 3.5 },
    { shape: 'circle', x: 78, y: 14, radius: 4.5 },
    { shape: 'circle', x: 85, y: -24, radius: 4 },
    { shape: 'circle', x: 92, y: -14, radius: 3 },
    { shape: 'circle', x: 105, y: 4, radius: 5 },
    { shape: 'circle', x: 118, y: -10, radius: 3.5 },
    { shape: 'circle', x: 130, y: 12, radius: 4 },
    // 우현 쪽 바깥 바다 (y > 0) — 항로를 크게 우회해도 계속 암초를 만난다.
    { shape: 'circle', x: 15, y: 30, radius: 4 },
    { shape: 'circle', x: 18, y: 52, radius: 4.5 },
    { shape: 'circle', x: 28, y: 34, radius: 4.5 },
    { shape: 'circle', x: 30, y: 60, radius: 4 },
    { shape: 'circle', x: 42, y: 20, radius: 3 },
    { shape: 'circle', x: 44, y: 45, radius: 5 },
    { shape: 'circle', x: 55, y: 36, radius: 3.5 },
    { shape: 'circle', x: 58, y: 58, radius: 4 },
    { shape: 'circle', x: 68, y: 48, radius: 3.5 },
    { shape: 'circle', x: 70, y: 30, radius: 4.5 },
    { shape: 'circle', x: 80, y: 40, radius: 4 },
    { shape: 'circle', x: 82, y: 62, radius: 5 },
    { shape: 'circle', x: 95, y: 22, radius: 4 },
    { shape: 'circle', x: 96, y: 50, radius: 3.5 },
    { shape: 'circle', x: 108, y: 32, radius: 5 },
    { shape: 'circle', x: 110, y: 56, radius: 4 },
    { shape: 'circle', x: 120, y: 20, radius: 4 },
    { shape: 'circle', x: 122, y: 44, radius: 3.5 },
    { shape: 'circle', x: 124, y: 60, radius: 4 },
    { shape: 'circle', x: 135, y: 34, radius: 4.5 },
    { shape: 'circle', x: 138, y: 50, radius: 3 },
    { shape: 'circle', x: 141, y: 13, radius: 3 },
    { shape: 'circle', x: 145, y: 26, radius: 4 },
    { shape: 'circle', x: 148, y: 58, radius: 4.5 },
    { shape: 'circle', x: 160, y: 14, radius: 4 },
    { shape: 'circle', x: 162, y: 40, radius: 5 },
    { shape: 'circle', x: 165, y: 62, radius: 4 },
    // 좌현 쪽 바깥 바다 (y < 0).
    { shape: 'circle', x: 15, y: -34, radius: 3.5 },
    { shape: 'circle', x: 18, y: -55, radius: 5 },
    { shape: 'circle', x: 30, y: -44, radius: 3 },
    { shape: 'circle', x: 42, y: -28, radius: 4 },
    { shape: 'circle', x: 44, y: -60, radius: 4.5 },
    { shape: 'circle', x: 55, y: -40, radius: 4 },
    { shape: 'circle', x: 58, y: -18, radius: 3 },
    { shape: 'circle', x: 68, y: -32, radius: 5 },
    { shape: 'circle', x: 70, y: -55, radius: 4 },
    { shape: 'circle', x: 80, y: -44, radius: 3.5 },
    { shape: 'circle', x: 95, y: -36, radius: 4.5 },
    { shape: 'circle', x: 98, y: -58, radius: 4 },
    { shape: 'circle', x: 108, y: -26, radius: 3.5 },
    { shape: 'circle', x: 110, y: -46, radius: 3 },
    { shape: 'circle', x: 122, y: -36, radius: 4.5 },
    { shape: 'circle', x: 135, y: -20, radius: 3.5 },
    { shape: 'circle', x: 136, y: -52, radius: 4 },
    { shape: 'circle', x: 142, y: -12, radius: 3.5 },
    { shape: 'circle', x: 146, y: -30, radius: 4 },
    { shape: 'circle', x: 150, y: -60, radius: 3.5 },
    { shape: 'circle', x: 160, y: -16, radius: 4.5 },
    { shape: 'circle', x: 162, y: -44, radius: 4 },
    { shape: 'circle', x: 166, y: -62, radius: 3.5 },
  ].map((o) => ({ ...o, material: 'rock' })),
};

/**
 * 해역 경계 → 사방을 두르는 암초 벽 넷 (정적 poly 강체 스펙).
 *
 * ★ 막는 방식이 **보이지 않는 벽이 아니라 암초**인 것이 요점이다. `createObstacle` 이 이미
 *   임의의 볼록 폴리곤을 정적 강체로 만들므로 경계 전용 물리 코드는 0줄이고, 재질도 그냥
 *   `rock` 이라 규칙 엔진·손상 파이프라인이 항로 한복판의 암초와 똑같이 취급한다.
 *   "여기서부터 못 간다"를 규칙이 아니라 **지형**으로 말하는 셈이다.
 *
 * `reef.inward` 는 렌더 전용 힌트다 — 어느 면이 바다 쪽인지 알아야 그쪽 면만 들쭉날쭉하게
 * 흔들고 여울 점묘를 둘 수 있다 (`sail/render.js`). 물리는 이 필드를 보지 않는다.
 *
 * @param {{minX:number,maxX:number,minY:number,maxY:number,thickness?:number}} b
 */
export function boundaryWalls(b) {
  const t = b.thickness ?? 12;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  // 가로벽은 좌우로, 세로벽은 위아래로 두께만큼 더 길게 뽑아 네 귀퉁이를 겹쳐 막는다.
  const halfW = (b.maxX - b.minX) / 2 + t;
  const halfH = (b.maxY - b.minY) / 2 + t;

  const wall = (x, y, hw, hh, inward) => ({
    shape: 'poly',
    x,
    y,
    points: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]],
    material: 'rock',
    reef: { inward },
  });

  return [
    wall(cx, b.minY - t / 2, halfW, t / 2, [0, 1]),   // 남
    wall(cx, b.maxY + t / 2, halfW, t / 2, [0, -1]),  // 북
    wall(b.minX - t / 2, cy, t / 2, halfH, [1, 0]),   // 서
    wall(b.maxX + t / 2, cy, t / 2, halfH, [-1, 0]),  // 동
  ];
}

/**
 * 스테이지 id → 맵. `game/progress.js` 의 `STAGES[].id` 와 1:1 이다.
 *
 * ★ 맵을 고르는 코드는 `sail/screen.js` 에 **한 줄**이다 (`MAPS[currentStage().id]`).
 *   맵을 더할 때 고치는 곳이 이 객체와 STAGES 배열 둘뿐이어야 원칙 1 이 지켜진다.
 */
export const MAPS = {
  practice: PRACTICE_MAP,
  reef: DEMO_MAP,
};
