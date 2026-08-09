// 주인공 — 배에 탄 사람 하나. **선체 로컬 좌표의 점 하나**가 정의의 전부다.
//
// 왜 §4.1 아이템으로 만들지 않았는가. 형식만 보면 아이템과 똑같다: 선체 로컬에 앵커되고,
// 질량을 갖고, 파손 시 소속 폴리곤을 따라간다. 그런데 아이템은 **잃어도 항해가 계속되는
// 것**이고 주인공은 정확히 그 반대다. `hull.items` 에 넣는 순간 세 가지가 따라온다:
//  ① 규칙 엔진이 그를 재질로 보고 태운다 (`itemLost` — 사람이 소품으로 소각된다).
//  ② `nextBind` 가 그에게 트리거 키를 배정한다.
//  ③ `droppedItemCount()` 가 그를 "탈락 아이템 1"로 집계해, 항해가 끝났다는 사실이
//     장치 하나 떨어진 것과 같은 무게로 표시된다.
// 그래서 형식은 빌리되 자리는 따로 둔다 — `hull.crew`.
//
// 빌려 쓰는 것은 §7.5 **소속 폴리곤 판정 하나**다. `damage/carve.js` 가 아이템과 같은
// `smallestContainer` 로 주인공의 조각을 정한다: 배가 두 동강 나면 그는 자기가 서 있던
// 조각을 타고 가고, 어느 조각에도 못 서면 물에 빠진다. 새 판정 코드는 0줄이다.
import { Vec2 } from 'planck';

export const CREW = {
  /**
   * 주인공 질량 (kg).
   *
   * 0 인 것은 게으름이 아니라 §5.2 원칙 2 의 **반대쪽**이다. 원칙 2 는 "선택에는 대가가
   * 있다"는 말이고, 모든 배에 똑같이 실리는 질량은 선택이 아니다 — 트레이드오프를 만들지
   * 않으면서 §2.1 의 흘수·종단 속도 기준선만 통째로 옮긴다.
   * 나중에 "선원을 더 태우면 노가 늘고 흘수가 깊어진다"를 넣게 되면 그때가 이 값을 올릴
   * 자리이고, 그때는 태우는 수가 플레이어의 선택이므로 원칙 2 를 만족한다.
   */
  mass: 0,
  /** 표시 반경 (m). 콜라이더가 아니다 — 주인공은 부피도 충돌도 갖지 않는다. */
  radius: 0.3,
};

/** 주인공을 태우고 있는 선체의 월드 좌표. 없으면 null. */
export function crewWorldPoint(body) {
  const crew = body?.getUserData()?.hull?.crew;
  if (!crew) return null;
  const w = body.getWorldPoint(new Vec2(crew.x, crew.y));
  return { x: w.x, y: w.y };
}

/**
 * 주인공이 타고 있는 강체를 찾는다.
 *
 * 절단(§7.5) 이후 조각이 여럿일 때 "어느 것이 플레이어의 배인가"에 답하는 유일한 기준이다.
 * 가장 큰 조각도, 처음 만들어진 조각도 아니다 — 사람이 서 있는 조각이다.
 *
 * @param {Iterable<Body>} bodies
 * @returns {Body|null}
 */
export function findCrewBody(bodies) {
  for (const body of bodies) {
    if (body.getUserData()?.hull?.crew) return body;
  }
  return null;
}
