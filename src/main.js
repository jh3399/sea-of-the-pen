import { DrawingCanvas } from './drawing.js';
import { judge, calcDamage } from './judge.js';
import { runDialogue } from './dialogue.js';
import { spriteCanvas } from './sprites.js';
import { startPixelBg, setScene } from './pixelbg.js';

startPixelBg(document.querySelector('#bg-canvas'));
// 배경 확인용 — 콘솔에서 __bg('volcano') 처럼 호출하면 그 씬으로 전환된다.
window.__bg = setScene;

const $ = (sel) => document.querySelector(sel);

const DRAW_TIME = 20; // 전투 드로잉 제한 시간(초)

const BOSS_GAR = {
  name: '황금 재규어 가르',
  sprite: 'gar',
  maxHp: 300,
  weaknesses: ['weapon'],
  resists: [],
  bg: 'jungle_gold',
  drawPrompt: '⚔️ 무기를 그려라!',
  introLog: '세렌: "저 재규어는 무기에 약해! 뭐든 무기를 그려봐!"',
  attackName: '할퀴기',
  attackMin: 12,
  attackMax: 26,
  situation: '보스전(황금 재규어) — 플레이어에게 무기를 그리라고 요청함',
};

const state = {
  shipPng: null,
  shipMaxHp: 150,
  shipHp: 150,
  bossHp: 0,
  timer: DRAW_TIME,
  timerId: null,
  judging: false,
  battleResolve: null,
  shipResolve: null,
  boss: BOSS_GAR,
};

const shipCanvas = new DrawingCanvas($('#ship-canvas'));
const battleCanvas = new DrawingCanvas($('#draw-canvas'));

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ---------------- 배 그리기 씬 ----------------

function drawShip({ prompt, hint, button, judged, bg }) {
  return new Promise((resolve) => {
    if (bg) setScene(bg);
    $('#ship-prompt').textContent = prompt;
    $('#ship-log').textContent = hint;
    $('#btn-ship-submit').textContent = button;
    $('#btn-ship-submit').disabled = false;
    shipCanvas.clear();
    shipCanvas.enabled = true;
    showScreen('#screen-ship');
    shipCanvas._resize();
    state.shipResolve = { resolve, judged };
  });
}

async function onShipSubmit() {
  if (!state.shipResolve) return;
  if (shipCanvas.isEmpty()) {
    $('#ship-log').textContent = '세렌: "빈 바다에 몸만 띄울 셈이야? 뭐라도 그려!"';
    return;
  }
  const { resolve, judged } = state.shipResolve;
  const png = shipCanvas.toPngDataUrl();
  const pixel = shipCanvas.toPixelDataUrl(); // 도트 스프라이트 버전 (게임 내 표시용)

  if (!judged) {
    state.shipResolve = null;
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
  state.shipResolve = null;
  resolve({ png, pixel, result });
}

// ---------------- 전투 씬 ----------------

function updateBars() {
  const boss = state.boss;
  $('#boss-hp').style.width = `${Math.max(0, state.bossHp / boss.maxHp) * 100}%`;
  $('#ship-hp').style.width = `${Math.max(0, state.shipHp / state.shipMaxHp) * 100}%`;
}

function log(msg) {
  $('#battle-log').textContent = msg;
}

function renderTimer() {
  const el = $('#draw-timer');
  el.textContent = state.timer;
  el.classList.toggle('low', state.timer <= 5);
}

function startTimer() {
  state.timer = DRAW_TIME;
  renderTimer();
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    state.timer -= 1;
    renderTimer();
    if (state.timer <= 0) submitAttack(true);
  }, 1000);
}

function popAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // 애니메이션 재시작 트릭
  el.classList.add(cls);
}

function runBattle(boss) {
  return new Promise((resolve) => {
    state.boss = boss;
    state.bossHp = boss.maxHp;
    state.shipHp = state.shipMaxHp;
    state.judging = false;
    state.battleResolve = resolve;

    if (boss.bg) setScene(boss.bg);
    $('#boss-name').textContent = boss.name;
    const bossEl = $('#boss-sprite');
    bossEl.innerHTML = '';
    bossEl.appendChild(spriteCanvas(boss.sprite, 8));
    $('#draw-prompt').textContent = boss.drawPrompt;
    $('#battle-ship').src = state.shipPixel;
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
  clearInterval(state.timerId);
  const resolve = state.battleResolve;
  state.battleResolve = null;
  if (resolve) setTimeout(() => resolve(won), 900);
}

async function submitAttack(auto = false) {
  if (state.judging || !state.battleResolve) return;

  // 시간 초과인데 빈 캔버스면: 공격 실패, 보스만 반격
  if (battleCanvas.isEmpty()) {
    if (!auto) {
      log('세렌: "아무것도 안 그렸잖아! 뭐라도 그려봐!"');
      return;
    }
    state.judging = true;
    clearInterval(state.timerId);
    log('세렌: "시간 초과야! 정신 차려!"');
    setTimeout(() => bossCounterattack(), 700);
    return;
  }

  state.judging = true;
  clearInterval(state.timerId);
  battleCanvas.enabled = false;
  $('#btn-submit').disabled = true;
  log('세렌: "어디 보자... (감정 중)"');

  const result = await judge(battleCanvas.stats(), battleCanvas.toPngDataUrl(), state.boss.situation);
  const damage = calcDamage(result, state.boss);

  popAnim($('#boss-sprite'), 'hit');
  const dmgEl = $('#damage-float');
  dmgEl.textContent = damage > 0 ? `-${damage}` : 'MISS';
  popAnim(dmgEl, 'show');

  state.bossHp -= damage;
  updateBars();
  log(`세렌: "${result.comment}" (${result.label} · ${result.score}점 · ${damage} 데미지!)`);

  if (state.bossHp <= 0) {
    endBattle(true);
    return;
  }
  setTimeout(() => bossCounterattack(), 1400);
}

function bossCounterattack() {
  if (!state.battleResolve) return;
  const boss = state.boss;
  const dmg = boss.attackMin + Math.floor(Math.random() * (boss.attackMax - boss.attackMin + 1));
  state.shipHp -= dmg;
  popAnim($('#battle-ship'), 'ship-hit');
  updateBars();
  log(`${boss.name}의 ${boss.attackName}! 배가 ${dmg} 피해를 입었다!`);

  if (state.shipHp <= 0) {
    endBattle(false);
    return;
  }
  // 다음 턴
  setTimeout(() => {
    if (!state.battleResolve) return;
    state.judging = false;
    battleCanvas.clear();
    battleCanvas.enabled = true;
    $('#btn-submit').disabled = false;
    log(state.boss.introLog);
    startTimer();
  }, 1200);
}

// ---------------- 스토리 진행 ----------------

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

const PIGGY_MEET = [
  { speaker: '???', bg: 'dawn_wreck', text: '이봐! 정신 차려! 일어나라고!' },
  { speaker: '세렌', sprite: 'seren', text: '나는 세렌. 전설의 배 "바람호"의 뱃머리... 였던 몸이지. 지금은 보다시피 통나무 신세지만.' },
  { speaker: '세렌', sprite: 'seren', text: '네가 그린 배, 봤어. 솜씨는 솔직히 엉망인데... 이상하게 진심이 담겨 있더라.' },
  { speaker: '세렌', sprite: 'seren', text: '"손이 아니라 마음으로 그리는 자가 나타나면, 바람호는 다시 떠오른다" — 모루 영감의 예언이야. 어쩌면 너일지도.' },
  { speaker: '세렌', sprite: 'seren', text: '배를 다시 그려봐. 이번엔 진심을 담아서 — 선체, 돛, 키까지 제대로!' },
];

const sailLines = (result, shipPixel) => [
  { speaker: '세렌', sprite: 'seren', text: `오오...! ${result ? `"${result.comment}"` : '좋아, 이 정도면 바다에 띄울 만해!'}` },
  { speaker: '', bg: 'sea_day', image: shipPixel, text: '좋아, 출항이다! 첫 목적지는 황금 수풀섬 — 도안 조각의 기운이 느껴져!' },
  { speaker: '세렌', sprite: 'seren', bg: 'jungle_gold', text: '조심해. 섬의 수호자 가르가 네일의 저주로 폭주하고 있어. 무기를 그려서 정신 차리게 해주자!' },
];

const DEFEAT = [
  { speaker: '세렌', sprite: 'seren', bg: 'dawn_wreck', text: '배가 버티질 못해! 일단 후퇴다!' },
  { speaker: '세렌', sprite: 'seren', text: '괜찮아. 우리에겐 펜이 있잖아? 다시 그리면 돼 — 이번엔 더 튼튼하게!' },
];

async function gameFlow() {
  await runDialogue(INTRO);

  // 1) 첫 배 그리기 (판정 없음 — 어차피 부서질 운명)
  const first = await drawShip({
    prompt: '🚢 너의 배를 자유롭게 그려라!',
    hint: '어떤 배든 좋다. 너만의 배를 그려서 출항하자!',
    button: '출항!',
    judged: false,
    bg: 'harbor',
  });
  state.shipPng = first.png;
  state.shipPixel = first.pixel;

  // 2) 네일의 습격 → 세렌 등장
  await runDialogue(nailAttack(first.pixel));
  await runDialogue(PIGGY_MEET);

  // 3) 배 다시 그리기 (판정 O — 점수가 배의 내구도가 된다)
  const second = await drawShip({
    prompt: '⛵ 이번엔 진심을 담아 — 선체·돛·키를 갖춰 그려라!',
    hint: '잘 그린 배일수록 튼튼하다. (판정 점수 = 배의 내구도)',
    button: '다시 출항!',
    judged: true,
    bg: 'dawn_wreck',
  });
  state.shipPng = second.png;
  state.shipPixel = second.pixel;
  state.shipMaxHp = 100 + (second.result?.score ?? 50);

  await runDialogue(sailLines(second.result, second.pixel));

  // 4) 보스전 — 질 때마다 배를 다시 그리고 재도전
  let won = await runBattle(BOSS_GAR);
  while (!won) {
    await runDialogue(DEFEAT);
    const retry = await drawShip({
      prompt: '⛵ 더 튼튼하게! 배를 다시 그려라!',
      hint: '잘 그린 배일수록 튼튼하다. (판정 점수 = 배의 내구도)',
      button: '재출항!',
      judged: true,
      bg: 'dawn_wreck',
    });
    state.shipPng = retry.png;
    state.shipPixel = retry.pixel;
    state.shipMaxHp = 100 + (retry.result?.score ?? 50);
    won = await runBattle(BOSS_GAR);
  }

  showScreen('#screen-victory');
}

// ---------------- 이벤트 바인딩 ----------------

$('#btn-start').addEventListener('click', gameFlow);
$('#btn-restart').addEventListener('click', gameFlow);
$('#btn-ship-clear').addEventListener('click', () => shipCanvas.clear());
$('#btn-ship-submit').addEventListener('click', onShipSubmit);
$('#btn-clear').addEventListener('click', () => battleCanvas.clear());
$('#btn-submit').addEventListener('click', () => submitAttack(false));
