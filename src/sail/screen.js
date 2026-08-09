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
import { View } from '../render/view.js';
import { drawWater, drawRock, drawHullBody, drawWake } from './render.js';
import { DEMO_MAP } from './map.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const HANDOFF_KEY = 'shipwright:handoff';
/** 트리거로 쓰는 키 코드 — 부착 아이템(부스터·키)의 bind 풀. `main.js` 와 같은 집합. */
const TRIGGER_KEYS = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyQ', 'KeyE']);
/** 항적 표시 간격 — 이 스텝 수마다 한 점씩 남긴다. */
const WAKE_EVERY_STEPS = 4;
const WAKE_MAX = 16;

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

    this.stepper = new FixedStepper(this.world, {
      onPreStep: (dt) => {
        this.stepIndex += 1;
        this.simTime = this.stepIndex * FIXED_DT;
        this.applyControls(dt);
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
      banner: document.getElementById('hud-banner'),
    };

    window.addEventListener('resize', () => this.view.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));

    this.launch(loadHandoff() ?? fallbackDesign());
    for (const spec of DEMO_MAP.obstacles) this.placeObstacle(spec);
    this.goal = createGoal(DEMO_MAP.goal);
    this.initialDistance = this.currentDistance();

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
    this.hud.banner.classList.remove('hidden');
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

    drawWater(ctx, view);
    for (const body of this.obstacles) {
      const spec = body.getUserData()?.obstacle?.spec;
      if (spec?.shape === 'circle') drawRock(ctx, spec);
    }
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
  }

  updateHud() {
    // 도착하면 시계·거리 바를 그 순간 값에 고정한다 — 이후 배가 표류해도 숫자가 흔들리지 않는다.
    if (this.cleared && this._huddedAtClear) return;

    const mm = Math.floor(this.simTime / 60).toString().padStart(2, '0');
    const ss = Math.floor(this.simTime % 60).toString().padStart(2, '0');
    this.hud.clock.textContent = `${mm}:${ss}`;

    const remaining = this.cleared ? 0 : this.currentDistance();
    const frac = this.cleared || this.initialDistance <= 0
      ? Number(this.cleared)
      : clamp01(1 - remaining / this.initialDistance);
    this.hud.barFill.style.width = `${(frac * 100).toFixed(1)}%`;
    this.hud.distance.textContent = Number.isFinite(remaining)
      ? `${(remaining / 1000).toFixed(2)} km`
      : '-- km';

    if (this.cleared) this._huddedAtClear = true;
  }
}

// 디버그 핸들 — 콘솔·자동화 테스트에서 물리 상태를 직접 들여다보기 위한 것 (main.js 와 같은 관례).
// 자동화 브라우저는 탭이 visibilityState:'hidden' 이라 rAF 가 0 프레임이므로, 그럴 땐
// `shipwright.loop(performance.now())` 를 손으로 반복 호출해 루프를 굴린다.
window.shipwright = new SailScreen();
