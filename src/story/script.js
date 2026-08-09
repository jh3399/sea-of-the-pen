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

  // ── [S-02] 불치병과 불가사리 ─────────────────────────────────
  //
  // ★ 포포의 말투는 **전부 60대 어르신**이다. 종결이 ~구나 · ~지 · ~다더구나 · ~다만 ·
  //   ~야 로 끝나고, 단정하지 않고 미룬다. 전설을 자기 말로 보증하지 않는 것이 그 나이의
  //   정직함이다. 한 줄이라도 젊은 말투가 섞이면 인물이 흔들린다.
  // ★ 병에는 **이름을 주지 않는다.** 포포도 모르는 병이라야 "고칠 방도가 없다"가 무겁고,
  //   그래야 뒤의 "어떤 병도 낫는다더라"가 유일한 길이 된다.
  // 이 게임의 전제가 통째로 여기 있다. 병에 이름이 붙고, 목적이 생기고, 갈 곳 셋이
  // 정해진다. 배경이 여섯 번 바뀌는 이유도 그것이다 — 말로만 지나가면 지명 나열이지만
  // 그림으로 지나가면 예고편이다. 심사위원이 컷신을 끝까지 볼지 여기서 갈린다.
  //
  // 배경은 S-01 의 sickroom 을 그대로 이어받는다. 포포는 미오를 보러 온 것이고,
  // 진단을 그 방에서 듣는 편이 밖에서 듣는 것보다 무겁다.
  THE_ONLY_CURE: [
    { speaker: '포포', sprite: 'examiner', text: '루냐. 앉아라. 서서 들을 얘기가 아니야.' },
    { speaker: '포포', sprite: 'examiner', text: '마을 약재는 다 써 봤다. 드는 게 하나도 없구나.' },
    { speaker: '루', sprite: 'ru', text: '무슨 병입니까.' },
    { speaker: '포포', sprite: 'examiner', text: '나도 모르겠구나. 여태 못 보던 병이야.' },
    { speaker: '포포', sprite: 'examiner', text: '고칠 방도가 없다. 그런 것을 불치병이라 하지.' },
    // 루는 여기서 말을 잃는다. 물어볼 것이 없어서가 아니라 물어봐야 소용이 없어서다.
    { speaker: '루', sprite: 'ru', text: '…' },
    { speaker: '포포', sprite: 'examiner', text: '…아주 없는 건 아니다만.' },
    { speaker: '포포', sprite: 'examiner', text: '믿을지 말지는 네가 정해라.' },

    // 전설. 이름 풀이(불가살이 = 죽일 수 없는 것)가 이 괴물의 성격을 한 줄에 담는다.
    { speaker: '포포', sprite: 'examiner', bg: 'fog_black', text: '바다 밑에 불가사리라는 게 산다더구나.' },
    { speaker: '포포', sprite: 'examiner', text: '불가살이(不可殺伊). 죽일 수 없는 것이라는 뜻이란다.' },
    { speaker: '포포', sprite: 'examiner', text: '가만히 누워서 물이고 배고 고기고 다 빨아들인다지.' },
    { speaker: '포포', sprite: 'examiner', text: '삼킨 것이 몸속에 맺혀 정수가 된다고 하는구나.' },
    { speaker: '포포', sprite: 'examiner', text: '그 정수 한 모금이면 어떤 병도 낫는다고, 오래전부터 이 바다에 전해 오는 이야기란다.' },
    { speaker: '루', sprite: 'ru', text: '그 괴물이 어디 있는지 아시나요.' },

    // 바다 셋 = 실제 3맵. 각 줄이 그 맵에서 플레이어를 죽이는 것을 하나씩 말한다.
    { speaker: '포포', sprite: 'examiner', text: '바다를 셋 건너야 하지.' },
    { speaker: '포포', sprite: 'examiner', bg: 'sea_day', text: '첫째는 바위 협곡. 바람은 등을 밀어주지만, 주변이 온통 바위지.' },
    { speaker: '포포', sprite: 'examiner', bg: 'night_storm', text: '둘째는 역풍 협곡. 바람이 정면으로 막아서는데, 해적까지 들끓는단다.' },
    { speaker: '포포', sprite: 'examiner', bg: 'volcano', text: '셋째는 불의 바다. 물 대신 용암이 흐르는 곳이지…' },
    { speaker: '포포', sprite: 'examiner', bg: 'world_end', text: '그 셋을 다 건너면 불가사리의 바다가 나온단다…' },
    { speaker: '포포', sprite: 'examiner', text: '전설로만 전해지던 그것이 거기 있다더구나.' },

    // 루는 기한을 묻지 않는다. 다 듣고 한 마디 하는 것이 그의 말수에 맞고,
    // 포포의 핀잔이 곧바로 경고로 이어지는 것이 시한보다 무섭다.
    { speaker: '루', sprite: 'ru', text: '알겠습니다.' },
    { speaker: '포포', sprite: 'examiner', text: '알긴 뭘 알아.' },
    { speaker: '포포', sprite: 'examiner', bg: 'shipyard_grave', text: '가겠다고 나선 사람은 여럿 있었지.' },
    { speaker: '포포', sprite: 'examiner', text: '돌아온 사람이 없어서 하는 말이야.' },
  ],

  // ── [S-03] 배가 없다 ─────────────────────────────────────────
  // 세계를 소개하는 줄이 여기로 내려왔다. S-01 이 실내가 되면서 "섬 하나뿐인 마을"을
  // 방 안에서 말하게 됐기 때문이다 — 눈에 보이는 자리에서 말해야 설명이 아니라 묘사다.
  NO_SHIP: [
    { speaker: '', bg: 'harbor', text: '섬 하나뿐인 마을이다. 배는 대개 남의 것이고, 바다는 늘 남의 일이었다.' },
    { speaker: '', text: '부두. 배는 많고, 그중 내 것은 없다.' },
    { speaker: '루', sprite: 'ru', text: '한 척만 빌려주세요. 반드시 돌려드리겠습니다.' },
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
    // 시한을 없앤 대신 목적을 두 마디로 못 박는다. 짧은 두 줄이라는 리듬은 그대로다.
    { speaker: '루', sprite: 'ru', text: '불가사리.' },
    { speaker: '루', sprite: 'ru', text: '그 정수를 가져온다.' },
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
