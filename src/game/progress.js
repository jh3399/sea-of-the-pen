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
 *
 * `gear` 는 지도·장비창(Tab)을 열 수 있는지다. **첫 항해에는 없다** — 해도는 시작의 섬에서
 * 세렌이 준다 ([S-06]). 받기도 전에 열리면 그 장면이 소품을 잃는다.
 * ⚠ 설정창(Esc)은 이것과 무관하게 **항상** 열린다. 게임을 끝낼 방법은 언제나 있어야 한다.
 *
 * `items` · `materials` 는 그 바다에 **이르렀을 때 열리는** 것들이다 (`unlockedItems`).
 * 누적이라 앞 바다의 것도 계속 쓸 수 있다.
 * ⚠ 첫 배는 **노만** 달고 그린다. 아이템이 하나도 없는 것이 의도다 — 연습 해역은 노 젓기를
 *   익히는 바다이고, 키도 돛도 세렌을 만난 뒤에 열린다.
 */
export const STAGES = [
  {
    id: 'practice',
    label: '연습 해역',
    interlude: 'FIRST_ISLAND',
    hints: true,
    gear: false,
    items: [],
    materials: ['wood'],
  },
  {
    id: 'reef',
    label: '바위 협곡',
    interlude: 'ROCK_ISLE',
    hints: false,
    gear: true,
    items: ['rudder', 'sail'],
    materials: [],
  },
  {
    id: 'storm',
    label: '역풍 협곡',
    interlude: 'STORM_ISLE',
    hints: false,
    gear: true,
    items: [],
    materials: [],
  },
  {
    /**
     * ★ 이 둘은 **연출용 보상이 아니라 통행증**이다. 불의 바다는 해역 전체가 330° 라
     *   (목재 발화점 250° 위) 나무 선체가 출발선에서 4.2초 만에 무너진다 — 철이 없으면
     *   3장은 클리어 자체가 불가능하다.
     * ★ `booster` 가 함께 있어야 하는 이유: 기본 노는 `items/defaults.js` 에서
     *   `material: 'wood'` 로 박혀 있어 **철 선체가 버텨도 노는 탄다.** 남는 장치가 닻뿐이라
     *   배가 표류한다. 벤치가 그 답까지 적어 두었다 —
     *   "철 부스터는 살아남아 노를 잃은 뒤의 추진이 된다".
     * ⚠ 둘 중 하나만 열면 3장이 조용히 클리어 불가가 된다. 같이 움직일 것.
     *   [S-08] 블루베리의 대사도 이 둘과 1:1 이다 (철 · 노는 탄다 · 그래서 부스터).
     */
    id: 'volcano',
    label: '불의 바다',
    interlude: 'STAR_ISLE',
    hints: false,
    gear: true,
    items: ['booster'],
    materials: ['iron'],
  },
  {
    /**
     * 4장 — 끌려간다. 싸우는 것은 **다음** 바다다.
     *
     * ★ **아무것도 새로 열지 않는다** (`items`·`materials` 가 비어 있다). [S-09] 에서
     *   3인방이 "아무것에도 맞추지 말고 타고 싶은 걸 그려"라고 하는 것과 짝이다 —
     *   여기서 뭔가를 더 주면 그 말이 거짓이 되고, 마지막 배가 또 하나의 숙제가 된다.
     *   여태 열린 것(키·돛·부스터·철·대포)은 그대로 다 쓸 수 있다.
     * ★ `interlude` 로 [S-10] 을 붙인다 — **없으면 보스전을 못 이긴다.** 대포가 그 대사에서
     *   열리고(보스 핵은 hull 이라 포탄으로만 깎인다), "입이 열린 6초에만 뚫린다"를 말해
     *   주는 곳이 거기뿐이다. 막간의 끝은 늘 그리기 화면이라 대포를 달 자리도 같이 생긴다.
     */
    id: 'maw',
    label: '삼키는 바다',
    interlude: 'BEFORE_BOSS',
    hints: false,
    gear: true,
    items: [],
    materials: [],
  },
  {
    /**
     * ★ **마지막 스테이지인 것이 곧 엔딩 트리거다.** `sail/screen.js` 의 `toNextStage()` 가
     *   `hasNextStage()` 로만 판단하므로(스테이지 이름을 모른다) 여기를 클리어하면
     *   `index.html?ending=1` 로 간다. 뒤에 바다를 더하면 엔딩이 그쪽으로 옮겨 간다.
     *
     * `items: ['cannon']` — 보스의 핵은 `hull`(`material:'flesh'`)이라 포탄으로만 깎인다.
     *   [S-10] 대사가 "대포. 배에 붙이고 F 로 쏴"라고 건네는 자리(`maw` 의 `interlude`)가
     *   끝나면 `playInterlude` 가 `advanceStage()` 로 여기로 넘어온 뒤 `draw.html` 을 연다 —
     *   그 그리기 화면이 읽는 `unlockedItems()` 가 바로 이 스테이지 것이므로, 대포는
     *   **여기**(전 바다가 아니라)에 열어야 인물이 건넨 것과 화면이 주는 것이 맞는다.
     */
    id: 'bulgasari',
    label: '불가사리의 바다',
    interlude: null,
    hints: false,
    // ⚠ `gear: false` 는 **일시정지 문제** 때문이다. Tab 도 Esc 도 물리를 멈추지 않고
    //   조종만 끊으므로(`sail/screen.js` 의 `panelOpen`), 탄막 한복판에서 창이 열리면
    //   그대로 맞는다. 설정(Esc)은 끌 수 없으니 보스 시계를 멈춰 막고, 지도(Tab)는
    //   **데이터로** 막는다. 서사적으로도 공짜다 — 여기가 노선의 끝이라 읽을 해도가 없다.
    gear: false,
    items: ['cannon'],
    materials: [],
  },
];

/** 지금까지 열린 것들을 모은다 (앞 바다 것 포함). */
function accumulate(field) {
  const out = new Set();
  for (let i = 0; i <= stageIndex(); i++) {
    for (const v of STAGES[i][field] ?? []) out.add(v);
  }
  return out;
}

/** 지금 그리기 화면에서 붙일 수 있는 아이템 타입들. */
export function unlockedItems() {
  return accumulate('items');
}

/** 지금 고를 수 있는 재질들. */
export function unlockedMaterials() {
  return accumulate('materials');
}

/**
 * 세션 저장소 — **없을 수도 있다.** 이 모듈은 벤치(`scripts/bench.mjs`)와 튜토리얼 검사
 * (`scripts/tutorial-check.mjs`)가 node 에서 import 하는데, 거기엔 sessionStorage 가 없다.
 * 없으면 "처음부터"로 읽는 것이 맞다 — 헤드리스 검사는 항상 첫 항해를 본다.
 */
function store() {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

/** 지금 스테이지의 인덱스. 저장값이 깨졌거나 범위를 벗어나면 처음으로 되돌린다. */
export function stageIndex() {
  const raw = Number.parseInt(store()?.getItem(STAGE_KEY) ?? '0', 10);
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
  store()?.setItem(STAGE_KEY, String(i + 1));
  return STAGES[i + 1];
}

/** 처음부터 다시 (메인 메뉴에서 새 항해를 시작할 때). */
export function resetStage() {
  store()?.removeItem(STAGE_KEY);
}

/**
 * 개발자 전용 — 스테이지를 임의 인덱스로 곧장 지정한다 (`menu/screen.js` 의 숫자 키 단축키).
 *
 * `advanceStage()` 와 달리 한 칸씩만 가지 않고, 범위 안이면 뒤로도 간다 — 테스트 중인
 * 스테이지를 몇 번이고 다시 열어야 하는 용도라 순방향 전용일 이유가 없다.
 */
export function jumpToStage(index) {
  if (!Number.isInteger(index) || index < 0 || index >= STAGES.length) return;
  store()?.setItem(STAGE_KEY, String(index));
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
  { id: 'practice', kind: 'isle', name: '시작의 섬', note: '노를 익힌 곳' },
  { id: 'reef', kind: 'reef', name: '바위 협곡', note: '바람은 등을 밀어주지만, 주변이 온통 바위' },
  { id: 'storm', kind: 'storm', name: '역풍 협곡', note: '바람이 막아서고, 해적이 들끓는다' },
  { id: 'volcano', kind: 'volcano', name: '불의 바다', note: '물 대신 용암이 흐르는 곳' },
  { id: 'maw', kind: 'abyss', name: '삼키는 바다', note: '가까이 간 것은 놓아주지 않는다' },
  { id: 'bulgasari', kind: 'abyss', name: '불가사리의 바다', note: '전설로만 전해지던 그것' },
];

/** 지도에서 "여기까지 왔다" 를 표시할 지점. ROUTE 인덱스. */
export function routeIndex() {
  const id = currentStage().id;
  const i = ROUTE.findIndex((r) => r.id === id);
  return i < 0 ? 0 : i;
}
