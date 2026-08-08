// 항해 화면의 임시 맵 데이터 — `docs/d3_handoff.md` §S4 의 `src/maps/maps.json` 이 아직
// 구현 전이라, `main.js` 의 `DEMO_GOAL`/`startTurretDrill` 과 같은 처지의 하드코딩이다.
// S4 가 `session.js` + `maps.json` 을 갖추면 이 파일은 그 맵 하나를 읽는 걸로 대체된다.
//
// 이 화면은 손상 파이프라인을 연결하지 않는다 — 암초는 `physics/obstacle.js` 의 정적 강체라
// `hull` 이 없고, 배는 부딪히면 물리적으로만 막힌다 (파손 없음).

/** 출항 지점(원점) 기준. 뱃머리(+X) 방향으로 흩어진 암초 사이를 지나 도착점까지. */
export const DEMO_MAP = {
  goal: { x: 150, y: 0, radius: 6, label: '도착' },
  obstacles: [
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
  ].map((o) => ({ ...o, material: 'rock' })),
};
