// 코드로 그린 픽셀아트 스프라이트.
// 각 스프라이트: rows(문자 그리드) + palette(문자→색). '.'은 투명.

const SPRITES = {
  // 세렌 — 바람호의 뱃머리 정령 (분홍 돼지 + 나무 받침) — TODO: 바닷새 등으로 디자인 변경 검토
  seren: {
    palette: { k: '#1a1423', p: '#f4a7b9', s: '#e0879e', n: '#40222e', b: '#8b5a2b' },
    rows: [
      '................',
      '..kk........kk..',
      '.kppk......kppk.',
      '.kppkkkkkkkkppk.',
      '.kppppppppppppk.',
      'kppppppppppppppk',
      'kpppkppppppkpppk',
      'kppppppppppppppk',
      'kppppssssssppppk',
      'kppppsnssnsppppk',
      'kppppssssssppppk',
      '.kppppppppppppk.',
      '..kppppppppppk..',
      '...kbbbbbbbbk...',
      '..kbbbbbbbbbbk..',
      '..kkkkkkkkkkkk..',
    ],
  },

  // 검은 함장 네일 — 해골 얼굴 + 검은 모자
  nail: {
    palette: { k: '#14101c', f: '#b9bfc9', r: '#ff2e3e', c: '#232746' },
    rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '.kkkkkkkkkkkkkk.',
      'kkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkk',
      '.kffffffffffffk.',
      '.kffrrffffrrffk.',
      '.kffffffffffffk.',
      '.kfffffkkfffffk.',
      '.kffffffffffffk.',
      '.kffkkkkkkkkffk.',
      '.kffffffffffffk.',
      '..kcccccccccck..',
      '.kcccccccccccck.',
      '.kcccck..kcccck.',
      '................',
    ],
  },

  // 루 — 주인공 (빨간 두건)
  ru: {
    palette: { k: '#1a1423', b: '#e5484d', t: '#f2c9a0', r: '#ff9d9d', g: '#3fd27f' },
    rows: [
      '................',
      '...bbbbbbbbbb...',
      '..bbbbbbbbbbbb..',
      '.bbbbbbbbbbbbbb.',
      '.kttttttttttttk.',
      'kttttttttttttttk',
      'kttkttttttttkttk',
      'kttttttttttttttk',
      'ktrttttttttttrtk',
      'kttttkkkkkkttttk',
      '.kttttttttttttk.',
      '..kttttttttttk..',
      '...kkkkkkkkkk...',
      '..kggggggggggk..',
      '.kggggggggggggk.',
      '................',
    ],
  },

  // 시험관 — 항해사 협회의 노련한 뱃사람 (남색 모자 + 흰 수염)
  examiner: {
    palette: { k: '#1a1423', h: '#232746', t: '#e8b98a', w: '#f0ede4', c: '#232746' },
    rows: [
      '................',
      '...hhhhhhhhhh...',
      '..hhhhhhhhhhhh..',
      '.hhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhhhhh',
      '.kttttttttttttk.',
      '.ktkttttttttktk.',
      '.kttttttttttttk.',
      '.kwwttttttttwwk.',
      '.kwwwwwwwwwwwwk.',
      '.kwwwwwwwwwwwwk.',
      '..kwwwwwwwwwwk..',
      '...kwwwwwwwwk...',
      '....kkkkkkkk....',
      '..kcckkkkkkcck..',
      '................',
    ],
  },

  // 가르 — 황금 재규어 (섬 1 보스)
  gar: {
    palette: { k: '#1a1423', g: '#ffb937', d: '#7a4a12', w: '#fffdf6', s: '#e0955c' },
    rows: [
      '.kkk........kkk.',
      'kgggk......kgggk',
      'kggggkkkkkkggggk',
      'kggggggggggggggk',
      'kgdggggddggggdgk',
      'kggkwggggggwkggk',
      'kgdggggggggggdgk',
      'kggggksssskggggk',
      'kggggskkkksggggk',
      'kgdggskkkksggdgk',
      'kggggkwkkwkggggk',
      '.kggggkkkkggggk.',
      '.kggggggggggggk.',
      '..kggdggggdggk..',
      '...kkkkkkkkkk...',
      '................',
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
