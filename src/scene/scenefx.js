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

let raf = 0;
let state = null;
// 그림 로드는 비동기라 씬을 빨리 넘기면 **이미 지나간 씬의 setup 이 나중에 도착**한다.
// 세대 번호로 그것을 버린다 — 없으면 S-02 배경 위에서 S-01 의 숨이 돈다.
let gen = 0;

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (state) state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
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
