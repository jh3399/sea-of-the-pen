// `draw.html` 이 남기고 `sail.html` 이 읽어 가는 배 설계 — 그 세션 값을 **중간에 고칠 때**
// 쓰는 도구. 지금은 시작의 섬에서 세렌이 키를 달아 주는 자리(`menu/screen.js`)에서만 쓴다.
//
// ★ 왜 설계 화면을 다시 띄우지 않는가: 섬은 **가다가 들르는 곳**이지 돌아온 곳이 아니다.
//   S-05 가 새벽 출항이고 마지막 대사가 "그 정수를 가져온다"인데, 첫 항해 끝에 그리기
//   화면이 다시 뜨면 그 줄이 무효가 된다. 그래서 아이템은 인물이 손으로 달아 준다.
//
// ⚠ 이 파일은 `draw/screen.js`·`sail/screen.js` 가 각자 들고 있는 HANDOFF_KEY 접근을
//   통합하지 않는다. 그건 두 파일을 모두 건드리는 별개의 정리이고, 여기서 하면
//   "키 하나 주는 변경"이 화면 둘을 고치는 변경이 된다.

import { sternAnchor } from '../items/defaults.js';
import { canAttachAt, attachItem } from '../items/attach.js';

const HANDOFF_KEY = 'shipwright:handoff';

/** 저장된 설계. 없거나 깨졌으면 null. (`sail/screen.js` 의 loadHandoff 와 같은 판정) */
export function loadDesign() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.outline?.length ? data : null;
  } catch {
    return null;
  }
}

export function saveDesign(design) {
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(design));
}

/**
 * 설계에 아이템을 하나 달아 준다. @returns {boolean} 달았는지
 *
 * 붙이는 자리는 **선미 중앙**(`sternAnchor`)이다 — 키가 원래 붙는 자리이고, 후미 밴드를
 * 여러 단면 훑어 구한 값이라 정점 min/max 가 만드는 가짜 비대칭도 없다.
 *
 * ⚠ 그 점이 **선체 안인지 반드시 확인한다** (`canAttachAt`). §7.5 가 전제하는 불변식이라,
 *   밖에 붙은 아이템은 첫 파손에 무조건 사라지고 그 전까지는 팔길이만 공짜로 늘어난
 *   치트로 동작한다. 초승달처럼 오목한 선체는 선미 중앙이 배 밖일 수 있으므로,
 *   그때는 **주인공이 선 자리**로 물러선다 — 그 점은 출항 조건상 반드시 선체 안이다.
 * ⚠ 같은 타입이 이미 있으면 더 달지 않는다. 섬 대사를 두 번 보면(새로고침 등) 키가
 *   두 개 달려 트리거 두 쌍을 먹는다.
 */
export function grantItem(design, type) {
  if (!design?.outline?.length) return false;
  const items = design.items ?? (design.items = []);
  if (items.some((it) => it.type === type)) return false;

  const stern = sternAnchor(design.outline);
  const crew = design.crew ?? { x: 0, y: 0 };
  const at = canAttachAt(design.outline, design.holes ?? [], stern) ? stern : crew;
  if (!canAttachAt(design.outline, design.holes ?? [], at)) return false;

  // ⚠ **`bind` 를 넘기지 않는다.** 넘기면 `nextBind` 가 배정한 트리거가 카탈로그의 전용
  //   바인딩을 덮어써서, 세렌이 "Q 랑 E" 라고 말한 키가 실제로는 A 가 된다 (한 번 그랬다).
  //   키는 `devices.js` 가 held.KeyQ/held.KeyE 를 직접 읽으므로 카탈로그 값이 곧 진실이고,
  //   `draw/screen.js` 의 손 부착도 같은 이유로 bind 를 안 넘긴다.
  const hull = { items };
  const item = attachItem(hull, type, { x: at.x, y: at.y });
  return Boolean(item);
}
