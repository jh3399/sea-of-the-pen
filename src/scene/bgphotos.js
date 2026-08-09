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
import bulgasariDeep from '../../assets/scene/bulgasari-deep.png';
import essence from '../../assets/scene/essence.png';
import starIsle from '../../assets/scene/star-isle.png';

export const BG_PHOTOS = {
  sickroom,
  mio_drawing: mioDrawing,
  living_room: livingRoom,
  // ★ 같은 그림을 키 둘이 나눠 쓴다. `_feed` 쪽에만 scenefx 의 흡입 움직임이 붙는다 —
  //   "누워 있다" → "빨아들인다" 로 넘어가는 두 줄에 그림을 두 장 그리지 않기 위해서다.
  bulgasari_deep: bulgasariDeep,
  bulgasari_feed: bulgasariDeep,
  essence,
  // [S-09] 별의섬. 별이 **하늘이 아니라 바위에** 붙어 있는 것이 이 그림의 전부다 —
  // 그 별들이 곧 캐럿·애플·블루베리가 나온 곳이라, 색도 3인방과 같은 셋이다.
  star_isle: starIsle,
};
