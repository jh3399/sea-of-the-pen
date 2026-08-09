// 메인 메뉴 + 인트로 컷신 — 배포 루트(index.html)의 진입점.
//
// 한 페이지에 둘 다 있는 이유는 오디오다. AudioContext 는 문서 단위라, 메뉴에서 첫 클릭으로
// initAudio() 를 해 놓고 컷신을 다른 페이지로 옮기면 새 문서라 다시 무음이 되는데 컷신에는
// BGM 을 되살릴 사용자 제스처가 없다. 배경 엔진(pixelbg)을 두 번 부팅하지 않는 이득도 있다.
//
// 이 파일은 순서만 다룬다 — 대사는 story/script.js 한 곳에 있다.

import './menu.css';
import { startPixelBg, setScene, SCENES } from '../scene/pixelbg.js';
import { stars, glitter } from '../scene/bgkit.js';
import { initAudio, playBgm, sfx, setBgmVolume, setSfxVolume } from '../audio/audio.js';
import { runDialogue, setDialogueBlip, skipDialogue } from '../story/dialogue.js';
import { SCRIPT, INTRO_BEATS, INTERLUDES, ENDING } from '../story/script.js';
import { advanceStage, resetStage, stageIndex } from '../game/progress.js';

const INTRO_SEEN_KEY = 'shipwright:introSeen'; // session — 처음 온 사람은 항상 인트로를 본다
const MUTED_KEY = 'shipwright:muted';          // local — 취향은 남는다
const HANDOFF_KEY = 'shipwright:handoff';      // session — draw → sail 이 쓰는 기존 채널

const BGM_VOL = 0.7;
const SFX_VOL = 0.9;

/**
 * 마지막 대사가 끝나고 **그림만 남아 있는** 시간 (ms).
 *
 * 씬 크로스페이드(`pixelbg.js` 의 FADE_MS 650ms)가 끝나고도 한 박자 더 남아야 "정지"가
 * 읽힌다. 3초면 그림을 한 번 훑고 숨을 고를 만하다 — 더 길면 멈춘 줄 알고, 더 짧으면
 * 넘어가는 화면 중 하나로 지나간다.
 */
const ENDING_HOLD_MS = 3000;
/** THE END 페이드 길이 (ms). `menu.css` 의 `the-end-in` 과 **같아야 한다.** */
const THE_END_FADE_MS = 1600;

const els = {
  bg: document.getElementById('bg'),
  title: document.getElementById('screen-title'),
  start: document.getElementById('btn-start'),
  replay: document.getElementById('btn-replay'),
  sound: document.getElementById('btn-sound'),
  skip: document.getElementById('btn-skip'),
  confirm: document.getElementById('confirm-layer'),
  confirmYes: document.getElementById('btn-confirm-yes'),
  confirmNo: document.getElementById('btn-confirm-no'),
  theEnd: document.getElementById('the-end'),
};

let muted = localStorage.getItem(MUTED_KEY) === '1';
let audioReady = false;
let pendingBgm = null;
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

/**
 * 첫 제스처에서만 오디오를 깨운다 — 로드 시점에 부르면 브라우저 자동재생 정책에 막힌다.
 *
 * ⚠ 막간(`?beat=`)으로 들어오면 **제스처 없이 화면이 시작된다.** 새 문서라 AudioContext 가
 *   다시 잠겨 있어서 그때 부른 playBgm 은 그냥 버려진다. 무엇을 틀려 했는지 기억해 뒀다가
 *   첫 입력에서 그것을 튼다 — 안 그러면 섬 대사 내내 무음이거나, 더 나쁘게는 타이틀 곡이
 *   깔린다.
 */
function wakeAudio() {
  if (audioReady) return;
  audioReady = true;
  initAudio();
  applyVolumes();
  playBgm(pendingBgm ?? 'title');
  pendingBgm = null;
}

/** 오디오가 잠겨 있는 동안 요청된 곡. 깨어나면 이것부터 튼다. */
function requestBgm(name) {
  if (!name) return;
  if (audioReady) playBgm(name);
  else pendingBgm = name;
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

/**
 * **새 항해** — 진행과 설계를 버리고 첫 바다부터. 「이야기 다시 보기」와 인트로가 여기로 온다.
 *
 * ⚠ 이 함수는 **되돌릴 수 없다.** 부르기 전에 반드시 `confirmRestart()` 로 묻는다
 *   (인트로 직후는 예외 — 그때는 버릴 진행이 애초에 없다).
 */
function toDraw() {
  sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  // 옛 설계가 남아 있으면 sail 화면이 유령 배를 띄운다. 새 항해는 새 배로 시작한다.
  sessionStorage.removeItem(HANDOFF_KEY);
  // 배를 새로 그리는 것은 곧 새 항해다 — 진행도 처음으로 되돌린다. 안 그러면 메인 메뉴로
  // 나갔다 들어온 사람이 1장 진행도인 채로 새 배를 그려, 연습 해역을 건너뛴다.
  resetStage();
  // base 가 '/sea-of-the-pen/' 이라 절대경로는 배포에서 404 다 — draw → sail 과 같은 상대경로.
  location.href = 'draw.html';
}

/**
 * 이어갈 항해가 있는가 — 그린 배가 남아 있거나, 첫 바다를 이미 지났거나.
 *
 * 세션 저장이라 **탭을 새로 열면 false 다.** 의도된 수명이다 (`progress.js` 머리말:
 * 진행과 설계의 수명은 반드시 같아야 한다). 그래서 새 탭은 언제나 「시작하기」로 뜬다.
 */
function canContinue() {
  return Boolean(sessionStorage.getItem(HANDOFF_KEY)) || stageIndex() > 0;
}

/**
 * 이어하기 — **아무것도 지우지 않는다.** `toDraw()` 와 갈리는 지점이 정확히 이것뿐이다.
 *
 * 배가 남아 있으면 그 배로 바다에, 진행만 있으면(막간을 보고 나온 경우) 배부터 그린다.
 * ⚠ 배가 없는데 `sail.html` 로 보내면 안 된다 — 폴백 슬루프가 뜬다. 플레이어가 그린 적
 *   없는 배로 자기 항해가 이어지는 것이 제일 나쁜 결과다.
 */
function continueVoyage() {
  location.href = sessionStorage.getItem(HANDOFF_KEY) ? 'sail.html' : 'draw.html';
}

/**
 * 되돌릴 수 없는 것 앞에서 한 번 묻는다. @returns {Promise<boolean>} 예를 눌렀는가
 *
 * 기본 초점을 「아니요」에 두는 이유: Enter 를 습관적으로 치는 손이 진행을 지우면 안 된다.
 */
function confirmRestart() {
  return new Promise((resolve) => {
    const done = (answer) => {
      els.confirm.hidden = true;
      els.confirmYes.removeEventListener('click', onYes);
      els.confirmNo.removeEventListener('click', onNo);
      window.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onYes = () => { click(); done(true); };
    const onNo = () => { click(); done(false); };
    // Esc 는 취소다. 아래 전역 Esc(건너뛰기)는 컷신이 떠 있을 때만 도므로 겹치지 않는다.
    const onKey = (e) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      onNo();
    };
    els.confirmYes.addEventListener('click', onYes);
    els.confirmNo.addEventListener('click', onNo);
    window.addEventListener('keydown', onKey);
    els.confirm.hidden = false;
    els.confirmNo.focus();
  });
}

/**
 * 막간 — 바다 하나를 끝낸 배가 이 페이지를 잠깐 빌려 쓴다 (`sail.html` → `index.html?beat=`).
 *
 * ★ 컷신 재생기를 여기 두는 이유는 인트로와 같다: 대사·배경·BGM 스택이 전부 이 문서에
 *   부팅돼 있다. `sail.html` 에 대화창을 다시 심으면 같은 것이 두 벌이 된다.
 *
 * ⚠ **`toDraw()` 를 타면 안 된다.** 그쪽은 새 항해라 설계와 진행을 지운다 — 막간은
 *   타고 온 배 그대로 다음 바다로 가는 것이다.
 * ⚠ 아이템을 달고 진행을 올리는 것은 **대사가 끝난 뒤**다. 도중에 새로고침한 사람이
 *   이야기를 못 본 채 다음 바다에 서 있으면 안 된다.
 */
async function playInterlude(beat) {
  skipping = false;
  showCutscene(true);
  requestBgm(beat.bgm);
  await runDialogue(SCRIPT[beat.key]);
  showCutscene(false);

  advanceStage();
  // ★ 다음 바다로 곧장 가지 않고 **그리기 화면으로** 간다. 세렌이 "그 배로 바로 출발
  //   하려고? 배를 다시 그려 봐" 라고 하는 것이 곧 이 이동이다 — 새로 열린 아이템(키·돛)을
  //   플레이어가 직접 달아 보는 자리이고, 배를 두 번 그리는 것이 이 게임의 본론이기도 하다.
  // ⚠ `toDraw()` 를 쓰면 안 된다. 그쪽은 새 항해라 **진행도까지 지운다** — 방금 올린
  //   것이 지워져 연습 해역으로 되돌아간다. 설계만 비우고 진행은 그대로 둔다.
  sessionStorage.removeItem(HANDOFF_KEY);
  location.href = 'draw.html';
}

/**
 * 엔딩 — **막간이 아니다.** 갈리는 지점이 둘이고, 그래서 함수를 따로 둔다:
 *
 *  ① 비트가 **줄줄이 이어 붙는다** (인트로와 같은 모양). 막간은 하나만 재생한다.
 *  ② 끝이 `draw.html` 이 아니라 **타이틀**이다. 막간의 끝은 다음 배를 그리는 것이지만
 *     엔딩의 끝은 더 그릴 배가 없다는 것이다.
 *
 * ⚠ `advanceStage()` 를 부르지 않는다. 다음 바다가 없다 — 부르면 존재하지 않는
 *   스테이지 인덱스가 남아 다음 실행이 빈 맵을 띄운다.
 * ⚠ 진행(`shipwright:stage`)과 설계는 여기서 지운다. 엔딩을 본 사람이 타이틀로 돌아갔을 때
 *   「계속하기」가 이미 끝난 항해를 가리키고 있으면 안 된다.
 */
async function playEnding() {
  skipping = false;
  showCutscene(true);
  for (const beat of ENDING) {
    if (skipping) break;
    if (beat.bgm) playBgm(beat.bgm);
    await runDialogue(SCRIPT[beat.key]);
  }

  sessionStorage.removeItem(HANDOFF_KEY);
  sessionStorage.removeItem('shipwright:stage');

  /**
   * ★ **마지막에 남는 것은 그림이다.** 대사가 끝나면 대화창만 사라지고(runDialogue 가 알아서
   *   감춘다) 스케치북이 화면을 통째로 가진 채 잠깐 버틴다.
   *   `ending_drawing` 은 **게임 내내 그리던 바로 그 스케치북**이다 — 종이·모눈·나무
   *   프레임·스프링 제본까지 설계 화면과 같은 것. 마지막에 남는 것이 그 종이라야
   *   "그린 것이 실체가 된다"가 대사 없이 한 번 더 성립하고, 미오의 "이제 우리의 배를
   *   그리자"가 곧바로 이 화면으로 이어진다.
   *   [S-01] 에서 받은 그림([S-04] 에서 펴고 [S-05] 에서 그린)이 여기서 닫힌다.
   * ⚠ `showCutscene(false)` 를 **여기서 부르면 안 된다.** 그러면 타이틀 화면이 곧바로
   *   돌아와 그림 대신 로고가 뜬다. 검은 화면이 덮은 **뒤에** 끈다.
   * ⚠ 건너뛰기(Esc)로 온 경우에도 이 정적은 유지한다 — 대사를 건너뛴 것이지 엔딩을
   *   건너뛴 것이 아니다.
   */
  els.skip.hidden = true;
  setScene('ending_drawing');
  await new Promise((done) => { setTimeout(done, ENDING_HOLD_MS); });

  // 검은 화면이 그림을 덮으며 THE END 가 떠오른다 (CSS 가 페이드를 맡는다).
  els.theEnd.hidden = false;
  showCutscene(false);

  // 아무 키·클릭으로 타이틀. `once` 라 두 입력이 겹쳐도 한 번만 돈다.
  // ⚠ 페이드가 도는 동안은 안 받는다. 마지막 줄을 넘기려고 누르던 손이 그대로 이어져
  //   THE END 를 못 보고 타이틀로 튄다 — 실제로 그러기 쉬운 자리다.
  const leave = () => { location.href = 'index.html'; };
  setTimeout(() => {
    window.addEventListener('keydown', leave, { once: true });
    window.addEventListener('pointerdown', leave, { once: true });
  }, THE_END_FADE_MS);
}

/** 주소에 `?beat=KEY` 가 있으면 그 막간을 재생한다. 없거나 모르는 키면 null. */
function requestedInterlude() {
  const key = new URLSearchParams(location.search).get('beat');
  if (!key) return null;
  const beat = INTERLUDES[key];
  if (!beat || !SCRIPT[beat.key]) {
    console.warn(`[story] 알 수 없는 막간: ${key}`);
    return null;
  }
  return beat;
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
  const resumable = seen && canContinue();
  if (seen) {
    els.replay.hidden = false;
    // ⚠ 이어갈 것이 있을 때만 이름을 바꾼다. 예전엔 인트로를 봤다는 이유만으로 「계속하기」가
    //   됐는데 누르면 진행을 지우고 처음으로 갔다 — 이름이 하는 말과 동작이 정반대였다.
    if (resumable) els.start.textContent = '▶ 계속하기';
  }

  // 키보드만 쓰는 사람도 있으므로 둘 다 건다. wakeAudio 는 멱등이다.
  window.addEventListener('pointerdown', wakeAudio, { once: true });
  window.addEventListener('keydown', wakeAudio, { once: true });

  els.start.addEventListener('click', () => {
    click();
    // 셋이 갈린다: 처음 온 사람은 인트로 / 이어갈 것이 있으면 이어하기 / 없으면 새 항해.
    // 마지막 갈래에 확인창이 없는 것은 버릴 진행이 없어서다 (canContinue 가 false 다).
    if (!seen) playIntro();
    else if (resumable) continueVoyage();
    else toDraw();
  });

  els.replay.addEventListener('click', async () => {
    click();
    // 이 버튼은 이야기만 다시 트는 것이 아니라 **진행을 버린다** (playIntro → toDraw).
    // 이어갈 것이 없으면 버릴 것도 없으니 묻지 않는다 — 아무 대가 없는 선택에 확인창을
    // 띄우면 다음에 진짜 위험할 때의 확인창도 그냥 넘기게 된다.
    if (resumable && !(await confirmRestart())) return;
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

  // 항해 중간에 들른 것이라면 메뉴를 보여 주지 않고 곧바로 막간·엔딩을 재생한다.
  // ⚠ 리스너를 다 건 **뒤에** 부른다 — 건너뛰기(Esc)가 이 대사에도 걸려야 한다.
  // ⚠ 엔딩을 막간보다 **먼저** 본다. 둘 다 붙은 주소는 있을 수 없지만, 순서를 정해 두면
  //   나중에 누가 실수로 둘을 같이 붙여도 거동이 정해져 있다.
  if (new URLSearchParams(location.search).get('ending') === '1') {
    playEnding();
    return;
  }
  const beat = requestedInterlude();
  if (beat) playInterlude(beat);
}

init();
