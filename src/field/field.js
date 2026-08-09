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

/**
 * 벡터 소스가 (x, y) 에서 내는 방향·크기.
 *
 * 셋 중 하나다:
 *  - `toward: {x, y}` **한 점을 향한다.** 방향이 위치에 따라 달라지는 유일한 소스다 —
 *    빨려 드는 흐름(§ 불가사리의 바다)이 이걸로 성립한다. 크기는 `speed`.
 *  - `directionCycle` 일정 간격으로 방향을 갈아 끼운다 (5초 폭풍).
 *  - 그 외 `x`·`y` 성분 그대로 (균일풍·해류).
 *
 * ★ **세기(intensity)와 방향은 따로 논다.** `toward` 를 `disc` 와 겹치면 "가운데로 갈수록
 *   세게 빨린다"가 되고, `band` 와 겹치면 "이 띠 안에서만 빨린다"가 된다 — 조합이 곧
 *   맵 제작이고 새 코드는 없다.
 * ⚠ 중심에 정확히 서면 방향이 정의되지 않는다. 0 벡터를 돌려 NaN 이 물리로 새는 것을 막는다
 *   (한 번 새면 강체 위치가 통째로 NaN 이 되어 화면에서 배가 사라진다).
 */
function vectorAt(src, time, x, y) {
  if (src.toward) {
    const dx = src.toward.x - x;
    const dy = src.toward.y - y;
    const d = Math.hypot(dx, dy);
    if (!(d > 1e-6)) return { x: 0, y: 0 };
    const s = src.speed ?? 0;
    return { x: (dx / d) * s, y: (dy / d) * s };
  }
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
 *   `directionCycle: {interval, directions:[{x,y}, ...]}` 을 두면 시간 구간마다 성분을 고르고,
 *   `toward: {x,y}` + `speed` 를 두면 **그 점을 향해** 흐른다 (방향이 위치에 따라 달라진다).
 *   ⚠ `toward` 를 `disc` 와 함께 쓸 때는 `shape` 쪽 x·y 가 **원의 중심**으로 해석된다 —
 *     성분이 아니다. 방향은 `toward`, 크기는 `speed` 가 전부 정하므로 충돌하지 않는다.
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
        const v = vectorAt(src, time, x, y);
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
