// 게임 플로우 총괄: 타이틀 → (인트로 컷씬 → 배 그리기) → [항해 → 섬 마을 → 보스전] 루프.
// 진행도·설정은 state.js(localStorage), 세계 데이터는 world.js.

import { DrawingCanvas } from './drawing.js';
import { judge, calcDamage } from './judge.js';
import { runDialogue, setDialogueBlip } from './dialogue.js';
import { spriteCanvas } from './sprites.js';
import { startPixelBg, setScene } from './pixelbg.js';
import { state, loadGame, saveGame, resetGame, hasSave, addPiece, addItem, markCleared } from './state.js';
import { SEA, START, PIECES, ISLANDS, islandByKey, pieceById, islandsWithProgress, nextTargetKey } from './world.js';
import { initAudio, playBgm, sfx, setBgmVolume, setSfxVolume } from './audio/audio.js';
import { runSail } from './sail.js';
import { runIsland } from './island.js';

startPixelBg(document.querySelector('#bg-canvas'));
// 배경 확인용 — 콘솔에서 __bg('volcano') 처럼 호출하면 그 씬으로 전환된다.
window.__bg = setScene;

const $ = (sel) => document.querySelector(sel);

const DRAW_TIME = 20; // 전투 드로잉 제한 시간(초)

const shipCanvas = new DrawingCanvas($('#ship-canvas'));
const battleCanvas = new DrawingCanvas($('#draw-canvas'));

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ---------------- 오디오 부팅 (첫 제스처에서) ----------------

loadGame();
setBgmVolume(state.settings.bgm);
setSfxVolume(state.settings.sfx);
setDialogueBlip(() => sfx('talk'));

document.addEventListener('pointerdown', function boot() {
  document.removeEventListener('pointerdown', boot);
  initAudio();
  setBgmVolume(state.settings.bgm);
  setSfxVolume(state.settings.sfx);
}, { once: true });

playBgm('title'); // init 전 호출은 기억됐다가 첫 제스처에 재생된다

// ---------------- HUD ----------------

function hudShow(on) {
  document.body.classList.toggle('playing', on);
}

function hudUpdate(stageText) {
  $('#hud-pieces').textContent = `📜 ${state.pieces.length}/7`;
  if (stageText !== undefined) {
    $('#hud-stage').textContent = stageText;
    $('#hud-stage').hidden = !stageText;   // 보여줄 게 없으면 칩 자체를 감춘다
  }
}

// ---------------- 모달 (설정 / 지도 / 가방) ----------------

const modal = {
  root: $('#modal-root'),
  title: $('#modal-title'),
  body: $('#modal-body'),
};

function openModal(title, render) {
  modal.title.textContent = title;
  modal.body.innerHTML = '';
  render(modal.body);
  modal.root.hidden = false;
  sfx('click');
}

function closeModal() {
  modal.root.hidden = true;
}
$('#modal-close').addEventListener('click', closeModal);
$('#modal-backdrop').addEventListener('click', closeModal);

function sliderRow(label, value, onInput) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.innerHTML = `<label>${label}</label><input type="range" min="0" max="100" /><span class="val"></span>`;
  const input = row.querySelector('input');
  const val = row.querySelector('.val');
  input.value = Math.round(value * 100);
  val.textContent = `${input.value}%`;
  input.addEventListener('input', () => {
    val.textContent = `${input.value}%`;
    onInput(input.value / 100);
  });
  return row;
}

function renderSettings(body) {
  body.appendChild(sliderRow('🎵 음악', state.settings.bgm, (v) => {
    state.settings.bgm = v;
    setBgmVolume(v);
    saveGame();
  }));
  body.appendChild(sliderRow('🔔 효과음', state.settings.sfx, (v) => {
    state.settings.sfx = v;
    setSfxVolume(v);
    saveGame();
    sfx('click');
  }));

  const sep = document.createElement('hr');
  sep.className = 'modal-sep';
  body.appendChild(sep);

  const note = document.createElement('p');
  note.className = 'modal-note';
  note.textContent = '진행 상황은 자동 저장된다. 처음부터 시작하면 저장이 지워진다.';
  body.appendChild(note);

  const reset = document.createElement('button');
  reset.className = 'btn-tool btn-danger';
  reset.textContent = '🗑 처음부터 시작 (저장 삭제)';
  reset.addEventListener('click', () => {
    if (!confirm('저장을 지우고 처음부터 시작할까?')) return;
    const settings = { ...state.settings };
    resetGame();
    state.settings = settings;
    saveGame();
    location.reload();
  });
  body.appendChild(reset);
}

function renderMap(body) {
  const list = islandsWithProgress(state.cleared, state.pieces.length);
  const target = nextTargetKey(state.cleared, state.pieces.length);
  for (const isl of list) {
    const row = document.createElement('div');
    row.className = 'map-row';
    let status = '🔒';
    if (isl.cleared) status = '✅';
    else if (isl.key === target && !isl.locked) { status = '🧭'; row.classList.add('next'); }
    if (isl.locked && !isl.cleared) row.classList.add('locked');
    const pieceInfo = isl.piece ? pieceById(isl.piece) : null;
    row.innerHTML = `
      <span class="map-status">${status}</span>
      <span class="map-name">${isl.locked && !isl.cleared && isl.key !== target ? '???' : isl.name}</span>
      <span>${pieceInfo ? (isl.cleared ? pieceInfo.icon : '📜') : '⚔'}</span>`;
    body.appendChild(row);
  }
  const note = document.createElement('p');
  note.className = 'modal-note';
  note.textContent = '🧭 다음 목적지 · ✅ 클리어 · 🔒 검은 안개에 막혀 있다';
  body.appendChild(note);
}

function renderInventory(body) {
  const grid = document.createElement('div');
  grid.className = 'inv-grid';
  for (const p of PIECES) {
    const got = state.pieces.includes(p.id);
    const slot = document.createElement('div');
    slot.className = `inv-slot ${got ? 'got' : 'empty'}`;
    slot.innerHTML = got
      ? `<span class="ico">${p.icon}</span><span>${p.name}</span>`
      : `<span class="ico">❓</span><span>도안 조각</span>`;
    if (got) slot.title = p.effect;
    grid.appendChild(slot);
  }
  body.appendChild(grid);

  const sep = document.createElement('hr');
  sep.className = 'modal-sep';
  body.appendChild(sep);

  if (state.items.length === 0) {
    const note = document.createElement('p');
    note.className = 'modal-note';
    note.textContent = '아직 얻은 물건이 없다.';
    body.appendChild(note);
  }
  for (const item of state.items) {
    const row = document.createElement('div');
    row.className = 'inv-item';
    row.innerHTML = `<span class="ico">${item.icon}</span><span>${item.name}</span><span class="desc">${item.desc}</span>`;
    body.appendChild(row);
  }
}

$('#btn-map').addEventListener('click', () => openModal('🗺️ 항해도', renderMap));
$('#btn-inv').addEventListener('click', () => openModal('🎒 가방', renderInventory));
$('#btn-settings').addEventListener('click', () => openModal('⚙ 설정', renderSettings));

// ---------------- 배 그리기 씬 ----------------

let shipResolve = null;

function drawShip({ prompt, hint, button, judged, bg, guide }) {
  return new Promise((resolve) => {
    if (bg) setScene(bg);
    $('#ship-prompt').textContent = prompt;
    $('#ship-log').textContent = hint;
    $('#btn-ship-submit').textContent = button;
    $('#btn-ship-submit').disabled = false;
    shipCanvas.clear();
    shipCanvas.setGuide(guide ? 'ship' : null);
    $('#btn-guide').textContent = guide ? '📐 도안 끄기' : '📐 도안 켜기';
    shipCanvas.enabled = true;
    showScreen('#screen-ship');
    shipCanvas._resize();
    shipResolve = { resolve, judged };
  });
}

$('#btn-guide').addEventListener('click', () => {
  const on = !shipCanvas.guideKey;
  shipCanvas.setGuide(on ? 'ship' : null);
  $('#btn-guide').textContent = on ? '📐 도안 끄기' : '📐 도안 켜기';
  sfx('click');
});

async function onShipSubmit() {
  if (!shipResolve) return;
  if (shipCanvas.isEmpty()) {
    $('#ship-log').textContent = '세렌: "빈 바다에 몸만 띄울 셈이야? 뭐라도 그려!"';
    sfx('cancel');
    return;
  }
  const { resolve, judged } = shipResolve;
  const png = shipCanvas.toPngDataUrl();
  const pixel = shipCanvas.toPixelDataUrl(); // 도트 스프라이트 버전 (게임 내 표시용)
  sfx('submit');

  if (!judged) {
    shipResolve = null;
    resolve({ png, pixel, result: null });
    return;
  }

  $('#btn-ship-submit').disabled = true;
  shipCanvas.enabled = false;
  $('#ship-log').textContent = '세렌: "어디 보자... (감정 중)"';
  const result = await judge(
    shipCanvas.stats(), png,
    '배 그리기 — 배로서의 완성도(선체·돛·키가 갖춰졌는지)를 평가하라. 배가 아니면 낮은 점수.',
  );
  shipResolve = null;
  resolve({ png, pixel, result });
}

function keepShip(drawn, maxHp) {
  state.ship = { png: drawn.png, pixel: drawn.pixel, maxHp };
  saveGame();
}

// ---------------- 전투 씬 ----------------

const battle = {
  boss: null,
  bossHp: 0,
  shipHp: 0,
  timer: DRAW_TIME,
  timerId: null,
  judging: false,
  resolve: null,
};

function updateBars() {
  $('#boss-hp').style.width = `${Math.max(0, battle.bossHp / battle.boss.maxHp) * 100}%`;
  $('#ship-hp').style.width = `${Math.max(0, battle.shipHp / state.ship.maxHp) * 100}%`;
}

function log(msg) {
  $('#battle-log').textContent = msg;
}

function renderTimer() {
  const el = $('#draw-timer');
  el.textContent = battle.timer;
  el.classList.toggle('low', battle.timer <= 5);
}

function startTimer() {
  battle.timer = DRAW_TIME;
  renderTimer();
  clearInterval(battle.timerId);
  battle.timerId = setInterval(() => {
    battle.timer -= 1;
    renderTimer();
    if (battle.timer <= 0) submitAttack(true);
  }, 1000);
}

function popAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // 애니메이션 재시작 트릭
  el.classList.add(cls);
}

function runBattle(boss) {
  return new Promise((resolve) => {
    battle.boss = boss;
    battle.bossHp = boss.maxHp;
    battle.shipHp = state.ship.maxHp;
    battle.judging = false;
    battle.resolve = resolve;

    if (boss.bg) setScene(boss.bg);
    $('#boss-name').textContent = boss.name;
    const bossEl = $('#boss-sprite');
    bossEl.innerHTML = '';
    bossEl.appendChild(spriteCanvas(boss.sprite, 6));
    $('#draw-prompt').textContent = boss.drawPrompt;
    $('#battle-ship').src = state.ship.pixel;
    updateBars();
    log(boss.introLog);

    battleCanvas.clear();
    battleCanvas.enabled = true;
    $('#btn-submit').disabled = false;
    showScreen('#screen-battle');
    battleCanvas._resize();
    startTimer();
  });
}

function endBattle(won) {
  clearInterval(battle.timerId);
  const resolve = battle.resolve;
  battle.resolve = null;
  if (resolve) setTimeout(() => resolve(won), 900);
}

async function submitAttack(auto = false) {
  if (battle.judging || !battle.resolve) return;

  // 시간 초과인데 빈 캔버스면: 공격 실패, 보스만 반격
  if (battleCanvas.isEmpty()) {
    if (!auto) {
      log('세렌: "아무것도 안 그렸잖아! 뭐라도 그려봐!"');
      sfx('cancel');
      return;
    }
    battle.judging = true;
    clearInterval(battle.timerId);
    log('세렌: "시간 초과야! 정신 차려!"');
    setTimeout(() => bossCounterattack(), 700);
    return;
  }

  battle.judging = true;
  clearInterval(battle.timerId);
  battleCanvas.enabled = false;
  $('#btn-submit').disabled = true;
  sfx('submit');
  log('세렌: "어디 보자... (감정 중)"');

  const result = await judge(battleCanvas.stats(), battleCanvas.toPngDataUrl(), battle.boss.situation);
  const damage = calcDamage(result, battle.boss);

  popAnim($('#boss-sprite'), 'hit');
  const dmgEl = $('#damage-float');
  dmgEl.textContent = damage > 0 ? `-${damage}` : 'MISS';
  popAnim(dmgEl, 'show');
  sfx(damage > 0 ? 'hit' : 'cancel');

  battle.bossHp -= damage;
  updateBars();
  log(`세렌: "${result.comment}" (${result.label} · ${result.score}점 · ${damage} 데미지!)`);

  if (battle.bossHp <= 0) {
    sfx('win');
    endBattle(true);
    return;
  }
  setTimeout(() => bossCounterattack(), 1400);
}

function bossCounterattack() {
  if (!battle.resolve) return;
  const boss = battle.boss;
  const dmg = boss.attackMin + Math.floor(Math.random() * (boss.attackMax - boss.attackMin + 1));
  battle.shipHp -= dmg;
  popAnim($('#battle-ship'), 'ship-hit');
  updateBars();
  sfx('damage');
  log(`${boss.name}의 ${boss.attackName}! 배가 ${dmg} 피해를 입었다!`);

  if (battle.shipHp <= 0) {
    sfx('lose');
    endBattle(false);
    return;
  }
  // 다음 턴
  setTimeout(() => {
    if (!battle.resolve) return;
    battle.judging = false;
    battleCanvas.clear();
    battleCanvas.enabled = true;
    $('#btn-submit').disabled = false;
    log(battle.boss.introLog);
    startTimer();
  }, 1200);
}

$('#btn-ship-clear').addEventListener('click', () => shipCanvas.clear());
$('#btn-ship-submit').addEventListener('click', onShipSubmit);
$('#btn-clear').addEventListener('click', () => battleCanvas.clear());
$('#btn-submit').addEventListener('click', () => submitAttack(false));

// ---------------- 인트로 대사 ----------------

const INTRO = [
  { speaker: '', bg: 'harbor', text: '이 세계에서, 진심을 담아 그린 그림은 실체가 된다.' },
  { speaker: '시험관', sprite: 'examiner', text: '지금부터 항해사 시험의 최종 과제를 시작한다.' },
  { speaker: '시험관', sprite: 'examiner', text: '과제는 단 하나. 너의 배를 그려 바다에 띄우고 — 전설의 황금섬, 그 단서를 가져와라.' },
  { speaker: '루', sprite: 'ru', text: '(그림엔 자신 없지만... 해보자. 나의 배다!)' },
];

const nailAttack = (shipPixel) => [
  { speaker: '', bg: 'sea_day', image: shipPixel, text: '출항! 순조로운 항해... 였는데.' },
  { speaker: '', bg: 'fog_black', text: '갑자기 검은 안개가 바다를 뒤덮는다.' },
  { speaker: '???', sprite: 'nail', text: '크크크... 그 낡은 배로 어딜 가시겠다?' },
  { speaker: '검은 함장 네일', sprite: 'nail', text: '황금섬으로 가는 바다는 전부 내 것이다. 그 배, 부숴주지!' },
  { speaker: '', image: shipPixel, imageCls: 'broken', text: '콰지직—!! 네일의 포격에 배가 산산조각 났다...' },
  { speaker: '루', sprite: 'ru', text: '(가라앉는다... 여기까지인가...)' },
];

const SEREN_MEET = [
  { speaker: '???', bg: 'dawn_wreck', text: '이봐! 정신 차려! 일어나라고!' },
  { speaker: '세렌', sprite: 'seren', text: '나는 세렌. 전설의 배 "바람호"의 뱃머리... 였던 몸이지. 지금은 보다시피 통나무 신세지만.' },
  { speaker: '세렌', sprite: 'seren', text: '네가 그린 배, 봤어. 솜씨는 솔직히 엉망인데... 이상하게 진심이 담겨 있더라.' },
  { speaker: '세렌', sprite: 'seren', text: '"손이 아니라 마음으로 그리는 자가 나타나면, 바람호는 다시 떠오른다" — 모루 영감의 예언이야. 어쩌면 너일지도.' },
  { speaker: '세렌', sprite: 'seren', text: '배를 다시 그려봐. 이번엔 진심을 담아서 — 선체, 돛, 키까지 제대로! 밑그림이 필요하면 📐 도안을 켜.' },
];

const sailLines = (result, shipPixel) => [
  { speaker: '세렌', sprite: 'seren', text: `오오...! ${result ? `"${result.comment}"` : '좋아, 이 정도면 바다에 띄울 만해!'}` },
  { speaker: '', bg: 'sea_day', image: shipPixel, text: '좋아, 출항이다! 이제 이 배는 네 손에 달렸어 — 방향키로 직접 몰아 봐!' },
  { speaker: '세렌', sprite: 'seren', text: '나침반이 다음 목적지를 가리킬 거야. 첫 목적지는 황금 수풀섬 — 도안 조각의 기운이 느껴져!' },
];

const DEFEAT = [
  { speaker: '세렌', sprite: 'seren', bg: 'dawn_wreck', text: '배가 버티질 못해! 일단 후퇴다!' },
  { speaker: '세렌', sprite: 'seren', text: '괜찮아. 우리에겐 펜이 있잖아? 다시 그리면 돼 — 이번엔 더 튼튼하게!' },
];

// ---------------- 승리(조각 획득) ----------------

function showVictory(island) {
  const piece = pieceById(island.piece);
  const n = state.pieces.length;
  $('#victory-title').textContent = '📜 도안 조각 획득!';
  $('#victory-desc').innerHTML = `${island.name}의 수호자가 제정신을 찾았다!<br/>제단의 도안 조각이 빛나며 손에 들어온다.`;
  $('#victory-piece').textContent = `${piece.icon} 도안 조각 ${n}/7 — ${piece.name} (${piece.effect})`;
  $('#victory-sub').textContent = n >= 7 ? '도안이 완성됐다! 세계의 끝으로!' : '다음 바다가 열렸다. 항해를 계속하자.';
  showScreen('#screen-victory');
  return new Promise((resolve) => {
    $('#btn-victory-next').addEventListener('click', () => { sfx('click'); resolve(); }, { once: true });
  });
}

// ---------------- 메인 루프 ----------------

async function intro() {
  hudUpdate('');
  playBgm('harbor');
  showScreen('#screen-scene');
  await runDialogue(INTRO);

  // 1) 첫 배 그리기 (판정 없음 — 어차피 부서질 운명)
  const first = await drawShip({
    prompt: '🚢 너의 배를 자유롭게 그려라!',
    hint: '어떤 배든 좋다. 너만의 배를 그려서 출항하자! (📐 도안을 켜면 밑그림을 따라 그릴 수 있다)',
    button: '출항!',
    judged: false,
    bg: 'harbor',
    guide: false,
  });
  keepShip(first, 150);

  // 2) 네일의 습격 → 세렌 등장
  playBgm('tension');
  showScreen('#screen-scene');
  await runDialogue(nailAttack(first.pixel));
  playBgm('title');
  await runDialogue(SEREN_MEET);

  // 3) 배 다시 그리기 (판정 O — 점수가 배의 내구도가 된다)
  const second = await drawShip({
    prompt: '⛵ 이번엔 진심을 담아 — 선체·돛·키를 갖춰 그려라!',
    hint: '잘 그린 배일수록 튼튼하다. (판정 점수 = 배의 내구도)',
    button: '다시 출항!',
    judged: true,
    bg: 'dawn_wreck',
    guide: true,
  });
  keepShip(second, 100 + (second.result?.score ?? 50));

  showScreen('#screen-scene');
  await runDialogue(sailLines(second.result, second.pixel));

  state.flags.introDone = true;
  state.sea = { ...START };
  saveGame();
}

async function redrawShip() {
  showScreen('#screen-scene');
  await runDialogue(DEFEAT);
  const retry = await drawShip({
    prompt: '⛵ 더 튼튼하게! 배를 다시 그려라!',
    hint: '잘 그린 배일수록 튼튼하다. (판정 점수 = 배의 내구도)',
    button: '재출항!',
    judged: true,
    bg: 'dawn_wreck',
    guide: true,
  });
  keepShip(retry, 100 + (retry.result?.score ?? 50));
}

async function sailLoop() {
  for (;;) {
    const islands = islandsWithProgress(state.cleared, state.pieces.length);
    const targetKey = nextTargetKey(state.cleared, state.pieces.length);
    const target = islandByKey(targetKey);
    hudUpdate('⛵ 항해 중');
    playBgm('sail');
    showScreen('#screen-sail');

    const res = await runSail({
      canvas: $('#sail-canvas'),
      promptEl: $('#sail-prompt'),
      objectiveEl: $('#sail-objective'),
      shipImage: state.ship.pixel,
      sea: SEA,
      islands,
      start: state.sea || { ...START },
      targetKey,
      onMove: (x, y) => { state.sea = { x, y }; saveGame(); },
      sfx,
    });
    state.sea = { x: res.x, y: res.y };
    saveGame();

    const island = islandByKey(res.islandKey);

    // 마을이 없는 섬 (본선 스테이지) — 세렌이 안내만
    if (!island.village) {
      showScreen('#screen-scene');
      await runDialogue([
        { speaker: '세렌', sprite: 'seren', bg: island.bg, text: `${island.name}… 기운이 심상치 않아. 이 바다는 다음 항해(본선)에서 건너자.` },
      ]);
      continue;
    }

    // 섬 탐험 (마을)
    hudUpdate(`🏝 ${island.name}`);
    playBgm(island.music || 'village');
    $('#island-name').textContent = island.village.name;
    showScreen('#screen-island');
    const iv = await runIsland(island.village, {
      canvas: $('#island-canvas'),
      promptEl: $('#island-prompt'),
      runDialogue,
      sfx,
    });
    if (iv.result === 'leave') continue;

    // 보스전
    hudUpdate(`⚔ ${island.boss.name}`);
    playBgm('battle');
    const won = await runBattle(island.boss);

    if (won) {
      addPiece(island.piece);
      if (island.boss.reward) addItem(island.boss.reward);
      markCleared(island.key);
      hudUpdate();
      playBgm('victory');
      if (island.boss.winLines) {
        showScreen('#screen-scene');
        await runDialogue(island.boss.winLines);
      }
      await showVictory(island);
      sfx('pickup');
    } else {
      await redrawShip();
    }
  }
}

async function gameFlow(fresh) {
  if (fresh) {
    const settings = { ...state.settings };
    resetGame();
    state.settings = settings;
    saveGame();
  }
  hudShow(true);
  hudUpdate('');
  if (!state.flags.introDone || !state.ship) await intro();
  await sailLoop();
}

// ---------------- 타이틀 ----------------

if (hasSave() && state.flags.introDone) $('#btn-continue').hidden = false;

$('#btn-start').addEventListener('click', () => {
  if (hasSave() && state.flags.introDone && !confirm('저장된 모험이 있다. 지우고 새로 시작할까?')) return;
  sfx('click');
  gameFlow(true);
});
$('#btn-continue').addEventListener('click', () => {
  sfx('click');
  gameFlow(false);
});
