// 필드가 선체·아이템에 만드는 힘 — **순수 함수만.** planck 도 필드 샘플러도 모른다.
//
// hydro.js · devices.js 와 같은 규약을 지킨다: 로컬 좌표계에서 (fx, fy, torque) 를 내고,
// predict.js 가 같은 함수를 그대로 불러 쓴다. 필드 힘만 예측 전용으로 다시 쓰는 순간
// 바람 맵에서 궤적선이 거짓말을 시작한다.
export const SAIL_TUNING = {
  /**
   * 풍압계수 — 힘 = coeff × 면적 × (상대풍·법선)|상대풍·법선|.
   *
   * 실제 값이 아니라 게임 노브이고, **기준은 역풍 페널티다.** D3 2장("1장의 정답이 페널티로
   * 반전")이 성립하려면 역풍에서 돛을 단 배가 눈에 띄게 느려야 한다.
   *
   * ⚠ 노 추력(oarStrokePeak)과 **묶여 있다.** 이 값은 돛 힘과 노 힘의 비로 체감되므로,
   *   노를 세게 만들면 같은 계수라도 페널티가 희석된다 (실측: 노 250 → 400 으로 올렸더니
   *   페널티가 38% → 15% 로 떨어졌다). 한쪽을 건드리면 벤치의 역풍 케이스를 반드시 다시 본다.
   *   ⚠ 반대쪽으로도 똑같이 움직인다: 조작감 때문에 노를 800 → 550 으로 **내리자** 같은 6.5
   *     에서 페널티가 41% → **87%** 로 뛰었다 (20초에 78 → 10 m). 2장의 "돛을 떼라"는 이제
   *     권유가 아니라 사실상 강제다. 돛을 달고도 기어서 통과할 여지를 남기고 싶으면 **여기를
   *     내려라** — 노를 다시 올리면 조작감 판정이 되돌아간다.
   */
  pressureCoeff: 6.5,
  /** 젖은 천은 무겁고 바람을 흘린다 (§3 원칙 2 — 젖음 해법의 대가). 규칙표가 이 값을 켠다. */
  wetScale: 0.5,
};

/**
 * ★ 순수 함수 — 상대풍과 돛 법선의 내적(w·n). 부호가 있다: 순풍이면 +, 역풍이면 −.
 *
 * `sailForceLocal` 의 힘 크기뿐 아니라 `sail/render.js` 의 돛 배 부름(billow) 연출도 같은
 * 정렬도를 쓴다 — 힘과 그림이 서로 다른 식으로 갈라지면 "세게 미는데 안 부푼 돛"이 생긴다.
 *
 * @param {object} item 돛 아이템 (angle = 법선)
 * @param {{x:number,y:number}} windLocal 선체 로컬 좌표계의 바람 벡터
 * @param {{u:number,v:number}} vel 선체 로컬 속도 — 상대풍을 만들려면 빼야 한다
 * @returns {number}
 */
export function sailAlignment(item, windLocal, vel) {
  if (!windLocal) return 0;
  const wx = windLocal.x - vel.u;
  const wy = windLocal.y - vel.v;
  const nx = Math.cos(item.angle ?? 0);
  const ny = Math.sin(item.angle ?? 0);
  return wx * nx + wy * ny;
}

/**
 * ★ 순수 함수 — 돛 하나가 내는 로컬 힘.
 *
 * 힘 = C × A × (w·n)|w·n| × n   (w = 상대풍, n = 돛 법선)
 *
 * 부호를 보존하는 2차형이라 세 성질이 **식 하나에서** 나온다. 조건 분기가 없다:
 *  - 순풍(w·n > 0)이면 법선 방향으로 밀린다
 *  - **역풍(w·n < 0)이면 그대로 역추력**이 된다 — §3 이 말하는 천의 약점
 *  - 바람과 돛이 나란하면(w·n = 0) 아무 일도 없다
 *
 * @param {object} item 돛 아이템 (angle = 법선, area = 돛 면적)
 * @param {{x:number,y:number}} windLocal 선체 로컬 좌표계의 바람 벡터
 * @param {{u:number,v:number}} vel 선체 로컬 속도 — 상대풍을 만들려면 빼야 한다
 * @returns {{fx:number, fy:number}}
 */
export function sailForceLocal(item, windLocal, vel) {
  const area = item.area ?? 0;
  if (!(area > 0) || !windLocal) return { fx: 0, fy: 0 };

  const dot = sailAlignment(item, windLocal, vel);
  const nx = Math.cos(item.angle ?? 0);
  const ny = Math.sin(item.angle ?? 0);

  const scale = item.status?.wet > 0 ? SAIL_TUNING.wetScale : 1;
  const f = SAIL_TUNING.pressureCoeff * area * dot * Math.abs(dot) * scale;
  return { fx: f * nx, fy: f * ny };
}

/**
 * ★ 순수 함수 — 아이템들이 필드에서 받는 로컬 합력·합토크.
 *
 * @param {Array<object>} items hull.items
 * @param {{x:number,y:number}} windLocal 로컬 바람 벡터 (없으면 힘 0)
 * @param {{u:number,v:number,w:number}} vel 로컬 속도
 * @returns {{fx:number, fy:number, torque:number}}
 */
export function fieldForcesLocal(items, windLocal, vel) {
  let fx = 0;
  let fy = 0;
  let torque = 0;
  if (!windLocal || (windLocal.x === 0 && windLocal.y === 0)) return { fx, fy, torque };

  for (const item of items) {
    if (item.type !== 'sail') continue;
    const f = sailForceLocal(item, windLocal, vel);
    fx += f.fx;
    fy += f.fy;
    // 일반형 외적 — 돛이 중심선을 벗어나 있으면 바람마다 요잉이 생긴다 (§4.2).
    torque += item.x * f.fy - item.y * f.fx;
  }
  return { fx, fy, torque };
}

/** 월드 벡터를 선체 로컬로 — 회전만, 평행이동 없음. */
export function toLocalVector(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c };
}
