// 도착 판정 — **도착하는 것은 배가 아니라 주인공이다.**
//
// 선체 폴리곤이 골 영역에 겹치는지로 재면 두 가지가 새어 나온다. 둘 다 §7 이 배를 쪼갤 수
// 있게 만든 순간 실제로 일어나는 일이다:
//  ① 뱃머리만 밀어 넣고 몸통은 밖에 둔 채로 클리어된다. 길쭉한 배가 §2.1 의 대가는 다 치르고
//     클리어 라인만 6 m 먼저 받는 셈이라, 형상 선택의 저울이 한쪽으로 기운다.
//  ② 잘려 나간 파편 하나가 표류해 들어가도 클리어된다 — 주인공은 반대편 조각에 실려
//     가라앉는 중인데도. 파손이 곧 실패라는 §7 의 전제가 여기서 통째로 무너진다.
//
// 그래서 판정은 `hull.crew` 점 하나로만 한다 (game/crew.js). 배가 아무리 크게 걸쳐 있어도
// 사람이 안 들어왔으면 도착이 아니다.
//
// 골은 **맵 데이터**다. 이 파일에 있는 것은 그 데이터를 읽는 판정 하나뿐이고, 맵마다 다른
// 처리는 없다 — 있을 수도 없다 (원칙 1).

export const GOAL_DEFAULTS = {
  /** 도착 지점 반경 (m). 선체 길이보다 작게 두어야 "배는 걸쳤는데 사람은 밖"이 실제로 생긴다. */
  radius: 5,
  label: '도착',
};

/**
 * 맵 데이터 한 줄 → 골 객체.
 * @param {{x:number, y:number, radius?:number, label?:string}} spec
 */
export function createGoal(spec) {
  if (!spec || !Number.isFinite(spec.x) || !Number.isFinite(spec.y)) return null;
  return { ...GOAL_DEFAULTS, ...spec };
}

/** 주인공에서 골 중심까지의 거리 (m). 남은 거리 표시용. */
export function goalDistance(goal, at) {
  if (!goal || !at) return Infinity;
  return Math.hypot(at.x - goal.x, at.y - goal.y);
}

/**
 * 도착했는가.
 *
 * @param {object} goal createGoal 결과
 * @param {{x:number,y:number}|null} at **주인공의** 월드 좌표 (crewWorldPoint). 선체 중심도
 *        외곽선도 넘기지 말 것 — 그 순간 위 ①②가 되살아난다.
 */
export function goalReached(goal, at) {
  return goalDistance(goal, at) <= (goal?.radius ?? 0);
}
