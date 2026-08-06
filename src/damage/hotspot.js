// 파손이 **어디서** 일어나는가 — §7 이 거동으로 읽히려면 이 한 가지가 맞아야 한다.
//
// ★ 지점은 반드시 **외곽선 위**여야 한다.
//
// 선체 안쪽을 깎으면 clipper 결과가 구멍(hole)이 되어 `outline` 이 그대로 남는다.
// `params.js` 의 length·beam 은 `projectedExtent(outline)` 에서 나오므로 **저항 타원이
// 안 바뀌고**, `respawnPieces` 가 아이템을 재중심화해도 무게중심이 거의 안 움직인다.
// 즉 "HP바가 아니라 거동 변화로 피해를 감지한다"(§7.3.1)가 성립할 수가 없다.
// 외곽선 위를 깎으면 저항 타원 비대칭화와 무게중심 이동이 **동시에** 일어나고,
// D1·D2 가 검증한 비대칭 창발 경로(τ = −y·F)가 신규 코드 0줄로 재사용된다.
//
// 이 모듈은 필드 샘플러를 **주입**받는다. `field/` 도 planck 도 모르므로 순수 함수이고,
// 무엇이 뜨거운지(온도인지 전기인지)는 규칙표가 정한다 — 여기에 필드 이름은 없다.

/** 외곽선을 훑는 최대 점 수. 규칙 엔진이 10 Hz 로 돌므로 이 정도면 예산에 안 잡힌다. */
export const HOTSPOT_SAMPLES = 24;

/**
 * 선체 외곽선 위에서 스칼라장이 가장 큰 점.
 *
 * 변을 보간하지 않고 **정점만** 고른다. 보간점을 쓰면 차감 브러시의 중심이 폴리곤 변 위에
 * 얹혀 clipper 가 접선 케이스를 만나고, 얻는 정확도는 브러시 반경에 비하면 무의미하다.
 *
 * @param {Array<{x,y}>} outline 선체 로컬 폴리곤 (무게중심이 원점)
 * @param {(x:number, y:number) => {x:number, y:number}} toWorld 로컬 → 월드
 * @param {(x:number, y:number) => number} sampleAt 월드 좌표의 스칼라 값
 * @returns {{local:{x,y}, world:{x,y}, value:number, spread:number}|null}
 *   spread = 훑은 점들의 최댓값 − 최솟값. 0 이면 그 자리 필드가 평평하다는 뜻이므로,
 *   호출자는 `mostExposedPoint` 로 넘어가야 한다 (어느 쪽이 더 탔는지 말할 근거가 없다).
 */
export function hottestOutlinePoint(outline, toWorld, sampleAt) {
  if (!outline?.length) return null;

  const stride = Math.max(1, Math.ceil(outline.length / HOTSPOT_SAMPLES));
  let best = null;
  let hi = -Infinity;
  let lo = Infinity;

  for (let i = 0; i < outline.length; i += stride) {
    const local = outline[i];
    const world = toWorld(local.x, local.y);
    const value = sampleAt(world.x, world.y);
    if (!Number.isFinite(value)) continue;
    if (value < lo) lo = value;
    if (value > hi) {
      hi = value;
      best = { local, world, value };
    }
  }
  if (!best) return null;
  return { ...best, spread: hi - lo };
}

/**
 * 폴백 — 무게중심에서 가장 먼 외곽 점.
 *
 * 필드가 평평하면 "어느 쪽이 더 탔는가"를 말할 근거가 없다. 그때 돌출부를 고르는 것은
 * 임의의 선택이 아니라 §2.2 그대로다: **"뾰족한 돌출부는 충돌 데미지가 집중된다."**
 * 덕분에 "길게 뽑은 충각이 먼저 부러진다"가 이 폴백 하나에서 따라 나온다.
 *
 * @param {Array<{x,y}>} outline 선체 로컬 폴리곤 (무게중심이 원점)
 * @returns {{x:number, y:number}|null}
 */
export function mostExposedPoint(outline) {
  if (!outline?.length) return null;
  let best = null;
  let far = -Infinity;
  for (const p of outline) {
    const d = p.x * p.x + p.y * p.y;
    if (d > far) {
      far = d;
      best = p;
    }
  }
  return best;
}
