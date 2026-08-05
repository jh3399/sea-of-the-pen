// 게임 대사 전문 (docs/SCRIPT.md v5와 1:1).
//
// 대사 텍스트를 흐름 로직(main.js)에서 떼어놓은 이유:
// 띄어쓰기·줄바꿈·말투를 한 파일에서 검토·수정할 수 있게 하기 위해서다.
//
// 한 줄 = 대화창 한 번. 대화창 폭이 약 33자라 3줄까지 들어간다.
// **한 줄은 90자를 넘기지 않는다.** 넘칠 것 같으면 문장을 쪼개서 다음 줄로 넘긴다.
//
// line: { speaker, sprite?, text, bg?, image?, imageCls?, pen? }
//   speaker '' → 내레이션 (이름표 숨김)
//   pen: true  → 펜 맞대기 연출이 들어가는 자리 (최종전 복선)

/** 마을 아이들의 동요. 프롤로그·1막·3막·에필로그에서 반복된다. */
export const SONG = [
  '형아가 하나 아우가 하나',
  '섬 끝에 살던 형제가 하나',
  '아우는 배를 다 못 그렸대요',
  '뱃머리 하나만 남았대요',
  '가지 마 가지 마 흰 숲엔 가지 마',
];

/** 엔딩에서 마지막 줄만 바뀐다 */
export const SONG_ENDING = [
  '형아가 하나 아우가 하나',
  '섬 끝에 살던 형제가 하나',
  '아우는 배를 다 못 그렸대요',
  '뱃머리 하나만 남았대요',
  '그래서 어떤 애가 대신 그려 줬대요',
];

const songLines = (song) => song.map((t) => ({ speaker: '아이들', text: `♪ ${t}` }));

export const SCRIPT = {
  // ══════════ 프롤로그 — 나루 마을 ══════════

  // [S-01] 오프닝
  INTRO: [
    { speaker: '', bg: 'village_pale', text: '이 바다에서는, 진심을 담아 그린 그림이 진짜가 된다.' },
    { speaker: '', text: '다들 그걸 당연하게 여긴다. 왜 그런지는 아무도 모른다.' },
    ...songLines(SONG),
    { speaker: '촌장', sprite: 'examiner', text: '루야. 이번 달에도 저 골목까지 색이 빠졌다.' },
    { speaker: '촌장', sprite: 'examiner', text: '이제 정말 섬을 떠날 때가 됐어.' },
    { speaker: '루', sprite: 'ru', text: '떠나면요? 그럼 여긴 어떻게 되는데요.' },
    { speaker: '촌장', sprite: 'examiner', text: '…그냥 그렇게 되는 거지. 400년째 그래 왔으니까.' },
    { speaker: '루', sprite: 'ru', text: '(400년째. 그 노래에 나오는 그 400년.)' },
    { speaker: '루', sprite: 'ru', text: '촌장님. 저 노래요. 그거 진짜 있었던 일이에요?' },
    { speaker: '촌장', sprite: 'examiner', text: '애들 노래다. 그런 게 어딨어.' },
    { speaker: '루', sprite: 'ru', text: '(…아무도 확인해 본 적이 없잖아.)' },
  ],

  // [S-02] 흰 숲 — 세렌과의 만남
  SEREN_MEET: [
    { speaker: '루', sprite: 'ru', bg: 'white_forest', text: '(색이 없어. 소리도 없고.)' },
    { speaker: '루', sprite: 'ru', text: '(여기서부터는… 아무것도 안 움직이네.)' },
    { speaker: '', text: '숲 한가운데에 무너진 집이 하나 있다. 오래된 신전처럼 보인다.' },
    { speaker: '???', text: '―― 야.' },
    { speaker: '루', sprite: 'ru', text: '!?' },
    { speaker: '???', text: '거기 너. 애기야. 이쪽. 발밑.' },
    { speaker: '', text: '나무를 깎아 만든 뱃머리가 하나 굴러다니고 있다. 그게 말을 한다.' },
    { speaker: '루', sprite: 'ru', text: '나무가… 말을 해.' },
    { speaker: '세렌', sprite: 'seren', text: '나무 아니야. 뱃머리야. 배의 제일 앞. 알지?' },
    { speaker: '세렌', sprite: 'seren', text: '400년 만에 사람 얼굴 보네. 다들 안 오더라고.' },
    { speaker: '세렌', sprite: 'seren', text: '하긴, 나라도 안 오지.' },
    { speaker: '루', sprite: 'ru', text: '400년…?' },
    { speaker: '루', sprite: 'ru', text: '(노래가… 진짜였어.)' },

    { speaker: '세렌', sprite: 'seren', text: '이름은 세렌. 별이라는 뜻이야. 내가 붙였어.' },
    { speaker: '루', sprite: 'ru', text: '원래 이름은요?' },
    { speaker: '세렌', sprite: 'seren', text: '…몰라. 기억이 없어.' },
    { speaker: '세렌', sprite: 'seren', text: '웃기지? 400년을 굴러다녔는데 내가 누군지는 몰라.' },
    { speaker: '루', sprite: 'ru', text: '우리 마을, 색이 빠지고 있어요. 여기서 시작된 거죠?' },
    { speaker: '세렌', sprite: 'seren', text: '응. 그리고 되돌릴 방법도 있어.' },
    { speaker: '세렌', sprite: 'seren', text: '세상 끝에 섬이 하나 있어. 거기 아주 맑은 물이 고여 있는데,' },
    { speaker: '세렌', sprite: 'seren', text: '성수라고 해.' },
    { speaker: '세렌', sprite: 'seren', text: '황금 잉크로 종이에 소원을 적어서 그 물에 넣고,' },
    { speaker: '세렌', sprite: 'seren', text: '그 물을 마시면 이루어져.' },
    { speaker: '루', sprite: 'ru', text: '그럼 지금 당장―' },
    { speaker: '세렌', sprite: 'seren', text: '가는 길에 돌풍 지대가 있어. 보통 배는 다 부서져.' },
    { speaker: '세렌', sprite: 'seren', text: '딱 한 척만 뚫을 수 있어. 바람호.' },
    { speaker: '세렌', sprite: 'seren', text: '근데 그건 아직 세상에 없어.' },
    { speaker: '세렌', sprite: 'seren', text: '도안이 세 장으로 찢겨서 섬 세 곳에 숨겨져 있거든.' },
    { speaker: '루', sprite: 'ru', text: '다 모으면 배를 지을 수 있고, 배를 지으면 성수에 갈 수 있고―' },
    { speaker: '세렌', sprite: 'seren', text: '마을을 되돌릴 수 있지.' },

    { speaker: '루', sprite: 'ru', text: '할게요.' },
    { speaker: '세렌', sprite: 'seren', text: '잠깐. 너 그림 잘 그려?' },
    { speaker: '루', sprite: 'ru', text: '…못 그려요. 진짜 못 그려요.' },
    { speaker: '세렌', sprite: 'seren', text: '하.' },
    { speaker: '세렌', sprite: 'seren', text: '뭐, 상관없어. 이 바다에서 중요한 건 잘 그리는 게 아니거든.' },
    { speaker: '세렌', sprite: 'seren', text: '자, 이거.' },
    { speaker: '세렌', sprite: 'seren', pen: true, text: '펜 꺼내서 끝을 세워. 그리고 내 코끝에 톡 대.' },
    { speaker: '루', sprite: 'ru', text: '이게 뭔데요?' },
    { speaker: '세렌', sprite: 'seren', text: '인사. 그리는 사람들끼리 하는 거.' },
    { speaker: '루', sprite: 'ru', text: '누가 알려줬어요?' },
    { speaker: '세렌', sprite: 'seren', text: '…몰라. 그냥 알아.' },
  ],

  // [S-03] 첫 배 그리기 — 안내
  FIRST_SHIP_INTRO: [
    { speaker: '세렌', sprite: 'seren', text: '배를 그려. 아무거나. 네가 배라고 생각하는 거.' },
    { speaker: '루', sprite: 'ru', text: '이렇게 대충 그려도 떠요?' },
    { speaker: '세렌', sprite: 'seren', text: '뜨는지 안 뜨는지는 바다가 정해. 나는 몰라.' },
  ],

  // [S-03] 첫 배 그리기 — 출항
  FIRST_SHIP_DONE: (shipPixel) => [
    { speaker: '루', sprite: 'ru', bg: 'sea_day', text: '(떴다. 진짜로 떴어.)' },
    { speaker: '', image: shipPixel, imageCls: 'sailing', text: '진심이 바다에 닿았다.' },
    { speaker: '세렌', sprite: 'seren', text: '첫 목적지는 덩굴섬. 나침반이 알려줄 거야.' },
  ],

  // [S-04] 검은 돛의 배
  BLACK_SAIL: (shipPixel) => [
    { speaker: '세렌', sprite: 'seren', bg: 'fog_pale', text: '…잠깐. 저거 뭐야.' },
    { speaker: '루', sprite: 'ru', text: '배예요. 돛이… 검은데.' },
    { speaker: '세렌', sprite: 'seren', text: '숨어. 아니, 못 숨어. 이미 봤어.' },
    { speaker: '세렌', sprite: 'seren', text: '쏴! 뭐든 그려서 쏴!!' },
    { speaker: '', text: '포탄이 몇 발 명중한다. 검은 돛의 배가 기울기 시작한다.' },
    { speaker: '루', sprite: 'ru', text: '맞았어요! 기울어요!' },
    { speaker: '세렌', sprite: 'seren', text: '조금만 더―' },
    { speaker: '', text: '흰 안개가 갑판 위로 퍼진다. 배에서 색이 빠지기 시작한다.' },
    { speaker: '루', sprite: 'ru', text: '배가… 색이 빠져요.' },
    { speaker: '세렌', sprite: 'seren', text: '그 색 빼앗기면 배는 끝이야. 뛰어내려!!' },
    { speaker: '', image: shipPixel, imageCls: 'broken', text: '(내가 그린 배가… 하얗게―)' },
    { speaker: '', text: '실력으로 진 게 아니었다.' },
  ],

  // ══════════ 1막 — 덩굴섬 ══════════

  VINE_ARRIVE: [
    { speaker: '리코', bg: 'jungle_green', text: '야! 살아있다! 이 녀석 살아있어!' },
    { speaker: '루', sprite: 'ru', text: '…여기가 어디예요.' },
    { speaker: '리코', text: '덩굴섬. 너 사흘 떠내려왔어. 그 나무토막 붙잡고.' },
    { speaker: '세렌', sprite: 'seren', text: '나무토막 아니야.' },
    { speaker: '리코', text: '우와아악 나무가 말해!!' },
  ],

  VINE_RIKO: [
    { speaker: '리코', text: '첫째. 선은 끊지 말고 한 번에 그어.' },
    { speaker: '리코', text: '끊으면 진심도 끊겨.' },
    { speaker: '리코', text: '둘째. 배는 옆에서 봤을 때가 제일 배다워.' },
    { speaker: '리코', text: '그래서 다들 옆모습부터 배우는 거야.' },
    { speaker: '세렌', sprite: 'seren', text: '셋째. 정확하게 그려. 대충 넘어가지 말고.' },
    { speaker: '리코', text: '어우, 뱃머리 무섭네.' },
    { speaker: '세렌', sprite: 'seren', text: '…내가 좀 그런 편이야. 왜인지는 모르겠는데.' },
  ],

  VINE_POPO: [
    { speaker: '포포 장로', sprite: 'examiner', text: '허허. 오랜만이구나, 뱃머리.' },
    { speaker: '세렌', sprite: 'seren', text: '…나를 알아요?' },
    { speaker: '포포 장로', sprite: 'examiner', text: '이 섬 사람이라면 다 아네.' },
    { speaker: '포포 장로', sprite: 'examiner', text: '신전을 지키는 짐승이 있고, 그 안에 종이가 한 장 있다는 것도.' },
    { speaker: '포포 장로', sprite: 'examiner', text: '다만 아무도 못 가져왔지.' },
    { speaker: '포포 장로', sprite: 'examiner', text: '가까이 가면 짐승이 미쳐 날뛰거든.' },
    { speaker: '루', sprite: 'ru', text: '그 종이, 제가 가지러 왔어요.' },
    { speaker: '포포 장로', sprite: 'examiner', text: '…그럼 먼저 그리는 법부터 배우게.' },
    { speaker: '포포 장로', sprite: 'examiner', text: '지금 실력으론 문턱도 못 넘어.' },
  ],

  GAR_WIN: [
    { speaker: '가르', sprite: 'gar', text: '……' },
    { speaker: '가르', sprite: 'gar', text: '오랜만이다. 색이라는 것이.' },
    { speaker: '루', sprite: 'ru', text: '미안해요. 너무 늦게 와서.' },
    { speaker: '가르', sprite: 'gar', text: '아니. 온 것만도 놀랍다.' },
    { speaker: '가르', sprite: 'gar', text: '400년 동안 하나가 계속 왔었다. 검은 돛을 단 자가.' },
    { speaker: '세렌', sprite: 'seren', text: '!!' },
    { speaker: '가르', sprite: 'gar', text: '그자가 올 때마다 나는 미쳐 날뛰었다.' },
    { speaker: '가르', sprite: 'gar', text: '죽어도 못 준다고 생각했으니까.' },
    { speaker: '가르', sprite: 'gar', text: '그런데 너는 다르다.' },
    { speaker: '가르', sprite: 'gar', text: '네 손에서… 그 사람 냄새가 난다.' },
    { speaker: '루', sprite: 'ru', text: '그 사람이요?' },
    { speaker: '가르', sprite: 'gar', text: '나를 그린 사람. 이름은 잊었다.' },
    { speaker: '가르', sprite: 'gar', text: '가져가라. 네가 가져가는 건 괜찮다.' },
  ],

  // 스케치북 낱장 ①
  PAGE_1: [
    { speaker: '', text: '낡은 종이 한 장이 도안과 함께 끼워져 있다. 그림 일기 같다.' },
    { speaker: '', text: '두 아이와 어른 하나가 그려져 있다. 어른의 얼굴은 세월에 지워져 있다.' },
    { speaker: '세렌', sprite: 'seren', text: '……' },
    { speaker: '루', sprite: 'ru', text: '세렌?' },
    { speaker: '세렌', sprite: 'seren', text: '아무것도 아니야. 가자.' },
  ],

  EMBLEM_INTRO: [
    { speaker: '세렌', sprite: 'seren', text: '배엔 이름표가 있어야지.' },
    { speaker: '세렌', sprite: 'seren', text: '네 마크를 그려. 뭐든 좋아. 네가 너라고 생각하는 거.' },
    { speaker: '루', sprite: 'ru', text: '잘 못 그려도요?' },
    { speaker: '세렌', sprite: 'seren', text: '마크는 잘 그리는 게 아니라 안 잊히는 거야.' },
  ],

  EMBLEM_DONE: [
    { speaker: '세렌', sprite: 'seren', pen: true, text: '좋아. 이제 진짜 네 배다.' },
  ],

  // ══════════ 2막 — 거울섬 ══════════

  MIRROR_ARRIVE: [
    { speaker: '루', sprite: 'ru', bg: 'mirror_fog', text: '물이… 하나도 안 움직여요.' },
    { speaker: '세렌', sprite: 'seren', text: '여기 도안은 위에서 본 그림이야. 반폭도.' },
    { speaker: '세렌', sprite: 'seren', text: '배는 좌우가 똑같잖아. 그래서 절반만 그려.' },
    { speaker: '세렌', sprite: 'seren', text: '나머지는 거울로 뜨는 거야.' },
    { speaker: '루', sprite: 'ru', text: '절반만요?' },
    { speaker: '세렌', sprite: 'seren', text: '절반이 정확해야 나머지 절반도 정확해져.' },
    { speaker: '세렌', sprite: 'seren', text: '한쪽이 틀어지면 배 전체가 틀어져.' },
  ],

  MIRROR_MIRA: [
    { speaker: '미라', text: '여긴 물이 거울이라, 거짓말을 못 해.' },
    { speaker: '미라', text: '물가에 서면 자기가 어떤 얼굴인지 그대로 보이거든.' },
    { speaker: '미라', text: '수호자님도 마찬가지야. 물 위에 하나, 물 아래 하나.' },
    { speaker: '미라', text: '둘로 보이지만 하나야. 헷갈리지 마.' },
  ],

  // [S-10] 세렌과의 충돌
  SEREN_CLASH: [
    { speaker: '세렌', sprite: 'seren', text: '아니 그렇게 말고. 여기 선이 나갔잖아.' },
    { speaker: '루', sprite: 'ru', text: '이 정도면 되지 않아요?' },
    { speaker: '세렌', sprite: 'seren', text: '안 돼. 다시.' },
    { speaker: '루', sprite: 'ru', text: '왜 그렇게까지 정확해야 하는데요?' },
    { speaker: '세렌', sprite: 'seren', text: '그야 당연히―' },
    { speaker: '세렌', sprite: 'seren', text: '……' },
    { speaker: '루', sprite: 'ru', text: '세렌?' },
    { speaker: '세렌', sprite: 'seren', text: '…몰라.' },
    { speaker: '세렌', sprite: 'seren', text: '모르겠어. 그냥 그래야 할 것 같아서.' },
    { speaker: '세렌', sprite: 'seren', text: '안 그러면 큰일 날 것 같아서.' },
    { speaker: '세렌', sprite: 'seren', text: '이유는 없어. 근데 이거 하나는 확실해.' },
    { speaker: '세렌', sprite: 'seren', text: '나 예전에 뭔가를… 끝까지 못 그렸어.' },
    { speaker: '루', sprite: 'ru', text: '기억이 없다면서요.' },
    { speaker: '세렌', sprite: 'seren', text: '없어. 그런데 그 느낌만 남아 있어.' },
  ],

  NAR_INTRO_EXTRA: [
    { speaker: '세렌', sprite: 'seren', text: '그러니까 이쪽도 절반만 정확하게 그리면 돼.' },
    { speaker: '세렌', sprite: 'seren', text: '내가 하라는 대로―' },
    { speaker: '루', sprite: 'ru', text: '세렌.' },
    { speaker: '루', sprite: 'ru', text: '제 방식대로 해 볼게요.' },
    { speaker: '세렌', sprite: 'seren', text: '야, 그러다 틀리면―' },
    { speaker: '루', sprite: 'ru', text: '틀려도 제가 그린 거잖아요.' },
  ],

  NAR_WIN: [
    { speaker: '나르', sprite: 'nar', text: '……곱구나.' },
    { speaker: '나르', sprite: 'nar', text: '완벽하지는 않은데, 곱다.' },
    { speaker: '세렌', sprite: 'seren', text: '(완벽하지 않은데…?)' },
    { speaker: '나르', sprite: 'nar', text: '가져가라. 너는 그 사람과 손이 닮았다.' },
    { speaker: '나르', sprite: 'nar', text: '그 사람도 늘 삐뚤빼뚤했지.' },
    { speaker: '나르', sprite: 'nar', text: '그런데 물이 좋아했다.' },
  ],

  // 스케치북 낱장 ② + 세렌의 기억 조각
  PAGE_2: [
    { speaker: '', text: '두 소년이 배 한 척을 함께 그리는 그림. 한 명이 웃고 있다.' },
    { speaker: '', text: '세렌이 물에 비친 자기 모습을 보다가 갑자기 멈춘다.' },
    { speaker: '세렌', sprite: 'seren', text: '……' },
    { speaker: '루', sprite: 'ru', text: '세렌?' },
    { speaker: '세렌', sprite: 'seren', text: '나 방금.' },
    { speaker: '세렌', sprite: 'seren', text: '나 방금 저기서 누구 얼굴을 봤어. 내 얼굴이 아니라.' },
    { speaker: '세렌', sprite: 'seren', pen: true, text: '…아니다. 잊어. 가자.' },
  ],

  // ══════════ 3막 — 얼음섬 ══════════

  ICE_ARRIVE: [
    { speaker: '루', sprite: 'ru', bg: 'iceberg', text: '얼음 안이 다 비쳐요. 층이 보여.' },
    { speaker: '세렌', sprite: 'seren', text: '마지막 도안이 저기 있어. 정면도.' },
    { speaker: '세렌', sprite: 'seren', text: '앞에서 본 그림인데, 한 장이 아니야.' },
    { speaker: '세렌', sprite: 'seren', text: '배를 여러 군데서 뚝뚝 잘라서 그 단면들을 전부 겹쳐 그린 거야.' },
    { speaker: '루', sprite: 'ru', text: '그걸 왜 그렇게까지…' },
    { speaker: '세렌', sprite: 'seren', text: '그래야 안이 어떻게 생겼는지 아니까.' },
    { speaker: '세렌', sprite: 'seren', text: '껍데기만 알면 배가 아니야.' },
  ],

  ICE_KORI: [
    { speaker: '코리', text: '저 위에 흰 새가 살아. 아주 오래됐대.' },
    { speaker: '코리', text: '근데 이상한 게 뭔 줄 알아?' },
    { speaker: '코리', text: '저 새는 원래도 흰색이었거든.' },
    { speaker: '코리', text: '그래서 색이 빠졌는지 아닌지, 아무도 몰라.' },
    { speaker: '코리', text: '…본인도 모를걸.' },
  ],

  TUN_INTRO_EXTRA: [
    { speaker: '루', sprite: 'ru', text: '원래 흰색이에요, 아니면 색이 빠진 거예요?' },
    { speaker: '세렌', sprite: 'seren', text: '…구분이 안 되네.' },
    { speaker: '툰', sprite: 'tun', text: '둘 다다.' },
    { speaker: '툰', sprite: 'tun', text: '나는 흰 새였고, 지금은 색이 빠진 흰 새다.' },
    { speaker: '툰', sprite: 'tun', text: '아무도 차이를 모른다. 400년 동안 아무도.' },
  ],

  // [S-14] 툰의 거부
  TUN_WIN: [
    { speaker: '', text: '색이 돌아오려는 순간, 툰이 날개로 막는다.' },
    { speaker: '툰', sprite: 'tun', text: '그만해라.' },
    { speaker: '루', sprite: 'ru', text: '네? 다 왔는데요. 조금만 더 하면―' },
    { speaker: '툰', sprite: 'tun', text: '그러니까 그만하라는 거다.' },
    { speaker: '툰', sprite: 'tun', text: '색이 돌아오면 나는 제정신으로 돌아온다.' },
    { speaker: '툰', sprite: 'tun', text: '그러면 400년 동안 내가 무슨 짓을 했는지 전부 기억해야 한다.' },
    { speaker: '툰', sprite: 'tun', text: '이 얼음에 박힌 배들이 왜 여기 있는지,' },
    { speaker: '툰', sprite: 'tun', text: '누가 그렇게 만들었는지.' },
    { speaker: '루', sprite: 'ru', text: '……' },
    { speaker: '툰', sprite: 'tun', text: '지금은 아무것도 모른다. 편하다.' },
    { speaker: '툰', sprite: 'tun', text: '그러니 이대로 두어라.' },
    { speaker: '루', sprite: 'ru', text: '(…뭐라고 해야 하지.)' },
    { speaker: '루', sprite: 'ru', text: '(되돌리는 게 좋은 거라고 생각했는데.)' },
    { speaker: '세렌', sprite: 'seren', text: '루. 강요하지 마.' },
    { speaker: '루', sprite: 'ru', text: '…네.' },
    { speaker: '툰', sprite: 'tun', text: '고맙다.' },
    { speaker: '툰', sprite: 'tun', text: '대신 이건 가져가라. 애초에 내 것도 아니었다.' },
    { speaker: '툰', sprite: 'tun', text: '너는 그 사람 손을 가졌으니까.' },
  ],

  // [S-15] 진실
  TRUTH: [
    { speaker: '', text: '낱장 세 장이 나란히 놓인다. 400년 전 이야기가 이어진다.' },
    { speaker: '', text: '한 소년이 잉크병을 들고 바다로 향하고, 다른 소년이 붙잡는 그림.' },
    { speaker: '', text: '마지막 칸은 찢겨 있다.' },
    { speaker: '세렌', sprite: 'seren', text: '형제였어.' },
    { speaker: '세렌', sprite: 'seren', text: '하나는 잉크를 바다에 버리려 했고, 하나는 막았고.' },
    { speaker: '루', sprite: 'ru', text: '그러다 하나가 죽었고…' },
    { speaker: '루', sprite: 'ru', text: '남은 하나가 피 묻은 손으로 잉크병을 열었고.' },
    { speaker: '루', sprite: 'ru', text: '그래서 색이 빠지기 시작한 거예요.' },
    { speaker: '세렌', sprite: 'seren', text: '노래 그대로네.' },
    { speaker: '루', sprite: 'ru', text: '아니요. 노래가 더 정확해요.' },
    { speaker: '루', sprite: 'ru', text: '어른들은 "죽였다"고 하는데, 그림에는 놓친 걸로 그려져 있어요.' },
    { speaker: '루', sprite: 'ru', text: '노래도 그렇게 부르고요. 형아가 아우 손을 놓쳤대요.' },
    { speaker: '세렌', sprite: 'seren', text: '……' },
    { speaker: '', text: '스케치북 표지 안쪽에 옛 지명이 적혀 있다.' },
    { speaker: '루', sprite: 'ru', text: '세렌. 여기 섬 이름이 적혀 있어요.' },
    { speaker: '루', sprite: 'ru', text: '어둠섬.' },
    { speaker: '루', sprite: 'ru', text: '…우리 마을 위치랑 똑같아요.' },
    { speaker: '세렌', sprite: 'seren', text: '네가 사는 섬이' },
    { speaker: '세렌', sprite: 'seren', text: '그 형제가 살던 섬이야.' },
    { speaker: '루', sprite: 'ru', text: '(내가 자란 곳이, 전부 시작된 자리였어.)' },
  ],

  // ══════════ 4막 — 바람호 / 돌풍 지대 ══════════

  BUILD_INTRO: [
    { speaker: '세렌', sprite: 'seren', bg: 'sea_day', text: '세 장 다 모였어. 이제 진짜로 그리는 거야.' },
    { speaker: '세렌', sprite: 'seren', text: '…이상하다.' },
    { speaker: '루', sprite: 'ru', text: '뭐가요?' },
    { speaker: '세렌', sprite: 'seren', text: '이 배, 나 아는 것 같아.' },
    { speaker: '세렌', sprite: 'seren', text: '어디가 어떻게 생겼는지 손이 먼저 알아.' },
    { speaker: '루', sprite: 'ru', text: '세렌, 혹시―' },
    { speaker: '세렌', sprite: 'seren', text: '나중에. 지금은 그려.' },
  ],

  BUILD_DONE: (shipPixel) => [
    { speaker: '', image: shipPixel, imageCls: 'sailing', text: '바람호가 완성됐다.' },
    { speaker: '세렌', sprite: 'seren', text: '……' },
    { speaker: '세렌', sprite: 'seren', pen: true, text: '여기가 내 자리였구나.' },
  ],

  STORM_RUN: [
    { speaker: '세렌', sprite: 'seren', bg: 'night_storm', text: '여기서부터는 바람이 배를 부순다!' },
    { speaker: '세렌', sprite: 'seren', text: '잘 그렸으면 버텨! 못 그렸으면―' },
    { speaker: '루', sprite: 'ru', text: '못 그렸으면요?!' },
    { speaker: '세렌', sprite: 'seren', text: '그건 그때 가서 얘기하자!!' },
    { speaker: '', text: '바람호가 돌풍을 뚫는다. 부서지지 않는다.' },
  ],

  // ══════════ 5막 — 황금섬 / 최종전 ══════════

  GOLDEN_ISLE: [
    { speaker: '루', sprite: 'ru', bg: 'golden_isle', text: '금이… 금이 쌓여 있어서 금빛인 게 아니네요.' },
    { speaker: '세렌', sprite: 'seren', text: '잉크야. 여기가 제일 짙게 고인 자리.' },
    { speaker: '', text: '섬 한가운데, 아주 맑은 물이 고여 있다.' },
    { speaker: '', text: '그리고 그 앞에 누가 서 있다.' },
  ],

  NAIL_INTRO: [
    { speaker: '네일', sprite: 'nail', text: '고맙다.' },
    { speaker: '루', sprite: 'ru', text: '…누구세요.' },
    { speaker: '네일', sprite: 'nail', text: '나는 400년 동안 그 종이를 한 장도 못 가져왔다.' },
    { speaker: '네일', sprite: 'nail', text: '가까이만 가면 그 짐승들이 죽자고 달려들었거든.' },
    { speaker: '네일', sprite: 'nail', text: '그런데 너한테는 순순히 주더군.' },
    { speaker: '세렌', sprite: 'seren', text: '…네가 그 검은 돛.' },
    { speaker: '네일', sprite: 'nail', text: '그래서 안 죽였다. 네가 다 모을 때까지.' },
    { speaker: '루', sprite: 'ru', text: '(처음부터… 나를 쓰고 있었어.)' },
    { speaker: '네일', sprite: 'nail', text: '배를 내놔라. 그거면 된다.' },
    { speaker: '루', sprite: 'ru', text: '안 돼요. 그거 없으면 우리 마을이―' },
    { speaker: '네일', sprite: 'nail', text: '마을.' },
    { speaker: '네일', sprite: 'nail', text: '나는 400년을 기다렸다. 네 마을은 몇 년째냐.' },
  ],

  // [S-21] 펜 맞대기 → [S-22] 기억
  RECOGNITION: [
    { speaker: '세렌', sprite: 'seren', text: '야, 괜찮아? 다친 데 없어?' },
    { speaker: '루', sprite: 'ru', text: '네. 세렌도요?' },
    { speaker: '세렌', sprite: 'seren', pen: true, text: '나야 나무인데 뭐.' },
    { speaker: '네일', sprite: 'nail', text: '――――' },
    { speaker: '네일', sprite: 'nail', text: '그거.' },
    { speaker: '네일', sprite: 'nail', text: '지금 그거 어디서 배웠나.' },
    { speaker: '루', sprite: 'ru', text: '…세렌이 알려줬는데요.' },
    { speaker: '네일', sprite: 'nail', text: '그 인사는 이 세상에 두 사람만 했다.' },
    { speaker: '네일', sprite: 'nail', text: '나하고.' },
    { speaker: '네일', sprite: 'nail', text: '……' },
    { speaker: '네일', sprite: 'nail', text: '…너였구나.' },

    { speaker: '세렌', sprite: 'seren', text: '무슨 소리야. 나는 그냥 나무―' },
    { speaker: '세렌', sprite: 'seren', text: '――' },
    { speaker: '', text: '세렌이 멈춘다.' },
    { speaker: '세렌', sprite: 'seren', text: '형.' },
    { speaker: '세렌', sprite: 'seren', text: '형이 내 손을 놓쳤어.' },
    { speaker: '세렌', sprite: 'seren', text: '나는 배를 다 못 그렸고, 뱃머리만 만들어 놨고, 그날 밤에―' },
    { speaker: '세렌', sprite: 'seren', text: '내 이름은 모루야.' },
    { speaker: '루', sprite: 'ru', text: '(모루… 루.)' },
    { speaker: '루', sprite: 'ru', text: '(내 이름은, 거기서 잘려 나온 거였어.)' },
  ],

  // [S-23] 네일의 요구
  NAIL_ASKS: [
    { speaker: '네일', sprite: 'nail', text: '400년이다.' },
    { speaker: '네일', sprite: 'nail', text: '그 소문 하나 믿고 400년을 왔다.' },
    { speaker: '네일', sprite: 'nail', text: '성수는 죽은 사람도 살린다고.' },
    { speaker: '네일', sprite: 'nail', text: '배를 지으면 여기 올 수 있고,' },
    { speaker: '네일', sprite: 'nail', text: '여기 오면 동생을 되살릴 수 있다고.' },
    { speaker: '네일', sprite: 'nail', text: '너는 아직 한 번 남았지.' },
    { speaker: '네일', sprite: 'nail', text: '나한테 줘라. 내 동생을 살려줘.' },
    { speaker: '루', sprite: 'ru', text: '(성수는 죽은 사람을 못 살려. 없는 걸 만들지는 못하니까.)' },
    { speaker: '루', sprite: 'ru', text: '(그리고 더 있어. 이 사람은 400년 동안―)' },
    { speaker: '루', sprite: 'ru', text: '(자기가 찾던 걸 계속 눈앞에 두고 있었어.)' },
    { speaker: '루', sprite: 'ru', text: '(말해야 하나. 아니면 이대로 믿게 두는 게 나은가.)' },
    { speaker: '루', sprite: 'ru', text: '(툰이 그랬지. 다 알게 되면 다 기억해야 한다고.)' },
  ],

  // [S-24] 네일의 최후
  NAIL_END: [
    { speaker: '루', sprite: 'ru', text: '……' },
    { speaker: '루', sprite: 'ru', text: '아저씨.' },
    { speaker: '루', sprite: 'ru', text: '이미 살아 있어요.' },
    { speaker: '네일', sprite: 'nail', text: '……' },
    { speaker: '루', sprite: 'ru', text: '400년 동안, 계속 옆에 있었어요.' },
    { speaker: '루', sprite: 'ru', text: '도안 찾느라 못 보신 거예요.' },
    { speaker: '네일', sprite: 'nail', text: '―――――' },
    { speaker: '세렌', sprite: 'seren', text: '…형.' },
    { speaker: '네일', sprite: 'nail', text: '아.' },
    { speaker: '네일', sprite: 'nail', text: '아아.' },
    { speaker: '네일', sprite: 'nail', text: '그럼 나는.' },
    { speaker: '네일', sprite: 'nail', text: '없어도 될 일을 400년 했구나.' },
    { speaker: '세렌', sprite: 'seren', text: '형. 그날 형은 나를 죽인 게 아니야.' },
    { speaker: '세렌', sprite: 'seren', text: '놓친 거야. 나 그거 기억나.' },
    { speaker: '네일', sprite: 'nail', text: '…그게 더 나쁘다.' },
    { speaker: '네일', sprite: 'nail', text: '놓쳤으면 잡았어야지.' },
    { speaker: '', text: '네일이 품에서 오래된 펜을 꺼낸다. 400년간 쓰지 않은 것이다.' },
    { speaker: '네일', sprite: 'nail', pen: true, text: '…400년 만이다.' },
    { speaker: '', text: '굳어 있던 몸에 색이 돌아온다. 그리고 처음으로, 늙기 시작한다.' },
    { speaker: '네일', sprite: 'nail', text: '이제 죽을 수 있겠군.' },
    { speaker: '네일', sprite: 'nail', text: '얘야.' },
    { speaker: '네일', sprite: 'nail', text: '내가 굳힌 바다는 너무 넓어서 네 힘으로 안 된다.' },
    { speaker: '네일', sprite: 'nail', text: '…네 마을이라도, 살려라.' },
    { speaker: '', text: '네일이 눈을 감는다.' },
  ],

  // [S-25] 세렌
  SEREN_FREE: [
    { speaker: '세렌', sprite: 'seren', text: '어. 나 몸이 가벼워.' },
    { speaker: '루', sprite: 'ru', text: '세렌?!' },
    { speaker: '세렌', sprite: 'seren', text: '붙잡고 있던 게 없어졌나 봐.' },
    { speaker: '세렌', sprite: 'seren', text: '400년 동안 내가 뭘 붙잡고 있었는지 이제 알았거든.' },
    { speaker: '루', sprite: 'ru', text: '가는 거예요?' },
    { speaker: '세렌', sprite: 'seren', text: '아니.' },
    { speaker: '세렌', sprite: 'seren', text: '모양만 바뀌는 거야.' },
    { speaker: '', text: '뱃머리에서 빛이 풀려나, 진짜 바닷새가 되어 날아오른다.' },
  ],

  // [S-26] 소원
  WISH_INTRO: [
    { speaker: '세렌', sprite: 'seren', text: '평생 한 번이야. 잘 생각해.' },
    { speaker: '루', sprite: 'ru', text: '(…어릴 때부터 빌고 싶었던 게 하나 있었는데.)' },
    { speaker: '루', sprite: 'ru', text: '(그림 잘 그리게 해 주세요.)' },
    { speaker: '루', sprite: 'ru', text: '(…아니다.)' },
  ],

  WISH_DONE: [
    { speaker: '세렌', sprite: 'seren', text: '뭐라고 썼는지는 안 물어볼게.' },
    { speaker: '루', sprite: 'ru', text: '네.' },
    { speaker: '', text: '종이를 물에 넣자, 글씨가 금빛으로 번져 물속으로 풀린다.' },
    { speaker: '', text: '루가 그 물을 마신다.' },
  ],

  // ══════════ 에필로그 ══════════

  EPILOGUE: [
    { speaker: '촌장', sprite: 'examiner', bg: 'village_alive', text: '지붕이… 지붕 색이 돌아왔어!' },
    { speaker: '리코', text: '야아아! 꽃 폈다! 꽃!!' },
    { speaker: '루', sprite: 'ru', text: '(돌아왔다.)' },
    { speaker: '루', sprite: 'ru', text: '(근데 바다는 아직 하얘.)' },
    { speaker: '세렌', sprite: 'seren', text: '당연하지. 네가 본 적도 없는 데까지 어떻게 닿겠어.' },
    { speaker: '루', sprite: 'ru', text: '그럼 저기는요?' },
    { speaker: '세렌', sprite: 'seren', text: '저기는 저기 사는 애들이 그리면 되지.' },
    { speaker: '세렌', sprite: 'seren', text: '잉크는 바다에 있어. 400년 전부터.' },
    { speaker: '세렌', sprite: 'seren', text: '펜은 원래 다들 손에 있었고.' },
    { speaker: '루', sprite: 'ru', text: '…그럼 진작에 다들 할 수 있었던 거네요.' },
    { speaker: '세렌', sprite: 'seren', text: '응. 아무도 확인 안 해 봤을 뿐이야.' },
    { speaker: '세렌', sprite: 'seren', text: '너 빼고.' },
    { speaker: '', text: '루가 펜을 바닷물에 담근다. 펜촉에 금빛이 차오른다.' },
    { speaker: '세렌', sprite: 'seren', text: '아, 그리고 하나.' },
    { speaker: '세렌', sprite: 'seren', text: '너 그거 알아?' },
    { speaker: '세렌', sprite: 'seren', text: '너 이제 꽤 잘 그려.' },
    { speaker: '루', sprite: 'ru', text: '…소원 안 썼는데요.' },
    { speaker: '세렌', sprite: 'seren', pen: true, text: '그러니까.' },
    { speaker: '', text: '루가 마을 아이들에게 펜을 하나씩 나눠 준다.' },
    ...songLines(SONG_ENDING),
    { speaker: '', text: '펜은 처음부터 손에 있었고, 잉크는 처음부터 온 바다에 있었다.' },
    { speaker: '', text: '『그리는 자의 바다』 ― 그것이 보물의 이름이었다.' },
  ],

  // ══════════ 마을 NPC ══════════

  NARU_CHIEF: [
    { speaker: '촌장', sprite: 'examiner', text: '루야. 또 그림 그리고 있었냐.' },
    { speaker: '촌장', sprite: 'examiner', text: '…뭐, 나쁘다는 건 아니다.' },
    { speaker: '촌장', sprite: 'examiner', text: '색이 저 골목까지 왔어. 다음 달이면 우물까지 오겠지.' },
    { speaker: '촌장', sprite: 'examiner', text: '흰 숲엔 절대 가지 마라. 들어간 사람 중에 돌아온 사람이 없어.' },
  ],

  NARU_KID: [
    { speaker: '마을 아이', text: '루 형! 이 노래 알아?' },
    { speaker: '마을 아이', text: '♪ 형아가 하나 아우가 하나' },
    { speaker: '마을 아이', text: '♪ 아우는 배를 다 못 그렸대요' },
    { speaker: '마을 아이', text: '엄마가 그러는데 옛날에 진짜 있었던 일이래.' },
    { speaker: '마을 아이', text: '근데 아빠는 그냥 노래래. 누가 맞아?' },
  ],

  // ══════════ 짧은 대사 풀 ══════════

  DEFEAT: [
    { speaker: '세렌', sprite: 'seren', text: '후퇴! 배가 못 버텨!' },
    { speaker: '세렌', sprite: 'seren', text: '괜찮아. 우리한텐 펜이 있잖아. 다시 그리면 돼.' },
  ],
};

/** 배 판정 결과별 세렌의 한마디 (로컬 점수 기준) */
export const SHIP_VERDICT_LINES = {
  wreck: '이건 바다가 안 받아 줘. 다시 그려.',
  weak: '…뜨긴 뜨네. 조심해서 가자.',
  ok: '오, 이 정도면 괜찮은데?',
  great: '야. 너 못 그린다며.',
};

/** 도안 따라 그리기 등급별 한마디 */
export const TRACE_GRADE_LINES = {
  S: '…나보다 잘 그리는데.',
  A: '좋아. 이 정도면 바람도 못 부순다.',
  B: '쓸 만해. 근데 여기 한 번만 더 볼래?',
  C: '음… 뜨긴 하겠다.',
  D: '다시. 이건 배가 아니라 뗏목이야.',
};

/** 빈 캔버스 / 성의 없는 그림 */
export const EMPTY_CANVAS_LINES = [
  '빈 바다에 몸만 띄울 셈이야? 뭐라도 그려.',
  '이건 좀… 이대로 나가면 그냥 가라앉아. 다시.',
  '선 두 개는 배가 아니야. 최소한 뜨긴 해야지.',
];
