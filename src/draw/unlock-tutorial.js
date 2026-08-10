// 스테이지가 바뀌며 새로 열린 아이템·재질을 그리기 화면에서 한 번 짚어주는 안내.
//
// `game/progress.js` 의 STAGES[].items/materials 는 이미 "이번 바다에 이르러 새로 열린 것"
// 만 담고 있다(누적은 accumulate() 가 따로 한다) — 이 파일은 그 값을 읽어 팔레트의 해당 칸을
// 가리키는 정보 단계로 바꾸기만 한다. 맵마다 문구를 새로 짓지 않는다: 단계 본문은 아이템·재질
// **자체**의 성질(카탈로그)에서 한 번만 쓰고, 어느 스테이지에서 열렸는지는 이 파일이 몰라도 된다
// — 원칙 1("맵별 특수 처리 코드 0줄")을 튜토리얼에도 그대로 적용한 것이다.
import { currentStage, stageIndex, STAGES } from '../game/progress.js';
import { ITEM_CATALOG, BIND_POOL } from '../items/catalog.js';
import { MATERIALS } from '../hull/params.js';
import { TUTORIAL_STEPS } from './tutorial-flow.js';

const ITEM_TIPS = {
  rudder: '고속에서만 방향을 꺾습니다. Q(좌현)·E(우현)를 누르고 있는 동안 꺾이고, 느릴 땐 거의 안 듣습니다 — 노와 같이 쓰세요.',
  sail: '바람을 받는 방향으로 미는 힘을 냅니다. 트리거가 없어 바람이 불면 항상 작동합니다 — 역풍일 때의 손해도 항상 받습니다.',
  booster: '휠을 굴려 미는 방향을 정하고 선체 안을 클릭해 붙이세요. 트리거 키를 누르고 있는 동안 그 방향으로 밉니다.',
  cannon: '휠로 포신 방향을 정해 붙이면, 배정된 키로 발사합니다. 쏠 때마다 반동으로 배가 밀리거나 돕니다.',
};

const MATERIAL_TIPS = {
  iron: '불에 강하지만 나무보다 세 배 무겁습니다. 선체가 깊이 잠기니 형태를 다시 생각해 보세요.',
};

/** 트리거를 BIND_POOL 에서 자동 배정받는 아이템인가 — `draw/screen.js` 의 isPooledBind 와
 *  같은 판별이다(부스터·대포). 키(고정 Q/E)·돛(트리거 없음)은 여기 안 걸린다. */
function isPooledBind(type) {
  return BIND_POOL.includes(ITEM_CATALOG[type]?.bind);
}

/** 이 스테이지 이전에 이미 풀 배정 아이템을 열어 본 적이 있는가 — 있으면 키 매핑 안내를
 *  또 보여줄 필요가 없다(처음 열릴 때 한 번만 설명한다). */
function hadPooledBindBefore(idx) {
  for (let i = 0; i < idx; i++) {
    if (STAGES[i].items.some(isPooledBind)) return true;
  }
  return false;
}

/**
 * 지금 스테이지에서 처음 열린 아이템·재질만 짚는 단계 목록.
 *
 * ⚠ 스테이지 0(연습 해역)은 건너뛴다 — 첫 방문은 이미 기본 튜토리얼(`tutorial-flow.js`)이
 *   패널 전체를 가리키며 훑고, 그 스테이지의 유일한 재질(나무)은 "새로 열렸다"라기보다
 *   시작값이라 다시 짚을 것이 아니다.
 */
export function unlockSteps() {
  if (stageIndex() === 0) return [];
  const stage = currentStage();
  const steps = [];
  for (const type of stage.items) {
    const spec = ITEM_CATALOG[type];
    if (!spec) continue;
    steps.push({
      id: `unlock-item-${type}`,
      target: `[data-item="${type}"]`,
      mode: 'info',
      title: `새 아이템 — ${spec.name}`,
      body: ITEM_TIPS[type] ?? `${spec.name}를 선체 안에 붙여 사용할 수 있습니다.`,
    });
  }
  // 풀 배정 트리거 아이템이 이번 스테이지에서 **처음** 열렸으면, 그 방식을 아이템 본문과
  // 분리해 따로 한 번 짚는다 — 부스터·대포에 매번 같은 설명을 반복해 붙이지 않는다.
  if (stage.items.some(isPooledBind) && !hadPooledBindBefore(stageIndex())) {
    steps.push({
      id: 'unlock-keymap',
      target: '#btn-keymap',
      mode: 'info',
      title: '트리거 키 매핑',
      body: '부스터·대포처럼 키로 조작하는 아이템에는 트리거 키가 자동 배정됩니다. 마커 위 배지를 눌러 개별로 바꾸거나, 이 "키 매핑" 버튼에서 전체 목록을 한눈에 보고 바꿀 수 있어요.',
    });
  }
  for (const key of stage.materials) {
    const mat = MATERIALS[key];
    if (!mat) continue;
    steps.push({
      id: `unlock-material-${key}`,
      target: `[data-material="${key}"]`,
      mode: 'info',
      title: `새 재질 — ${mat.name}`,
      body: MATERIAL_TIPS[key] ?? `${mat.name} 재질을 선택할 수 있습니다.`,
    });
  }
  return steps;
}

/** 저장 키 — 스테이지 id 별로 나눠 그 스테이지의 안내를 한 번만 본다. */
export function unlockStorageKey() {
  return `shipwright:drawTutorial:unlock:${currentStage().id}`;
}

/**
 * "? 튜토리얼" 버튼이 다시 보여줄 전체 목록 — 기본 안내 뒤에 지금 스테이지의 신규 해금
 * 안내를 끼워 넣는다.
 *
 * ⚠ `finish` 단계 **앞에** 끼운다. `finish` 는 Next 버튼이 없는 특별 단계라(실제로
 *   완성하기를 눌러야 다음으로 간다) — 그 뒤에 붙이면 재생 중에는 영영 도달하지 못한다.
 */
export function replaySteps() {
  const extra = unlockSteps();
  if (!extra.length) return TUTORIAL_STEPS;
  const finishIndex = TUTORIAL_STEPS.findIndex((s) => s.id === 'finish');
  if (finishIndex < 0) return [...TUTORIAL_STEPS, ...extra];
  return [
    ...TUTORIAL_STEPS.slice(0, finishIndex),
    ...extra,
    TUTORIAL_STEPS[finishIndex],
  ];
}
