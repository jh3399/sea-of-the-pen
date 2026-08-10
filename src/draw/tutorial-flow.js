import { unlockedItems } from '../game/progress.js';

/**
 * 단계 전문. 실제로 쓰이는 것은 아래 `TUTORIAL_STEPS` 이고, **그 바다에서 의미 없는 단계는
 * 빠진다** — 첫 배는 노만 달아서 아이템 칸 자체가 숨어 있는데, 없는 칸을 가리키며
 * "아이템을 붙이세요" 하면 화면에 빈 테두리만 뜬다.
 */
const ALL_STEPS = [
  {
    id: 'draw-hull',
    target: '#ink',
    mode: 'action',
    completionEvent: 'HULL_CONFIRMED',
    title: '배의 선체를 그려 보세요',
    body: '가운데 주인공을 감싸도록 한 번에 닫힌 선을 그리세요. 그린 모양이 그대로 배의 무게와 움직임이 됩니다.',
    actionHint: '선체를 완성하면 자동으로 다음 단계로 넘어갑니다.',
  },
  {
    id: 'status',
    target: '#status',
    mode: 'info',
    title: '여기서 결과를 확인하세요',
    body: '선체가 너무 작거나 무너졌는지, 주인공이 배 안에 있는지, 다음에 무엇을 해야 하는지 알려 줍니다.',
  },
  {
    id: 'oar-device',
    target: '#device-list',
    mode: 'info',
    title: '노는 꼭 달아야 합니다',
    body: '선체가 완성되면 노 배치가 자동으로 선택됩니다. 노를 다는 앞뒤 위치와 그곳의 선폭이 배의 조향을 바꿉니다.',
  },
  {
    id: 'place-oar',
    target: '#ink',
    mode: 'action',
    completionEvent: 'OAR_PLACED',
    title: '노의 위치를 정하세요',
    body: '선체가 넓은 곳을 클릭하세요. 좌우 노는 그 자리의 양쪽 가장자리에 한 쌍으로 붙습니다.',
    actionHint: '올바른 위치에 노를 달면 자동으로 다음 단계로 넘어갑니다.',
  },
  {
    id: 'blueprint',
    target: '#blueprint-toggle',
    mode: 'info',
    title: '도면을 밑그림으로 쓸 수 있어요',
    body: '모양이 어렵다면 도면 보기를 열어 밑그림을 따라 그리세요. 도면은 완성된 선체에는 포함되지 않습니다.',
  },
  {
    id: 'items',
    target: '#item-list',
    mode: 'info',
    title: '아이템을 배 안에 붙이세요',
    body: '아이템을 선택한 뒤 선체 안을 클릭하면 부착됩니다. 같은 아이템을 다시 선택해 마커를 클릭하면 뗄 수 있습니다.',
  },
  {
    id: 'material',
    target: '#material-list',
    mode: 'info',
    title: '배의 재질을 고르세요',
    body: '재질은 배의 무게와 환경 반응을 결정합니다. 지금 선택된 재질은 선체의 펜 색으로도 표시됩니다.',
  },
  {
    id: 'clear',
    target: '#btn-clear',
    mode: 'info',
    title: '처음부터 다시 그릴 수 있어요',
    body: '다시 그리기는 선체와 장치, 아이템, 도면 선택을 모두 초기화합니다. 지금 누르지 않아도 됩니다.',
  },
  {
    id: 'finish',
    target: '#btn-finish',
    mode: 'action',
    completionEvent: 'FINISHED',
    title: '완성하면 바다로 나갑니다',
    body: '주인공을 감싼 유효한 선체와 노 위치가 준비되면 완성하기가 열립니다. 버튼을 눌러 항해를 시작하세요.',
    actionHint: '완성하기 버튼을 누르면 튜토리얼도 끝납니다.',
  },
];

/**
 * 이번 화면에서 실제로 도는 단계.
 *
 * ⚠ 이 모듈은 순수한 편이 좋지만 여기서만 진행도를 읽는다 — 단계 목록이 화면 구성과
 *   어긋나면 튜토리얼이 없는 것을 가리키기 때문이다. `unlockedItems()` 는 sessionStorage 가
 *   없는 환경(node 검사)에서 "처음부터"로 읽으므로 헤드리스에서도 안전하다.
 */
export const TUTORIAL_STEPS = ALL_STEPS.filter(
  (step) => step.id !== 'items' || unlockedItems().size > 0,
);

export function createTutorialState() {
  return { status: 'active', index: 0 };
}

export function currentTutorialStep(state, steps = TUTORIAL_STEPS) {
  if (state.status !== 'active') return null;
  return steps[state.index] ?? null;
}

export function isStepSatisfied(step, snapshot) {
  if (!step || step.mode !== 'action') return false;
  if (step.id === 'draw-hull') return Boolean(snapshot.hasValidHull);
  if (step.id === 'place-oar') return Boolean(snapshot.hasOar);
  if (step.id === 'finish') return Boolean(snapshot.canFinish);
  return false;
}

function advance(state, steps) {
  const nextIndex = state.index + 1;
  if (nextIndex >= steps.length) return { status: 'completed', index: state.index };
  return { status: 'active', index: nextIndex };
}

/**
 * @param {object[]} [steps] 이번 상태 전이가 도는 단계 목록. 기본값은 그리기 화면의 첫 안내
 *   (`TUTORIAL_STEPS`)이고, 스테이지 전환마다 새로 열린 아이템·재질을 짚어주는
 *   `draw/unlock-tutorial.js` 도 같은 리듀서를 자기 목록으로 재사용한다 — 상태 기계가
 *   두 벌로 갈라지지 않는다.
 */
export function reduceTutorial(state, event, snapshot = {}, steps = TUTORIAL_STEPS) {
  if (event === 'REPLAY') return createTutorialState();
  if (state.status !== 'active') return state;
  if (event === 'SKIP') return { ...state, status: 'dismissed' };
  if (event === 'FINISHED') return { ...state, status: 'completed' };
  if (event === 'DESIGN_RESET') return createTutorialState();

  const step = currentTutorialStep(state, steps);
  if (!step) return state;

  if (event === 'NEXT') {
    if (step.mode === 'info' || isStepSatisfied(step, snapshot)) return advance(state, steps);
    return state;
  }

  if (step.completionEvent === event) return advance(state, steps);
  return state;
}
