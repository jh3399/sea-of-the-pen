// 대사 전문 — docs/SCRIPT.md 와 **1:1**. 한쪽만 고치지 않는다.
// SCRIPT 의 키 = SCRIPT.md 의 `CODE_CONST`, INTRO_BEATS 의 id = 거기 [S-##].
//
// 한 줄 = 대화창 한 번. 대화창 폭이 약 33자라 3줄까지 들어간다. 한 줄은 90자를 넘기지 않는다.
// speaker 를 비우면 내레이션(이름표가 숨는다). sprite 를 비우면 초상화 없이 이름표만 —
// 동생 미오가 그렇다. 얼굴을 안 보여주는 것이 연출이다.
//
// ★ 미오의 종이가 이 프롤로그의 축이다. S-01 에서 받고 S-04 에서 펴서 S-05 에서 그린다 —
//   설계 화면의 첫 밑그림이 그 종이이므로, 튜토리얼이 기능이 아니라 소품에서 나온다.
//   "선이 떨린다"는 그 밑그림이 비대칭이라는 사실의 복선이다. 방향은 말하지 않는다 —
//   플레이어가 바다에서 배가 기우는 것을 먼저 보고 이 줄을 되짚는 순서여야 한다.

export const SCRIPT = {
  // ── [S-01] 병상 ──────────────────────────────────────────────
  SICKROOM: [
    { speaker: '', bg: 'sickroom', text: '사흘째 동생의 열이 내리지 않는다.' },
    { speaker: '미오', text: '…오빠.' },
    { speaker: '미오', text: '오늘은 좀 괜찮아. 진짜야.' },
    { speaker: '루', sprite: 'ru', text: '괜찮은 사람은 그 말을 안 해.' },
    { speaker: '미오', text: '누워만 있으니까 심심해서. 이거 봐.' },
    // ★ 여기서 화면이 그 종이로 넘어간다. 넉 줄 동안 방을 보여주지 않는 것이 요점이다 —
    //    루가 지금 보고 있는 것이 그 그림뿐이기 때문이다. 배 안의 고양이 둘이
    //    "바다 건너까지" 를 말로 하지 않고 대신 말한다.
    { speaker: '', bg: 'mio_drawing', text: '종이 한 장. 배가 그려져 있다.' },
    { speaker: '미오', text: '오빠 배야.' },
    { speaker: '미오', text: '바다 건너까지 가보는 게 꿈이었잖아. 이거 타면 어디든 갈 수 있어.' },
    { speaker: '루', sprite: 'ru', text: '(선이 울퉁불퉁하다. 쥘 힘이 없었던 모양이다.)' },
    // 방으로 돌아온다. 다음 줄부터는 그림이 아니라 미오를 봐야 한다.
    { speaker: '미오', bg: 'sickroom', text: '바람이나 쐬고 와. 나 괜찮아!' },
    { speaker: '루', sprite: 'ru', text: '(괜찮다는 말은 사흘째고, 목소리는 어제보다 작다.)' },
  ],

  // ── [S-02] 하나뿐인 약 ───────────────────────────────────────
  // 포포가 바다 셋을 읊는 동안 배경이 셋을 지나간다. 이 게임이 어디로 가는지를
  // 30초 안에 다 보여주는 자리다 — 심사위원이 컷신을 끝까지 볼지 여기서 갈린다.
  THE_ONLY_CURE: [
    { speaker: '포포', sprite: 'examiner', text: '루냐. 약재는 다 떨어졌다. 이 열은 여기 것으로 안 내려.' },
    { speaker: '포포', sprite: 'examiner', text: '불섬의 온천가에 나는 풀이 있다. 그거면 낫는다. 나도 젊을 적엔 봤지.' },
    { speaker: '루', sprite: 'ru', text: '어디로 가면 됩니까.' },
    { speaker: '포포', sprite: 'examiner', text: '바다를 셋 건넌다.' },
    { speaker: '포포', sprite: 'examiner', bg: 'sea_day', text: '첫째는 순풍 해협. 바람이 등을 민다. 거긴 쉽다.' },
    { speaker: '포포', sprite: 'examiner', bg: 'night_storm', text: '둘째는 역풍 협곡. 같은 바람이 정면으로 온다.' },
    { speaker: '포포', sprite: 'examiner', bg: 'volcano', text: '셋째는 불의 바다. 약은 거기 있다.' },
    // ⚠ "사흘"이라는 시한이 여기서 처음 나온다. 이 두 줄이 없으면 S-03·S-05 의 루가
    //    아무도 말한 적 없는 기한을 혼자 알고 있는 꼴이 된다 (실제로 그랬다).
    { speaker: '루', sprite: 'ru', text: '얼마나 걸립니까.' },
    { speaker: '포포', sprite: 'examiner', text: '순풍을 만나도 사흘이다. 그 안에 못 돌아오면 소용없고.' },
    { speaker: '포포', sprite: 'examiner', bg: 'shipyard_grave', text: '가겠다고 나선 사람은 여럿 있었다.' },
    { speaker: '포포', sprite: 'examiner', text: '돌아온 사람이 없어서 하는 말이야.' },
  ],

  // ── [S-03] 배가 없다 ─────────────────────────────────────────
  // 세계를 소개하는 줄이 여기로 내려왔다. S-01 이 실내가 되면서 "섬 하나뿐인 마을"을
  // 방 안에서 말하게 됐기 때문이다 — 눈에 보이는 자리에서 말해야 설명이 아니라 묘사다.
  NO_SHIP: [
    { speaker: '', bg: 'harbor', text: '섬 하나뿐인 마을이다. 배는 대개 남의 것이고, 바다는 늘 남의 일이었다.' },
    { speaker: '', text: '부두. 배는 많고, 그중 내 것은 없다.' },
    { speaker: '루', sprite: 'ru', text: '한 척만 빌려주세요. 사흘이면 됩니다.' },
    { speaker: '', text: '아무도 대답하지 않았다.' },
    { speaker: '루', sprite: 'ru', text: '(살 돈도 없고, 빌릴 신용도 없다.)' },
    { speaker: '루', sprite: 'ru', text: '그럼 만든다.' },
    { speaker: '', text: '말은 쉬웠다.' },
  ],

  // ── [S-04] 스케치북 ──────────────────────────────────────────
  // 배경이 workshop 으로 바뀐다. 모루의 작업장은 이 프롤로그에서 유일하게
  // 실내이고 유일하게 안전한 자리다 — 다음 줄이 바다이기 때문에 필요하다.
  THE_SKETCHBOOK: [
    { speaker: '모루', sprite: 'moru', bg: 'workshop', text: '거기서 뭘 그렇게 오래 서 있냐.' },
    { speaker: '루', sprite: 'ru', text: '배를 만들 겁니다.' },
    { speaker: '모루', sprite: 'moru', text: '만들 줄은 아냐?' },
    { speaker: '루', sprite: 'ru', text: '아니요.' },
    { speaker: '모루', sprite: 'moru', text: '그럼 그려라. 이 바다에서는 그린 대로 뜨고, 그린 대로 가라앉는다.' },
    { speaker: '', text: '모루가 스케치북을 내밀다가, 루가 쥔 종이를 본다.' },
    { speaker: '모루', sprite: 'moru', text: '그건 뭐냐.' },
    { speaker: '루', sprite: 'ru', text: '동생이 그린 겁니다. 배라고.' },
    { speaker: '모루', sprite: 'moru', text: '…그걸로 시작해.' },
    { speaker: '루', sprite: 'ru', text: '이건 애가 그린 겁니다.' },
    { speaker: '모루', sprite: 'moru', text: '바다는 누가 그렸는지 안 물어. 어떻게 그렸는지만 묻지.' },
    { speaker: '모루', sprite: 'moru', text: '하나만 지켜. 네가 설 자리를 먼저 정하고, 그 둘레를 감싸라.' },
    { speaker: '모루', sprite: 'moru', text: '자기 자리를 안 남긴 배는 아무도 못 태운다.' },
  ],

  // ── [S-05] 출항 ──────────────────────────────────────────────
  // 배경을 sea_day(한낮)에서 dawn_wreck(새벽)으로 바꿨다. 첫 줄이 "새벽"인데
  // 한낮 그림이 뜨고 있었다. 물에 남은 난파선이 S-02 의 경고를 말없이 받는다.
  DEPARTURE: [
    { speaker: '', bg: 'dawn_wreck', text: '새벽. 물이 잔잔하다.' },
    { speaker: '', text: '멀리, 가라앉다 만 배들이 아직 떠 있다.' },
    { speaker: '루', sprite: 'ru', text: '사흘.' },
    { speaker: '루', sprite: 'ru', text: '그 안에 돌아온다.' },
    { speaker: '', text: '미오의 종이를 펴고, 연필을 쥐었다.' },
  ],
};

/**
 * 인트로 컷신의 비트 순서. BGM 은 대사 데이터가 아니라 여기서 비트 경계에 건다 —
 * dialogue.js 는 배경(bg)만 알고 소리는 모른다. bgm 이 없는 비트는 앞 곡을 이어 쓴다.
 *
 * 곡의 모양: 마을(따뜻) → 긴장(바다 셋·난파선) → 부두(차갑고 공적) → 마을(모루,
 * 다시 따뜻) → 항해. S-04 에 village 를 다시 쓰는 것은 재탕이 아니라 회귀다 —
 * 출항 직전에 한 번 안전한 자리로 돌려놓아야 S-05 의 바다가 넓어 보인다.
 */
export const INTRO_BEATS = [
  { id: 'S-01', key: 'SICKROOM', bgm: 'village' },
  { id: 'S-02', key: 'THE_ONLY_CURE', bgm: 'tension' },
  { id: 'S-03', key: 'NO_SHIP', bgm: 'harbor' },
  { id: 'S-04', key: 'THE_SKETCHBOOK', bgm: 'village' },
  { id: 'S-05', key: 'DEPARTURE', bgm: 'sail' },
];
