// 코드로 그린 픽셀아트 스프라이트 (24×32 흉상).
// 각 스프라이트: rows(문자 그리드) + palette(문자→색). '.'은 투명.
//
// 캐스트는 전원 동물이다 — 루/모루/네일은 고양이, 세렌은 바닷새, 시험관은 바다코끼리,
// 보스는 각 섬의 짐승. 사람 얼굴은 이 해상도에서 서로 구분이 안 되고,
// 7섬의 '가족 그림' 복선도 같은 귀·같은 줄무늬로 그려야 그림만으로 회수된다.
//
// 도트 규칙
// - 실루엣 전체를 어두운 외곽선(k)으로 감싼다. 배경이 씬마다 확 바뀌므로 이게 없으면 묻힌다.
// - 광원은 왼쪽 위. 밝은 면(l/w) → 기본(f) → 그늘(d) 3톤을 쓴다.
// - 얼굴은 좌우 대칭, 눈 하이라이트만 광원 쪽(왼쪽)으로 몰아준다.
// - 편집 후 `node dev/sprite-sheet.mjs`로 PNG를 뽑아 확인한다 (행 길이도 검사해준다).

export const SPRITES = {
  // 루 — 주인공. 크림 태비 고양이, 빨간 스카프, 초록 눈.
  // 램프: 크림 털 l→f→d→e (하이라이트는 난색, 그늘은 한색으로 휴시프트).
  // 광원 좌상단 — 이마 왼쪽에 빛 덩어리, 오른뺨·턱밑에 그늘. e는 정수리의 선택적 외곽선 겸용.
  ru: {
    palette: {
      k: '#1a1420', e: '#7a5340', d: '#c39a6e', f: '#eccfa2', l: '#fbeccb',
      s: '#9a6f46', p: '#efa3ac', w: '#fdf9ee', c: '#d8c5ae', g: '#3fd07d',
      r: '#e5505a', q: '#9c2b3f', v: '#3c518a', u: '#26335e',
    },
    rows: [
      '........................',
      '...kk..............kk...',
      '..klpk............kpdk..',
      '..klppk..........kppdk..',
      '.klfppk..........kppfdk.',
      '.klffpk..........kpffdk.',
      '.klffffeeeeekkkkkfffddk.',
      '.kllllllfffffffffffffdk.',
      '.klllsssffffffffsssfddk.',
      '.kllffsffffffffffsffddk.',
      '.kllfffffffffffffffdddk.',
      '.klffffffffffffffffdddk.',
      '.klffskkksffffskkksfddk.',
      '.klffkwggkffffkwggkfddk.',
      '.klffkggvkffffkggvkfddk.',
      '.klfffkkkffffffkkkffddk.',
      '.klffffffffffffffffdddk.',
      '.kffffffwwwppwccfffddek.',
      '.kffffffwwwqqwwcfffdeek.',
      '.kffffffwwqwwqwcfffdeek.',
      '.kfffffffwwwwccffffdeek.',
      '..kffffffcwwcccfffddek..',
      '...kfffffffffffffddek...',
      '....kfffffffffffddek....',
      '.....krrrrrrrrrrqqk.....',
      '....krrrrrrrrrrrqqqk....',
      '..kqqrrrrrrrrrrrqqqqqk..',
      '.kvvvvqqrrrrrrrrqqvuuuk.',
      '.kvvvvvvddffffdduuuuuuk.',
      '.kvvvvvvfllfffdduuuuuuk.',
      '.kvvvvvvvffffdduuuuuuuk.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },

  // 모루 영감 — 전설의 조선공. 늙은 크림 태비 고양이 (루와 같은 귀·같은 줄무늬 = 7섬 복선).
  moru: {
    palette: {
      k: '#17121c', f: '#d8c3a8', d: '#ab9078', l: '#efe2cf', s: '#8f7a63',
      p: '#d2909a', w: '#f5f2ec', g: '#c9a94a', b: '#5e3b1c', n: '#8b5a2b',
      v: '#4a4030', u: '#332c22',
    },
    rows: [
      '........................',
      '...kk..............kk...',
      '..kfpk............kpfk..',
      '..kfppk..........kppfk..',
      '.kffppk..........kppffk.',
      '.kfffpk..........kpfffk.',
      '.knnnnnkkkkkkkkkknnnnnk.',
      '.kbnnnnnnnnnnnnnnnnnnbk.',
      '.klfffsssffffffsssfffdk.',
      '.klffffssffffffssffffdk.',
      '.klfffwwwwffffwwwwfffdk.',
      '.klffwwffffffffffwwffdk.',
      '.klfffkkkkffffffkkkkfdk.',
      '.klffkwgkffffffkwgkffdk.',
      '.klffkggkffffffkggkffdk.',
      '.klfffkkkkffffffkkkkfdk.',
      '.klffffffffffffffffffdk.',
      '.klfffffwwwppwwwfffffdk.',
      '.klffffwwwwkkwwwwffffdk.',
      '.kdfffwwwwwwwwwwwwfffdk.',
      '.kdffwwwwwwwwwwwwwwffdk.',
      '..kdwwwwwwwwwwwwwwwwdk..',
      '...kwwwwwwwwwwwwwwwwk...',
      '....kwwwwwwwwwwwwwwk....',
      '.....kwwwwwwwwwwwwk.....',
      '....kvvvvvvvvvvvvvvk....',
      '..kuuvvvvvvvvvvvvvvuuk..',
      '.kvvvvuuvvvvvvvvuuvvvvk.',
      '.kvvuvvvvvvvvvvvvvvuvvk.',
      '.kvvuvvvvnnnnnnvvvvuvvk.',
      '.kvvuvvvvvvvvvvvvvvuvvk.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },

  // 검은 함장 네일 — 검은 고양이 해적선장. 루와 같은 종족, 반대의 선택.
  // 훔친 검은 잉크가 얼굴을 타고 흐르고, 한쪽 눈만 금빛으로 타오른다.
  nail: {
    palette: {
      k: '#08060c', f: '#453d55', d: '#2a2438', l: '#5f5675', s: '#9a90ab',
      p: '#3a2a35', m: '#6a6076', w: '#c9c4d6', g: '#ffc83d', y: '#fff0a0',
      r: '#e5484d', h: '#1c1f36', i: '#0f1120',
    },
    rows: [
      '...kk....kkkkkk....kk...',
      '..kfpk..khhhhhhk..kpfk..',
      '..kfppkkhhhhhhhhkkppfk..',
      '.kffppkhhhhhhhhhhkppffk.',
      '.kffkhhhgghhgghhgghkffk.',
      '.kkkhhhgghhgghhgghhhkkk.',
      'kkhhhhhhhhhhhhhhhhhhhhkk',
      'kiiiiiiiiiiiiiiiiiiiiiik',
      'khhhhhhhhhhhhhhhhhhhhhhk',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
      '.klffffffffffffffffffdk.',
      '.klffffffffffffffsffffk.',
      '.klffkkkkfffffffsffffdk.',
      '.klffkygkffffffsfffffdk.',
      '.klffkyykffffkkkkkfffdk.',
      '.klsffkkkkfffffffffssdk.',
      '.klsfffffffffffffffssdk.',
      '.klsffffmmmppmmmffssfdk.',
      '.klsfffmmmmppmmmmfssfdk.',
      '.kdsfffmmkmmmmkmmfssfdk.',
      '.kdssfffmmmmmmmmfssffdk.',
      '..kdsffffmmmmmmffssfdk..',
      '...kdsfffmmmmmmfssfdk...',
      '....kdsffmmmmmmfssdk....',
      '.....ksdddddddddskk.....',
      '....krrrrrrrrrrrrrrk....',
      '..kiirrrrrrrrrrrrrriik..',
      '.kiiiiiirrrrrrrriiiiiik.',
      '.kiiiiiiiggggggiiiiiiik.',
      '.kiiiiiiigyyyygiiiiiiik.',
      '.kiiiiiiiiggggiiiiiiiik.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },

  // 세렌 — 바람호의 뱃머리 정령. 바닷새(알바트로스) + 나무 받침.
  // 이마의 별 표식 = 이름의 뜻('별'), 길잡이.
  seren: {
    palette: {
      k: '#14101c', w: '#f2f6fb', c: '#c3d0de', b: '#4a7fbe', d: '#2f5a8e',
      o: '#ffb638', e: '#cf8a1c', y: '#ffe07a', g: '#2a2f45', n: '#8b5a2b',
      m: '#5e3b1c',
    },
    rows: [
      '........................',
      '.........kkkk...........',
      '.......kkwwwwkk.........',
      '......kwwwwwwwwk........',
      '.....kwwwwwwwwwwk.......',
      '.....kwwwyywwwwwck......',
      '....kwwwyyyywwwwwck.....',
      '....kwwwwyywwwwwwck.....',
      '....kwwwwwwwwwwwwck.....',
      '...kwwkgkwwwwwwwwck.....',
      '...kwwkgkwwwwwwwwck.....',
      '...kwwwkkwwwwwwwwck.....',
      '...kwwwwwwwwwwooooook...',
      '...kwwwwwwwwwkoooooook..',
      '...kwwwwwwwwwkeeeeeek...',
      '...kwwwwwwwwwwkeeeek....',
      '...kwwwwwwwwwwwkkkk.....',
      '...kwwwwwwwwwwwck.......',
      '....kwwwwwwwwwck........',
      '....kbwwwwwwwbck........',
      '...kbbbwwwwwbbbck.......',
      '..kbbbbbwwwbbbbdck......',
      '..kbbbbbbbbbbbbdck......',
      '.kbbbbbbbbbbbbbbdck.....',
      '.kbdbbbbbbbbbbbbddck....',
      'kbbdbbbbbbbbbbbbbddck...',
      'kbbddbbbbbbbbbbbbdddk...',
      'knnnnnnnnnnnnnnnnnnnnnk.',
      'kmnnnnnnnnnnnnnnnnnnnmk.',
      'kmmnnnnnnnnnnnnnnnnnmmk.',
      'kkmmmmmmmmmmmmmmmmmmmkk.',
      '..kkkkkkkkkkkkkkkkkkk...',
    ],
  },

  // 시험관 — 항해사 협회의 노련한 바다코끼리. 상아와 흰 수염, 남색 정모.
  examiner: {
    palette: {
      k: '#161320', s: '#9a8b98', d: '#786a78', l: '#b6a7b4', w: '#ddd3c2',
      c: '#fffdf5', h: '#232746', i: '#161a34', g: '#ffd24a', p: '#c98f9c',
      n: '#2a2231',
    },
    rows: [
      '........................',
      '.....kkkkkkkkkkkkkk.....',
      '...kkiiiiiiiiiiiiiikk...',
      '..kiiiiiiiiiiiiiiiiiik..',
      '..kihhhhhhgggggghhhhik..',
      '..kihhhhhhgggggghhhhik..',
      '.kiihhhhhhhhhhhhhhhhiik.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
      '..klssssssssssssssssdk..',
      '.klssssssssssssssssssdk.',
      '.klsswwwwssssssswwwwsdk.',
      '.klsssskgkssssskgksssdk.',
      '.klssskkkkssssskkkkssdk.',
      '.klssssssssssssssssssdk.',
      '.klssssspppppppppssssdk.',
      '.kdsssspkppppkppppsssdk.',
      '.kdssswwppppppppwwwssdk.',
      '.kdswwwwwwwwwwwwwwwwsdk.',
      'kwwwwwwwwwwwwwwwwwwwwwwk',
      'kwwwwwwwkccckkccckwwwwwk',
      'kwwwwwwkccckkccckwwwwwwk',
      '.kwwwwwkccckkccckwwwwwk.',
      '..kwwwkkccckkccckkwwwk..',
      '...kkkkcckkkkkkcckkkk...',
      '...khhhcckhhhhkcckhhhk..',
      '..khhhhcckhhhhkcckhhhhk.',
      '.khhiihcckhhhhkcckihhhk.',
      '.khhiihhkkkggkkkhiihhhk.',
      '.khhiihhhhgggghhhiihhhk.',
      '.khhiihhhhhggghhhhiihhk.',
      '.khhiihhhhhhhhhhhhiihhk.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },

  // 가르 — 수풀의 파수꾼 (1섬 보스). 네일의 검은 잉크에 물들어 폭주 중 —
  // 눈가와 이마에 검은 얼룩이 번져 있고 눈이 붉게 탄다.
  gar: {
    palette: {
      k: '#17121c', g: '#ffb937', d: '#c98717', l: '#ffd88a', s: '#7a4a12',
      p: '#e0955c', w: '#fffdf6', r: '#ff2e3e', b: '#1a1020', n: '#2e1d2e',
    },
    rows: [
      '..kk................kk..',
      '..kgk..............kgk..',
      '.kggpk............kpggk.',
      '.kgggpk..........kpgggk.',
      'klgggpk..........kpgggdk',
      'klggggkkkkkkkkkkkkggggdk',
      'klgggggggggggggggggggydk',
      'klggsgggbbbbbbbbgggsggdk',
      'klgsdsggbbbbbbbbggsdsgdk',
      'klggsggbbbbbbbbbbggsggdk',
      'klgggbbbbggggggbbbbgggdk',
      'klggbbkkkkggggkkkkbbggdk',
      'klgbbkwrkggggggkwrkbbgdk',
      'klgbbkrrkggggggkrrkbbgdk',
      'klggbkkkkggggggkkkkbggdk',
      'klgggggggbbbbbbgggggggdk',
      'klggsgggggppppggggggsgdk',
      'klgsdsgggpwwwwpgggsdsgdk',
      'klggsggkkpwwwwpkkggsggdk',
      'kdgggggkwkwwwwkwkgggggdk',
      'kdggggggkwkkkkwkggggggdk',
      '.kdgggggkwwwwwwkgggggdk.',
      '.kdggggggkwwwwkggggggdk.',
      '..kdggggggkkkkggggggdk..',
      '...kdgggggggggggggddk...',
      '....kddgggggggggggdk....',
      '...ksdgggsggggsgggdsk...',
      '..ksddgggggggggggggdsk..',
      '.ksdggggsggggggsggggdsk.',
      '.ksdgggggggggggggggddsk.',
      '.kssddgggggggggggggddsk.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },
};

// 스프라이트를 캔버스로 렌더 (scale 배율로 확대 표시)
export function spriteCanvas(name, scale = 6) {
  const def = SPRITES[name];
  if (!def) return null;
  const h = def.rows.length;
  const w = def.rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = def.rows[y][x];
      if (ch === '.' || !def.palette[ch]) continue;
      ctx.fillStyle = def.palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  canvas.classList.add('pixel');
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${h * scale}px`;
  return canvas;
}

export function hasSprite(name) {
  return !!SPRITES[name];
}
