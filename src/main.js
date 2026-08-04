import { DrawingCanvas } from './drawing.js';
import { mockJudge, calcDamage } from './judge.js';

const $ = (sel) => document.querySelector(sel);

const BOSS = {
  name: '황금 재규어 오로',
  maxHp: 300,
  weakness: 'weapon',
  drawPrompt: '⚔️ 무기를 그려라!',
  introLog: '피기: "저 재규어는 무기에 약해! 뭐든 무기를 그려봐!"',
};

const DRAW_TIME = 20; // 초

const state = {
  bossHp: BOSS.maxHp,
  timer: DRAW_TIME,
  timerId: null,
  judging: false,
};

const drawing = new DrawingCanvas($('#draw-canvas'));

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

function log(msg) {
  $('#battle-log').textContent = msg;
}

function updateHp() {
  const pct = Math.max(0, state.bossHp / BOSS.maxHp) * 100;
  $('#boss-hp').style.width = `${pct}%`;
}

function startTimer() {
  state.timer = DRAW_TIME;
  renderTimer();
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    state.timer -= 1;
    renderTimer();
    if (state.timer <= 0) submitDrawing(); // 시간 초과 시 그려진 만큼으로 자동 공격
  }, 1000);
}

function renderTimer() {
  const el = $('#draw-timer');
  el.textContent = state.timer;
  el.classList.toggle('low', state.timer <= 5);
}

function startBattle() {
  state.bossHp = BOSS.maxHp;
  updateHp();
  log(BOSS.introLog);
  $('#draw-prompt').textContent = BOSS.drawPrompt;
  drawing.clear();
  drawing.enabled = true;
  showScreen('#screen-battle');
  // 캔버스가 화면에 표시된 후 크기를 다시 계산해야 함 (classList 변경 직후 동기 reflow로 충분)
  drawing._resize();
  startTimer();
}

async function submitDrawing() {
  if (state.judging) return;
  if (drawing.isEmpty()) {
    log('피기: "아무것도 안 그렸잖아! 뭐라도 그려봐!"');
    return;
  }
  state.judging = true;
  clearInterval(state.timerId);
  drawing.enabled = false;
  $('#btn-submit').disabled = true;
  log('피기: "어디 보자... (감정 중)"');

  const result = await mockJudge(drawing.stats(), drawing.toPngDataUrl());
  const damage = calcDamage(result, BOSS.weakness);

  // 공격 연출
  const sprite = $('#boss-sprite');
  sprite.classList.remove('hit');
  void sprite.offsetWidth; // 애니메이션 재시작 트릭
  sprite.classList.add('hit');

  const dmgEl = $('#damage-float');
  dmgEl.textContent = `-${damage}`;
  dmgEl.classList.remove('show');
  void dmgEl.offsetWidth;
  dmgEl.classList.add('show');

  state.bossHp -= damage;
  updateHp();
  log(`피기: "${result.comment}" (${result.label} · 성의 ${result.score}점 · ${damage} 데미지!)`);

  if (state.bossHp <= 0) {
    setTimeout(() => showScreen('#screen-victory'), 900);
    return;
  }

  // 다음 턴
  setTimeout(() => {
    state.judging = false;
    drawing.clear();
    drawing.enabled = true;
    $('#btn-submit').disabled = false;
    startTimer();
  }, 1200);
}

$('#btn-start').addEventListener('click', startBattle);
$('#btn-restart').addEventListener('click', startBattle);
$('#btn-clear').addEventListener('click', () => drawing.clear());
$('#btn-submit').addEventListener('click', submitDrawing);
