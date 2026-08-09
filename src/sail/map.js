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
 *   4.66 m/s 라 직선으로도 20초가 걸리고, 돌면서 가느라 실제로는 그 두 배쯤 든다.
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
  storm: STORM_MAP,
  volcano: VOLCANO_MAP,
};
