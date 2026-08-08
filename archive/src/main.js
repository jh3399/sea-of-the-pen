// 게임 플로우 총괄 (STORY.md v5).
//
// 프롤로그: 나루 마을 → 유리 숲(세렌) → 첫 배 → 검은 돛의 배(난파) → 덩굴섬 표류
// 본편:     [항해 → 섬 마을 → 수호자] × 3 → 바람호 건조 → 돌풍 → 황금섬(최종전) → 엔딩
//
// 대사는 전부 src/script.js에 있다. 여기는 순서와 조건만 다룬다.

import { DrawingCanvas } from './drawing.js';
import { judge, calcDamage } from './judge.js';
import { shipQuality, emblemQuality } from './localjudge.js';
import { runDialogue, setDialogueBlip } from './dialogue.js';
import { spriteCanvas } from '../../src/scene/sprites.js';
import { startPixelBg, setScene } from '../../src/scene/pixelbg.js';
import { state, loadGame, saveGame, resetGame, hasSave, addPiece, addItem, markCleared } from './state.js';
import { SEA, START, PIECES, ISLANDS, ACT_ISLANDS, PENS, penInk, islandByKey, pieceById, islandsWithProgress, nextTargetKey } from './world.js';
import { initAudio, playBgm, sfx, setBgmVolume, setSfxVolume } from '../../src/audio/audio.js';
import { runSail } from './sail.js';
import { runIsland } from './island.js';
import { SCRIPT, SHIP_VERDICT_LINES, EMPTY_CANVAS_LINES } from './script.js';

startPixelBg(document.querySelector('#bg-canvas'));
window.__bg = setScene;   // 배경 확인용 — 콘솔에서 __bg('crystal_forest')

const $ = (sel) => document.querySelector(sel);
const DRAW_TIME = 20;

const shipCanvas = new DrawingCanvas($('#ship-canvas'));
const battleCanvas = new DrawingCanvas($('#draw-canvas'));

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

/** 컷씬 — 배경만 있는 화면 위에 대화 오버레이를 띄운다 */
async function cutscene(lines) {
  showScreen('#screen-scene');
  await runDialogue(lines);
}

/**
 * 마을 데이터의 npc.linesKey(script.js 참조)를 실제 대사 배열로 풀어준다.
 * world.js에는 대사를 두지 않고 키만 두어서, 대사 수정이 script.js 한 곳에서 끝나게 한다.
 */
function resolveVillage(village) {
  return {
    ...village,
    npcs: village.npcs.map((npc) => ({
      ...npc,
      lines: npc.lines || SCRIPT[npc.linesKey] || [],
    })),
  };
}

/** 섬 마을 탐험 — 공통 진입 */
function enterVillage(island) {
  $('#island-name').textContent = island.village.name;
  showScreen('#screen-island');
  return runIsland(resolveVillage(island.village), {
    canvas: $('#island-canvas'),
    promptEl: $('#island-prompt'),
    runDialogue: (lines) => runDialogue(lines),
    sfx,
  });
}

// ---------------- 오디오 부팅 ----------------

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

playBgm('title');

// ---------------- HUD ----------------

function hudShow(on) {
  document.body.classList.toggle('playing', on);
}

function hudUpdate(stageText) {
  $('#hud-pieces').textContent = `📜 ${state.pieces.length}/${PIECES.length}`;
  if (stageText !== undefined) {
    $('#hud-stage').textContent = stageText;
    $('#hud-stage').hidden = !stageText;
  }
}

// ---------------- 모달 (설정 / 지도 / 가방) ----------------

const modal = { root: $('#modal-root'), title: $('#modal-title'), body: $('#modal-body') };

function openModal(title, render) {
  modal.title.textContent = title;
  modal.body.innerHTML = '';
  render(modal.body);
  modal.root.hidden = false;
  sfx('click');
}
const closeModal = () => { modal.root.hidden = true; };
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
    state.settings.bgm = v; setBgmVolume(v); saveGame();
  }));
  body.appendChild(sliderRow('🔔 효과음', state.settings.sfx, (v) => {
    state.settings.sfx = v; setSfxVolume(v); saveGame(); sfx('click');
  }));

  const sep = document.createElement('hr');
  sep.className = 'modal-sep';
  body.appendChild(sep);

  const note = document.createElement('p');
  note.className = 'modal-note';
  note.textContent = '진행 상황은 자동 저장된다.';
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
    if (isl.kind === 'home') status = '🏠';
    else if (isl.cleared) status = '✅';
    else if (isl.key === target && !isl.locked) { status = '🧭'; row.classList.add('next'); }
    if (isl.locked && !isl.cleared) row.classList.add('locked');
    const hidden = isl.locked && !isl.cleared && isl.key !== target;
    const p = isl.piece ? pieceById(isl.piece) : null;
    row.innerHTML = `
      <span class="map-status">${status}</span>
      <span class="map-name">${hidden ? '???' : isl.name}</span>
      <span>${p ? (isl.cleared ? p.icon : '📜') : (isl.kind === 'final' ? '⚔' : '')}</span>`;
    body.appendChild(row);
  }
  const note = document.createElement('p');
  note.className = 'modal-note';
  note.textContent = '🧭 다음 목적지 · ✅ 클리어 · 🏠 고향 · 🔒 아직 갈 수 없다';
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
      : '<span class="ico">❓</span><span>도안</span>';
    if (got) slot.title = `${p.en} — ${p.view}\n${p.effect}`;
    grid.appendChild(slot);
  }
  body.appendChild(grid);

  const pen = PENS[state.pen] || PENS.none;
  const penRow = document.createElement('div');
  penRow.className = 'inv-item';
  penRow.innerHTML = `<span class="ico">🖊</span><span>${pen.name}</span>`
    + `<span class="desc">${pen.ship}</span>`;
  penRow.title = pen.desc;
  body.appendChild(penRow);

  if (state.emblem) {
    const em = document.createElement('div');
    em.className = 'inv-item';
    em.innerHTML = '<span class="ico">🏴</span><span>나의 마크</span>';
    const img = document.createElement('img');
    img.src = state.emblem;
    img.className = 'pixel';
    img.style.cssText = 'width:48px;height:48px;object-fit:contain;margin-left:auto';
    em.appendChild(img);
    body.appendChild(em);
  }

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

// ---------------- 그리기 화면 ----------------

let drawResolve = null;

/**
 * 그리기 화면을 띄우고 결과를 기다린다.
 * check: 'ship' 배 판정(부실하면 반려) · 'emblem' 마크 판정 · null 판정 없음
 */
function drawScreen({ prompt, hint, button, bg, guide, check = null, judged = false }) {
  return new Promise((resolve) => {
    if (bg) setScene(bg);
    $('#ship-prompt').textContent = prompt;
    $('#ship-log').textContent = hint;
    $('#btn-ship-submit').textContent = button;
    $('#btn-ship-submit').disabled = false;
    $('#btn-guide').hidden = !guide;
    shipCanvas.clear();
    shipCanvas.setGuide(null);
    $('#btn-guide').textContent = '📐 도안 켜기';
    shipCanvas.enabled = true;
    showScreen('#screen-ship');
    shipCanvas._resize();
    drawResolve = { resolve, check, judged, guide };
  });
}

$('#btn-guide').addEventListener('click', () => {
  const on = !shipCanvas.guideKey;
  shipCanvas.setGuide(on ? 'ship' : null);
  $('#btn-guide').textContent = on ? '📐 도안 끄기' : '📐 도안 켜기';
  sfx('click');
});

async function onDrawSubmit() {
  if (!drawResolve) return;
  const { resolve, check, judged } = drawResolve;

  if (shipCanvas.isEmpty()) {
    $('#ship-log').textContent = `세렌: "${EMPTY_CANVAS_LINES[0]}"`;
    sfx('cancel');
    return;
  }

  // 진행 판정은 로컬로 — 통신 없이 즉시, 같은 그림이면 항상 같은 결과.
  const w = shipCanvas.cssW;
  const h = shipCanvas.cssH;
  const quality = check === 'ship' ? shipQuality(shipCanvas.strokes, w, h)
    : check === 'emblem' ? emblemQuality(shipCanvas.strokes, w, h)
      : null;

  if (check === 'ship' && quality.verdict === 'wreck') {
    $('#ship-log').textContent = `세렌: "${quality.reason}. ${SHIP_VERDICT_LINES.wreck}"`;
    sfx('cancel');
    return;
  }
  if (check === 'emblem' && !quality.ok) {
    $('#ship-log').textContent = `세렌: "${quality.reason}"`;
    sfx('cancel');
    return;
  }

  const png = shipCanvas.toPngDataUrl();
  // 펜 재료가 곧 배의 재료 — 같은 그림이 나무면 갈색 목선, 철이면 회청색 철갑선이 된다.
  const pixel = shipCanvas.toPixelDataUrl(72, penInk(state.pen));
  sfx('submit');

  if (!judged) {
    drawResolve = null;
    resolve({ png, pixel, quality });
    return;
  }

  // AI는 진행을 막지 않는 곁가지 — 무엇을 그렸는지 알아보고 한마디 거든다.
  $('#btn-ship-submit').disabled = true;
  shipCanvas.enabled = false;
  $('#ship-log').textContent = '세렌: "어디 보자… (감정 중)"';
  const result = await judge(shipCanvas.stats(), png, '배 그리기 — 배로서의 완성도를 평가하라.');
  drawResolve = null;
  resolve({ png, pixel, quality, result });
}

$('#btn-ship-clear').addEventListener('click', () => shipCanvas.clear());
$('#btn-ship-submit').addEventListener('click', onDrawSubmit);

/** 배 저장 — 내구도는 로컬 점수로 결정한다 */
function keepShip(drawn, baseHp = 100) {
  state.ship = {
    png: drawn.png,
    pixel: drawn.pixel,
    maxHp: baseHp + (drawn.quality?.score ?? 50),
    quality: drawn.quality?.verdict ?? 'ok',
  };
  saveGame();
}

// ---------------- 전투 ----------------

const battle = {
  boss: null, bossHp: 0, shipHp: 0, timer: DRAW_TIME,
  timerId: null, judging: false, resolve: null, used: new Set(),
};

function updateBars() {
  $('#boss-hp').style.width = `${Math.max(0, battle.bossHp / battle.boss.maxHp) * 100}%`;
  $('#ship-hp').style.width = `${Math.max(0, battle.shipHp / state.ship.maxHp) * 100}%`;
}
const log = (msg) => { $('#battle-log').textContent = msg; };

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
  void el.offsetWidth;
  el.classList.add(cls);
}

/** 그림의 대략적 지문 — 최종전에서 "같은 걸 또 그렸는지" 판별한다 */
function strokeSignature(stats) {
  return `${stats.strokeCount}:${Math.round(stats.totalLength / 120)}:${Math.round(stats.coverage * 12)}`;
}

function runBattle(boss) {
  return new Promise((resolve) => {
    battle.boss = boss;
    battle.bossHp = boss.maxHp;
    battle.shipHp = state.ship.maxHp;
    battle.judging = false;
    battle.resolve = resolve;
    battle.used = new Set();

    if (boss.bg) setScene(boss.bg);
    $('#boss-name').textContent = boss.title ? `${boss.title} ${boss.name}` : boss.name;
    const bossEl = $('#boss-sprite');
    bossEl.innerHTML = '';
    const sp = spriteCanvas(boss.sprite, 6);
    if (sp) bossEl.appendChild(sp);           // 아직 도트가 없는 보스는 그냥 비워둔다
    else bossEl.textContent = '❔';
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

  // 최종전: 이번 판에 이미 쓴 그림은 그대로 복제당한다 (창조 vs 약탈)
  const stats = battleCanvas.stats();
  const sig = strokeSignature(stats);
  if (battle.boss.copycat && battle.used.has(sig)) {
    log('네일이 똑같이 베껴서 되돌려준다! 통하지 않는다!');
    popAnim($('#damage-float'), 'show');
    $('#damage-float').textContent = 'COPY';
    sfx('cancel');
    setTimeout(() => bossCounterattack(), 1200);
    return;
  }
  battle.used.add(sig);

  log('세렌: "어디 보자… (감정 중)"');
  const result = await judge(stats, battleCanvas.toPngDataUrl(), battle.boss.situation);
  const damage = calcDamage(result, battle.boss);

  popAnim($('#boss-sprite'), 'hit');
  const dmgEl = $('#damage-float');
  dmgEl.textContent = damage > 0 ? `-${damage}` : 'MISS';
  popAnim(dmgEl, 'show');
  sfx(damage > 0 ? 'hit' : 'cancel');

  battle.bossHp -= damage;
  updateBars();
  log(`세렌: "${result.comment}" (${result.label} · ${damage} 데미지!)`);

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

$('#btn-clear').addEventListener('click', () => battleCanvas.clear());
$('#btn-submit').addEventListener('click', () => submitAttack(false));

// ---------------- 섬별 대사 배치 ----------------

const ISLAND_SCRIPT = {
  vine:   { arrive: 'VINE_ARRIVE',   preBoss: null,           win: 'GAR_WIN', page: 'PAGE_1' },
  mirror: { arrive: 'MIRROR_ARRIVE', preBoss: 'SEREN_CLASH',  win: 'NAR_WIN', page: 'PAGE_2', extra: 'NAR_INTRO_EXTRA' },
  ice:    { arrive: 'ICE_ARRIVE',    preBoss: null,           win: 'TUN_WIN', page: 'TRUTH',  extra: 'TUN_INTRO_EXTRA' },
};

// ---------------- 도안 조각 획득 화면 ----------------

function showPieceGet(island) {
  const piece = pieceById(island.piece);
  const n = state.pieces.length;
  $('#victory-title').textContent = '📜 도안 획득!';
  $('#victory-desc').innerHTML = `${island.name}의 수호자가 색을 되찾았다.<br/>도안 한 장이 손에 들어온다.`;
  $('#victory-piece').textContent = `${piece.icon} ${piece.name} (${piece.en}) — ${piece.view}`;
  $('#victory-sub').textContent = n >= PIECES.length
    ? '세 장이 다 모였다. 이제 바람호를 그릴 수 있다.'
    : `${n}/${PIECES.length} — 다음 바다가 열렸다.`;
  showScreen('#screen-victory');
  return new Promise((resolve) => {
    $('#btn-victory-next').textContent = '⛵ 항해를 계속한다';
    $('#btn-victory-next').addEventListener('click', () => { sfx('click'); resolve(); }, { once: true });
  });
}

// ---------------- 프롤로그 ----------------

async function prologue() {
  hudUpdate('');
  playBgm('village');
  await cutscene(SCRIPT.INTRO);

  playBgm('tension');
  await cutscene(SCRIPT.SEREN_MEET);
  state.pen = 'wood';        // 세렌의 몸을 깎은 펜 — 이제 그림이 실체가 된다
  saveGame();

  playBgm('harbor');
  await cutscene(SCRIPT.FIRST_SHIP_INTRO);
  const first = await drawScreen({
    prompt: '🚢 너의 배를 그려라',
    hint: '아무거나 좋다. 네가 배라고 생각하는 것을 그리자.',
    button: '출항!',
    bg: 'crystal_forest',
    guide: false,
  });
  keepShip(first, 110);

  playBgm('sail');
  await cutscene(SCRIPT.FIRST_SHIP_DONE(first.pixel));

  playBgm('tension');
  await cutscene(SCRIPT.BLACK_SAIL(first.pixel));

  // 난파 → 덩굴섬으로 떠내려간다. 항해가 아니라 표류라서 배 위치도 덩굴섬 앞바다로 옮긴다.
  const vine = islandByKey('vine');
  state.flags.introDone = true;
  state.flags.drifted = true;
  state.sea = { x: vine.x - vine.r - 30, y: vine.y };
  saveGame();
}

/** 배를 (다시) 그린다 — 판정 있음. 부실하면 뜨지 않는다. */
async function redrawShip(bg) {
  const drawn = await drawScreen({
    prompt: '⛵ 배를 그려라',
    hint: '선체와 돛대는 갖추자. 너무 부실하면 아예 뜨지 않는다. (📐 도안 가능)',
    button: '이 배로 간다',
    bg,
    guide: true,
    check: 'ship',
    judged: true,
  });
  keepShip(drawn);
  const v = SHIP_VERDICT_LINES[drawn.quality.verdict] || '';
  await cutscene([{ speaker: '세렌', sprite: 'seren', text: v }]);
  return drawn;
}

// ---------------- 섬 한 곳 진행 ----------------

async function playIsland(island) {
  const sc = ISLAND_SCRIPT[island.key] || {};

  hudUpdate(`🏝 ${island.name}`);
  playBgm(island.music || 'village');
  if (sc.arrive) await cutscene(SCRIPT[sc.arrive]);

  // 마을 탐험
  const iv = await enterVillage(island);
  if (iv.result === 'leave') return false;

  // 첫 섬에서는 관문을 넘기 전에 배부터 다시 그린다 (난파 직후라 배가 없다)
  if (island.key === 'vine' && !state.flags.shipRebuilt) {
    await redrawShip(island.bg);
    state.flags.shipRebuilt = true;
    saveGame();
  }

  if (sc.preBoss) await cutscene(SCRIPT[sc.preBoss]);
  if (sc.extra) await cutscene(SCRIPT[sc.extra]);

  // 수호자
  hudUpdate(`⚔ ${island.boss.name}`);
  playBgm('battle');
  const won = await runBattle(island.boss);
  if (!won) {
    playBgm('village');
    await cutscene(SCRIPT.DEFEAT);
    await redrawShip(island.bg);
    return false;
  }

  playBgm('victory');
  if (sc.win) await cutscene(SCRIPT[sc.win]);

  addPiece(island.piece);
  if (island.boss.reward) addItem(island.boss.reward);
  markCleared(island.key);
  hudUpdate();
  sfx('pickup');

  // 얼음섬: 얼어붙은 배들의 철을 녹여 철 펜을 만든다 (다음이 돌풍 지대다)
  if (island.key === 'ice' && state.pen !== 'iron') {
    await cutscene(SCRIPT.IRON_PEN);
    state.pen = 'iron';
    addItem({ id: 'iron_pen', icon: '🖊', name: PENS.iron.name, desc: PENS.iron.desc });
    saveGame();
  }

  if (sc.page) await cutscene(SCRIPT[sc.page]);
  await showPieceGet(island);

  // 1섬 클리어 후 나만의 마크
  if (island.key === 'vine' && !state.emblem) {
    await cutscene(SCRIPT.EMBLEM_INTRO);
    const em = await drawScreen({
      prompt: '🏴 너의 마크를 그려라',
      hint: '돛에 새길 표식이다. 잘 그리는 게 아니라 안 잊히는 것.',
      button: '이걸로 정한다',
      bg: island.bg,
      guide: false,
      check: 'emblem',
    });
    state.emblem = em.pixel;
    saveGame();
    await cutscene(SCRIPT.EMBLEM_DONE);
  }
  return true;
}

// ---------------- 4막: 바람호 / 돌풍 ----------------

async function buildWindShip() {
  hudUpdate('⚓ 바람호 건조');
  playBgm('harbor');
  await cutscene(SCRIPT.BUILD_INTRO);

  // 도면 세 장을 차례로 따라 그린다. 정확도가 배의 성능이 된다.
  let best = null;
  for (const p of PIECES) {
    const drawn = await drawScreen({
      prompt: `${p.icon} ${p.name} — ${p.view}`,
      hint: `${p.effect}. 📐 도안을 켜고 따라 그리자.`,
      button: '이대로 짓는다',
      bg: 'sea_day',
      guide: true,
      check: 'ship',
    });
    best = drawn;
  }
  keepShip(best, 180);   // 바람호는 튼튼하다
  state.flags.windShip = true;
  saveGame();

  await cutscene(SCRIPT.BUILD_DONE(best.pixel));
  playBgm('tension');
  await cutscene(SCRIPT.STORM_RUN);
}

// ---------------- 5막: 최종전 ----------------

async function finale() {
  hudUpdate('⚔ 세계의 끝');
  playBgm('tension');
  await cutscene(SCRIPT.GOLDEN_ISLE);
  await cutscene(SCRIPT.NAIL_INTRO);

  const boss = islandByKey('golden').boss;
  playBgm('battle');
  let won = await runBattle(boss);
  while (!won) {
    playBgm('village');
    await cutscene(SCRIPT.DEFEAT);
    await redrawShip('golden_isle');
    playBgm('battle');
    won = await runBattle(boss);
  }

  playBgm('title');
  await cutscene(SCRIPT.RECOGNITION);
  await cutscene(SCRIPT.NAIL_ASKS);
  await cutscene(SCRIPT.NAIL_END);
  await cutscene(SCRIPT.SEREN_FREE);

  // 소원 — 플레이어가 직접 쓴다. 게임은 내용을 읽지 않는다.
  await cutscene(SCRIPT.WISH_INTRO);
  const wish = await drawScreen({
    prompt: '🖊 성수에 넣을 소원을 적어라',
    hint: '무엇을 적든 좋다. 아무도 읽지 않는다.',
    button: '물에 넣는다',
    bg: 'golden_isle',
    guide: false,
  });
  state.wish = wish.pixel;
  state.flags.cleared = true;
  markCleared('golden');
  saveGame();
  await cutscene(SCRIPT.WISH_DONE);

  playBgm('victory');
  hudUpdate('');
  state.pen = 'gold';        // 바닷물에 담근 펜촉에 금빛이 차오른다
  saveGame();
  await cutscene(SCRIPT.EPILOGUE);

  // 엔딩 화면
  $('#victory-title').textContent = '🏝 그리는 자의 바다';
  $('#victory-desc').innerHTML = '펜은 처음부터 손에 있었고,<br/>잉크는 처음부터 온 바다에 있었다.';
  $('#victory-piece').textContent = '― 끝 ―';
  $('#victory-sub').textContent = '당신이 적은 소원은 아무도 읽지 않았다.';
  showScreen('#screen-victory');
  $('#btn-victory-next').textContent = '↺ 처음부터';
  $('#btn-victory-next').addEventListener('click', () => location.reload(), { once: true });
}

// ---------------- 메인 루프 ----------------

async function sailLoop() {
  for (;;) {
    if (state.flags.cleared) return;

    // 도안 3장을 다 모았고 아직 바람호가 없으면 건조 단계로
    if (state.pieces.length >= PIECES.length && !state.flags.windShip) {
      await buildWindShip();
      continue;
    }

    // 난파 직후에는 항해할 배가 없다 — 떠내려온 덩굴섬에서 바로 시작한다.
    if (state.flags.drifted) {
      state.flags.drifted = false;
      saveGame();
      await playIsland(islandByKey('vine'));
      continue;
    }

    const islands = islandsWithProgress(state.cleared, state.pieces.length);
    const targetKey = nextTargetKey(state.cleared, state.pieces.length);
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

    if (island.kind === 'final') { await finale(); return; }

    if (island.kind === 'home') {
      hudUpdate('🏠 나루 마을');
      playBgm('village');
      await enterVillage(island);
      continue;
    }

    if (island.cleared) {
      await cutscene([
        { speaker: '세렌', sprite: 'seren', bg: island.bg, text: '여긴 이제 볼일 없어. 다음으로 가자.' },
      ]);
      continue;
    }

    await playIsland(island);
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
  if (!state.flags.introDone || !state.ship) await prologue();
  await sailLoop();
}

// ---------------- 타이틀 ----------------

if (hasSave() && state.flags.introDone) $('#btn-continue').hidden = false;

$('#btn-start').addEventListener('click', () => {
  if (hasSave() && state.flags.introDone && !confirm('저장된 모험이 있다. 지우고 새로 시작할까?')) return;
  sfx('click');
  gameFlow(true);
});
$('#btn-continue').addEventListener('click', () => { sfx('click'); gameFlow(false); });
