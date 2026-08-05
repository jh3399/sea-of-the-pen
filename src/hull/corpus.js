// 재현 가능한 테스트 코퍼스.
//
// 스파이크의 계측은 매번 손으로 다시 그려서는 비교가 안 되므로, 파이프라인을 깨뜨리기 쉬운
// 형상들을 파라메트릭으로 고정해 둔다. 좌표는 캔버스 픽셀(Y-down)이며 (cx, cy) 기준이다.

/** 결정론적 난수 — 낙서 코퍼스가 매번 같은 모양이어야 계측을 비교할 수 있다. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TAU = Math.PI * 2;

function arc(cx, cy, r, a0, a1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export const CORPUS = {
  /** 기준선 — 아무 문제 없는 매끈한 선체. */
  sloop: (cx, cy) => {
    const pts = [];
    const steps = 120;
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * TAU;
      // 뱃머리(+x)가 뾰족하고 선미가 뭉툭한 물방울 형상
      const taper = 0.55 + 0.45 * Math.cos(t);
      pts.push({ x: cx + Math.cos(t) * 200, y: cy + Math.sin(t) * 62 * taper });
    }
    return pts;
  },

  /** 둥근 배 — D1 의 "조작감 차이" 비교군. */
  round: (cx, cy) => arc(cx, cy, 110, 0, TAU, 90),

  /** 정점이 아닌 곳에서 가로지르는 교차 — clipper 가 링 자체를 둘로 쪼개는 경로. */
  bowtie: (cx, cy) => [
    { x: cx - 170, y: cy - 110 },
    { x: cx + 170, y: cy + 110 },
    { x: cx - 170, y: cy + 110 },
    { x: cx + 170, y: cy - 110 },
  ],

  /** 정점에서 만나는 자기교차 — 핀치 링이 나오므로 우리가 갈라야 하는 경로. */
  figure8: (cx, cy) => {
    const pts = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU;
      pts.push({ x: cx + Math.sin(t) * 190, y: cy + Math.sin(t) * Math.cos(t) * 150 });
    }
    return pts;
  },

  /** 얇은 헤어핀 — 단순화가 가는 부위를 먹어버리지 않는지 본다. */
  hairpin: (cx, cy) => [
    ...arc(cx + 130, cy, 26, -Math.PI / 2, Math.PI / 2, 14),
    { x: cx - 150, y: cy + 26 },
    ...arc(cx - 150, cy, 26, Math.PI / 2, (Math.PI * 3) / 2, 14),
    { x: cx + 130, y: cy - 26 },
  ],

  /**
   * 다단 분리 설계(§7.3.4) — 목이 얇은 아령. 차감 한 번에 두 동강 나야 한다.
   * 양쪽 원의 **바깥쪽** 호만 그리고 목 높이(±NECK)에서 이어 붙인다.
   */
  barbell: (cx, cy) => {
    const R = 78, SPAN = 120, NECK = 13;
    const a = Math.asin(NECK / R); // 목이 원과 만나는 각
    return [
      // 왼쪽 원: 위쪽 목 접점에서 바깥으로 한 바퀴 돌아 아래쪽 목 접점까지
      ...arc(cx - SPAN, cy, R, -a, a - TAU, 44),
      // 오른쪽 원: 아래쪽 목 접점에서 바깥을 돌아 위쪽 목 접점까지
      ...arc(cx + SPAN, cy, R, Math.PI - a, a - Math.PI, 44),
    ];
  },

  /** 초승달 — 무게중심이 선체 밖으로 나가는 케이스(§7.5 엣지 케이스). */
  crescent: (cx, cy) => {
    const R = 150, r = 125, d = 62;
    const x = (d * d + R * R - r * r) / (2 * d);
    const y = Math.sqrt(Math.max(R * R - x * x, 1));
    const aOuter = Math.atan2(y, x);
    const aInner = Math.atan2(y, x - d);
    return [
      ...arc(cx, cy, R, aOuter, TAU - aOuter, 60),
      ...arc(cx + d, cy, r, TAU - aInner, aInner, 50),
    ];
  },

  /** 키홀 고리 — 반대 방향 내부 링으로 진짜 구멍을 만든다. earcut 경로를 태운다. */
  donut: (cx, cy) => [
    ...arc(cx, cy, 160, 0, TAU, 72),
    { x: cx + 90, y: cy },
    ...arc(cx, cy, 90, 0, -TAU, 72),
    { x: cx + 160, y: cy },
  ],

  /** 열린 곡선 — 자동 폐곡선화 + 경고 경로. */
  open: (cx, cy) => arc(cx, cy, 140, 0, Math.PI * 1.35, 60),

  /** 2000점 낙서 — 단순화·Union 의 성능 상한을 때린다. */
  scribble: (cx, cy) => {
    const rnd = lcg(20260805);
    const pts = [];
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      const wobble = 1 + 0.35 * Math.sin(t * 9) + 0.18 * (rnd() - 0.5);
      pts.push({ x: cx + Math.cos(t) * 170 * wobble, y: cy + Math.sin(t) * 110 * wobble });
    }
    return pts;
  },
};

export const CORPUS_LABELS = {
  sloop: '슬루프(기준)',
  round: '둥근 배',
  bowtie: '나비넥타이 교차',
  figure8: '8자 자기교차',
  hairpin: '얇은 헤어핀',
  barbell: '아령(다단 분리)',
  crescent: '초승달',
  donut: '구멍 뚫린 고리',
  open: '열린 곡선',
  scribble: '2000점 낙서',
};
