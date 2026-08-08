// "도면 보기" 트레이싱 가이드 4종.
//
// hull/corpus.js(엔지니어링 QA 테스트 형상)와 모양은 비슷하지만 목적이 다르다 — 이건 그냥
// 캔버스 중앙에 반투명하게 얹혀 따라 그리기 쉽게 돕는 시각 가이드일 뿐, strokeToHull
// 파이프라인에는 절대 들어가지 않는다. 좌표는 캔버스 픽셀(Y-down)이며 원점(0,0) 중심이다 —
// 화면에 그릴 땐 캔버스 정중앙으로 translate 만 하면 된다.

const TAU = Math.PI * 2;

function arc(r, a0, a1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export const TEMPLATES = {
  /** 화살촉형 — 배 실루엣처럼 앞이 뾰족하고 뒤가 뭉툭하다. */
  arrow: () => {
    const pts = [];
    const steps = 90;
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * TAU;
      const taper = 0.55 + 0.45 * Math.cos(t);
      pts.push({ x: Math.cos(t) * 170, y: Math.sin(t) * 95 * taper });
    }
    return pts;
  },

  /** 원. */
  circle: () => arc(140, 0, TAU, 72),

  /** 캡슐 — 둥근 직사각형(스타디움 곡선), 반원 두 개 + 직선 두 변. */
  capsule: () => {
    const half = 130;
    const r = 90;
    return [
      ...arc(r, -Math.PI / 2, Math.PI / 2, 24).map((p) => ({ x: p.x + half, y: p.y })),
      ...arc(r, Math.PI / 2, (Math.PI * 3) / 2, 24).map((p) => ({ x: p.x - half, y: p.y })),
    ];
  },

  /** 하트 — 표준 매개변수 하트 곡선. 캔버스는 Y-down 이라 y 부호를 뒤집어 첨점이 아래로 온다. */
  heart: () => {
    const pts = [];
    const steps = 100;
    const scale = 10.2;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const yMath = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push({ x: x * scale, y: -yMath * scale });
    }
    return pts;
  },
};

export const TEMPLATE_LABELS = {
  arrow: '화살촉형',
  circle: '원',
  capsule: '캡슐형',
  heart: '하트',
};

export const TEMPLATE_ORDER = ['arrow', 'circle', 'capsule', 'heart'];
