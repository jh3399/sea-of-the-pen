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

/** 출항 지점(원점) 기준. 뱃머리(+X) 방향으로 흩어진 암초 사이를 지나 도착점까지. */
export const DEMO_MAP = {
  goal: { x: 150, y: 0, radius: 6, label: '도착' },
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
