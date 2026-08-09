// §6.1 환경 필드 — **맵은 벡터장과 스칼라장의 집합이다.**
//
// 설계 문서의 한 줄이 이 파일의 전부다: "장애물은 필드를 국소 변조하는 장치일 뿐이다."
// 화산은 오브젝트 타입이 아니라 **온도 스칼라장의 고온 영역**이고, 폭풍은 시변 회전
// 바람 벡터다. 그래서 맵별 특수 코드가 0줄일 수 있다 (원칙 1).
//
// 필드 정의는 순수 JSON 이다. 아래 프리미티브 셋 말고는 아무 것도 없고, 맵이 코드를
// 실행할 구멍(콜백·표현식·스크립트 이름)은 스키마에 존재하지 않는다 — 원칙 1을 데이터
// 형식 수준에서 강제한다.

/** D2 가 구현하는 필드. current·electric·magnetic 은 **스키마 자리만** 잡아 둔다 (§2.2). */
export const VECTOR_FIELDS = ['wind', 'current'];
export const SCALAR_FIELDS = ['temperature', 'moisture', 'electric', 'magnetic', 'darkness'];

/** 스칼라장의 기본값 — 아무 소스도 없는 바다의 값. */
export const AMBIENT = {
  temperature: 20,
  moisture: 0,
  electric: 0,
  magnetic: 0,
  darkness: 0,
};

/**
 * 프리미티브 하나가 (x, y) 에서 내는 세기 0..1.
 *  - `uniform` 어디서나 1
 *  - `disc`    중심에서 radius 까지, falloff 만큼 가장자리가 부드럽다
 *  - `band`    축(axis: 'x'|'y') 값이 [from, to] 안이면 1
 */
function intensity(src, x, y) {
  switch (src.shape) {
    case 'uniform':
      return 1;
    case 'disc': {
      const d = Math.hypot(x - src.x, y - src.y);
      if (d >= src.radius) return 0;
      const soft = src.falloff ?? 0;
      if (soft <= 0) return 1;
      const edge = src.radius * (1 - soft);
      return d <= edge ? 1 : 1 - (d - edge) / (src.radius - edge);
    }
    case 'band': {
      const v = src.axis === 'y' ? y : x;
      return v >= src.from && v <= src.to ? 1 : 0;
    }
    default:
      return 0;
  }
}

/** 5초 폭풍처럼 일정 간격으로 방향을 바꾸는 선언형 벡터 소스. */
function vectorAt(src, time) {
  const cycle = src.directionCycle;
  if (!cycle?.directions?.length || !(cycle.interval > 0)) {
    return { x: src.x ?? 0, y: src.y ?? 0 };
  }
  const step = Math.floor(Math.max(0, time) / cycle.interval);
  const dir = cycle.directions[step % cycle.directions.length] ?? {};
  return { x: dir.x ?? 0, y: dir.y ?? 0 };
}

/**
 * 맵의 필드 정의 → 샘플러.
 *
 * @param {object} def `{ wind: [...], temperature: [...], ... }` — 각 값은 소스 배열.
 *   벡터장 소스는 `{shape, ..., x, y}` 의 x·y 가 **벡터 성분**이다. 선택적으로
 *   `directionCycle: {interval, directions:[{x,y}, ...]}` 을 두면 시간 구간마다 성분을 고른다.
 *   스칼라장 소스는 `{shape, ..., value}` 다.
 * @returns {{sampleVector(name,x,y,time), sampleScalar(name,x,y,time), def, isEmpty}}
 */
export function createFields(def = {}) {
  const sources = {};
  for (const name of [...VECTOR_FIELDS, ...SCALAR_FIELDS]) {
    sources[name] = def[name] ?? [];
  }
  const isEmpty = Object.values(sources).every((list) => list.length === 0);

  return {
    def,
    isEmpty,

    /** 벡터장은 **합**한다 — 두 바람이 겹치면 합성풍이 된다. */
    sampleVector(name, x, y, time = 0) {
      let vx = 0;
      let vy = 0;
      for (const src of sources[name] ?? []) {
        const k = intensity(src, x, y);
        if (k <= 0) continue;
        const v = vectorAt(src, time);
        vx += v.x * k;
        vy += v.y * k;
      }
      return { x: vx, y: vy };
    },

    /**
     * 스칼라장은 **최댓값**을 쓴다. 화염 지대 둘이 겹친다고 두 배로 뜨거워지지는 않지만,
     * 더 뜨거운 쪽이 이긴다. (합을 쓰면 소스를 여러 개 놓는 것만으로 규칙 임계를 넘겨
     * 맵 제작자가 규칙표를 우회하게 된다 — 원칙 1 이 새는 구멍이 된다.)
     */
    sampleScalar(name, x, y, time = 0) {
      let best = AMBIENT[name] ?? 0;
      for (const src of sources[name] ?? []) {
        const k = intensity(src, x, y);
        if (k <= 0) continue;
        const v = (AMBIENT[name] ?? 0) + ((src.value ?? 0) - (AMBIENT[name] ?? 0)) * k;
        if (v > best) best = v;
      }
      return best;
    },
  };
}

/** 필드가 없는 잔잔한 바다 — 기본값. */
export const CALM = createFields({});
