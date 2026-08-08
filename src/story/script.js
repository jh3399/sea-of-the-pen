// 대사 전문 — docs/SCRIPT.md 와 **1:1**. 한쪽만 고치지 않는다.
// SCRIPT 의 키 = SCRIPT.md 의 `CODE_CONST`, INTRO_BEATS 의 id = 거기 [S-##].
//
// 한 줄 = 대화창 한 번. 대화창 폭이 약 33자라 3줄까지 들어간다. 한 줄은 90자를 넘기지 않는다.
// speaker 를 비우면 내레이션(이름표가 숨는다). sprite 를 비우면 초상화 없이 이름표만 —
// 동생 미오가 그렇다. 얼굴을 안 보여주는 것이 연출이다.

export const SCRIPT = {
  // ── [S-01] 병상 ──────────────────────────────────────────────
  SICKROOM: [
    { speaker: '', bg: 'village_alive', text: '섬 하나뿐인 마을이다. 배는 대개 남의 것이고, 바다는 늘 남의 일이었다.' },
    { speaker: '', text: '사흘째 동생의 열이 내리지 않는다.' },
    { speaker: '미오', text: '…루.' },
    { speaker: '미오', text: '오늘은 좀 괜찮아. 진짜야.' },
    { speaker: '루', sprite: 'ru', text: '괜찮은 사람은 그 말을 안 해.' },
    { speaker: '미오', text: '…바람이나 쐬고 와. 방이 좁잖아.' },
    { speaker: '루', sprite: 'ru', text: '(사흘째 같은 말을 한다.)' },
  ],

  // ── [S-02] 하나뿐인 약 ───────────────────────────────────────
  THE_ONLY_CURE: [
    { speaker: '포포', sprite: 'examiner', text: '루냐. 약재는 다 떨어졌다. 이 열은 여기 것으로 안 내려.' },
    { speaker: '포포', sprite: 'examiner', text: '불섬의 온천가에 나는 풀이 있다. 그거면 낫는다. 나도 젊을 적엔 봤지.' },
    { speaker: '루', sprite: 'ru', text: '어디로 가면 됩니까.' },
    { speaker: '포포', sprite: 'examiner', text: '바다를 셋 건넌다. 순풍 해협, 역풍 협곡, 그리고 불의 바다.' },
    { speaker: '포포', sprite: 'examiner', text: '…가겠다고 나선 사람은 여럿 있었다.' },
    { speaker: '포포', sprite: 'examiner', text: '돌아온 사람이 없어서 하는 말이야.' },
  ],

  // ── [S-03] 배가 없다 ─────────────────────────────────────────
  NO_SHIP: [
    { speaker: '', bg: 'harbor', text: '부두. 배는 많고, 그중 내 것은 없다.' },
    { speaker: '루', sprite: 'ru', text: '한 척만 빌려주세요. 사흘이면 됩니다.' },
    { speaker: '', text: '아무도 대답하지 않았다.' },
    { speaker: '루', sprite: 'ru', text: '(살 돈도 없고, 빌릴 신용도 없다.)' },
    { speaker: '루', sprite: 'ru', text: '그럼 만든다.' },
    { speaker: '', text: '말은 쉬웠다.' },
  ],

  // ── [S-04] 스케치북 ──────────────────────────────────────────
  THE_SKETCHBOOK: [
    { speaker: '모루', sprite: 'moru', text: '거기서 뭘 그렇게 오래 서 있냐.' },
    { speaker: '루', sprite: 'ru', text: '배를 만들 겁니다.' },
    { speaker: '모루', sprite: 'moru', text: '만들 줄은 아냐?' },
    { speaker: '루', sprite: 'ru', text: '아니요.' },
    { speaker: '모루', sprite: 'moru', text: '그럼 그려라. 이 바다에서는 그린 대로 뜨고, 그린 대로 가라앉는다.' },
    { speaker: '모루', sprite: 'moru', text: '하나만 지켜. 네가 설 자리를 먼저 정하고, 그 둘레를 감싸라.' },
    { speaker: '모루', sprite: 'moru', text: '자기 자리를 안 남긴 배는 아무도 못 태운다.' },
  ],

  // ── [S-05] 출항 ──────────────────────────────────────────────
  DEPARTURE: [
    { speaker: '', bg: 'sea_day', text: '새벽. 물이 잔잔하다.' },
    { speaker: '루', sprite: 'ru', text: '사흘.' },
    { speaker: '루', sprite: 'ru', text: '그 안에 돌아온다.' },
    { speaker: '', text: '연필을 쥐었다.' },
  ],
};

/**
 * 인트로 컷신의 비트 순서. BGM 은 대사 데이터가 아니라 여기서 비트 경계에 건다 —
 * dialogue.js 는 배경(bg)만 알고 소리는 모른다. bgm 이 없는 비트는 앞 곡을 이어 쓴다.
 */
export const INTRO_BEATS = [
  { id: 'S-01', key: 'SICKROOM', bgm: 'village' },
  { id: 'S-02', key: 'THE_ONLY_CURE', bgm: 'tension' },
  { id: 'S-03', key: 'NO_SHIP', bgm: 'harbor' },
  { id: 'S-04', key: 'THE_SKETCHBOOK' },
  { id: 'S-05', key: 'DEPARTURE', bgm: 'sail' },
];
