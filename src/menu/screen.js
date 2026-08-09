// 메인 메뉴 + 인트로 컷신 — 배포 루트(index.html)의 진입점.
//
// 한 페이지에 둘 다 있는 이유는 오디오다. AudioContext 는 문서 단위라, 메뉴에서 첫 클릭으로
// initAudio() 를 해 놓고 컷신을 다른 페이지로 옮기면 새 문서라 다시 무음이 되는데 컷신에는
// BGM 을 되살릴 사용자 제스처가 없다. 배경 엔진(pixelbg)을 두 번 부팅하지 않는 이득도 있다.
//
// 이 파일은 순서만 다룬다 — 대사는 story/script.js 한 곳에 있다.

import './menu.css';
import { startPixelBg, SCENES } from '../scene/pixelbg.js';
import { stars, glitter } from '../scene/bgkit.js';
import { initAudio, playBgm, sfx, setBgmVolume, setSfxVolume } from '../audio/audio.js';
import { runDialogue, setDialogueBlip, skipDialogue } from '../story/dialogue.js';
import { SCRIPT, INTRO_BEATS } from '../story/script.js';

const INTRO_SEEN_KEY = 'shipwright:introSeen'; // session — 처음 온 사람은 항상 인트로를 본다
const MUTED_KEY = 'shipwright:muted';          // local — 취향은 남는다
const HANDOFF_KEY = 'shipwright:handoff';      // session — draw → sail 이 쓰는 기존 채널

const BGM_VOL = 0.7;
const SFX_VOL = 0.9;

const els = {
  bg: document.getElementById('bg'),
  title: document.getElementById('screen-title'),
  start: document.getElementById('btn-start'),
  replay: document.getElementById('btn-replay'),
  sound: document.getElementById('btn-sound'),
  skip: document.getElementById('btn-skip'),
};

let muted = localStorage.getItem(MUTED_KEY) === '1';
let audioReady = false;
let skipping = false;

/**
 * 대사에 적힌 배경 키가 실제 씬인지 확인한다. setScene() 은 모르는 키를 warn 후 무시하므로
 * 오타는 "화면이 안 바뀐다"로만 드러난다 — 로드 시점에 시끄럽게 잡는 편이 낫다.
 */
function assertSceneKeys() {
  const bad = [];
  for (const [key, lines] of Object.entries(SCRIPT)) {
    for (const line of lines) {
      if (line.bg && !SCENES[line.bg]) bad.push(`${key}: ${line.bg}`);
    }
  }
  if (bad.length) console.error('[story] 알 수 없는 배경 키:', bad.join(', '));
}

function applyVolumes() {
  setBgmVolume(muted ? 0 : BGM_VOL);
  setSfxVolume(muted ? 0 : SFX_VOL);
}

function renderSoundBtn() {
  els.sound.textContent = muted ? '♪ 소리 꺼짐' : '♪ 소리 켜짐';
}

/** 첫 제스처에서만 오디오를 깨운다 — 로드 시점에 부르면 브라우저 자동재생 정책에 막힌다. */
function wakeAudio() {
  if (audioReady) return;
  audioReady = true;
  initAudio();
  applyVolumes();
  playBgm('title');
}

function click() {
  sfx('click');
}

function showCutscene(on) {
  els.title.classList.toggle('active', !on);
  els.skip.hidden = !on;
}

async function playIntro() {
  skipping = false;
  showCutscene(true);
  for (const beat of INTRO_BEATS) {
    if (skipping) break;
    if (beat.bgm) playBgm(beat.bgm);
    await runDialogue(SCRIPT[beat.key]);
  }
  showCutscene(false);
  toDraw();
}

function toDraw() {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  // 옛 설계가 남아 있으면 sail 화면이 유령 배를 띄운다. 새 항해는 새 배로 시작한다.
  sessionStorage.removeItem(HANDOFF_KEY);
  // base 가 '/sea-of-the-pen/' 이라 절대경로는 배포에서 404 다 — draw → sail 과 같은 상대경로.
  location.href = 'draw.html';
}

function onSkip() {
  if (els.skip.hidden) return;
  skipping = true;
  skipDialogue();
}

/* 타이틀 배경 그림(assets/menu/title-bg.png)에서 **직접 잰** 좌표. 418×235 격자 기준이다.
   bg-snap 의 --grid 를 바꾸면 그림이 다시 그려지므로 여기도 다시 재야 한다.
   재는 법은 assets/menu/README.md 에 적어 뒀다. */
const FX = {
  w: 418,
  h: 235,
  horizon: 137,                      // 행 평균 밝기가 가장 크게 꺾이는 줄
  moonX: 319,                        // 수평선 아래에서 가장 밝은 열 = 달빛 기둥
  lanterns: [[75, 133], [89, 134]],  // 배의 등불 둘 (따뜻한 색 픽셀 군집)
};

/**
 * 타이틀 그림 위에 얹는 유일한 움직임. 배경이 정지 PNG 라 이 캔버스가 없으면 타이틀이
 * 통째로 멈춰 보인다.
 *
 * 그리는 것은 셋뿐이고, 셋 다 **그림에 이미 있는 것 위에만** 얹는다 — 좌표를 PNG 에서
 * 재서 쓰는 이유가 이것이다. 새로 그리면 그림과 두 겹으로 보인다.
 */
function startTitleFx(host) {
  const cv = document.createElement('canvas');
  cv.id = 'title-fx';
  cv.width = FX.w;
  cv.height = FX.h;
  cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  const ctx = cv.getContext('2d');

  function frame(t) {
    // 컷신 중에는 섹션이 닫혀 있다. 그릴 필요가 없으므로 건너뛴다 (rAF 는 유지 — 되돌아온다)
    if (host.classList.contains('active')) {
      const sec = t / 1000;
      ctx.clearRect(0, 0, FX.w, FX.h);
      stars(ctx, FX.w, FX.horizon * 0.72, sec, { count: 46, seed: 31, bright: 0.85 });
      glitter(ctx, FX.moonX, FX.horizon, FX.h, sec, '#f5e6c8', { alpha: 0.42, count: 70, spread: 0.34, seed: 33 });
      ctx.fillStyle = '#ffb937';
      for (let i = 0; i < FX.lanterns.length; i++) {
        const [x, y] = FX.lanterns[i];
        // 등불 둘의 주기를 다르게 둔다 — 같으면 두 불이 한 몸처럼 뛴다
        const f = 0.55 + 0.45 * Math.sin(sec * (5.5 + i * 2.3) + i * 2);
        ctx.globalAlpha = 0.3 * f;
        ctx.fillRect(x - 1, y - 1, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function init() {
  startPixelBg(els.bg);
  startTitleFx(els.title);
  assertSceneKeys();
  setDialogueBlip(() => sfx('talk'));
  renderSoundBtn();

  const seen = sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  if (seen) {
    els.start.textContent = '▶ 계속하기';
    els.replay.hidden = false;
  }

  // 키보드만 쓰는 사람도 있으므로 둘 다 건다. wakeAudio 는 멱등이다.
  window.addEventListener('pointerdown', wakeAudio, { once: true });
  window.addEventListener('keydown', wakeAudio, { once: true });

  els.start.addEventListener('click', () => {
    click();
    if (seen) toDraw();
    else playIntro();
  });

  els.replay.addEventListener('click', () => {
    click();
    playIntro();
  });

  els.sound.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    applyVolumes();
    renderSoundBtn();
    if (!muted) sfx('click');
  });

  els.skip.addEventListener('click', onSkip);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') onSkip();
  });
}

init();
