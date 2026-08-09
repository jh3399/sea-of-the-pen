// 항해 화면 — `draw.html` 에서 이어지는 플레이어용 진입점. 물리·조향·필드·규칙 엔진은
// `main.js` 하니스가 이미 가진 순수 모듈을 그대로 재사용하고(설계 원칙 3), 렌더링만 하니스의
// 벡터 그림 대신 픽셀 그래픽(`sail/render.js`)으로 새로 짠다.
//
// 이번 화면은 손상 파이프라인을 연결하지 않는다 — 암초는 `hull` 이 없는 정적 강체라 물리로만
// 막히고 깎이지 않는다 (`physics/obstacle.js` 머리말). 암초 배치·도착 지점은 `sail/map.js` 에
// 하드코딩돼 있다 — `docs/d3_handoff.md` §S4 의 `maps.json` 이 이 자리를 나중에 대체한다.
import './sail.css';
import { createWorld, FixedStepper, FIXED_DT } from '../physics/world.js';
import { applyHydroToWorld } from '../physics/hydro.js';
import { applyFieldsToWorld } from '../physics/fields.js';
import { createFields } from '../field/field.js';
import { createRuleEngine, loadRules } from '../rules/engine.js';
import ZONES from '../field/zones.json';
import RULE_TABLE from '../rules/table.json';
import { applyDevices, STROKE_KEYMAP } from '../physics/devices.js';
import { createHullBody } from '../physics/body.js';
import { createObstacle } from '../physics/obstacle.js';
import { defaultDevices } from '../items/defaults.js';
import { itemsExtraMass } from '../items/attach.js';
import { strokeToHull, HULL_DEFAULTS } from '../hull/polygon.js';
import { CORPUS } from '../hull/corpus.js';
import { crewWorldPoint, findCrewBody } from '../game/crew.js';
import { createGoal, goalDistance, goalReached } from '../game/goal.js';
import { rateTravelTime } from '../game/scoring.js';
import { currentStage, hasNextStage } from '../game/progress.js';
import { View } from '../render/view.js';
import { drawWater, drawObstacle, drawHullBody, drawWake, drawGoal, drawGoalCompass } from './render.js';
import { MAPS, boundaryWalls } from './map.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const HANDOFF_KEY = 'shipwright:handoff';
/** 트리거로 쓰는 키 코드 — 부착 아이템(부스터·키)의 bind 풀. `main.js` 와 같은 집합. */
const TRIGGER_KEYS = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyQ', 'KeyE']);
/** 항적 표시 간격 — 이 스텝 수마다 한 점씩 남긴다. */
const WAKE_EVERY_STEPS = 4;
const WAKE_MAX = 16;

/**
 * 연습 해역의 조작 안내 — **읽는 목록이 아니라 해 보면 켜지는 판**이다.
 *
 * ★ 각 줄에 `did(strokes, held)` 가 붙어 있어서, 플레이어가 실제로 그 입력을 넣은 순간에만
 *   불이 들어온다. 설명을 읽히는 대신 **해 보게 만드는** 것이 이 프로젝트의 방식이고
 *   (맵도 골을 옆에 두어 돌게 만든다), 셋을 다 켜면 판이 저절로 사라진다.
 *
 * ★ 순서가 곧 배우는 순서다. 「넓게 선회」가 마지막인 이유는 그것이 앞의 둘을 **겹쳐서**
 *   나오는 것이기 때문이다 — 상쇄 규칙에서 저절로 나오는 조작이라 아무도 안 알려준다
 *   (CLAUDE.md D3). 실측: 제자리 반경 2.5 m / 1.69 m/s vs 넓게 10.5 m / 3.67 m/s.
 *
 * ⚠ **키(Q/E)는 여기 없다.** 키는 시작의 섬에서 받는데 그 다음 바다는 안내가 꺼져 있어
 *   (D4: "튜토리얼 텍스트 없이 1장을 클리어하는가") 이 판에 넣어 봐야 영영 안 뜬다.
 *   그 역할은 세렌의 대사가 한다 — "Q 랑 E, 왼쪽 오른쪽" ([S-06]). 화면이 아니라 인물이
 *   가르치는 편이 이 게임의 방식이기도 하다.
 *   ★ 안내가 켜진 바다에서 아이템별 줄이 필요해지면 `needs: '<type>'` 를 붙이면 된다 —
 *     `initHints()` 가 배에 실제로 달린 것만 골라 만든다.
 */
const SAIL_HINTS = [
  { id: 'row', keys: '↑', label: '젓기', did: (s) => s.has('ArrowUp') && !s.has('ArrowLeft') && !s.has('ArrowRight') },
  { id: 'pivot', keys: '← →', label: '제자리 선회', did: (s) => (s.has('ArrowLeft') !== s.has('ArrowRight')) && !s.has('ArrowUp') },
  { id: 'wide', keys: '↑ + ← →', label: '넓게 선회', did: (s) => s.has('ArrowUp') && (s.has('ArrowLeft') !== s.has('ArrowRight')) },
  { id: 'back', keys: '↓', label: '뒤로 젓기', did: (s) => s.has('ArrowDown') },
];

/** `draw.html` 이 sessionStorage 에 남긴 설계. 없거나 깨졌으면 null. */
function loadHandoff() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.outline?.length ? data : null;
  } catch {
    return null;
  }
}

/** 핸드오프가 없을 때(직접 sail.html 을 연 경우)의 기본 배 — 기존 코퍼스 재사용. */
function fallbackDesign() {
  const result = strokeToHull(CORPUS.sloop(0, 0), { pixelsPerMeter: PPM });
  return { outline: result.outline, material: 'wood', items: [], crew: { x: 0, y: 0 } };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/** 남은 거리 표기. 맵 한 장이 수백 m 규모라 km 로 고정하면 도착할 때까지 0.0x km 만 보인다. */
function formatDistance(m) {
  if (!Number.isFinite(m)) return '-- m';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(total / 60).toString().padStart(2, '0');
  const ss = (total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function formatClearTime(seconds) {
  const total = Math.max(0, Math.floor(seconds * 100 + 1e-6));
  const mm = Math.floor(total / 6000).toString().padStart(2, '0');
  const ss = Math.floor((total % 6000) / 100).toString().padStart(2, '0');
  const cs = (total % 100).toString().padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
}

class SailScreen {
  constructor() {
    this.canvas = document.getElementById('sea');
    this.view = new View(this.canvas);
    this.view.ppm = PPM * 0.5;

    this.world = createWorld();
    this.rules = loadRules(RULE_TABLE);
    // 잔잔한 바다 — 필드가 없어 화재·발화 규칙이 조건을 못 만족한다. 이 화면이 손상 파이프라인을
    // 안 붙이고도 "파손 없음"인 이유는 이 존 선택이다 (계산 코드가 아니라 데이터 선택).
    this.fields = createFields(ZONES.zones.calm.fields ?? {});
    this.engine = createRuleEngine(this.rules, this.fields);

    this.stepIndex = 0;
    this.simTime = 0;
    this.bodies = new Set();
    this.obstacles = new Set();
    this.heldStrokes = new Set();
    this.tappedStrokes = new Set();
    this.held = {};
    this.keys = new Set();
    this.wake = [];
    this.cleared = false;
    this.clearTime = null;

    this.stepper = new FixedStepper(this.world, {
      onPreStep: (dt) => {
        // 여러 물리 스텝이 한 렌더 프레임에 몰려도 직전 스텝의 도착 시각을 놓치지 않는다.
        this.checkGoal();
        this.stepIndex += 1;
        this.simTime = this.stepIndex * FIXED_DT;
        if (!this.cleared) this.applyControls(dt);
        applyHydroToWorld(this.world, dt);
        applyFieldsToWorld(this.world, this.fields, dt);
        this.engine.tick(this.world, dt);
        if (this.stepIndex % WAKE_EVERY_STEPS === 0) this.sampleWake();
      },
    });

    this.hud = {
      clock: document.getElementById('hud-clock'),
      barFill: document.getElementById('hud-bar-fill'),
      distance: document.getElementById('hud-distance'),
    };
    // ★ 어느 바다인가는 `game/progress.js` 가 정하고, 그 id 로 맵을 꺼내는 것이 이 한 줄이다.
    //   맵별 분기는 여기에도 없다 — 아래는 전부 `this.map` 의 데이터만 읽는다.
    this.stage = currentStage();
    this.map = MAPS[this.stage.id];

    this.clearUi = {
      overlay: document.getElementById('clear-overlay'),
      stars: [...document.querySelectorAll('#clear-stars span')],
      rating: document.getElementById('clear-rating'),
      time: document.getElementById('clear-time'),
      retry: document.getElementById('btn-retry'),
      next: document.getElementById('btn-next'),
      nextNote: document.getElementById('next-stage-note'),
      menu: document.getElementById('btn-clear-menu'),
    };
    this.clearUi.retry.addEventListener('click', () => {
      location.href = 'sail.html';
    });
    this.clearUi.menu.addEventListener('click', () => {
      sessionStorage.removeItem(HANDOFF_KEY);
      location.href = 'index.html';
    });
    this.clearUi.next.addEventListener('click', () => this.toNextStage());

    window.addEventListener('resize', () => this.view.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));

    this.launch(loadHandoff() ?? fallbackDesign());
    for (const spec of this.map.obstacles) this.placeObstacle(spec);
    // 해역 경계 — 벽도 그냥 암초다 (같은 `placeObstacle`, 같은 재질). 경계 전용 물리·판정
    // 코드가 0줄인 이유이고, 그래서 "여기서부터 못 간다"를 규칙이 아니라 지형이 말한다.
    for (const spec of boundaryWalls(this.map.bounds)) this.placeObstacle(spec);
    this.goal = createGoal(this.map.goal);
    this.initialDistance = this.currentDistance();
    // ⚠ 반드시 `launch()` **뒤에** 부른다 — 어느 줄을 띄울지는 배에 실제로 달린 것으로
    //   정하므로, 배가 없는 상태로 부르면 「키」 줄이 영영 안 나온다.
    this.initHints();

    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------ 출항

  /** 선체 로컬 폴리곤 + 손으로 붙인 아이템을 기본 장치 위에 얹어 강체로 만든다 (main.js#launch). */
  launch(design) {
    // oarX 는 그리기 화면에서 플레이어가 찍은 노의 세로 위치. 폴백 설계(fallbackDesign)에는
    // 없으므로 그때는 D1~D3 의 자동 배치(station)로 되돌아간다.
    const items = defaultDevices(design.outline, { oarX: design.oarX ?? null })
      .concat((design.items ?? []).map((it) => ({ ...it })));
    const body = createHullBody(
      this.world,
      { outline: design.outline, holes: [], items, crew: design.crew ?? { x: 0, y: 0 }, tag: null },
      {
        position: { x: 0, y: 0 },
        angle: 0,
        material: design.material ?? 'wood',
        extraMass: itemsExtraMass(items),
      },
    );
    if (body) this.bodies.add(body);
    return body;
  }

  placeObstacle(spec) {
    const body = createObstacle(this.world, spec);
    if (body) this.obstacles.add(body);
    return body;
  }

  // ------------------------------------------------------------ 입력

  /**
   * 조작 안내판을 만든다. `hints` 가 꺼진 바다에서는 아무것도 하지 않는다.
   *
   * 어느 줄을 띄울지는 **배에 실제로 달린 것**으로 정한다 — `needs` 가 붙은 줄은 그
   * 아이템이 없으면 아예 만들지 않는다. 배가 만들어진 뒤에 불려야 하므로 `launch()`
   * 다음에 호출한다.
   */
  initHints() {
    const host = document.getElementById('sail-hints');
    const list = document.getElementById('sail-hints-list');
    this.hints = null;
    if (!host || !list || !this.stage.hints) return;

    const have = new Set();
    for (const body of this.bodies) {
      for (const it of body.getUserData()?.hull?.items ?? []) have.add(it.type);
    }

    const rows = SAIL_HINTS.filter((h) => !h.needs || have.has(h.needs));
    list.innerHTML = '';
    const els = new Map();
    for (const h of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="sail-hints-key"></span><span class="sail-hints-text"></span>`;
      li.querySelector('.sail-hints-key').textContent = h.keys;
      li.querySelector('.sail-hints-text').textContent = h.label;
      list.appendChild(li);
      els.set(h.id, li);
    }
    host.hidden = false;
    this.hints = { host, rows, els, done: new Set() };
  }

  /**
   * 매 프레임 입력을 보고 "해 본 것"에 불을 켠다.
   *
   * ⚠ 한 번 켜진 줄은 다시 끄지 않는다. 손을 뗄 때마다 꺼지면 깜빡이기만 하고
   *   "해 봤다"는 기록이 안 남는다.
   */
  updateHints() {
    const H = this.hints;
    if (!H || H.finished) return;
    for (const h of H.rows) {
      if (H.done.has(h.id)) continue;
      if (!h.did(this.heldStrokes, this.held)) continue;
      H.done.add(h.id);
      H.els.get(h.id).classList.add('on');
    }
    if (H.done.size < H.rows.length) return;
    // 다 해 봤다. 잠깐 두었다가 지운다 — 마지막 줄에 불이 들어오는 것을 보고 넘어가야 한다.
    H.finished = true;
    setTimeout(() => H.host.classList.add('done'), 900);
  }

  onKey(e, down) {
    if (STROKE_KEYMAP[e.key]) {
      e.preventDefault();
      if (down) {
        this.heldStrokes.add(e.key);
        this.tappedStrokes.add(e.key);
      } else {
        this.heldStrokes.delete(e.key);
      }
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (down) this.keys.add(e.key);
      else this.keys.delete(e.key);
      return;
    }
    if (TRIGGER_KEYS.has(e.code)) {
      if (down) this.held[e.code] = true;
      else delete this.held[e.code];
    }
  }

  applyControls(dt) {
    const strokes = [];
    for (const key of this.heldStrokes) strokes.push(...STROKE_KEYMAP[key]);
    for (const key of this.tappedStrokes) {
      if (!this.heldStrokes.has(key)) strokes.push(...STROKE_KEYMAP[key]);
    }
    this.tappedStrokes.clear();
    const input = { strokes, held: this.held, anchor: this.keys.has(' ') };
    for (const body of this.bodies) applyDevices(body, input, dt);
  }

  // ------------------------------------------------------------ 판정 · 카메라

  currentDistance() {
    return goalDistance(this.goal, crewWorldPoint(findCrewBody(this.bodies)));
  }

  checkGoal() {
    if (!this.goal || this.cleared) return;
    const at = crewWorldPoint(findCrewBody(this.bodies));
    if (!at || !goalReached(this.goal, at)) return;
    this.cleared = true;
    this.clearTime = this.simTime;
    this.heldStrokes.clear();
    this.tappedStrokes.clear();
    this.keys.clear();
    this.held = {};
    this.showClearResult(rateTravelTime(this.clearTime, this.map.scoring));
  }

  showClearResult(stars) {
    this.clearUi.stars.forEach((star, i) => star.classList.toggle('active', i < stars));
    this.clearUi.rating.textContent = `별 ${stars}개`;
    this.clearUi.time.textContent = formatClearTime(this.clearTime);

    // 다음 바다가 있으면 그리로, 없으면 잠근 채 이유를 적어 둔다.
    const next = hasNextStage();
    this.clearUi.next.disabled = !next;
    this.clearUi.nextNote.textContent = next
      ? '이어서 다음 바다로'
      : '다음 스테이지 준비 중';

    this.clearUi.overlay.classList.remove('hidden');
    // 이어서 갈 수 있으면 그쪽에 초점을 준다 — 키보드만 쓰는 사람에게 「다시하기」가
    // 기본이면 클리어할 때마다 같은 바다를 한 번 더 돌게 된다.
    (next ? this.clearUi.next : this.clearUi.retry).focus();
  }

  /**
   * 다음 바다로. **여기서 진행을 올리지 않는다** — 사이 대사(`interlude`)가 있으면
   * 그 대사를 재생하는 쪽(`menu/screen.js`)이 대사를 다 보여 준 뒤에 올린다.
   *
   * ⚠ 순서를 뒤집으면 안 된다. 여기서 먼저 올려 두면 플레이어가 섬 대사 도중에 새로고침
   *   했을 때 이야기를 못 본 채 다음 바다에 서 있게 된다. "대사를 봤다"와 "진행이 올랐다"가
   *   같은 사건이어야 한다.
   */
  toNextStage() {
    const beat = this.stage.interlude;
    // base 가 '/sea-of-the-pen/' 이라 절대경로는 배포에서 404 다 — 상대경로로만 옮긴다.
    location.href = beat ? `index.html?beat=${encodeURIComponent(beat)}` : 'sail.html';
  }

  updateCamera() {
    const primary = findCrewBody(this.bodies) ?? [...this.bodies][0];
    if (primary) this.view.follow(crewWorldPoint(primary) ?? primary.getPosition());
  }

  sampleWake() {
    const body = [...this.bodies][0];
    if (!body) return;
    const p = body.getPosition();
    this.wake.push({ x: p.x, y: p.y });
    if (this.wake.length > WAKE_MAX) this.wake.shift();
  }

  // ------------------------------------------------------------ 루프 · 렌더

  loop(now) {
    const elapsed = Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;
    this.stepper.advance(elapsed);
    // 이 화면은 파손을 연결하지 않는다 — 규칙 이벤트는 소비하지 않고 버린다(잔잔한 바다라
    // 실제로는 발생하지 않지만, 큐가 무한정 쌓이지 않도록 매 프레임 비워 둔다).
    this.engine.drain();
    this.updateHints();
    this.checkGoal();
    this.updateCamera();
    this.render();
    this.updateHud();
    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const { ctx } = this.view;
    const view = this.view;
    view.begin();
    ctx.imageSmoothingEnabled = false;

    // 반짝임의 시계는 물리 시각이다 — 벽시계로 두면 일시정지·프레임 드랍에서 물결만 따로 흐른다.
    drawWater(ctx, view, this.simTime);
    // 도착 지점은 수면 위 표식이라 배·암초보다 **아래**에 깐다 — 도착하는 순간 배가 고리를
    // 가리는 것이 맞다 (고리 위에 배가 올라앉아야 "들어갔다"로 읽힌다).
    drawGoal(ctx, view, this.goal, { cleared: this.cleared, sec: this.simTime });
    // 화면 밖 장애물을 거르는 것은 `drawObstacle` 안에서 한다 — 암초밭이 해역 전체를 덮어
    // 60개가 넘고, 그중 화면에 걸치는 것은 늘 몇 개뿐이다.
    for (const body of this.obstacles) drawObstacle(ctx, view, body.getUserData()?.obstacle?.spec);
    drawWake(ctx, this.wake);
    for (const body of this.bodies) {
      const p = body.getPosition();
      const angle = body.getAngle();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      drawHullBody(ctx, body.getUserData().hull);
      ctx.restore();
    }
    // 화면 밖일 때만 가장자리 화살표가 뜬다 — 판단은 `drawGoalCompass` 안에서 한다.
    drawGoalCompass(ctx, view, this.goal, crewWorldPoint(findCrewBody(this.bodies)), {
      cleared: this.cleared,
    });
  }

  updateHud() {
    // 도착하면 시계·거리 바를 그 순간 값에 고정한다 — 이후 배가 표류해도 숫자가 흔들리지 않는다.
    if (this.cleared && this._huddedAtClear) return;

    this.hud.clock.textContent = formatClock(this.clearTime ?? this.simTime);

    const remaining = this.cleared ? 0 : this.currentDistance();
    const frac = this.cleared || this.initialDistance <= 0
      ? Number(this.cleared)
      : clamp01(1 - remaining / this.initialDistance);
    this.hud.barFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.hud.distance.textContent = formatDistance(remaining);

    if (this.cleared) this._huddedAtClear = true;
  }
}

// 디버그 핸들 — 콘솔·자동화 테스트에서 물리 상태를 직접 들여다보기 위한 것 (main.js 와 같은 관례).
// 자동화 브라우저는 탭이 visibilityState:'hidden' 이라 rAF 가 0 프레임이므로, 그럴 땐
// `shipwright.loop(performance.now())` 를 손으로 반복 호출해 루프를 굴린다.
window.shipwright = new SailScreen();
