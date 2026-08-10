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
 *
 * ⚠ `disc` 의 중심은 `at:{x,y}` 로도 쓸 수 있고 그쪽이 우선이다. **벡터 소스에서는 반드시
 *   `at` 을 써야 한다** — 벡터장은 `x`/`y` 가 **벡터 성분**이라(위 createFields 주석), 원판
 *   벡터 소스가 같은 키로 중심과 성분을 동시에 뜻할 수 없다. 스칼라 소스는 지금까지처럼
 *   `x`/`y` 를 중심으로 쓴다.
 */
function intensity(src, x, y) {
  switch (src.shape) {
    case 'uniform':
      return 1;
    case 'disc': {
      const d = Math.hypot(x - (src.at?.x ?? src.x ?? 0), y - (src.at?.y ?? src.y ?? 0));
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
 * 벡터 소스가 (x, y) 에서 내는 방향·크기. `intensity` 가 씌우는 봉투와 곱해져 최종 벡터가 된다.
 *
 * 기본형은 **위치와 무관한 상수 벡터**다 (`{x, y}` 성분). 그 위에 두 변조가 있다:
 *  - `directionCycle` : 5초 폭풍처럼 일정 간격으로 방향을 갈아탄다 (시간 의존, 위치 무관)
 *  - `mode: 'radial'` : `at` 에서 **밖으로** 향하는 단위벡터 × `strength` (위치 의존, 시간 무관)
 *                       `strength` 가 음수면 안으로 빨아들인다.
 *
 * ★ 방사장에 새 `shape` 를 만들지 않은 이유: `intensity` 의 `disc` 가 이미 "중심에서 radius
 *   까지, falloff 만큼 부드럽게"라는 **봉투**를 준다. 방사는 봉투가 아니라 **방향**의 성질이라
 *   두 축이 직교한다 — `{shape:'disc', mode:'radial'}` 로 둘을 곱하면 끝이고, `band`
 *   같은 다른 봉투와도 조합된다. 새 shape 를 만들면 falloff 로직이 두 벌이 된다.
 */
function vectorAt(src, time, x = 0, y = 0) {
  if (src.mode === 'radial') {
    const dx = x - (src.at?.x ?? src.cx ?? 0);
    const dy = y - (src.at?.y ?? src.cy ?? 0);
    const d = Math.hypot(dx, dy);
    // 중심에서는 방향이 정의되지 않는다. 0 을 돌려주는 것이 맞다 — 임의의 방향을 고르면
    // 정확히 중심에 놓인 배가 프레임마다 다른 쪽으로 튄다.
    if (d < 1e-6) return { x: 0, y: 0 };
    const s = src.strength ?? 0;
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
 *   `mode:'radial'` + `{at:{x,y}, strength}` 면 중심에서 뻗는(음수면 빨아들이는) 방사장이 된다.
 *   스칼라장 소스는 `{shape, ..., value}` 다.
 * @returns {{sampleVector(name,x,y,time), sampleScalar(name,x,y,time),
 *            setSource(name,key,src), def, isEmpty}}
 */
export function createFields(def = {}) {
  const sources = {};
  /**
   * 런타임 오버레이 — 이름 붙은 슬롯. `def`(맵 데이터)는 절대 건드리지 않는다.
   * @type {Record<string, Map<string, object>>}
   */
  const overlay = {};
  for (const name of [...VECTOR_FIELDS, ...SCALAR_FIELDS]) {
    sources[name] = def[name] ?? [];
    overlay[name] = new Map();
  }

  /** 정적 소스 + 오버레이를 순서대로 훑는다. 합성 규칙은 아래 두 샘플러가 각자 정한다. */
  function* all(name) {
    yield* (sources[name] ?? []);
    const ov = overlay[name];
    if (ov) yield* ov.values();
  }

  return {
    def,

    /**
     * 소스가 하나도 없는가. **getter 여야 한다** — `physics/fields.js`·`rules/engine.js`·
     * `physics/predict.js` 네 곳이 이 값을 조기 반환 게이트로 쓰는데, 생성 시점에 한 번
     * 계산해 두면 **소스 없이 시작한 맵은 런타임에 추가한 것을 영영 무시한다.**
     */
    get isEmpty() {
      return [...VECTOR_FIELDS, ...SCALAR_FIELDS]
        .every((name) => sources[name].length === 0 && overlay[name].size === 0);
    },

    /**
     * 런타임 소스를 슬롯에 꽂거나(`src`) 뺀다(`null`).
     *
     * ★ 이것이 이 시스템에 새로 생기는 **유일한 메커니즘**이고, 일부러 일반 능력으로 뒀다.
     *   맵 데이터는 정적이라 "상태에 따라 켜지는 필드"(보스의 흡입·빔처럼 HP 로 구동되는 것)를
     *   표현할 수 없다. 그렇다고 화면에 `if (stage === '...')` 를 넣으면 원칙 1 이 깨진다.
     *   이름 붙은 슬롯이면 **어느 맵이든** 자기 상태를 필드로 흘려보낼 수 있고, 소비자
     *   (물리·규칙 엔진·물 렌더·예측선)는 무엇이 꽂혔는지 몰라도 된다.
     *
     * ⚠ 키는 소유자가 정한다 (`'boss:suck'` 처럼 접두사를 붙일 것). 같은 키에 다시 꽂으면
     *   덮어쓴다 — 매 프레임 갱신하는 소스(움직이는 흡입 중심)를 그렇게 쓴다.
     *
     * @param {string} name 필드 이름 (VECTOR_FIELDS | SCALAR_FIELDS)
     * @param {string} key  슬롯 이름
     * @param {object|null} src 소스 하나, 또는 null 이면 제거
     */
    setSource(name, key, src) {
      const ov = overlay[name];
      // `loadRules` 와 같은 정신 — 오타를 조용히 삼키면 밸런싱 중에 물리 버그로 착각한다.
      if (!ov) throw new Error(`모르는 필드 '${name}'.`);
      if (src == null) ov.delete(key);
      else ov.set(key, src);
    },

    /** 벡터장은 **합**한다 — 두 바람이 겹치면 합성풍이 된다. */
    sampleVector(name, x, y, time = 0) {
      let vx = 0;
      let vy = 0;
      for (const src of all(name)) {
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
      for (const src of all(name)) {
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
