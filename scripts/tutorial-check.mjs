import assert from 'node:assert/strict';
import {
  TUTORIAL_STEPS,
  createTutorialState,
  currentTutorialStep,
  reduceTutorial,
} from '../src/draw/tutorial-flow.js';

let checked = 0;
function check(name, run) {
  run();
  checked += 1;
  console.log(`  PASS  ${name}`);
}

console.log('\n▌그리기 튜토리얼 진행 검사');

check('처음에는 선체 그리기 단계다', () => {
  assert.equal(currentTutorialStep(createTutorialState()).id, 'draw-hull');
});

check('선체 없는 행동 단계는 다음으로 건너뛸 수 없다', () => {
  const state = createTutorialState();
  assert.deepEqual(reduceTutorial(state, 'NEXT', { hasValidHull: false }), state);
});

check('관계없는 이벤트는 행동 단계를 진행시키지 않는다', () => {
  const state = createTutorialState();
  assert.deepEqual(reduceTutorial(state, 'OAR_PLACED', { hasOar: true }), state);
});

check('유효 선체 확정은 상태줄 단계로 한 번 진행한다', () => {
  const next = reduceTutorial(createTutorialState(), 'HULL_CONFIRMED', { hasValidHull: true });
  assert.equal(currentTutorialStep(next).id, 'status');
  assert.deepEqual(reduceTutorial(next, 'HULL_CONFIRMED', { hasValidHull: true }), next);
});

check('정보 단계는 다음 버튼으로 진행한다', () => {
  let state = reduceTutorial(createTutorialState(), 'HULL_CONFIRMED', { hasValidHull: true });
  state = reduceTutorial(state, 'NEXT', { hasValidHull: true });
  assert.equal(currentTutorialStep(state).id, 'oar-device');
});

check('노 배치는 해당 행동 단계에서만 진행한다', () => {
  let state = createTutorialState();
  state = reduceTutorial(state, 'HULL_CONFIRMED', { hasValidHull: true });
  state = reduceTutorial(state, 'NEXT', {});
  state = reduceTutorial(state, 'NEXT', {});
  assert.equal(currentTutorialStep(state).id, 'place-oar');
  state = reduceTutorial(state, 'OAR_PLACED', { hasOar: true });
  assert.equal(currentTutorialStep(state).id, 'blueprint');
});

check('설계 초기화는 활성 튜토리얼을 첫 단계로 돌린다', () => {
  const later = { status: 'active', index: 6 };
  assert.equal(currentTutorialStep(reduceTutorial(later, 'DESIGN_RESET')).id, 'draw-hull');
});

check('기존 설계 재생은 충족된 행동 단계를 다음으로 넘길 수 있다', () => {
  let state = createTutorialState();
  state = reduceTutorial(state, 'NEXT', { hasValidHull: true });
  assert.equal(currentTutorialStep(state).id, 'status');
  state = { status: 'active', index: 3 };
  state = reduceTutorial(state, 'NEXT', { hasOar: true });
  assert.equal(currentTutorialStep(state).id, 'blueprint');
});

check('건너뛰기와 완료 뒤에는 진행 이벤트를 무시한다', () => {
  const dismissed = reduceTutorial(createTutorialState(), 'SKIP');
  assert.equal(dismissed.status, 'dismissed');
  assert.deepEqual(reduceTutorial(dismissed, 'HULL_CONFIRMED', { hasValidHull: true }), dismissed);

  const completed = reduceTutorial({ status: 'active', index: TUTORIAL_STEPS.length - 1 }, 'FINISHED');
  assert.equal(completed.status, 'completed');
  assert.deepEqual(reduceTutorial(completed, 'DESIGN_RESET'), completed);
});

console.log(`\n${checked}/${checked} 통과\n`);
