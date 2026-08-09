// 그림 배경 — 절차적 씬 대신 도트 원본(PNG)을 까는 씬들.
//
// 절차적 배경(bgscenes.js)은 논리 356×200 캔버스에 그린다. 그 해상도에 안 들어가는
// 그림을 쓰고 싶을 때만 여기 등록한다 — 타이틀에서 먼저 겪고 내린 결론이고
// (assets/menu/README.md), 컷신도 같은 길을 쓴다.
//
// ★ 여기 등록해도 bgscenes.js 의 같은 이름 씬을 **지우지 않는다.** 그림이 못 뜨는 경우
//   (파일 누락·네트워크 실패) 아래 캔버스가 그대로 배경 노릇을 한다. 전환 크로스페이드도
//   캔버스 쪽이 계속 담당하므로 그림 씬 ↔ 절차 씬 사이가 끊기지 않는다.
//
// import 로 가져오는 이유는 Vite 가 해시를 붙여 번들에 넣어 주기 때문이다.
// 문자열 경로로 적으면 dev 에서만 되고 배포에서 404 난다 (base 가 /sea-of-the-pen/).

import sickroom from '../../assets/scene/sickroom.png';
import mioDrawing from '../../assets/scene/mio-drawing.png';
import livingRoom from '../../assets/scene/living-room.png';

export const BG_PHOTOS = {
  sickroom,
  mio_drawing: mioDrawing,
  living_room: livingRoom,
};
