// 애니메이션 픽셀 밤바다 배경 — 모든 화면 뒤에 깔린다.
// 저해상도(가로 240px) 캔버스에 그리고 CSS로 확대(image-rendering: pixelated).

const LOGICAL_W = 240;

const SKY_TOP = '#070a1e';
const SKY_BOTTOM = '#122048';
const SEA_ROWS = ['#1b3a6b', '#16305c', '#12284e', '#0e2042', '#0b1a37', '#081430'];
const WAVE_LIGHT = '#2e5d9e';
const MOON = '#f5e6c8';
const MOON_SHADE = '#d9c9a3';

// 고정 시드 별 (매 프레임 같은 자리, 반짝임만 변화)
const STARS = Array.from({ length: 70 }, (_, i) => {
  const seed = Math.sin(i * 127.1) * 43758.5453;
  const frac = (n) => n - Math.floor(n);
  return { x: frac(seed), y: frac(seed * 1.7), phase: frac(seed * 2.3) * Math.PI * 2 };
});

export function startPixelBg(canvas) {
  const ctx = canvas.getContext('2d');
  let w = LOGICAL_W;
  let h = 135;

  function resize() {
    const aspect = window.innerHeight / window.innerWidth || 0.56;
    w = LOGICAL_W;
    h = Math.max(100, Math.round(LOGICAL_W * aspect));
    canvas.width = w;
    canvas.height = h;
  }
  resize();
  window.addEventListener('resize', resize);

  function drawShip(x, y) {
    // 작은 픽셀 범선 실루엣
    ctx.fillStyle = '#0a0d20';
    ctx.fillRect(x, y + 8, 16, 3);        // 선체
    ctx.fillRect(x + 1, y + 11, 14, 1);
    ctx.fillRect(x + 7, y - 2, 1, 10);    // 돛대
    ctx.fillStyle = '#1c2440';
    ctx.fillRect(x + 8, y - 1, 6, 6);     // 돛
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(x + 7, y - 3, 3, 1);     // 깃발
  }

  function frame(t) {
    const sec = t / 1000;
    const seaTop = Math.round(h * 0.62);

    // 하늘 (2단 그라데이션 밴드)
    ctx.fillStyle = SKY_TOP;
    ctx.fillRect(0, 0, w, Math.round(seaTop * 0.5));
    ctx.fillStyle = SKY_BOTTOM;
    ctx.fillRect(0, Math.round(seaTop * 0.5), w, seaTop - Math.round(seaTop * 0.5));

    // 별
    for (const s of STARS) {
      const y = s.y * seaTop * 0.9;
      const tw = Math.sin(sec * 2 + s.phase) > 0.2 ? 1 : 0.35;
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#cfe0ff';
      ctx.fillRect(Math.round(s.x * w), Math.round(y), 1, 1);
    }
    ctx.globalAlpha = 1;

    // 달
    const mx = Math.round(w * 0.78);
    const my = Math.round(seaTop * 0.28);
    ctx.fillStyle = MOON;
    ctx.fillRect(mx - 4, my - 6, 8, 12);
    ctx.fillRect(mx - 6, my - 4, 12, 8);
    ctx.fillStyle = MOON_SHADE;
    ctx.fillRect(mx - 1, my - 3, 3, 2);
    ctx.fillRect(mx - 4, my + 2, 2, 2);

    // 바다 (밴드별로 다른 속도의 반짝이는 파도 픽셀)
    const bandH = Math.max(2, Math.round((h - seaTop) / SEA_ROWS.length));
    for (let b = 0; b < SEA_ROWS.length; b++) {
      const y0 = seaTop + b * bandH;
      ctx.fillStyle = SEA_ROWS[b];
      ctx.fillRect(0, y0, w, bandH + 1);
      // 파도 하이라이트
      ctx.fillStyle = WAVE_LIGHT;
      const speed = (b + 1) * 6;
      for (let i = 0; i < 8; i++) {
        const px = Math.round((i * 37 + sec * speed + b * 13) % w);
        const py = y0 + ((i + b) % bandH);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(px, py, 3 + (i % 3), 1);
      }
      ctx.globalAlpha = 1;
    }

    // 달빛 기둥
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = MOON;
    ctx.fillRect(mx - 3, seaTop, 6, h - seaTop);
    ctx.globalAlpha = 1;

    // 수평선의 작은 배 (둥실둥실)
    const bob = Math.round(Math.sin(sec * 1.4) * 1.5);
    drawShip(Math.round(w * 0.16), seaTop - 10 + bob);

    requestAnimationFrame(frame);
  }
  // 첫 프레임은 즉시 그린다 (rAF가 지연되는 환경에서도 배경이 비지 않게)
  frame(performance.now());
}
