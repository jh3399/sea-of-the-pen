// 항해 진행 — 지금 몇 번째 바다에 있는가.
//
// ★ **이 파일은 맵을 하나도 모른다.** id 순서만 들고 있고, 그 id 로 무엇을 그릴지는
//   `sail/map.js` 가, 무슨 대사를 할지는 `story/script.js` 가 정한다. 설계 원칙 1
//   ("맵별 특수 처리 코드 0줄")을 진행 상태에도 그대로 적용한 것이다 — 스테이지를
//   더할 때 고치는 곳이 이 배열 하나여야 한다.
//
// 세션 저장인 이유: `shipwright:handoff`(배 설계)가 세션이라서다. 진행만 localStorage 에
// 두면 탭을 새로 열었을 때 **3장 진행도인데 배가 없는** 상태가 되고, 그러면 폴백 슬루프로
// 3장을 시작하게 된다. 둘의 수명은 반드시 같아야 한다.

const STAGE_KEY = 'shipwright:stage';

/**
 * 바다의 순서. `sail/map.js` 의 `MAPS` 키와 1:1 이다.
 *
 * `interlude` 는 **그 바다를 클리어한 뒤** 재생할 대사 비트다 (`story/script.js` 의 키).
 * null 이면 곧바로 다음 바다로 넘어간다. 대사가 스테이지 데이터에 붙어 있어야
 * "연습 다음에 섬 이야기"라는 순서가 코드가 아니라 데이터로 남는다.
 *
 * `hints` 는 항해 화면에 조작 안내판을 띄울지다. **연습 해역에만 켠다** — D4 통과 질문이
 * "튜토리얼 텍스트 없이 1장을 클리어하는가"라, 1장부터는 화면이 설명하지 않아야 한다.
 */
export const STAGES = [
  { id: 'practice', label: '연습 해역', interlude: 'FIRST_ISLAND', hints: true },
  { id: 'reef', label: '바위 협곡', interlude: null, hints: false },
];

/** 지금 스테이지의 인덱스. 저장값이 깨졌거나 범위를 벗어나면 처음으로 되돌린다. */
export function stageIndex() {
  const raw = Number.parseInt(sessionStorage.getItem(STAGE_KEY) ?? '0', 10);
  if (!Number.isFinite(raw) || raw < 0 || raw >= STAGES.length) return 0;
  return raw;
}

/** 지금 스테이지. */
export function currentStage() {
  return STAGES[stageIndex()];
}

/** 다음 스테이지가 있는가 (마지막 바다에서는 「다음 스테이지」 버튼이 잠긴다). */
export function hasNextStage() {
  return stageIndex() + 1 < STAGES.length;
}

/**
 * 한 칸 나아간다. @returns {object|null} 새 스테이지 (마지막이었으면 null)
 *
 * 마지막에서 더 나아가려 해도 **인덱스를 늘리지 않는다.** 늘려 두면 `stageIndex` 가
 * 범위를 벗어난 값을 처음으로 되돌려, 클리어했더니 연습 해역으로 돌아가 있게 된다.
 */
export function advanceStage() {
  const i = stageIndex();
  if (i + 1 >= STAGES.length) return null;
  sessionStorage.setItem(STAGE_KEY, String(i + 1));
  return STAGES[i + 1];
}

/** 처음부터 다시 (메인 메뉴에서 새 항해를 시작할 때). */
export function resetStage() {
  sessionStorage.removeItem(STAGE_KEY);
}

/**
 * 항해 전체 노선 — **지도가 읽는 데이터**다. 아직 못 가는 바다까지 들어 있다.
 *
 * ★ `STAGES` 와 나눠 둔 이유: STAGES 는 "지금 플레이할 수 있는 것"이고 ROUTE 는
 *   "포포가 말한 전체 여정"이다. S-02 에서 바다 셋을 다 들었으므로 루도 플레이어도
 *   갈 곳을 이미 안다 — 지도에 없으면 오히려 이상하다. 만들어지지 않은 바다는
 *   `locked` 로 흐리게 그린다 (`sail/voyagemap.js`).
 * ⚠ 이름과 한 줄 설명은 [S-02] 포포의 대사에서 그대로 가져온 것이다. 한쪽만 고치면
 *   지도와 이야기가 어긋난다.
 */
export const ROUTE = [
  { id: 'practice', name: '시작의 섬', note: '노를 익힌 곳' },
  { id: 'reef', name: '바위 협곡', note: '바람은 등을 밀어주지만, 주변이 온통 바위' },
  { id: 'storm', name: '역풍 협곡', note: '바람이 정면으로 막아서고, 해적이 들끓는다', locked: true },
  { id: 'volcano', name: '불의 바다', note: '물 대신 용암이 흐르는 곳', locked: true },
  { id: 'bulgasari', name: '불가사리의 바다', note: '전설로만 전해지던 그것', locked: true },
];

/** 지도에서 "여기까지 왔다" 를 표시할 지점. ROUTE 인덱스. */
export function routeIndex() {
  const id = currentStage().id;
  const i = ROUTE.findIndex((r) => r.id === id);
  return i < 0 ? 0 : i;
}
