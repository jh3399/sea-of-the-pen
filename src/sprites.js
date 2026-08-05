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
  // 램프는 루와 같은 구조를 채도만 낮춰서 — 같은 혈통이 팔레트에서도 읽히게.
  // 흰 눈썹·긴 수염이 가슴까지 덮고, 눈가엔 주름(s), 허리엔 띠.
  moru: {
    palette: {
      k: '#1a1420', e: '#66503f', d: '#a88d6f', f: '#cdb694', l: '#e8dabc',
      s: '#82644a', p: '#d8a0a4', w: '#f7f4ec', c: '#cfc4b2', g: '#e8bc4e',
      n: '#a06c38', b: '#5e3b20', v: '#565037', u: '#343226',
    },
    rows: [
      '........................',
      '...kk..............kk...',
      '..klpk............kpdk..',
      '..klppk..........kppdk..',
      '.klfppk..........kppfdk.',
      '.klffpk..........kpffdk.',
      '.knnnnnbbbbbkkkkknnnnnk.',
      '.knnnnnnnnnnnnnnnnbbbbk.',
      '.klllsssffffffffsssfddk.',
      '.kllffsffffffffffsffddk.',
      '.kllfwwwwwffffwwwwwdddk.',
      '.klffwwwwwffffwwwwwdddk.',
      '.klffskkksffffskkksfddk.',
      '.klffkwggkffffkwggkfddk.',
      '.klffkggekffffkggekfddk.',
      '.klfffkkkffffffkkkffddk.',
      '.klffsffsfffffsffsfdddk.',
      '.kffffffwwwppwccfffddek.',
      '.kfffwwwwwwbbwwwwcfdeek.',
      '.kffwwwwwwwwwwwwwccfdek.',
      '.kfwwwwwwwwwwwwwwwccdek.',
      '..kwwwwwwwwwwwwwwwccek..',
      '...kwwwwwwwwwwwwwccek...',
      '....kwwwwwwwwwwwccek....',
      '.....kwwwwwwwwwwcck.....',
      '....kvvvvvwwwwvvuuuk....',
      '..kvvvvvvvwwwwvvvuuuuk..',
      '.kvvvvvvvvvwwvvvvuuuuuk.',
      '.kvvnnnnnnnnnnnnbbuuuuk.',
      '.kvvvvvvvvvvvvvvuuuuuuk.',
      '.kvvvvvvvvvvvvvuuuuuuuk.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },

  // 검은 함장 네일 — 멀리서 검게 보이는 자주빛 고양이. 루와 같은 골격, 반대의 선택.
  // 램프는 자주 결정화 팔레트(d→f→m→s→림라이트 e) — 색 자체가 피가 섞였다는 증거.
  // 왼눈만 금빛으로 타오르고, 오른눈은 흉터로 감겨 있다. 왼뺨에 금 간 선(g) 2px.
  nail: {
    palette: {
      k: '#0d0a14', d: '#2a1630', f: '#44254a', m: '#63356a', s: '#8a5590',
      e: '#c9a0cf', g: '#ffd24a', y: '#fff0a0', h: '#252c4e', i: '#161933',
      r: '#b03040', q: '#701f30',
    },
    rows: [
      '...kk....kkkkkk....kk...',
      '..ksdk..khhhhhhk..kdfk..',
      '..ksddkkhhhhhhhhkkddfk..',
      '.ksfddkhhhhhhhhhhkddffk.',
      '.ksffdkgghhgghhggkdfffk.',
      '.ksffdkhhhhhhhhhhkdfffk.',
      '.khhhhhhhhhhhhhhhiiiiik.',
      '.kiiiiiiiiiiiiiiiiiiiik.',
      '.ksfffffffffffffffddddk.',
      '.kesfffffffffffffffdddk.',
      '.keffffffffffffffffdddk.',
      '.ksfffffffffffffffddddk.',
      '.ksffmkkkmfffffffsfdddk.',
      '.ksffkyggkffffffsffdddk.',
      '.ksffkggmkffffkskkkfddk.',
      '.ksfffkkkfffffsffffdddk.',
      '.ksfgffffffffffffffdddk.',
      '.kffgfffmmmddmfffffdddk.',
      '.kffffffmmdmmdfffffdddk.',
      '.kfffffffmmmmffffffdddk.',
      '..kffffffmmmffffffdddk..',
      '...kfffffffffffffdddk...',
      '....kfffffffffffdddk....',
      '.....krrrrrrrrrrqqk.....',
      '....krrrrrrrrrrrqqqk....',
      '..kqqrrrrrrrrrrrqqqqqk..',
      '.khhhhqqrrrrrrrrqqhiiik.',
      '.khhhhhhhhgghhhiiiiiiik.',
      '.khhhhhhhhhhhhhiiiiiiik.',
      '.khhhhhhhhgghhhiiiiiiik.',
      '.khhhhhhhhhhhhiiiiiiiik.',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },

  // 세렌 — 바람호의 뱃머리 정령. 바닷새(알바트로스) + 나무 받침.
  // 이마의 별 표식 = 이름의 뜻('별'). 깃털 그늘은 한색(청회) 램프 — 순백 평면 금지.
  // 흰 가슴이 V자로 파란 몸에 흘러들고, 받침엔 나뭇결(m).
  seren: {
    palette: {
      k: '#141020', w: '#f6f9fd', c: '#d3dfec', a: '#a6bad2', b: '#5088c4',
      d: '#33619c', l: '#7fb2dc', o: '#f5a63c', e: '#c47a20', y: '#ffe07a',
      n: '#8a5a30', m: '#5e3a1e',
    },
    rows: [
      '........................',
      '.........kkkkk..........',
      '.......kkwwwwckk........',
      '......kwwwwwwwwcck......',
      '.....kwwwwywwwwwcck.....',
      '....kwwwwyyywwwwwcck....',
      '....kwwwwwyowwwwwwcck...',
      '...kwwwwwwwwwwwwwwcack..',
      '...kwwkkkwwwwwwwwwcack..',
      '...kwwkwkwwwwwwkkkkkk...',
      '...kwwkkkwwwwwcyooooook.',
      '..kwwwwwwwwwwwwcoooeek..',
      '..kwwwwwwwwwwwwckeeeek..',
      '..kwwwwwwwwwwwwwckkkk...',
      '..kwwwwwwwwwwwwwcak.....',
      '..kawwwwwwwwwwwccak.....',
      '...kwwwwwwwwwwwcak......',
      '...kawwwwwwwwwcak.......',
      '..kbbwwwwwwwwbbk........',
      '.kbbbbwwwwwwbbbdk.......',
      '.klbbbbbwwwwbbbddk......',
      'kblbbbbbbwwbbbbdddk.....',
      'kbbbbbbbbbbbbbbddddk....',
      'kbbbbbbbbbbbbbbdddddk...',
      'kbbbbbbbbbbbbddddddddk..',
      'kbbbbbbbbbbbdddddddddk..',
      'kbbbbbbbbbbbdddddddddk..',
      'knnnnnnnnnnnnnnnnnnnnnk.',
      '.kmnnnnnnnnnnnnnnnmmmk..',
      '.kmnnnmmnnnnnnmmnmmmmk..',
      '.kmmmmmmmmmmmmmmmmmmmk..',
      '..kkkkkkkkkkkkkkkkkkkk..',
    ],
  },

  // 시험관 — 항해사 협회의 노련한 바다코끼리. 상아와 흰 수염, 남색 정모.
  // 살빛은 회자주 램프(l→s→d→e), 그늘은 보라 쪽으로. 정모·제복은 같은 남색(h/i)으로 통일.
  examiner: {
    palette: {
      k: '#161320', l: '#c4b2c0', s: '#a08ba0', d: '#7c6680', e: '#584a60',
      w: '#e8ddcc', c: '#fffdf2', h: '#2a3158', i: '#1a1f3c', g: '#ffd24a',
      p: '#c79aa4',
    },
    rows: [
      '........................',
      '.....kkkkkkkkkkkkkk.....',
      '...kkhhhhhhhhhhhhhhkk...',
      '..khhhhhhhhhhhhhhhhhhk..',
      '..khhhhhhgggggghhiiiik..',
      '..khhhhhhhgggghhhiiiik..',
      '.khhhhhhhhhhhhhhhiiiiik.',
      '.kiiiiiiiiiiiiiiiiiiiik.',
      '..klsssssssssssssssddk..',
      '.kllssssssssssssssssddk.',
      '.klsskkkssssssskkkssddk.',
      '.klsskwkssssssskwkssddk.',
      '.klsssssssssssssssssddk.',
      '.klsssspppppppppsssddk..',
      '.klsssppkpppkppppssddk..',
      '.klswwwwwwwwwwwwwwsddk..',
      '.kdswwwwwwwwwwwwwwsddk..',
      '.kdwwwwwccwwwwccwwwedk..',
      '..kdwwwkcckwwkcckwwdk...',
      '.khhhhhkcckhhkcckhhhhik.',
      '.khhhhhkcckhhkcckhhhiik.',
      'khhhhhhkcckhhkcckhhiiiik',
      'khhhhhhkcckhhkcckhiiiiik',
      'khhhhhhhkkhhhhkkhhiiiiik',
      'khhhhhhhhhhhhhhhhiiiiiik',
      'khhhhhhhhhgghhhhhiiiiiik',
      'khhhhhhhhhhhhhhhhiiiiiik',
      'khhhhhhhhhgghhhhhiiiiiik',
      'khhhhhhhhhhhhhhhhiiiiiik',
      'khhhhhhhhhhhhhhhiiiiiiik',
      'khhhhhhhhhhhhhhhiiiiiiik',
      'kkkkkkkkkkkkkkkkkkkkkkkk',
    ],
  },

  // 가르 — 수풀의 파수꾼 (1섬 보스). 자주빛 결정이 눈가를 덮고 어깨를 타고 오른다 —
  // v5 규칙: 오염은 검정이 아니라 결정화(f/m). 눈만 붉게 탄다. 반점은 2px 로제트 뭉치로.
  gar: {
    palette: {
      k: '#17111c', l: '#ffd88a', g: '#f5ae38', d: '#c97f1f', s: '#8a5216',
      p: '#e8a06a', w: '#fbf3e2', r: '#ff3b47', f: '#3a1f3f', m: '#5a2f5e',
    },
    rows: [
      '..kk................kk..',
      '.kggk..............kggk.',
      '.kgddk............kddgk.',
      'klggdk............kdggdk',
      'klgggssssssskkkkkkkgggdk',
      'klllgggggggggggggggggddk',
      'kllggggggggggggggggggddk',
      'klgggffmffffffmffggggddk',
      'klggffmffffffffmfffggddk',
      'klffkwrkffffffkwrkffgddk',
      'klffkrrkffffffkrrkffgddk',
      'klgffmffffffffffmffggddk',
      'klggfgggggffgggggfggggdk',
      'klgggggggppppgggggggdddk',
      'klggggggpwwwwpggggggdddk',
      'klggggkkpwwwwpkkgggddddk',
      'kdggggkwkwwwwkwkgggddddk',
      'kdgggggkwkkkkwkggggddddk',
      '.kdggggkwwwwwwkggggdddk.',
      '.kdgggggkwwwwkgggggdddk.',
      '..kdggggggkkkkgggggddk..',
      '...kdggggggggggggggddk..',
      '....kdggggggggggggddk...',
      '..klgssggggggggssgggdk..',
      '.klgggssggggggggssggddk.',
      '.klggggggssggssggggdddk.',
      '.kffmggggggggggggggdddk.',
      '.kfffmgggggggggggggdddk.',
      '.kffffggggssggggggggddk.',
      '.kfffffgggggggggggggddk.',
      '.kffffgggggggggggggdddk.',
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
