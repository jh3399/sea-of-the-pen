// 항해 화면의 임시 맵 데이터 — `docs/d3_handoff.md` §S4 의 `src/maps/maps.json` 이 아직
// 구현 전이라, `main.js` 의 `DEMO_GOAL`/`startTurretDrill` 과 같은 처지의 하드코딩이다.
// S4 가 `session.js` + `maps.json` 을 갖추면 이 파일은 그 맵 하나를 읽는 걸로 대체된다.
//
// 항해 화면은 공용 손상 파이프라인을 연결한다. 암초는 `hull` 이 없는 정적 강체라 스스로는
// 깎이지 않지만, 플레이어와 수동 표적 선체는 충돌·포탄 에너지에 따라 같은 규칙으로 파손된다.
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
 * ★ **골을 정면에 두지 않는 것이 이 맵의 전부다.** (80, 52) 는 뱃머리에서 33° 옆이라
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
 * ★ 해역은 1장보다 좁다. 넓은 바다에서 방향을 잃는 것 자체가 초반 좌절의 큰 몫이고,
 *   경계가 암초 벽이라 벗어나려 하면 지형이 알아서 돌려보낸다 (경계 전용 코드 0줄).
 *
 * ⚠ **처음엔 골이 53 m 였는데 너무 가까웠다** — 출발하자마자 도착 표시가 화면에 들어와서
 *   "익히는 구간"이 아니라 "짧은 심부름"이 됐다. 95 m 로 늘렸다. 노만 단 배의 종단이
 *   4.24 m/s 라 직선으로도 22초가 걸리고, 돌면서 가느라 실제로는 그 두 배쯤 든다.
 *   더 늘리는 것은 권하지 않는다 — 여기서부터는 배우는 시간이 아니라 그냥 젓는 시간이다.
 */
export const PRACTICE_BOUNDS = { minX: -35, maxX: 118, minY: -45, maxY: 85, thickness: 12 };

export const PRACTICE_MAP = {
  id: 'practice',
  number: 0,
  label: '연습 해역',
  goal: { x: 80, y: 52, radius: 7, label: '시작의 섬' },
  // 직선 최소 20.5초. 70초는 "돌 줄 몰라 헤매도 3별"이 되는 값이다.
  scoring: { threeStarMaxSeconds: 70, twoStarMaxSeconds: 110 },
  bounds: PRACTICE_BOUNDS,
  fields: {},
  weather: { rain: 0, gloom: 0 },
  damage: false,
  obstacles: [
    // 골로 가는 호의 **바깥**. 지나는 길에 보이지만 부딪히려면 일부러 가야 한다.
    // 항로에서 11~14 m 씩 떨어져 있다 — 눈에는 걸리고 뱃전에는 안 걸리는 거리.
    { shape: 'circle', x: 20, y: 32, radius: 5 },
    { shape: 'circle', x: 66, y: 24, radius: 4.5 },
    { shape: 'circle', x: 66, y: 65, radius: 4 },
    // 바깥 바다 — 크게 벗어나도 텅 비어 보이지 않게.
    { shape: 'circle', x: 28, y: -18, radius: 4.5 },
    { shape: 'circle', x: -18, y: 26, radius: 4 },
    { shape: 'circle', x: 102, y: 30, radius: 5 },
  ].map((o) => ({ ...o, material: 'rock' })),
};

/** 출항 지점(원점) 기준. 뱃머리(+X) 방향으로 흩어진 암초 사이를 지나 도착점까지. */
export const DEMO_MAP = {
  id: 'reef',
  number: 1,
  label: '바위 협곡',
  goal: { x: 150, y: 0, radius: 6, label: '도착' },
  scoring: { threeStarMaxSeconds: 60, twoStarMaxSeconds: 90 },
  bounds: SEA_BOUNDS,
  fields: {},
  weather: { rain: 0, gloom: 0 },
  damage: true,
  // 선택 배선용 수동 표적. screen 이 아직 만들지 않아도 되는 순수 맵 스펙이며, 연결할 때는
  // game/targets.js 의 createPassiveTargets 로 동적 나무 선체를 만든다.
  targets: [
    { entityId: 'route-target-1', x: 42, y: -20, angle: 0.10, width: 4.5, height: 3, material: 'wood' },
    { entityId: 'route-target-2', x: 82, y: 27, angle: -0.18, width: 5, height: 3.2, material: 'wood' },
    { entityId: 'route-target-3', x: 138, y: -2, angle: 0.22, width: 4, height: 3.5, material: 'wood' },
  ],
  // 해적선(game/pirates.js)은 테스트용으로 여기 배치했었다 — 스톰 맵이 생기면 거기로 옮긴다.
  // 메커니즘 자체는 남겨 둔다: screen.js 는 DEMO_MAP.pirates ?? [] 라 빈 배열이면 그냥 0척.
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

/** 레벨 2 — 암초 간격은 넓지만 어둠과 5초마다 바뀌는 폭풍이 항로 판단을 흔든다. */
export const STORM_MAP = {
  id: 'storm',
  number: 2,
  label: '역풍 협곡',
  // ★ BGM 도 맵 데이터다. 항해 화면은 `map.bgm` 을 틀 뿐 어느 바다인지 모른다 —
  //   `if (stage === 'storm')` 를 쓰고 싶어지는 순간이 원칙 1 이 새는 자리다.
  bgm: 'storm',
  goal: { x: 150, y: -8, radius: 7, label: '등대' },
  scoring: { threeStarMaxSeconds: 75, twoStarMaxSeconds: 110 },
  bounds: SEA_BOUNDS,
  fields: {
    wind: [{
      shape: 'uniform',
      directionCycle: {
        interval: 5,
        directions: [
          { x: 10, y: 0 },
          { x: 7.071, y: 7.071 },
          { x: 0, y: 10 },
          { x: -7.071, y: 7.071 },
          { x: -10, y: 0 },
          { x: -7.071, y: -7.071 },
          { x: 0, y: -10 },
          { x: 7.071, y: -7.071 },
        ],
      },
    }],
    darkness: [{ shape: 'uniform', value: 0.58 }],
  },
  weather: { rain: 0.72, gloom: 0.65 },
  damage: true,
  obstacles: [
    // 북쪽 바깥 해역 — 띠마다 끊어진 통로를 남겨 레벨 1보다 성기게 배치한다.
    { shape: 'circle', x: 18, y: 60, radius: 4 },
    { shape: 'circle', x: 42, y: 57, radius: 3.5 },
    { shape: 'circle', x: 68, y: 64, radius: 4.5 },
    { shape: 'circle', x: 96, y: 55, radius: 4 },
    { shape: 'circle', x: 124, y: 62, radius: 3.5 },
    { shape: 'circle', x: 158, y: 57, radius: 4.5 },

    { shape: 'circle', x: 30, y: 40, radius: 4.5 },
    { shape: 'circle', x: 56, y: 34, radius: 3.5 },
    { shape: 'circle', x: 84, y: 43, radius: 4 },
    { shape: 'circle', x: 112, y: 36, radius: 5 },
    { shape: 'circle', x: 140, y: 44, radius: 3.5 },
    { shape: 'circle', x: 166, y: 34, radius: 4 },

    { shape: 'circle', x: 16, y: 21, radius: 3.5 },
    { shape: 'circle', x: 44, y: 18, radius: 4 },
    { shape: 'circle', x: 72, y: 26, radius: 5 },
    { shape: 'circle', x: 102, y: 17, radius: 3.5 },
    { shape: 'circle', x: 132, y: 25, radius: 4.5 },
    { shape: 'circle', x: 160, y: 16, radius: 3.5 },

    // 중앙 항로 — 한 줄 벽이 아니라 좌우 선택이 생기는 넓은 지그재그다.
    { shape: 'circle', x: 26, y: 5, radius: 4 },
    { shape: 'circle', x: 52, y: -5, radius: 4.5 },
    { shape: 'circle', x: 78, y: 7, radius: 3.5 },
    { shape: 'circle', x: 106, y: -4, radius: 5 },
    { shape: 'circle', x: 134, y: 8, radius: 4 },
    { shape: 'circle', x: 164, y: -3, radius: 3.5 },

    { shape: 'circle', x: 17, y: -18, radius: 4.5 },
    { shape: 'circle', x: 43, y: -25, radius: 3.5 },
    { shape: 'circle', x: 70, y: -16, radius: 4 },
    { shape: 'circle', x: 98, y: -27, radius: 4.5 },
    { shape: 'circle', x: 126, y: -18, radius: 3.5 },
    { shape: 'circle', x: 166, y: -22, radius: 4 },

    { shape: 'circle', x: 29, y: -42, radius: 4 },
    { shape: 'circle', x: 57, y: -35, radius: 5 },
    { shape: 'circle', x: 86, y: -45, radius: 3.5 },
    { shape: 'circle', x: 114, y: -37, radius: 4 },
    { shape: 'circle', x: 143, y: -46, radius: 4.5 },
    { shape: 'circle', x: 163, y: -35, radius: 3.5 },

    { shape: 'circle', x: 16, y: -60, radius: 3.5 },
    { shape: 'circle', x: 45, y: -56, radius: 4.5 },
    { shape: 'circle', x: 74, y: -64, radius: 4 },
    { shape: 'circle', x: 104, y: -55, radius: 3.5 },
    { shape: 'circle', x: 132, y: -62, radius: 5 },
    { shape: 'circle', x: 164, y: -58, radius: 4 },

    // 띠 사이의 대각선 연결점 — 넓은 빈 복도를 직선으로 관통하지 못하게만 한다.
    { shape: 'circle', x: 38, y: 29, radius: 3 },
    { shape: 'circle', x: 64, y: 10, radius: 3 },
    { shape: 'circle', x: 91, y: 31, radius: 3.5 },
    { shape: 'circle', x: 119, y: -30, radius: 3 },
    { shape: 'circle', x: 146, y: 29, radius: 3.5 },
    { shape: 'circle', x: 151, y: -31, radius: 3 },
  ].map((o) => ({ ...o, material: 'rock' })),
};

/**
 * 레벨 3 「불의 바다」 — 해역 **전체**가 용암인 암초 해역.
 *
 * 용암은 전용 장애물이나 맵 분기가 아니다. 화면은 `surface` 값 데이터를 읽고, 물리는
 * `current`, 연소는 `temperature` 를 읽는다.
 *
 * ★ 온도가 목재 발화점(250°) **위**라는 것이 이 맵의 전부다. 나무 선체는 어디에 있든
 *   붙고 4.2초 뒤 무너진다 — 우회로도 안전 지대도 없다 (스칼라장은 최댓값 합성이라
 *   뜨거운 uniform 안에 시원한 통로를 파는 것은 표현 자체가 불가능하다: 시원함은
 *   소스의 **부재**로만 만든다). 그래서 이 바다의 답은 항로가 아니라 **재질**이다.
 * ⚠ 기본 노는 `material: 'wood'` 라 선체가 철이어도 4.2초에 타 없어진다. 추진은
 *   철 부스터로 한다 — 규칙표에 철+온도 규칙이 **없어서** 성립하는 내화다.
 */
export const VOLCANO_MAP = {
  id: 'volcano',
  number: 3,
  label: '불의 바다',
  // 이 바다는 4.2초짜리 연소 시계와 달리는 곳이라 `battle`(bpm 168)이 맞는다.
  // `tension` 은 바위섬 막간이 이미 쓴다 — 같은 곡이 두 종류의 자리에 오면 뜻이 흐려진다.
  bgm: 'battle',
  goal: { x: 150, y: 6, radius: 7, label: '화산섬' },
  scoring: { threeStarMaxSeconds: 80, twoStarMaxSeconds: 120 },
  bounds: SEA_BOUNDS,
  fields: {
    // 전 해역의 완만한 흐름 + 더 빠른 두 줄기. 벡터장은 **합**이라 줄기 안에서는
    // 둘이 더해져 대각선으로 밀린다.
    current: [
      { shape: 'uniform', x: 0.8, y: 0.2 },
      { shape: 'band', axis: 'y', from: 18, to: 34, x: 3.2, y: -1.4 },
      { shape: 'band', axis: 'y', from: -42, to: -26, x: 2.8, y: 1.8 },
    ],
    // ★ 균일 330° — 목재 발화점 250° 위다. 이 한 줄이 "바다 전체가 용암"의 전부이고,
    //   더 뜨거운 줄기를 겹쳐도 규칙은 임계 하나뿐이라 거동이 달라지지 않는다.
    temperature: [{ shape: 'uniform', value: 330 }],
    darkness: [{ shape: 'uniform', value: 0.18 }],
  },
  weather: { rain: 0, gloom: 0.24 },
  surface: {
    base: '#8f1d0f',
    deep: 'rgba(55, 8, 5, 0.42)',
    glint: '#ffd35c',
    shoal: 'rgba(255, 116, 38, 0.68)',
    wake: '#ffb347',
    flowField: 'current',
  },
  damage: true,
  obstacles: [
    // 북쪽부터 남쪽까지 끊긴 현무암 열. 같은 줄에서도 틈의 위치가 달라 한 길로 관통할 수 없다.
    { shape: 'circle', x: 18, y: 62, radius: 4.5 },
    { shape: 'circle', x: 46, y: 57, radius: 3.5 },
    { shape: 'circle', x: 74, y: 65, radius: 5 },
    { shape: 'circle', x: 104, y: 58, radius: 4 },
    { shape: 'circle', x: 132, y: 63, radius: 4.5 },
    { shape: 'circle', x: 164, y: 56, radius: 5 },

    { shape: 'circle', x: 30, y: 43, radius: 5 },
    { shape: 'circle', x: 58, y: 38, radius: 4 },
    { shape: 'circle', x: 88, y: 46, radius: 3.5 },
    { shape: 'circle', x: 116, y: 39, radius: 5 },
    { shape: 'circle', x: 143, y: 45, radius: 4 },
    { shape: 'circle', x: 168, y: 35, radius: 3.5 },

    // 위쪽 빠른 줄기 — 암초 사이를 타면 빠르지만 횡류가 있어 암초 쪽으로 떠밀린다.
    // (온도는 해역 전체가 같으므로 줄기의 대가는 열이 아니라 **조종**이다.)
    { shape: 'circle', x: 17, y: 24, radius: 4 },
    { shape: 'circle', x: 43, y: 30, radius: 5 },
    { shape: 'circle', x: 70, y: 21, radius: 3.5 },
    { shape: 'circle', x: 98, y: 29, radius: 4.5 },
    { shape: 'circle', x: 126, y: 20, radius: 4 },
    { shape: 'circle', x: 160, y: 28, radius: 5 },

    // 중앙의 완만한 통로. 출발점과 골은 열려 있지만 일직선은 암초가 끊는다.
    { shape: 'circle', x: 27, y: 7, radius: 4.5 },
    { shape: 'circle', x: 54, y: -5, radius: 4 },
    { shape: 'circle', x: 82, y: 8, radius: 5 },
    { shape: 'circle', x: 110, y: -4, radius: 3.5 },
    { shape: 'circle', x: 136, y: 14, radius: 4 },
    { shape: 'circle', x: 166, y: -5, radius: 4.5 },

    { shape: 'circle', x: 17, y: -18, radius: 4 },
    { shape: 'circle', x: 45, y: -23, radius: 3.5 },
    { shape: 'circle', x: 72, y: -15, radius: 5 },
    { shape: 'circle', x: 101, y: -22, radius: 4 },
    { shape: 'circle', x: 130, y: -16, radius: 4.5 },
    { shape: 'circle', x: 160, y: -21, radius: 3.5 },

    // 아래쪽 빠른 줄기 — 진행 방향으로 밀지만 횡류가 있어 암초 쪽으로 떠밀릴 수 있다.
    { shape: 'circle', x: 29, y: -37, radius: 4.5 },
    { shape: 'circle', x: 57, y: -43, radius: 5 },
    { shape: 'circle', x: 86, y: -34, radius: 3.5 },
    { shape: 'circle', x: 114, y: -41, radius: 4 },
    { shape: 'circle', x: 142, y: -33, radius: 5 },
    { shape: 'circle', x: 166, y: -44, radius: 4 },

    { shape: 'circle', x: 18, y: -60, radius: 5 },
    { shape: 'circle', x: 47, y: -55, radius: 3.5 },
    { shape: 'circle', x: 76, y: -64, radius: 4.5 },
    { shape: 'circle', x: 106, y: -57, radius: 4 },
    { shape: 'circle', x: 136, y: -63, radius: 3.5 },
    { shape: 'circle', x: 164, y: -56, radius: 5 },

    // 행 사이 대각선 연결점 — 넓은 빈 복도를 직선으로 우회하는 것만 막는다.
    { shape: 'circle', x: 38, y: 14, radius: 3 },
    { shape: 'circle', x: 66, y: 35, radius: 3.5 },
    { shape: 'circle', x: 94, y: -10, radius: 3 },
    { shape: 'circle', x: 120, y: -29, radius: 3.5 },
    { shape: 'circle', x: 149, y: 34, radius: 3 },
    { shape: 'circle', x: 151, y: -47, radius: 3.5 },
  ].map((o) => ({ ...o, material: 'rock' })),
};

/**
 * 4장 「불가사리의 바다」 — 고전 탄막 구도의 고정 아레나.
 *
 * ★ **이 맵만 카메라를 안 따라간다.** `camera.mode === 'arena'` 한 줄이 추적을 끄고 줌을
 *   창 크기에 맞춘다 (`sail/screen.js`). 회전 금지 규칙은 그대로다 — 끄는 것은 추적뿐이다.
 *   플레이어가 화면 아래, 보스가 화면 위에 **고정**돼야 "부채꼴이 내려온다"가 성립한다.
 *
 * ★ **뱃머리가 +X 인 것이 이 맵의 조작이다.** 보스는 +Y 쪽에 있으므로 배는 위협에 대해
 *   옆으로 서 있다 — 이방성 항력이 횡:종 약 3.9배라 **좌우 회피는 싸고**(저항 작은 축),
 *   보스에게 다가가려면 느린 90° 선회를 해야 한다. 새 물리 코드 0줄로 나오는 트레이드오프다.
 *
 * ★ **핵도 팔도 폴리곤이 절대 안 깎인다** (사람 판정, "보스 형태 전체가 안 부서지게" —
 *   `game/boss.js#applyDamage`). 대포는 형태가 아니라 숫자(체력)만 깎으므로, 팔은
 *   `createHullBody` 이면서도 영원히 처음 그 모양 그대로다. 그래서 270° 노치가 **유일한
 *   접근로**다 — 끊어서 길을 내는 것은 답이 아니다. 팔은 자기 탄막의 17.5%(2페이즈)·
 *   48.4%(3페이즈)를 막아 주는 엄폐물로 끝까지 남고, 대신 어디를 맞히든(핵이든 팔이든)
 *   같은 체력 풀이 줄어든다 — 취약 창 게이트 없이 항상 유효타다.
 */
export const BULGASARI_BOUNDS = { minX: -28, maxX: 28, minY: -14, maxY: 26, thickness: 9 };

/** 보스 핵의 중심 (m). 맵·보스·골이 같은 값을 봐야 해서 상수로 뽑는다. */
const CORE_AT = { x: 0, y: 14 };
/** 위에서 비스듬히 내려다보는 단축률. 팔이 세로로 눌려 "수면에 누워 있다"로 읽힌다. */
const SQUASH = 0.6;

/**
 * 핵(입) — 무게중심이 원점인 볼록 십각형 (선체 로컬 좌표).
 *
 * ★ **덩치는 팔이 내고 핵은 작다.** 처음엔 반경 6(면적 85 m²)이었는데, 대포 한 발이 뜯는
 *   것이 둥근 표면에 빗맞아 평균 0.3 m² 라 쓰러뜨리는 데 100발 넘게 걸렸다. 핵은 몸이
 *   아니라 **입**이고, 40 m 짜리 불가사리에 폭 8 m 짜리 입은 이상하지 않다.
 *   작아진 대신 조준이 필요해져 탄막 게임으로서도 맞다.
 */
const CORE_POINTS = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    // 살짝 들쭉날쭉하게 — 완전한 원이면 생물이 아니라 공으로 보인다. 해시가 아니라
    // 고정 수열이라 매번 같은 모양이 나온다.
    const r = 5 + [0.4, -0.25, 0.35, -0.4, 0.25, 0.4, -0.35, 0.25, -0.25, 0.35][i];
    pts.push([r * Math.cos(t), r * Math.sin(t) * 0.78]);
  }
  return pts;
})();

/**
 * 팔 하나 → 육각형 하나. 뿌리(5.2)에서 시작해 중간에서 가장 굵고(2.4) 끝으로 갈수록 여윈다.
 *
 * ★ 원래는 사다리꼴 두 마디의 암초였다가, 팔이 대포로 끊어지던 시절(2026-08-10 세 번째
 *   라운드)에 마디를 나누면 이음매가 공짜 절단선이 되는 문제 때문에 한 몸(육각형)으로
 *   합쳤다. 이후 팔이 다시 절대 안 깎이게 됐지만(형태 전체가 무형태), 굳이 두 마디로
 *   되돌릴 이유는 없다 — 두 마디의 합집합과 **꼭짓점까지 같은** 형상이라 콜라이더는 어느
 *   쪽이든 동일하다.
 *
 * 볼록으로 두는 것은 이제 판정이 아니라 습관이다 — `createHullBody` 는 `decomposeHull` 을
 * 거치므로 오목이어도 볼록껍질로 부풀지 않는다 (`createObstacle` 과 다른 점이다).
 */
function bossArm(deg, reach = 19.5) {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const px = -s;   // 진행 방향의 수직 (폭 방향)
  const py = c;
  const pt = (r, w) => [
    CORE_AT.x + c * r + px * w,
    CORE_AT.y + (s * r + py * w) * SQUASH,
  ];
  const mid = 5.2 + (reach - 5.2) * 0.45;
  return {
    // 월드 좌표다 (핵의 `points` 는 선체 로컬). `createBoss` 가 무게중심으로 옮겨 준다.
    points: [pt(5.2, 2.2), pt(mid, 2.4), pt(reach, 0.8), pt(reach, -0.8), pt(mid, -2.4), pt(5.2, -2.2)],
    // 팔은 살이 아니라 힘줄이다 (hull/params.js#sinew) — maxCarveRadius 만 0.6→0.5 로 더
    // 질기다. 핵은 그대로 살을 쓴다.
    material: 'sinew',
  };
}

export const BULGASARI_MAP = {
  id: 'bulgasari',
  // ★ 5장이다. 4장 「삼키는 바다」(`MAW_MAP`)가 앞에 끼면서 한 칸 밀렸다 —
  //   끌려가는 것과 싸우는 것은 다른 층이라 바다를 나눴다 (MAW_MAP 머리말 참조).
  number: 5,
  label: '불가사리의 바다',
  bgm: 'boss',
  camera: { mode: 'arena', at: { x: 0, y: 3 }, fit: { w: 64, h: 38 } },
  // 뱃머리는 +X (동). 위협은 +Y 라 배는 옆으로 서서 출발한다 — 위 ★ 참조.
  start: { x: 0, y: -9, angle: 0 },
  // ★ 처음에는 도착 지점이 **없다.** 보스가 쓰러져야 입이 열리고 그때 생긴다 (game/boss.js).
  //   `createGoal(null)` 이 null 을 돌려주고 판정·나침반·HUD 가 전부 null 을 견딘다.
  goal: null,
  scoring: { threeStarMaxSeconds: 150, twoStarMaxSeconds: 240 },
  bounds: BULGASARI_BOUNDS,
  fields: {
    darkness: [{ shape: 'uniform', value: 0.26 }],
  },
  weather: { rain: 0, gloom: 0.3 },
  surface: {
    base: '#101a3a',
    deep: 'rgba(6, 10, 34, 0.5)',
    glint: '#8fb4ff',
    shoal: 'rgba(150, 120, 220, 0.6)',
    wake: '#c9b6ff',
    // 흡입이 켜지면 이 필드가 방사장이 되고, 물이 **칸마다** 안쪽으로 흐른다.
    flowField: 'current',
  },
  damage: true,
  /**
   * 보스 정의. 팔은 `obstacles` 와 같은 스펙 형식이라 `createObstacle` 이 그대로 만든다.
   * 18° / 90° / 162° / 234° / 306° — **270° 가 비어 있고 그것이 접근로다.**
   */
  boss: {
    core: { x: CORE_AT.x, y: CORE_AT.y, points: CORE_POINTS },
    /**
     * ⚠ **정오각별이 아니다.** 아래 두 팔이 뒤로 젖혀져 있고(218°·322°) 짧다.
     *
     * 처음엔 234°·306° 의 정오각별이었는데, 그 둘이 아래로 V 를 만들어 핵을 가렸다.
     * 실측: 아래에서 핵을 직접 맞힐 수 있는 폭이 **4.4 m** — 배 한 척 폭이 2.1 m 이니
     * 사실상 한 줄뿐이고, 그 줄은 하필 부채꼴이 가장 촘촘한 정중앙이라 **유일한 사격
     * 자리가 곧 유일한 사지**가 됐다. 게다가 한 자리를 계속 뚫는 것은 흩어 쏘는 것보다
     * 2.7배 비효율이라(이미 깎인 자리는 다시 깎이지 않는다) 그 한 줄조차 나빴다.
     * 젖히고 나니 사격 폭 11 m · 접근 통로 8.9 m 가 됐다.
     * 팔이 제각각인 것은 불가사리로서 이상하지 않다 — 오래 싸운 몸이고, 입이 플레이어를
     * 향해 열려 있다는 것이 이 형상의 뜻이다.
     */
    arms: [[18, 19.5], [90, 19.5], [162, 19.5], [218, 12.5], [322, 12.5]]
      .map(([deg, reach]) => bossArm(deg, reach)),
    /** 장식(콜라이더 없음)이 물에 잠겨 보이기 시작하는 반경 (m). */
    submergeFrom: 15,
  },
  // 아레나에 암초는 없다 — 피할 것은 탄막이지 지형이 아니다. 경계 벽만 두른다.
  obstacles: [],
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
/**
 * 4장 「삼키는 바다」 — 별의섬을 떠나 불가사리에게 **끌려가는** 구간.
 *
 * ★ **보스전(`BULGASARI_MAP`)의 흡입과 다른 층이다.** 저쪽은 싸우는 동안 배를 아레나
 *   안쪽으로 당기는 **전투 기믹**이고, 여기는 그 바다에 **도착하는 방식** 자체다.
 *   그래서 저기는 파손이 켜져 있고 여기는 꺼져 있으며, 저기는 골이 보스가 쓰러져야
 *   생기고 여기는 처음부터 끝이 정해져 있다. 둘을 한 맵으로 합치면 "빨려 들어갔다"와
 *   "빨려 들어가며 싸운다"가 같은 말이 되어 도입부가 사라진다.
 *
 * ★ 이 맵은 **시험이 아니라 연출**이다. 앞의 셋이 매번 "무엇에 맞춰 그릴 것인가"를 물었다면
 *   여기는 [S-09] 에서 그 제약을 전부 걷은 다음이라, 어떻게 그린 배로 와도 도착한다.
 *   그래서 `damage: false` 다 — 마음대로 그리라고 해 놓고 그 배가 깨지면 자유가 벌이 된다
 *   (연습 해역이 같은 이유로 false 인 것과 짝을 이룬다).
 *
 * ★ 지형은 **첫 바다를 되짚는다.** 성긴 암초 몇 개뿐이고 항로를 막지 않는다. 여정이
 *   시작한 곳처럼 보여야 마지막이 원을 그린다. 다만 그 바위마다 별이 붙어 있다
 *   (`stars: true` → `sail/render.js` 가 점을 얹는다) — 별의섬에서 여기까지 이어진 것이다.
 *
 * ★ **빨려 든다.** `mode:'radial'` 이 방향을, `disc` 가 세기를 정한다 (`field/field.js`):
 *   반경 150 m 밖에서는 0 이라 처음 40 m 는 평소처럼 항해하고, 그 원에 들어서는 순간부터
 *   끌리기 시작해 가까울수록 세진다. 출항 지점에서 골까지 190 m 이므로 **끌리기 시작하는
 *   자리에서 남은 거리가 정확히 150 m** 다.
 *   흡입 9 m/s 는 노 종단(4.24)보다 확실히 크다 — **저항은 되지만 못 이긴다.** 뒤로 저으면
 *   느려지긴 하는데 결국 끌려가고, 그 발버둥이 무력감을 만든다.
 *
 * ⚠ 흡입 구간(x > 40)의 암초는 항로에서 멀리 둔다. 9 m/s 로 끌려가다 바위에 박는 것은
 *   플레이어가 피할 방법이 없는 사고이고, 피할 수 없는 것으로 벌하면 안 된다.
 *
 * ★ **2026-08-10, 사람 판정으로 전체 길이를 절반으로 줄였다** (380 m → 190 m, 반경도
 *   300 → 150 m). 원래 값이 "끌려간다"는 취지에 비해 지루하게 길다는 판정이었다 — 배·
 *   암초·필드 세기는 그대로 두고 좌표만 균일하게 ×0.5 했다 (전 구간 상대 위치가 그대로
 *   보존된다). 흡입 세기(9 m/s)와 노 종단은 안 건드렸으므로 "발버둥은 쳐지되 못 이긴다"는
 *   그대로고, 걸리는 시간만 짧아졌다.
 */
export const MAW_BOUNDS = { minX: -40, maxX: 230, minY: -75, maxY: 75, thickness: 12 };

export const MAW_MAP = {
  id: 'maw',
  number: 4,
  label: '삼키는 바다',
  bgm: 'tension',
  goal: { x: 190, y: 0, radius: 8, label: '불가사리' },
  // 흡입이 시간을 거의 정하므로 별점은 사실상 고정된다. 헤매도 3별이 되게 넉넉히 둔다 —
  // 마지막 항해에서 별 하나를 덜 주는 것은 아무것도 가르치지 않는다. 길이를 절반으로
  // 줄이면서 시간 상한도 절반으로 맞췄다.
  scoring: { threeStarMaxSeconds: 55, twoStarMaxSeconds: 80 },
  bounds: MAW_BOUNDS,
  fields: {
    current: [
      // 잔잔한 밑흐름 — 흡입 밖에서도 바다가 죽어 있지 않게.
      { shape: 'uniform', x: 0.5, y: 0 },
      /**
       * ★ 빨아들이는 입.
       *
       * ⚠ `falloff` 가 이 맵의 유일한 밸런싱 노브이고, 0.9 로 뒀다가 한 번 틀렸다.
       *   0.9 는 "반경의 90%가 램프"라 원 대부분에서 흡입이 약하다 — 실측(x=200, 골까지
       *   180 m)에서 4.0 m/s 밖에 안 나와 **노 종단(4.66)에 졌다.** 뒤로 저으면 15초에
       *   32 m 를 되돌아가 그냥 도망칠 수 있었다.
       *   0.25 면 바깥 75 m 만 램프이고 그 안은 전부 최대 세기다: 테두리(300 m)에서는
       *   거의 안 잡혀 "가다가 서서히 걸리는" 느낌이 살고, 한 번 들어오면 9 m/s 라
       *   **발버둥은 쳐지되 못 이긴다.**
       *
       * ★ `strength` 가 **음수**라 안으로 빨아들인다 (`field/field.js` 의 `mode:'radial'` —
       *   양수면 밖으로 뻗는다). 보스전의 흡입과 같은 프리미티브를 쓴다.
       */
      {
        shape: 'disc', x: 190, y: 0, radius: 150, falloff: 0.25,
        mode: 'radial', at: { x: 190, y: 0 }, strength: -9,
      },
    ],
    darkness: [{ shape: 'disc', x: 190, y: 0, radius: 150, falloff: 0.85, value: 0.5 }],
  },
  weather: { rain: 0, gloom: 0.3 },
  surface: {
    base: '#121a3a',
    deep: 'rgba(6, 8, 24, 0.45)',
    glint: '#cdd8ff',
    shoal: 'rgba(90, 120, 220, 0.55)',
    wake: '#9fb4f0',
    flowField: 'current',
  },
  damage: false,
  obstacles: [
    // 앞 구간(x < 40) — 첫 바다와 같은 성긴 배치. 지나며 보이지만 막지는 않는다.
    { shape: 'circle', x: 11, y: 30, radius: 5 },
    { shape: 'circle', x: 17, y: -26, radius: 4.5 },
    { shape: 'circle', x: 32, y: 22, radius: 4 },
    { shape: 'circle', x: 35, y: -34, radius: 5 },
    { shape: 'circle', x: -8, y: 18, radius: 4 },
    { shape: 'circle', x: 3, y: -46, radius: 4.5 },
    // 흡입 구간 — 항로(y≈0)에서 30 m 이상 떨어뜨린다. 끌려가며 박을 수 없는 거리다.
    { shape: 'circle', x: 60, y: 44, radius: 5 },
    { shape: 'circle', x: 75, y: -48, radius: 4.5 },
    { shape: 'circle', x: 98, y: 52, radius: 4 },
    { shape: 'circle', x: 116, y: -44, radius: 5 },
    { shape: 'circle', x: 137, y: 46, radius: 4.5 },
    { shape: 'circle', x: 155, y: -50, radius: 4 },
    { shape: 'circle', x: 172, y: 48, radius: 4.5 },
  ].map((o) => ({ ...o, material: 'rock', stars: true })),
};

export const MAPS = {
  practice: PRACTICE_MAP,
  reef: DEMO_MAP,
  storm: STORM_MAP,
  volcano: VOLCANO_MAP,
  // ★ 순서가 곧 이야기다 — 끌려가고(maw) 나서 싸운다(bulgasari).
  maw: MAW_MAP,
  bulgasari: BULGASARI_MAP,
};
