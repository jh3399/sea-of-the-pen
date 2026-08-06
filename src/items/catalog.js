// §4.2 아이템 카탈로그 — **데이터만.** 힘 계산은 physics/devices.js 와 field/forces.js 에 있다.
//
// §4.1 통일 모델: 모든 아이템은 **부착 위치 · 방향 · 질량** 셋으로 정의되고, 효과는 전부
// 그 셋과 물리 법칙에서 파생된다. 아래 표에 있는 나머지 필드(force·area·kind)는 "얼마나
// 세게"에 해당하는 스칼라일 뿐, 아이템마다 다른 **동작**을 정의하지 않는다.
//
// `kind` 가 곧 힘의 종류이고, 종류는 넷뿐이다:
//   thruster  부착점에 상시력 (트리거 홀드 중)      — 부스터
//   impulse   부착점에 순간 충격량 (트리거 엣지)     — 대포 (D3)
//   foil      유속에 비례하는 양력                  — 키
//   sail      바람 벡터와 법선의 내적에 비례하는 힘   — 돛
//   mass      힘 없음. 질량만으로 흘수·관성을 바꾼다  — 밸러스트
//   joint     순간 고정점                          — 닻
//   oar       스트로크 봉투 추력                    — 노
//
// ★ 대포(D3)를 부스터의 특수 케이스로 짜지 않는 이유가 여기 있다. 둘 다 "부착점 + 방향 +
//   트리거"를 공유하고 차이는 상시력이냐 충격량이냐 하나뿐이라, D3 은 impulse 분기 하나만
//   더하면 된다. 부스터에 대포용 조건을 끼워 넣기 시작하면 §4.1 통일 모델이 무너진다.
import { MATERIALS } from '../hull/params.js';

export const ITEM_CATALOG = {
  booster: {
    kind: 'thruster', name: '부스터', mass: 40, material: 'iron',
    /** 부착 방향(+각도)으로 미는 힘 (N). 노 한 자루의 피크보다 한 자릿수 크다. */
    force: 9000,
    /** 기본 트리거. 부착 시 비어 있는 바인딩으로 자동 배정된다. */
    bind: 'KeyA',
  },
  sail: {
    kind: 'sail', name: '돛', mass: 15, material: 'cloth',
    /** 돛 면적 (m²). 힘 = 풍압계수 × 면적 × (상대풍·법선)|상대풍·법선|. */
    area: 8,
    /** 돛은 트리거가 없다 — 바람이 불면 항상 받는다. 역풍이면 그 대가도 항상 받는다. */
    bind: null,
  },
  rudder: {
    kind: 'foil', name: '키', mass: 30, material: 'wood',
    /** 조타 입력을 받는 두 키 (좌현/우현). 방향키는 노가 가져갔다. */
    bind: 'KeyQ/KeyE',
  },
  ballast: {
    kind: 'mass', name: '밸러스트', mass: 220, material: 'iron',
    bind: null,
  },
  anchor: {
    kind: 'joint', name: '닻', mass: 60, material: 'iron',
    bind: 'Space',
  },
  cannon: {
    // D3 자리 예약 — 스키마만. 반동 임펄스는 D3 파손 작업에서 붙인다.
    kind: 'impulse', name: '대포', mass: 120, material: 'iron',
    impulse: 6000,
    bind: 'KeyF',
  },
};

/** 하니스에서 손으로 붙일 수 있는 것들 (기본 장치와 D3 예약분 제외). */
export const ATTACHABLE = ['booster', 'sail', 'rudder', 'ballast'];

/** 트리거 바인딩 풀 — 부착 순서대로 배정한다. T·C 는 하니스 단축키라 뺀다. */
export const BIND_POOL = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH'];

/** 바인딩 표시용 짧은 이름. */
export function bindLabel(bind) {
  if (!bind) return '상시';
  return bind.replace(/Key/g, '');
}

/** 아이템 재질 객체 (규칙 엔진이 재질별 규칙을 찾을 때 쓴다). */
export function itemMaterial(item) {
  return MATERIALS[item.material] ?? MATERIALS.wood;
}
