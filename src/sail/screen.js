// 항해 화면 — `draw.html` 에서 이어지는 플레이어용 진입점. 물리·조향·필드·규칙 엔진은
// `main.js` 하니스가 이미 가진 순수 모듈을 그대로 재사용하고(설계 원칙 3), 렌더링만 하니스의
// 벡터 그림 대신 픽셀 그래픽(`sail/render.js`)으로 새로 짠다.
//
// 암초·포탄 충격은 같은 접촉 큐와 파손 파이프라인을 탄다. 암초 자신은 `hull` 이 없는 정적
// 강체라 깎이지 않고, 플레이어와 수동 표적 선체만 충격 에너지에 따라 재구성된다.
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
import { bindLabel } from '../items/catalog.js';
import { CANNON_TUNING } from '../items/cannon.js';
import { strokeToHull, HULL_DEFAULTS } from '../hull/polygon.js';
import { CORPUS } from '../hull/corpus.js';
import { crewWorldPoint, findCrewBody } from '../game/crew.js';
import { createGoal, goalDistance, goalReached } from '../game/goal.js';
import { rateTravelTime } from '../game/scoring.js';
import { createPassiveTargets } from '../game/targets.js';
import { createPirates, stepPirateMotion, stepPirateCannons, rebindPirate } from '../game/pirates.js';
import { applyImpact } from '../damage/apply.js';
import { installImpactListener } from '../damage/contact.js';
import { spawnProjectile, cullProjectiles, installProjectileContacts } from '../damage/projectile.js';
import { View } from '../render/view.js';
import {
  drawWater, drawObstacle, drawHullBody, drawWake, drawGoal, drawGoalCompass, drawCombatEffects,
} from './render.js';
import { DEMO_MAP, boundaryWalls } from './map.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const HANDOFF_KEY = 'shipwright:handoff';
/** 트리거로 쓰는 키 코드 — 부착 아이템(부스터·키)의 bind 풀. `main.js` 와 같은 집합. */
const TRIGGER_KEYS = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyQ', 'KeyE']);
/** 항적 표시 간격 — 이 스텝 수마다 한 점씩 남긴다. */
const WAKE_EVERY_STEPS = 4;
const WAKE_MAX = 16;
const SPARK_LIFE = 0.35;
const SPARK_MAX = 24;

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
    // 잔잔한 바다 — 필드가 없어 화재·발화 규칙은 조건을 못 만족하지만, 접촉 충격과 포탄 피격은
    // 아래 공용 손상 파이프라인에서 그대로 처리한다.
    this.fields = createFields(ZONES.zones.calm.fields ?? {});
    this.engine = createRuleEngine(this.rules, this.fields);

    this.stepIndex = 0;
    this.simTime = 0;
    /** 플레이어 조각·수동 표적·포탄은 수명이 달라 각각의 Set 으로 추적한다. */
    this.bodies = new Set();
    this.targets = new Set();
    /** 해적선 컨트롤러 — body → { table, loop, speed, cannons } (game/pirates.js). */
    this.pirates = new Map();
    this.projectiles = new Set();
    this.obstacles = new Set();
    this.sparks = [];
    this.heldStrokes = new Set();
    this.tappedStrokes = new Set();
    this.held = {};
    this.pressed = {};
    this.keys = new Set();
    this.wake = [];
    this.cleared = false;
    this.clearTime = null;

    // world.on 은 누적 등록이므로 화면 수명 동안 딱 한 번만 설치한다.
    this.impacts = installImpactListener(this.world, { now: () => this.simTime });
    installProjectileContacts(this.world);

    this.stepper = new FixedStepper(this.world, {
      onPreStep: (dt) => {
        // 여러 물리 스텝이 한 렌더 프레임에 몰려도 직전 스텝의 도착 시각을 놓치지 않는다.
        this.checkGoal();
        this.stepIndex += 1;
        this.simTime = this.stepIndex * FIXED_DT;
        // 해적선은 조준·추적이 없다 — 항로 위 자리가 `now` 의 순수 함수로 정해진다. 대포가
        // 이번 스텝의 최신 포구 위치를 쓰도록 발사(applyControls)보다 먼저 옮겨 둔다.
        stepPirateMotion(this.pirates.values(), this.simTime);
        if (!this.cleared) this.applyControls(dt);
        else this.pressed = {};
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
      equipment: document.getElementById('hud-equipment'),
    };
    this.clearUi = {
      overlay: document.getElementById('clear-overlay'),
      stars: [...document.querySelectorAll('#clear-stars span')],
      rating: document.getElementById('clear-rating'),
      time: document.getElementById('clear-time'),
      retry: document.getElementById('btn-retry'),
      menu: document.getElementById('btn-clear-menu'),
    };
    this.clearUi.retry.addEventListener('click', () => {
      location.href = 'sail.html';
    });
    this.clearUi.menu.addEventListener('click', () => {
      sessionStorage.removeItem(HANDOFF_KEY);
      location.href = 'index.html';
    });

    window.addEventListener('resize', () => this.view.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    // ⚠ 창이 포커스를 잃으면 keyup 이 오지 않는다. Alt-Tab 을 트리거를 누른 채로 하면
    //   `held` 가 눌린 채 굳어 배가 혼자 젓고, 돌아와 다시 눌러도 `wasHeld` 가 이미 true 라
    //   대포가 안 나간다. 나갈 때 손을 떼게 만든다.
    window.addEventListener('blur', () => this.releaseInput());

    this.launch(loadHandoff() ?? fallbackDesign());
    for (const body of createPassiveTargets(this.world, DEMO_MAP.targets ?? [])) this.targets.add(body);
    for (const p of createPirates(this.world, DEMO_MAP.pirates ?? [])) this.pirates.set(p.body, p);
    for (const spec of DEMO_MAP.obstacles) this.placeObstacle(spec);
    // 해역 경계 — 벽도 그냥 암초다 (같은 `placeObstacle`, 같은 재질). 경계 전용 물리·판정
    // 코드가 0줄인 이유이고, 그래서 "여기서부터 못 간다"를 규칙이 아니라 지형이 말한다.
    for (const spec of boundaryWalls(DEMO_MAP.bounds)) this.placeObstacle(spec);
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
      {
        outline: design.outline, holes: [], items, crew: design.crew ?? { x: 0, y: 0 },
        role: 'player', entityId: 'player', tag: null,
      },
      {
        position: { x: 0, y: 0 },
        angle: 0,
        material: design.material ?? 'wood',
        extraMass: itemsExtraMass(items),
        role: 'player',
        entityId: 'player',
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
      e.preventDefault();
      if (down) {
        // 대포는 엣지 입력이다. OS key-repeat 는 새 발사로 세지 않고, 래치는 첫 고정 스텝에서
        // 한 번만 소비한다. 부스터 같은 홀드 장치는 같은 held 맵을 계속 본다.
        if (!e.repeat && !this.held[e.code]) this.pressed[e.code] = true;
        this.held[e.code] = true;
      } else {
        delete this.held[e.code];
      }
    }
  }

  applyControls(dt) {
    const strokes = [];
    for (const key of this.heldStrokes) strokes.push(...STROKE_KEYMAP[key]);
    for (const key of this.tappedStrokes) {
      if (!this.heldStrokes.has(key)) strokes.push(...STROKE_KEYMAP[key]);
    }
    this.tappedStrokes.clear();
    const input = {
      strokes,
      held: this.held,
      pressed: this.pressed,
      anchor: this.keys.has(' '),
      now: this.simTime,
    };
    // 선원 없는 조각용 — 입력은 비었지만 `now` 는 같다. 시계만 전진시키는 용도다.
    const IDLE_INPUT = { strokes: [], held: {}, pressed: {}, anchor: false, now: this.simTime };
    // ★ **새 입력을 받는 것은 주인공이 탄 조각뿐이지만, 장치 시계는 모든 조각이 돌린다.**
    //   둘을 하나로 묶으면 안 된다 — 주인공만 부르면 잘려 나간 조각의 진행 중이던 반동 봉투가
    //   `t` 가 멈춘 채 **영원히 그 세기로 굳고**, 재장전 시계도 서지 않아 다시 붙어도 못 쏜다.
    //   반대로 전부에 입력을 주면 선원 없는 잔해를 원격 발사하게 된다 (하니스의 세 척 비교는
    //   배마다 선원이 있으니 그쪽은 전부 넘기는 것이 맞다).
    const player = findCrewBody(this.bodies);
    for (const body of this.bodies) {
      const events = applyDevices(body, body === player ? input : IDLE_INPUT, dt);
      for (const event of events) {
        if (event.type !== 'cannonFire' || !event.request) continue;
        const shot = spawnProjectile(this.world, event.request);
        if (shot) this.projectiles.add(shot);
      }
    }
    // 물리 스텝 사이의 짧은 탭도 위에서 한 번 전달됐고, 홀드는 held 로 따로 남는다.
    this.pressed = {};

    // 해적 대포 — 입력원이 키보드가 아니라 시간표(game/pirates.js)일 뿐, 발사 자체는 플레이어와
    // 완전히 같은 applyDevices/spawnProjectile 경로를 탄다. 재장전 시계는 쏘지 않는 스텝에도
    // 전진해야 하므로 모든 해적을 매 스텝 돌린다.
    const pirateShots = stepPirateCannons(this.pirates.values(), this.simTime);
    for (const body of this.pirates.keys()) {
      const pirateInput = {
        strokes: [], held: {}, pressed: pirateShots.get(body) ?? {}, anchor: false, now: this.simTime,
      };
      const events = applyDevices(body, pirateInput, dt);
      for (const event of events) {
        if (event.type !== 'cannonFire' || !event.request) continue;
        const shot = spawnProjectile(this.world, event.request);
        if (shot) this.projectiles.add(shot);
      }
    }
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
    this.releaseInput();
    this.showClearResult(rateTravelTime(this.clearTime, DEMO_MAP.scoring));
  }

  /** 모든 입력을 놓은 것으로 친다 — 클리어와 포커스 상실이 같은 처리를 쓴다. */
  releaseInput() {
    this.heldStrokes.clear();
    this.tappedStrokes.clear();
    this.keys.clear();
    this.held = {};
    this.pressed = {};
  }

  showClearResult(stars) {
    this.clearUi.stars.forEach((star, i) => star.classList.toggle('active', i < stars));
    this.clearUi.rating.textContent = `별 ${stars}개`;
    this.clearUi.time.textContent = formatClearTime(this.clearTime);
    this.clearUi.overlay.classList.remove('hidden');
    this.clearUi.retry.focus();
  }

  updateCamera() {
    const player = findCrewBody(this.bodies);
    const at = crewWorldPoint(player);
    if (at) this.view.follow(at);
  }

  sampleWake() {
    const body = findCrewBody(this.bodies);
    if (!body) return;
    const p = body.getPosition();
    this.wake.push({ x: p.x, y: p.y });
    if (this.wake.length > WAKE_MAX) this.wake.shift();
  }

  // ------------------------------------------------------------ 충격 · 발사체

  addSpark(at, kind, radius = CANNON_TUNING.radius) {
    if (!at) return;
    this.sparks.push({ x: at.x, y: at.y, at: this.simTime, radius, kind });
    if (this.sparks.length > SPARK_MAX) this.sparks.splice(0, this.sparks.length - SPARK_MAX);
  }

  carveMember(set, body, at, radius) {
    if (!set.has(body)) return false;
    const outcome = applyImpact(this.world, body, at, radius);
    if (!outcome) return false;
    set.delete(body);
    for (const next of outcome.bodies) set.add(next);
    return true;
  }

  /**
   * 해적선용 `carveMember` — `this.pirates` 는 Set 이 아니라 Map(body → 이동·발사 컨트롤러)
   * 이므로, 쪼개져 나온 조각마다 `rebindPirate` 로 컨트롤러를 옮겨 붙인다. 항로·발사 리듬은
   * `physics/body.js#respawnPieces` 가 모르는 화면 전용 상태라 여기서 직접 승계한다.
   */
  carvePirate(body, at, radius) {
    const ctrl = this.pirates.get(body);
    if (!ctrl) return false;
    const outcome = applyImpact(this.world, body, at, radius);
    if (!outcome) return false;
    this.pirates.delete(body);
    for (const next of outcome.bodies) this.pirates.set(next, rebindPirate(ctrl, next));
    return true;
  }

  consumeImpacts() {
    for (const glance of this.impacts.drainGlances()) {
      this.addSpark(glance.at, 'glance', Math.max(glance.radius, CANNON_TUNING.radius));
    }

    for (const impact of this.impacts.drain()) {
      if (impact.projectile) impact.projectile.getUserData().projectile.spent = true;
      this.addSpark(impact.at, 'hit', impact.projectile?.getUserData()?.projectile?.radius);
      if (this.bodies.has(impact.body)) this.carveMember(this.bodies, impact.body, impact.at, impact.radius);
      else if (this.targets.has(impact.body)) this.carveMember(this.targets, impact.body, impact.at, impact.radius);
      else if (this.pirates.has(impact.body)) this.carvePirate(impact.body, impact.at, impact.radius);
    }
  }

  cullShots() {
    for (const dead of cullProjectiles(this.world, this.simTime, DEMO_MAP.bounds)) {
      this.projectiles.delete(dead);
      const shot = dead.getUserData()?.projectile;
      if (!shot?.spent) continue;
      const p = dead.getPosition();
      // 선체 명중·튕김은 큐 소비에서 정확한 접촉점 자국을 이미 남겼다. 근처 자국이 없을 때만
      // 암초 흡수 같은 일반 접촉 자국을 보충해 중복 섬광을 막는다.
      const marked = this.sparks.some((s) => this.simTime - s.at <= FIXED_DT * 2
        && Math.hypot(s.x - p.x, s.y - p.y) < 0.75);
      if (!marked) this.addSpark(p, 'hit', shot.radius);
    }
    this.sparks = this.sparks.filter((s) => this.simTime - s.at <= SPARK_LIFE);
  }

  // ------------------------------------------------------------ 루프 · 렌더

  loop(now) {
    const elapsed = Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;
    this.stepper.advance(elapsed);
    // 스텝 밖에서만 강체를 재구성한다. 포탄은 Impact 가 강체 참조를 들고 있으므로 반드시 큐를
    // 먼저 소비한 뒤 수명·접촉·경계 컬링을 한다.
    this.engine.drain();
    this.consumeImpacts();
    this.cullShots();
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
    for (const [set, target] of [[this.targets, true], [this.pirates.keys(), true], [this.bodies, false]]) {
      for (const body of set) {
        const p = body.getPosition();
        const angle = body.getAngle();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        drawHullBody(ctx, body.getUserData().hull, { target });
        ctx.restore();
      }
    }
    drawCombatEffects(ctx, view, this.projectiles, this.sparks, this.simTime, SPARK_LIFE);
    // 화면 밖일 때만 가장자리 화살표가 뜬다 — 판단은 `drawGoalCompass` 안에서 한다.
    drawGoalCompass(ctx, view, this.goal, crewWorldPoint(findCrewBody(this.bodies)), {
      cleared: this.cleared,
    });
  }

  updateEquipmentHud() {
    const hull = findCrewBody(this.bodies)?.getUserData()?.hull;
    const groups = new Map();
    for (const item of hull?.items ?? []) {
      if (item.type !== 'cannon' || !item.bind) continue;
      if (!groups.has(item.bind)) groups.set(item.bind, []);
      groups.get(item.bind).push(item);
    }

    if (groups.size === 0) {
      this.hud.equipment.replaceChildren();
      this.hud.equipment.classList.add('hidden');
      return;
    }

    const chips = [];
    for (const [bind, cannons] of groups) {
      let ready = 0;
      let wait = 0;
      for (const cannon of cannons) {
        const t = hull.control?.cannons?.[cannon.key]?.t ?? Infinity;
        if (t >= CANNON_TUNING.reload - 1e-9) ready += 1;
        else wait = Math.max(wait, CANNON_TUNING.reload - t);
      }
      const chip = document.createElement('span');
      chip.className = `hud-equipment-chip ${ready === cannons.length ? 'ready' : 'reloading'}`;
      const count = cannons.length > 1 ? ` ×${cannons.length}` : '';
      chip.textContent = ready === cannons.length
        ? `${bindLabel(bind)} 대포 준비${count}`
        : `${bindLabel(bind)} 재장전 ${wait.toFixed(1)}초${count}`;
      chips.push(chip);
    }
    this.hud.equipment.replaceChildren(...chips);
    this.hud.equipment.classList.remove('hidden');
  }

  updateHud() {
    this.updateEquipmentHud();
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
