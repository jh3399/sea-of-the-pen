// 씬 배경 엔진 — 저해상도 캔버스에 그리고 CSS로 확대(image-rendering: pixelated).
// 씬 그림 자체는 bgscenes.js, 공용 레이어 함수는 bgkit.js에 있다.
//
//   startPixelBg(canvas)        게임 시작 시 1회
//   setScene('harbor')          크로스페이드로 전환
//   setScene('volcano', true)   즉시 전환 (페이드 없음)
//
// 대사 데이터에 { bg: 'harbor' }를 넣으면 dialogue.js가 대신 호출한다.

import { SCENES, DEFAULT_SCENE } from './bgscenes.js';

const MIN_SIDE = 200;   // 짧은 쪽 논리 픽셀 수 (도트 크기 기준)
const FADE_MS = 650;

let engine = null;

function makeBuffer(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function startEngine(canvas) {
  const ctx = canvas.getContext('2d');
  let w = MIN_SIDE;
  let h = MIN_SIDE;
  let bufFrom = null;
  let bufTo = null;

  const st = {
    key: DEFAULT_SCENE,
    prevKey: null,
    fadeStart: 0,
  };

  function resize() {
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    if (vw >= vh) {
      h = MIN_SIDE;
      w = Math.round((MIN_SIDE * vw) / vh);
    } else {
      w = MIN_SIDE;
      h = Math.round((MIN_SIDE * vh) / vw);
    }
    canvas.width = w;
    canvas.height = h;
    bufFrom = makeBuffer(w, h);
    bufTo = makeBuffer(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  function drawScene(target, key, env) {
    const scene = SCENES[key] || SCENES[DEFAULT_SCENE];
    target.save();
    scene(target, env);
    target.restore();
  }

  function frame(t) {
    const env = { w, h, sec: t / 1000 };
    const fading = st.prevKey && t - st.fadeStart < FADE_MS;

    if (!fading) {
      st.prevKey = null;
      drawScene(ctx, st.key, env);
    } else {
      const p = (t - st.fadeStart) / FADE_MS;
      const from = bufFrom.getContext('2d');
      const to = bufTo.getContext('2d');
      drawScene(from, st.prevKey, env);
      drawScene(to, st.key, env);
      ctx.globalAlpha = 1;
      ctx.drawImage(bufFrom, 0, 0);
      ctx.globalAlpha = p * p * (3 - 2 * p);   // smoothstep
      ctx.drawImage(bufTo, 0, 0);
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }

  return {
    st,
    setScene(key, instant = false) {
      if (!SCENES[key]) {
        console.warn(`[pixelbg] 알 수 없는 배경: ${key}`);
        return;
      }
      if (key === st.key) return;
      st.prevKey = instant ? null : st.key;
      st.fadeStart = performance.now();
      st.key = key;
    },
    start() {
      // 첫 프레임은 즉시 (rAF가 늦는 환경에서도 배경이 비지 않게)
      frame(performance.now());
    },
  };
}

export function startPixelBg(canvas) {
  engine = startEngine(canvas);
  engine.start();
  return engine;
}

export function setScene(key, instant = false) {
  if (!engine) return;
  engine.setScene(key, instant);
}

export function currentScene() {
  return engine ? engine.st.key : null;
}

export { SCENES };
