// 그림 배경 위에서 움직이는 것들 — 타이틀의 #title-fx 와 같은 수법이다.
// 정지 PNG 는 디테일을 지키지만 화면이 통째로 멈춰 보인다. 그래서 그림은 그대로 두고
// **움직여야 하는 것만** 위 캔버스에서 다시 그린다.
//
// 좌표는 전부 그림 원본(1672×941) 기준이다. 캔버스도 같은 크기로 두고 CSS 가 같은
// object-fit: cover 로 잘라야 창 비율이 바뀌어도 어긋나지 않는다 (#title-fx 와 같은 이유).

const FX = {
  sickroom: {
    // 창밖 바다 — 실측 좌표
    sea: { x: 964, y: 252, w: 545, h: 138 },
    // 숨 — 이불·고양이·베개 덩어리를 통째로 몇 px 들었다 놓는다.
    // 마스크는 침대 안에서 플러드 필로 만든다. 사각형으로 자르면 벽 판자선과 걸상이
    // 잘려 세로 이음매가 생기고, 열마다 훑는 방식은 빛기둥 경계에서 깨진다 — 둘 다 해 봤다.
    breath: { seeds: [[400, 520], [250, 470], [700, 540]], yBot: 600, amp: 3, period: 4.6 },
  },
  // 거실 — 인물이 앉아만 있는 컷이라 가만두면 화면이 통째로 정지 사진이 된다.
  //
  // ★ **눈 깜빡임이 제일 크게 먹는다.** 램프나 먼지는 "분위기"지만 깜빡임은 살아 있다는
  //   신호라, 이것 하나로 "PNG 그 자체" 느낌이 깨진다. 눈 좌표는 눈대중이 아니라
  //   그림에서 초록 화소를 훑어 클러스터로 찾았다 (좌 788,373 · 우 882,373, 대칭).
  //   덮는 색도 눈 바로 위 털에서 뽑은 값이다 — 손으로 고르면 얼굴에 얼룩이 생긴다.
  // ★ 귀·꼬리를 따로 움직이는 것은 **하지 않았다.** 그러려면 PNG 에서 그 부분만 레이어로
  //   떼고 원래 자리를 배경색으로 메워야 하는데, 꼬리가 소파(붉은색) 위에 있고 목도리도
  //   같은 붉은색이라 sickroom 처럼 플러드 필로 자를 수가 없다. 잘못 자르면 얼굴이
  //   몸에서 떨어져 나온다. 레이어를 나눠 그린 그림이 생기면 그때 붙일 자리다.
  living_room: {
    lamp: { cx: 230, cy: 352, r: 260, period: 5.2 },
    // 깜빡임은 **불규칙해야 한다.** 정확히 6초마다 감으면 시계처럼 보인다 —
    // 가끔 두 번 연속으로 깜빡이게 해서 그것을 깬다.
    //
    // ⚠ 상자는 **검은 테두리까지 덮어야 한다.** 초록 홍채만 덮으면 테두리가 그대로 남아
    //   감은 눈이 아니라 검은 사각형이 된다 (한 번 그렇게 만들었다). 눈 위의 갈색 눈썹
    //   자국(y 354~361)은 덮으면 안 된다 — 그건 눈이 아니라 무늬다.
    //   행 히스토그램으로 잰 값: 눈 = x 765~825 · 847~907, y 363~393.
    blink: {
      boxes: [[765, 363, 61, 31], [847, 363, 61, 31]],
      fur: '#f6d2a1', lid: '#241a12', period: 6.2, dur: 0.15,
    },
    dust: { count: 40, x0: 110, x1: 470, y0: 660, y1: 150, period: 11 },
  },
  // "가만히 누워서 물이고 배고 고기고 다 빨아들인다지." 에만 붙는다.
  // 앞 줄(bulgasari_deep)은 같은 그림을 쓰되 아무것도 움직이지 않는다 — 가만히 있다가
  // 빨아들이기 시작하는 것이 대사의 순서이고, 그림을 두 장 그리지 않아도 그게 된다.
  bulgasari_feed: {
    suck: { cx: 820, cy: 400, count: 120, radius: 900, period: 3.4 },
  },
  // "반짝이는" 것이 정지 그림이면 그 낱말이 거짓말이 된다. 병에서 새어 나오는 빛이
  // 숨 쉬듯 커졌다 작아지고, 물속이라 기포가 올라간다.
  essence: {
    glow: { cx: 890, cy: 560, r: 420, period: 2.6 },
    bubbles: { count: 26, period: 5.2, x0: 620, x1: 1160, y0: 780, y1: 60 },
  },
};

/** 나무(벽·침대틀·걸상). 이불·고양이·베개는 전부 여기서 빠지므로 플러드 필이 벽에 막힌다. */
function isWood(d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return r > b + 14 && g >= b - 4 && b < 130 && r < 185;
}

/** 그림에서 "숨 쉬는 덩어리"만 남기고 나머지를 투명하게 만든 레이어를 한 번 만든다. */
function buildBreathLayer(img, cfg) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const mask = new Uint8Array(c.width * c.height);
  const stack = cfg.seeds.slice();
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= c.width || y >= cfg.yBot) continue;
    const p = y * c.width + x;
    if (mask[p] || isWood(d, p * 4)) continue;
    mask[p] = 1;
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  for (let p = 0; p < mask.length; p++) if (!mask[p]) d[p * 4 + 3] = 0;
  ctx.putImageData(id, 0, 0);
  return c;
}

/** 바다 위에서 흐를 반짝임 자리. 창살 위에 찍히지 않게 바다색인 칸만 남긴다. */
function buildSparks(img, sea) {
  const c = document.createElement('canvas');
  c.width = sea.w; c.height = sea.h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, sea.x, sea.y, sea.w, sea.h, 0, 0, sea.w, sea.h);
  const d = ctx.getImageData(0, 0, sea.w, sea.h).data;
  const isSea = (x, y) => {
    const i = (y * sea.w + x) * 4;
    return d[i + 2] > 120 && d[i + 2] - d[i] > 40 && d[i + 1] > d[i];
  };
  const out = [];
  for (let n = 0; n < 90; n++) {
    // 결정적 난수 — Math.random() 은 새로고침마다 반짝임 배치가 튄다
    const h = Math.sin(n * 12.9898) * 43758.5453;
    const h2 = Math.sin(n * 78.233) * 12345.6789;
    const x = Math.floor((h - Math.floor(h)) * sea.w);
    const y = Math.floor((h2 - Math.floor(h2)) * sea.h);
    const len = 4 + Math.floor((h - Math.floor(h)) * 14);
    if (x + len >= sea.w || !isSea(x, y) || !isSea(x + len - 1, y)) continue;
    out.push({ x, y, len, speed: 4 + ((n % 5) * 3), phase: n * 0.7 });
  }
  return out;
}

/**
 * 빨려드는 부유물의 출발 자리. 각도와 반지름만 미리 정해 두고 매 프레임 안으로 당긴다.
 * 위상을 흩어 두는 것이 요점이다 — 안 그러면 전부 같은 박자로 빨려들어 파도처럼 보인다.
 */
function buildMotes(cfg) {
  const out = [];
  for (let i = 0; i < cfg.count; i++) {
    const h1 = Math.sin(i * 12.9898) * 43758.5453;
    const h2 = Math.sin(i * 78.233) * 12345.6789;
    const h3 = Math.sin(i * 39.425) * 24634.6345;
    out.push({
      angle: (h1 - Math.floor(h1)) * Math.PI * 2,
      dist: 0.35 + (h2 - Math.floor(h2)) * 0.65,   // 중심에서 얼마나 먼 데서 출발하는가
      phase: h3 - Math.floor(h3),
      size: 1 + Math.floor((h1 - Math.floor(h1)) * 3),
    });
  }
  return out;
}

/**
 * 지금 눈을 감고 있는가. 0 = 뜸, 1 = 완전히 감음.
 *
 * 한 주기에 한 번 감되, 주기의 3할쯤에서 **두 번째 깜빡임**을 섞는다. 사람도 고양이도
 * 일정한 간격으로 깜빡이지 않아서, 규칙적으로 감으면 살아 있는 게 아니라 기계로 보인다.
 */
function blinkAmount(sec, cfg) {
  const t = (sec / cfg.period) % 1;
  const hit = (at) => {
    const d = cfg.dur / cfg.period;
    if (t < at || t > at + d) return 0;
    return Math.sin(((t - at) / d) * Math.PI);   // 감았다 뜨는 한 번
  };
  return Math.max(hit(0), hit(0.31));
}

/** 램프빛 속의 먼지. 아주 느리게 오르고, 빛 안에서만 보인다. */
function buildDust(cfg) {
  const out = [];
  for (let i = 0; i < cfg.count; i++) {
    const h1 = Math.sin(i * 33.17) * 27183.281;
    const h2 = Math.sin(i * 61.43) * 14142.135;
    out.push({
      x: cfg.x0 + (h1 - Math.floor(h1)) * (cfg.x1 - cfg.x0),
      phase: h2 - Math.floor(h2),
      size: 1 + Math.floor((h1 - Math.floor(h1)) * 2),
      sway: 5 + (h2 - Math.floor(h2)) * 16,
    });
  }
  return out;
}

/** 올라가는 기포. 위상을 흩어야 한 줄로 몰려 올라가지 않는다. */
function buildBubbles(cfg) {
  const out = [];
  for (let i = 0; i < cfg.count; i++) {
    const h1 = Math.sin(i * 21.71) * 33417.1234;
    const h2 = Math.sin(i * 55.09) * 19876.5432;
    out.push({
      x: cfg.x0 + (h1 - Math.floor(h1)) * (cfg.x1 - cfg.x0),
      phase: h2 - Math.floor(h2),
      size: 1 + Math.floor((h1 - Math.floor(h1)) * 3),
      sway: 6 + (h2 - Math.floor(h2)) * 14,
    });
  }
  return out;
}

let raf = 0;
let state = null;
// 그림 로드는 비동기라 씬을 빨리 넘기면 **이미 지나간 씬의 setup 이 나중에 도착**한다.
// 세대 번호로 그것을 버린다 — 없으면 S-02 배경 위에서 S-01 의 숨이 돈다.
let gen = 0;

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (state) {
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.canvas.dataset.on = '0';
  }
  state = null;
}

/**
 * 씬에 맞는 움직임을 켠다. 그림이 없거나 정의가 없는 씬이면 끄기만 한다.
 * @param canvas  #scene-fx
 * @param key     씬 키
 * @param src     그 씬의 그림 URL (bgphotos.js 가 준 것)
 */
export function startSceneFx(canvas, key, src) {
  stop();
  const myGen = ++gen;
  const cfg = FX[key];
  // 움직임이 정의된 씬에만 레이어를 켠다. 그림만 있고 움직임이 없는 씬(mio_drawing)에서
  // 켜 두면 빈 캔버스가 계속 합성되고, "왜 안 움직이지"를 여기서 찾게 된다.
  if (canvas) canvas.dataset.on = cfg && src ? '1' : '0';
  if (!canvas || !cfg || !src) return;

  const img = new Image();

  // ⚠ img.decode() 를 쓰면 안 된다 — 탭이 화면에 없을 때(자동화 브라우저·백그라운드 탭)
  //    영영 resolve 되지 않아 움직임이 통째로 안 켜진다. onload 는 그 경우에도 온다.
  const setup = () => {
    if (myGen !== gen || !canvas.isConnected) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    const breathLayer = cfg.breath ? buildBreathLayer(img, cfg.breath) : null;
    const sparks = cfg.sea ? buildSparks(img, cfg.sea) : [];
    const motes = cfg.suck ? buildMotes(cfg.suck) : [];
    const bubbles = cfg.bubbles ? buildBubbles(cfg.bubbles) : [];
    const dust = cfg.dust ? buildDust(cfg.dust) : [];
    state = { canvas, ctx };

    const frame = (t) => {
      const sec = t / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 숨 — 사인 한 주기가 한 번의 들숨·날숨이다. 정수로 반올림해야 도트가 떨리지 않는다.
      if (breathLayer) {
        const k = Math.round(((Math.sin((sec / cfg.breath.period) * Math.PI * 2) + 1) / 2) * cfg.breath.amp);
        ctx.drawImage(breathLayer, 0, -k);
      }

      // 바다 — 반짝임이 가로로 흐르다 창 끝에서 되돌아온다.
      // 아래에 원본 그림이 그대로 깔려 있으므로 바탕을 다시 그릴 필요가 없다.
      if (cfg.sea) {
        for (const s of sparks) {
          const drift = (sec * s.speed + s.phase * 30) % (cfg.sea.w + 40) - 20;
          const x = cfg.sea.x + ((s.x + drift) % cfg.sea.w + cfg.sea.w) % cfg.sea.w;
          if (x + s.len > cfg.sea.x + cfg.sea.w) continue;
          ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(sec * 2.2 + s.phase));
          ctx.fillStyle = '#dbeaf4';
          ctx.fillRect(Math.round(x), cfg.sea.y + s.y, s.len, 2);
        }
        ctx.globalAlpha = 1;
      }

      // 흡입 — 부유물이 중심으로 당겨지고, 가까워질수록 빨라지며 사라진다.
      // t 를 제곱해서 쓰는 것이 핵심이다: 등속으로 당기면 빨려드는 게 아니라 떠내려간다.
      if (cfg.suck) {
        const s = cfg.suck;
        for (const m of motes) {
          const t = ((sec / s.period) + m.phase) % 1;
          const r = s.radius * m.dist * (1 - t * t);
          const x = s.cx + Math.cos(m.angle) * r;
          const y = s.cy + Math.sin(m.angle) * r * 0.52;   // 바닥에 누운 것이라 세로를 눌러 준다
          ctx.globalAlpha = 0.55 * Math.min(1, t * 4) * (1 - t);
          ctx.fillStyle = '#9fd4f2';
          ctx.fillRect(Math.round(x), Math.round(y), m.size, m.size);
        }
        ctx.globalAlpha = 1;
      }

      // 병에서 새어 나오는 빛의 맥박. 원본 그림에 이미 헤일로가 있으므로 여기서는
      // **덧그리기만** 한다 — 지웠다 다시 그리면 원본의 결이 같이 지워진다.
      if (cfg.glow) {
        const g = cfg.glow;
        const puls = 0.5 + 0.5 * Math.sin((sec / g.period) * Math.PI * 2);
        const grad = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.r);
        grad.addColorStop(0, `rgba(80,220,255,${0.16 * puls + 0.04})`);
        grad.addColorStop(0.5, `rgba(50,180,230,${0.07 * puls + 0.02})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
      }

      // 램프 — 갓 둘레의 빛이 아주 느리게 밝아졌다 어두워진다. 기름등이라 흔들린다는 뜻이고,
      // 덧그리기만 하므로 원본 갓의 결은 그대로 남는다 (essence 의 glow 와 같은 수법).
      if (cfg.lamp) {
        const L = cfg.lamp;
        const puls = 0.5 + 0.5 * Math.sin((sec / L.period) * Math.PI * 2);
        // 두 번째 사인은 주기가 안 떨어지게 잡았다 — 겹치면 맥박이 규칙적으로 들린다.
        const flick = 0.9 + 0.1 * Math.sin(sec * 7.3);
        const grad = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.r);
        grad.addColorStop(0, `rgba(255,214,140,${(0.1 * puls + 0.05) * flick})`);
        grad.addColorStop(0.55, `rgba(240,180,90,${(0.05 * puls + 0.02) * flick})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(L.cx - L.r, L.cy - L.r, L.r * 2, L.r * 2);
      }

      // 먼지 — 램프빛 안에서만 보인다. 위로 갈수록 옅어진다.
      if (cfg.dust) {
        const D = cfg.dust;
        for (const p of dust) {
          const t = ((sec / D.period) + p.phase) % 1;
          const y = D.y0 + (D.y1 - D.y0) * t;
          const x = p.x + Math.sin(t * Math.PI * 3 + p.phase * 11) * p.sway;
          ctx.globalAlpha = 0.34 * (1 - t) * Math.min(1, t * 5);
          ctx.fillStyle = '#ffe6b0';
          ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      // 눈 깜빡임 — 눈을 털색으로 덮고 가운데에 감은 선을 긋는다.
      // ⚠ 반쯤 감은 중간 상태를 그리면 도트가 뭉개져 눈병처럼 보인다. 임계로 딱 끊는다.
      if (cfg.blink && blinkAmount(sec, cfg.blink) > 0.5) {
        const B = cfg.blink;
        for (const [bx, by, bw, bh] of B.boxes) {
          ctx.fillStyle = B.fur;
          ctx.fillRect(bx, by, bw, bh);
          // 감은 선은 상자 한가운데가 아니라 아래쪽 3분의 2 지점이다 — 눈꺼풀은
          // 위에서 아래로 내려와 덮으므로, 가운데 그으면 눈을 치켜뜬 것처럼 보인다.
          const lh = Math.max(2, Math.round(bh * 0.13));
          ctx.fillStyle = B.lid;
          ctx.fillRect(bx + 2, by + Math.round(bh * 0.62), bw - 4, lh);
        }
      }

      // 기포 — 물속이라는 표시. 위로 갈수록 옅어진다.
      if (cfg.bubbles) {
        const b = cfg.bubbles;
        for (const p of bubbles) {
          const t = ((sec / b.period) + p.phase) % 1;
          const y = b.y0 + (b.y1 - b.y0) * t;
          const x = p.x + Math.sin(t * Math.PI * 4 + p.phase * 9) * p.sway;
          ctx.globalAlpha = 0.4 * (1 - t) * Math.min(1, t * 6);
          ctx.fillStyle = '#a8e8fb';
          ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    };

    // 첫 프레임은 즉시 (rAF 가 늦거나 안 도는 환경에서도 화면이 비지 않게 — pixelbg 와 같다)
    frame(performance.now());
  };

  img.onload = setup;
  img.onerror = () => {
    // 그림이 안 뜨면 움직임도 없다. 아래 절차적 캔버스가 배경을 계속 맡으므로 화면은 안 비지만,
    // 조용히 지나가면 "왜 안 움직이지"로만 드러나므로 시끄럽게 남긴다.
    console.warn(`[scenefx] 그림을 읽지 못해 움직임을 끈다: ${src}`);
  };
  img.src = src;
  if (img.complete && img.naturalWidth) setup();
}

export function stopSceneFx() {
  gen++;   // 아직 로드 중인 그림의 setup 을 무효로 만든다
  stop();
}
