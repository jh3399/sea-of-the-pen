// 항해 화면 — `draw.html` 에서 이어지는 플레이어용 진입점. 물리·조향·필드·규칙 엔진은
// `main.js` 하니스가 이미 가진 순수 모듈을 그대로 재사용하고(설계 원칙 3), 렌더링만 하니스의
// 벡터 그림 대신 픽셀 그래픽(`sail/render.js`)으로 새로 짠다.
//
// 암초·화재·포탄이 만드는 손상은 모두 같은 `applyImpact` 접촉 큐·파손 파이프라인을 탄다.
// 암초 자신은 `hull` 이 없는 정적 강체라 깎이지 않고, 플레이어·수동 표적·해적선 선체만
// 충격 에너지에 따라 폴리곤과 고정 픽셀 표면이 함께 재구성된다.
import './sail.css';
import { createWorld, FixedStepper, FIXED_DT, Vec2 } from '../physics/world.js';
import { applyHydroToWorld } from '../physics/hydro.js';
import { applyFieldsToWorld } from '../physics/fields.js';
import { createFields } from '../field/field.js';
import { toLocalVector } from '../field/forces.js';
import { createRuleEngine, loadRules } from '../rules/engine.js';
import RULE_TABLE from '../rules/table.json';
import { applyDevices, STROKE_KEYMAP } from '../physics/devices.js';
import { createHullBody } from '../physics/body.js';
import { createObstacle } from '../physics/obstacle.js';
import { defaultDevices } from '../items/defaults.js';
import { itemsExtraMass } from '../items/attach.js';
import { bindLabel } from '../items/catalog.js';
import { CANNON_TUNING } from '../items/cannon.js';
import { strokeToHull, HULL_DEFAULTS } from '../hull/polygon.js';
import { rasterizeHullSurface } from '../hull/raster.js';
import { CORPUS } from '../hull/corpus.js';
import { applyImpact } from '../damage/apply.js';
import { hottestOutlinePoint, nearestOutlinePoint, mostExposedPoint } from '../damage/hotspot.js';
import { burnRadius } from '../damage/impact.js';
import { installImpactListener } from '../damage/contact.js';
import { fieldBehind } from '../rules/provenance.js';
import { crewWorldPoint, findCrewBody } from '../game/crew.js';
import { createGoal, goalDistance, goalReached } from '../game/goal.js';
import { rateTravelTime } from '../game/scoring.js';
import { currentStage, hasNextStage, advanceStage, ROUTE, routeIndex } from '../game/progress.js';
import { initAudio, playBgm, sfx, setBgmVolume, setSfxVolume } from '../audio/audio.js';
import { drawVoyageMap } from '../scene/voyagemap.js';
import { createPassiveTargets } from '../game/targets.js';
import { createPirates, stepPirateMotion, stepPirateCannons, rebindPirate } from '../game/pirates.js';
import { createBoss, BOSS_TUNING } from '../game/boss.js';
import { spawnProjectile, cullProjectiles, installProjectileContacts } from '../damage/projectile.js';
import { polygonMoments, translate } from '../geom/poly.js';
import { View } from '../render/view.js';
import {
  drawWater, drawObstacle, drawHullBody, drawWake, drawGoal, drawGoalCompass, drawCombatEffects,
  drawWeather, drawDarkness,
} from './render.js';
import { createSpray, stepSpray, drawSpray } from './spray.js';
import { drawBoss, drawBeam } from './bossart.js';
import { MAPS, boundaryWalls } from './map.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const HANDOFF_KEY = 'shipwright:handoff';
/** 트리거로 쓰는 키 코드 — 부착 아이템(부스터·키)의 bind 풀. `main.js` 와 같은 집합. */
const TRIGGER_KEYS = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyQ', 'KeyE']);
/** 항적 표시 간격 — 이 스텝 수마다 한 점씩 남긴다. */
const WAKE_EVERY_STEPS = 4;
const WAKE_MAX = 16;
const SPARK_LIFE = 0.35;
const SPARK_MAX = 24;
/** 맵의 각도는 도(degree)로 적는다 — 손으로 쓰는 파일에 라디안을 적게 하지 않는다. */
const DEG = Math.PI / 180;

const MUTED_KEY = 'shipwright:muted';   // local — 메뉴와 같은 키를 쓴다 (취향은 화면을 넘어 남는다)
const BGM_VOL = 0.7;
const SFX_VOL = 0.9;

/**
 * 연습 해역의 조작 안내 — **읽는 목록이 아니라 해 보면 켜지는 판**이다.
 *
 * ★ 각 줄에 `did(strokes, held)` 가 붙어 있어서, 플레이어가 실제로 그 입력을 넣은 순간에만
 *   불이 들어온다. 설명을 읽히는 대신 **해 보게 만드는** 것이 이 프로젝트의 방식이고
 *   (맵도 골을 옆에 두어 돌게 만든다).
 *
 * ★ 순서가 곧 배우는 순서다. 「넓게 선회」가 마지막인 이유는 그것이 앞의 둘을 **겹쳐서**
 *   나오는 것이기 때문이다 — 상쇄 규칙에서 저절로 나오는 조작이라 아무도 안 알려준다
 *   (CLAUDE.md D3). 실측: 제자리 반경 2.5 m / 1.69 m/s vs 넓게 10.5 m / 3.67 m/s.
 *
 * ⚠ 다 해 봤다고 판이 **사라지지 않는다.** 한 번 해 봤다고 외운 것은 아니고, 급할 때 눈이
 *   가는 자리에 계속 있어야 한다. 켜진 줄과 안 켜진 줄의 대비만 남는다.
 * `info: true` 인 줄은 해 보고 켜는 것이 아니라 **처음부터 켜져 있는 안내**다 (창 여는 키).
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
  // `needs: 'gear'` 는 아이템이 아니라 **스테이지 권한**을 본다 — 해도를 받기 전에는
  // Tab 줄이 아예 없어야 한다 (없는 것을 누르라고 하면 안 된다).
  { id: 'gear', keys: 'Tab', label: '지도·장비', info: true, needsGear: true },
  { id: 'settings', keys: 'Esc', label: '설정', info: true },
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

    // 어느 바다인가는 progress.js 가 정하고, 맵은 id 로 한 번만 고른다.
    this.stage = currentStage();
    this.map = MAPS[this.stage.id];
    if (!this.map) throw new Error(`스테이지에 대응하는 맵이 없습니다: ${this.stage.id}`);
    // 고정 아레나는 추적하지 않고 줌을 창에 맞춘다. 그 밖의 바다는 지금까지 그대로 20 px/m.
    this.arena = this.map.camera?.mode === 'arena' ? this.map.camera : null;
    if (this.arena) this.applyArena();
    else this.view.ppm = PPM * 0.5;

    this.world = createWorld();
    this.rules = loadRules(RULE_TABLE);
    // 맵은 필드 데이터만 고르고, 힘·규칙·파손 경로는 모든 레벨이 똑같이 탄다.
    this.fields = createFields(this.map.fields ?? {});
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
    /** 보스 몸통 조각 — `boss.parts` 와 같은 Set 을 공유한다 (game/boss.js). */
    this.boss = null;
    /** 보스가 던진 난파선. 플레이어 조각과 섞이면 카메라·장비창이 헷갈리므로 따로 둔다. */
    this.wrecks = new Set();
    /**
     * 보스 전용 시계. `simTime` 과 나눠 두는 이유는 **창이 열려도 물리가 안 멈추기** 때문이다
     * (`panelOpen` 은 조종만 끊는다). 설정창은 절대 막을 수 없으니 여기서 시간을 멈춰
     * 탄막이 창 뒤에서 쌓이는 것을 막는다. 멈춘 채 `simTime` 을 넘기면 재개하는 순간
     * `turrets.js` 의 while 백스톱이 밀린 발사를 한 스텝에 쏟아 낸다.
     */
    this.bossClock = 0;
    this.wreckSeq = 0;
    this.failed = false;
    this.sinkCause = null;
    this.sparks = [];
    this.heldStrokes = new Set();
    this.tappedStrokes = new Set();
    this.held = {};
    this.pressed = {};
    this.keys = new Set();
    this.wake = [];
    /** 물보라 입자 — 항적(`wake`)이 지나온 자리라면 이쪽은 지금 튀는 물이다 (`sail/spray.js`). */
    this.spray = createSpray();
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
        // 보스도 같은 자리에서 움직인다 — 다만 누워 있으므로 경로조차 없고 상수에 못 박는다.
        this.stepBoss(dt);
        // 창이 열려 있으면 조종을 받지 않는다 — 지도를 보는 동안 배가 혼자 달리면 안 된다.
        if (!this.cleared && !this.panelOpen()) this.applyControls(dt);
        else this.pressed = {};
        applyHydroToWorld(this.world, dt);
        applyFieldsToWorld(this.world, this.fields, dt, this.simTime);
        this.engine.tick(this.world, dt, this.simTime);
        // 물보라도 항적과 같은 자리에서 — 이 스텝의 속도와 스트로크 세기를 그대로 읽는다.
        // 렌더 프레임에 두면 주사율에 따라 양이 달라진다 (추력을 렌더에 넣었을 때와 같은 함정).
        stepSpray(this.spray, this.sprayBodies(), this.simTime, this.stepIndex, dt);
        if (this.stepIndex % WAKE_EVERY_STEPS === 0) this.sampleWake();
      },
    });

    this.hud = {
      clock: document.getElementById('hud-clock'),
      barFill: document.getElementById('hud-bar-fill'),
      distance: document.getElementById('hud-distance'),
      equipment: document.getElementById('hud-equipment'),
      bossHp: document.getElementById('boss-hp'),
      bossBar: document.getElementById('boss-bar-fill'),
      bossPhase: document.getElementById('boss-phase'),
    };
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
    // ⚠ 메뉴로 나가는 두 출구(여기와 설정창의 `btn-quit`)는 **아무것도 지우지 않는다.**
    //   메뉴의 「계속하기」가 진짜 이어하기가 된 뒤로는, 지우는 쪽이 곧 이어갈 것을
    //   없애는 쪽이다. 처음부터 다시는 메뉴의 「이야기 다시 보기」 하나가 맡는다.
    //   ★ 두 출구가 같은 규칙이어야 한다 — 예전엔 여기가 설계만, 저기가 설계와 진행을
    //     지워서, 어느 문으로 나갔느냐에 따라 남는 것이 달랐다.
    this.clearUi.menu.addEventListener('click', () => {
      location.href = 'index.html';
    });
    this.clearUi.next.addEventListener('click', () => this.toNextStage());

    this.failUi = {
      overlay: document.getElementById('fail-overlay'),
      badge: document.getElementById('fail-badge'),
      time: document.getElementById('fail-time'),
    };
    // 클리어 화면의 두 출구와 **같은 규칙** — 아무것도 지우지 않는다.
    document.getElementById('btn-fail-retry')?.addEventListener('click', () => {
      location.href = 'sail.html';
    });
    document.getElementById('btn-fail-menu')?.addEventListener('click', () => {
      location.href = 'index.html';
    });

    // ⚠ `applyArena` 는 반드시 `resize()` **뒤에** 온다 — width/height 를 갱신하는 것이 resize 다.
    window.addEventListener('resize', () => {
      this.view.resize();
      if (this.arena) this.applyArena();
    });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    // ⚠ 창이 포커스를 잃으면 keyup 이 오지 않는다. Alt-Tab 을 트리거를 누른 채로 하면
    //   `held` 가 눌린 채 굳어 배가 혼자 젓고, 돌아와 다시 눌러도 `wasHeld` 가 이미 true 라
    //   대포가 안 나간다. 나갈 때 손을 떼게 만든다.
    window.addEventListener('blur', () => this.releaseInput());

    this.launch(loadHandoff() ?? fallbackDesign());
    for (const body of createPassiveTargets(this.world, this.map.targets ?? [])) this.targets.add(body);
    for (const p of createPirates(this.world, this.map.pirates ?? [])) this.pirates.set(p.body, p);
    if (this.map.boss) this.spawnBoss(this.map.boss);
    for (const spec of this.map.obstacles) this.placeObstacle(spec);
    // 해역 경계 — 벽도 그냥 암초다 (같은 `placeObstacle`, 같은 재질). 경계 전용 물리·판정
    // 코드가 0줄인 이유이고, 그래서 "여기서부터 못 간다"를 규칙이 아니라 지형이 말한다.
    for (const spec of boundaryWalls(this.map.bounds)) this.placeObstacle(spec);
    this.goal = createGoal(this.map.goal);
    this.initialDistance = this.currentDistance();
    // ⚠ 반드시 `launch()` **뒤에** 부른다 — 어느 줄을 띄울지는 배에 실제로 달린 것으로
    //   정하므로, 배가 없는 상태로 부르면 아이템 줄이 영영 안 나온다.
    this.initHints();
    this.initAudioUi();
    // 장비 목록도 배를 읽으므로 여기서. (설정창은 배와 무관하지만 같이 묶어 둔다)
    this.initPanels();

    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------ 카메라 · 출항

  /**
   * 고정 아레나 — 카메라를 못 박고 줌을 창에 맞춘다.
   *
   * `View` 는 `center`·`ppm` 이 그냥 필드라 밖에서 넣으면 되고, `begin()` 이 매 프레임 새로
   * 읽는다. 회전 금지 규칙(`render/view.js`)은 그대로 지킨다 — 끄는 것은 **추적**뿐이다.
   */
  applyArena() {
    const { at, fit } = this.arena;
    this.view.snapTo(at);
    this.view.ppm = Math.min(this.view.width / fit.w, this.view.height / fit.h);
  }

  /** 선체 로컬 폴리곤 + 손으로 붙인 아이템을 기본 장치 위에 얹어 강체로 만든다 (main.js#launch). */
  launch(design) {
    // oarX 는 그리기 화면에서 플레이어가 찍은 노의 세로 위치. 폴백 설계(fallbackDesign)에는
    // 없으므로 그때는 D1~D3 의 자동 배치(station)로 되돌아간다.
    const items = defaultDevices(design.outline, { oarX: design.oarX ?? null })
      .concat((design.items ?? []).map((it) => ({ ...it })));
    const holes = design.holes ?? [];
    const start = this.map.start ?? { x: 0, y: 0, angle: 0 };
    const body = createHullBody(
      this.world,
      {
        outline: design.outline,
        holes,
        items,
        crew: design.crew ?? { x: 0, y: 0 },
        surface: rasterizeHullSurface({ outline: design.outline, holes }),
        tag: null,
      },
      {
        // 출항 자세는 맵 데이터다. 없으면 지금까지의 원점·정동(正東) 그대로라 앞 네 바다는
        // 비트 단위로 동일하다. 탄막 아레나만 이걸 써서 배를 화면 아래에 세운다.
        position: { x: start.x, y: start.y },
        angle: (start.angle ?? 0) * DEG,
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

  // ------------------------------------------------------------ 보스

  /**
   * 보스를 띄운다. 몸통(핵)은 **깎이는 선체**라 플레이어 대포가 이미 있는 경로로 그대로
   * 파손시키고, 팔은 `createObstacle` 이 만드는 안 깎이는 암초다 — 보스 전용 물리도
   * 전용 파손도 없다 (`game/targets.js` 의 원칙).
   */
  spawnBoss(spec) {
    this.boss = createBoss(this.world, spec, this.fields, {
      onFall: () => this.onBossFall(),
      onPhase: () => this.cue('roar'),
      onSuck: () => this.cue('suck'),
      // ⚠ 상태가 **바뀌는 순간에만** 온다 (boss.js#setBeam). 매 프레임 부르면 스윕이
      //   겹쳐 쌓여 화이트노이즈가 된다.
      onBeam: (state) => this.cue(state.phase === 'telegraph' ? 'charge' : 'hit'),
    });
    for (const arm of spec.arms) this.placeObstacle(arm);
  }

  /** 보스 시계를 전진시키고 이번 스텝의 포탄을 낳는다. `onPreStep` 안이라 강체 생성이 안전하다. */
  stepBoss(dt) {
    const boss = this.boss;
    if (!boss) return;
    boss.pin();
    if (this.cleared || this.failed) return;
    // 창이 열려 있는 동안은 시계를 세운다 — 탄막이 창 뒤에서 쌓이면 안 된다.
    if (this.panelOpen()) return;
    this.bossClock += dt;
    for (const req of boss.step(this.bossClock)) {
      const shot = spawnProjectile(this.world, { ...req, bornAt: this.simTime });
      if (shot) this.projectiles.add(shot);
    }
    for (const req of boss.drainWrecks()) this.throwWreck(req);
  }

  /**
   * 난파선 한 조각 — 플레이어 배와 **완전히 같은** 선체다 (`createHullBody`). 그래서 유체
   * 저항·흡입·규칙 엔진·파손이 전부 공짜로 따라온다. 대신 주인공도 장치도 없다.
   *
   * ⚠ 폴리곤을 **먼저 무게중심으로 옮긴다.** `computeHullParams` 도 hydro 회전 클램프도
   *   `respawnPieces` 도 전부 무게중심이 로컬 원점이라고 가정한다.
   * ⚠ 속도를 14 m/s 로 묶는다. `createHullBody` 에는 CCD 옵션이 없고 동적↔동적 TOI 는 한쪽이
   *   bullet 이어야 도는데, 판자 두께가 1.4 m 라 0.23 m/step 이면 6배 여유가 남는다.
   */
  throwWreck(req) {
    if (this.wrecks.size >= req.max) return null;
    const m = polygonMoments(req.outline);
    const centred = translate(req.outline, -m.cx, -m.cy);
    const body = createHullBody(
      this.world,
      {
        outline: centred,
        holes: [],
        items: [],
        crew: null,
        surface: rasterizeHullSurface({ outline: centred, holes: [] }),
        role: 'wreck',
        entityId: `wreck-${this.wreckSeq++}`,
      },
      {
        position: { x: req.x, y: req.y },
        angle: req.angle,
        material: 'wood',
        extraMass: 0,
        role: 'wreck',
        entityId: `wreck-${this.wreckSeq}`,
      },
    );
    if (!body) return null;
    body.setLinearVelocity(new Vec2(Math.cos(req.angle) * req.speed, Math.sin(req.angle) * req.speed));
    body.setAngularVelocity((this.wreckSeq % 2 ? 1 : -1) * 0.6);
    this.wrecks.add(body);
    return body;
  }

  /** 흡입이 켜져 있으면 입 가까이 온 난파선을 삼킨다 — 판이 영영 어지러워지지 않게 하는 청소부. */
  swallowWrecks() {
    const boss = this.boss;
    if (!boss?.sucking) return;
    for (const body of [...this.wrecks]) {
      const p = body.getPosition();
      if (!boss.swallows(p)) continue;
      this.addSpark(p, 'hit', 0.6);
      this.world.destroyBody(body);
      this.wrecks.delete(body);
    }
  }

  /**
   * 보스가 쓰러졌다 — **죽은 것이 아니다** (不可殺伊). 공격을 그만두고 늘어질 뿐이고,
   * 벌어진 입이 그대로 도착 지점이 된다.
   */
  onBossFall() {
    this.goal = createGoal({ x: this.boss.coreAt.x, y: this.boss.coreAt.y, radius: 5, label: '정수' });
    // ★ 반드시 다시 잰다. 골이 없던 동안 `initialDistance` 가 Infinity 라, 안 고치면
    //   진행 바가 `clamp01(NaN)` 으로 굳어 골이 생겨도 복구되지 않는다.
    this.initialDistance = this.currentDistance();
    this.cue('win');
  }

  // ------------------------------------------------------------ 파손

  /** 이벤트가 이미 지목한 강체만 깎고, 재생성된 조각으로 Set 을 원자적으로 갈아 끼운다. */
  carveBody(target, worldPoint, radius) {
    if (!target || !this.bodies.has(target) || this.map.damage === false) return null;
    const outcome = applyImpact(this.world, target, worldPoint, radius);
    if (!outcome) return null;

    this.bodies.delete(target);
    for (const body of outcome.bodies) this.bodies.add(body);

    if (outcome.result.destroyed || outcome.result.crewLost) {
      this.heldStrokes.clear();
      this.tappedStrokes.clear();
      this.keys.clear();
      this.held = {};
      this.showFailResult(outcome.result.crewLost ? 'crewLost' : 'destroyed');
    }
    return outcome;
  }

  /** 연소 파괴 지점 — 규칙표가 가리킨 필드의 뜨거운 외곽, 없으면 직전 화점에서 번진다. */
  burnSpot(ev) {
    const hull = ev.target;
    const body = ev.body;
    const field = fieldBehind(this.rules, ev.ruleId);
    const local = (() => {
      if (field) {
        const hot = hottestOutlinePoint(
          hull.outline,
          (x, y) => body.getWorldPoint(new Vec2(x, y)),
          (x, y) => this.fields.sampleScalar(field, x, y, this.simTime),
        );
        if (hot && hot.spread > 1e-3) return hot.local;
      }
      return nearestOutlinePoint(hull.outline, hull.burnAt)
        ?? mostExposedPoint(hull.outline)
        ?? { x: 0, y: 0 };
    })();

    hull.burnAt = { x: local.x, y: local.y };
    const world = body.getWorldPoint(new Vec2(local.x, local.y));
    return { x: world.x, y: world.y };
  }

  consumeRuleEvents() {
    for (const ev of this.engine.drain()) {
      if (ev.type !== 'destroyed' || !this.bodies.has(ev.body)) continue;
      // 침몰 사유는 **깎기 전에** 잡는다 — 깎는 순간 실패 화면이 뜨므로 그 뒤에 적으면 늦다.
      // 어느 규칙이 죽였는지는 `ruleId` 가 들고 있다 (rules/engine.js).
      this.sinkCause = ev.ruleId === 'iron-melts-down' ? 'melted' : 'burned';
      const spot = this.burnSpot(ev);
      this.carveBody(ev.body, spot, burnRadius(ev.target.launchArea ?? ev.target.params.area));
    }
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

    const rows = SAIL_HINTS.filter((h) => (!h.needs || have.has(h.needs))
      && (!h.needsGear || this.stage.gear));
    list.innerHTML = '';
    const els = new Map();
    for (const h of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="sail-hints-key"></span><span class="sail-hints-text"></span>`;
      li.querySelector('.sail-hints-key').textContent = h.keys;
      li.querySelector('.sail-hints-text').textContent = h.label;
      if (h.info) li.classList.add('on');
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
      if (h.info || H.done.has(h.id)) continue;
      if (!h.did(this.heldStrokes, this.held)) continue;
      H.done.add(h.id);
      H.els.get(h.id).classList.add('on');
    }
    // ⚠ 다 해 봤다고 판을 **지우지 않는다.** 한 번 해 봤다고 외운 것은 아니고, 급할 때
    //   눈이 가는 자리에 계속 있어야 한다. 켜진 줄과 안 켜진 줄의 대비만 남는다.
    if (H.done.size >= H.rows.filter((h) => !h.info).length) H.finished = true;
  }

  // ---------------------------------------------------------- 소리 · 창

  /**
   * 항해 화면의 BGM.
   *
   * ⚠ 이 문서는 **제스처 없이 시작된다** (그리기 화면에서 넘어온다). AudioContext 가 잠겨
   *   있어서 로드 시점의 playBgm 은 그냥 버려지므로, 첫 입력에서 깨운다 — 메뉴 화면이
   *   막간 BGM 에 쓰는 것과 같은 수법이다.
   * 취향(음소거)은 `MUTED_KEY` 로 메뉴와 공유한다. 화면마다 따로 끄게 하면 안 된다.
   */
  initAudioUi() {
    this.muted = localStorage.getItem(MUTED_KEY) === '1';
    this.audioReady = false;
    const wake = () => {
      if (this.audioReady) return;
      this.audioReady = true;
      initAudio();
      this.applyVolumes();
      // 어느 곡인지는 **맵이 들고 있다** (`map.bgm`). 이 화면은 바다 이름을 모른다.
      playBgm(this.map.bgm ?? 'sail');
    };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
  }

  /**
   * 효과음 한 번. 오디오가 아직 안 깨어 있으면 조용히 흘린다 (첫 입력 전에는 AudioContext 가
   * 잠겨 있다 — `initAudioUi`). 부르는 쪽마다 `if (this.audioReady)` 를 쓰지 않기 위한 것.
   */
  cue(name) {
    if (this.audioReady) sfx(name);
  }

  applyVolumes() {
    setBgmVolume(this.muted ? 0 : BGM_VOL);
    setSfxVolume(this.muted ? 0 : SFX_VOL);
  }

  /** 장비·지도(Tab)와 설정(Esc). 둘 다 **항해를 멈추지 않는다** — 배는 계속 뜬다. */
  initPanels() {
    this.panels = {
      gear: document.getElementById('gear-overlay'),
      settings: document.getElementById('settings-overlay'),
      gearList: document.getElementById('gear-list'),
      map: document.getElementById('voyage-map'),
      sound: document.getElementById('btn-sound'),
    };
    this.mapCtx = this.panels.map?.getContext('2d') ?? null;

    document.getElementById('btn-gear-close')?.addEventListener('click', () => this.togglePanel('gear', false));
    document.getElementById('btn-settings-close')?.addEventListener('click', () => this.togglePanel('settings', false));
    // Esc 와 **같은 토글**을 부른다 — 아이콘을 두 번 눌러도 닫히고, 겹침 규칙(장비창이
    // 열려 있으면 닫는다)·입력 해제도 그대로 따라온다. 여는 전용 경로를 새로 만들면 안 된다.
    document.getElementById('btn-open-settings')?.addEventListener('click', () => this.togglePanel('settings'));
    this.panels.sound?.addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-redraw')?.addEventListener('click', () => {
      // 설계만 버리고 진행(`shipwright:stage`)은 남긴다 — 「다시 그리기」는 "이 바다를 다른
      // 배로"이지 "처음부터"가 아니다. 스테이지까지 지우면 여기까지 오며 열어 둔 아이템·재질이
      // 함께 잠겨(progress.js 의 `unlockedItems`) 연습 해역의 노 한 벌로 되돌아간다.
      sessionStorage.removeItem(HANDOFF_KEY);
      location.href = 'draw.html';
    });
    // 클리어 화면의 「메인 메뉴」와 **같은 규칙**이다 — 지우지 않는다. 위 주석 참조.
    document.getElementById('btn-quit')?.addEventListener('click', () => {
      location.href = 'index.html';
    });
    this.renderSoundBtn();
    this.renderGearList();
  }

  /** 장비창이든 설정창이든 하나라도 열려 있는가. */
  panelOpen() {
    return Boolean(this.panels
      && (!this.panels.gear.classList.contains('hidden')
        || !this.panels.settings.classList.contains('hidden')));
  }

  /** 지도는 열려 있을 때만 그린다 — 안 보이는 캔버스를 매 프레임 다시 그릴 이유가 없다. */
  drawMapIfOpen() {
    if (!this.mapCtx || this.panels.gear.classList.contains('hidden')) return;
    const c = this.panels.map;
    drawVoyageMap(this.mapCtx, {
      w: c.width, h: c.height, route: ROUTE, at: routeIndex(), sec: this.simTime,
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTED_KEY, this.muted ? '1' : '0');
    this.applyVolumes();
    this.renderSoundBtn();
    if (!this.muted && this.audioReady) sfx('click');
  }

  renderSoundBtn() {
    const b = this.panels?.sound;
    if (!b) return;
    b.textContent = this.muted ? '♪ 소리 꺼짐' : '♪ 소리 켜짐';
    b.setAttribute('aria-pressed', this.muted ? 'true' : 'false');
  }

  /** 배에 실제로 실린 것 — 기본 장치(노·닻)까지 전부 보여 준다. 지금 무엇을 탔는지가 답이다. */
  renderGearList() {
    const list = this.panels?.gearList;
    if (!list) return;
    const items = [];
    for (const body of this.bodies) {
      for (const it of body.getUserData()?.hull?.items ?? []) items.push(it);
    }
    list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'gear-empty';
      li.textContent = '아무것도 없다.';
      list.appendChild(li);
      return;
    }
    for (const it of items) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = it.side ? `${it.name} (${it.side === 'port' ? '좌현' : '우현'})` : it.name;
      const bind = document.createElement('span');
      bind.className = 'gear-bind';
      // 방향키로 젓는 노는 bind 가 없다 — 빈칸 대신 실제로 누르는 것을 적어 준다.
      bind.textContent = it.bind ?? (it.kind === 'oar' ? '↑ ← → ↓' : '—');
      li.append(name, bind);
      list.appendChild(li);
    }
  }

  togglePanel(which, on) {
    const el = this.panels?.[which];
    if (!el) return;
    const next = on ?? el.classList.contains('hidden');
    // 두 창을 겹쳐 띄우지 않는다 — 하나를 열면 다른 하나는 닫는다.
    if (next) {
      for (const other of ['gear', 'settings']) {
        if (other !== which) this.panels[other]?.classList.add('hidden');
      }
      if (which === 'gear') this.renderGearList();
    }
    el.classList.toggle('hidden', !next);
    // 창을 열면 누르고 있던 것을 놓는다. 안 그러면 Tab 을 누른 채로 창이 뜨고
    // 배는 계속 젓는다 (창 뒤에서 배가 혼자 달려가는 그 버그).
    if (next) {
      this.heldStrokes.clear();
      this.held = {};
      this.keys.clear();
    }
  }

  onKey(e, down) {
    // 창 여닫기는 눌릴 때 한 번만. Tab 은 기본 동작(포커스 이동)을 반드시 막아야 한다.
    if (down && (e.code === 'Tab' || e.code === 'Escape')) {
      e.preventDefault();
      // ⚠ 해도(Tab)는 시작의 섬에서 받는다. 설정(Esc)은 **항상** 열린다 — 게임을 끝낼
      //   방법이 없는 화면을 만들면 안 된다.
      if (e.code === 'Tab' && !this.stage.gear) return;
      this.togglePanel(e.code === 'Tab' ? 'gear' : 'settings');
      return;
    }
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
    this.showClearResult(rateTravelTime(this.clearTime, this.map.scoring));
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

    // ★ 마지막 바다를 깼으면 버튼이 **엔딩으로 가는 문**이 된다. 예전엔 여기서 그냥
    //   잠갔는데, 그러면 이야기를 끝까지 만들어 놓고 플레이어는 「모든 스테이지 완료」라는
    //   회색 버튼만 보게 된다 — 엔딩이 있는데 갈 길이 없는 상태였다.
    const next = hasNextStage();
    this.clearUi.next.disabled = false;
    this.clearUi.next.textContent = next ? '다음 스테이지' : '이야기의 끝으로';
    this.clearUi.nextNote.textContent = next
      ? '이어서 다음 바다로'
      : '마지막 바다를 건넜습니다';

    this.clearUi.overlay.classList.remove('hidden');
    // 도착 팡파르. `victory` 는 loop:false 라 한 번 울리고 끝난다.
    if (this.audioReady) playBgm('victory');
    // 이어서 갈 곳이 늘 있으므로 초점도 늘 그쪽이다 — 키보드만 쓰는 사람에게 「다시하기」가
    // 기본이면 클리어할 때마다 같은 바다를 한 번 더 돌게 된다.
    this.clearUi.next.focus();
  }

  /**
   * 침몰 — 지금까지 어느 바다에도 없던 상태다. 배가 부서지면 조종 불가능한 잔해로 영원히
   * 표류하는 것이 기존 거동이었다 (`CLAUDE.md` 의 ⚠ 남은 것 ②).
   *
   * 배지는 **왜 졌는지**를 한 줄로 말한다. 다시 그릴 때 무엇을 고쳐야 하는지가 여기서 나와야
   * 실패가 벌이 아니라 정보가 된다 — 이 게임의 실패는 언제나 설계로 되돌아가는 문이다.
   * 사유는 `consumeRuleEvents` 가 규칙 id 에서 미리 잡아 둔다 (`sinkCause`).
   *
   * ⚠ 래치가 필요하다. `carveBody`·`consumeImpacts` 양쪽에서 불릴 수 있고, 한 프레임에 조각이
   *   여러 번 깎이면 중복 호출된다.
   */
  showFailResult(reason) {
    if (this.failed || this.cleared) return;
    this.failed = true;
    const cause = this.sinkCause;
    const label = (() => {
      if (cause === 'melted') return '철이 녹아내렸다';
      if (cause === 'burned') return '불타 무너졌다';
      if (reason === 'crewLost') return '발밑이 잘려 나갔다';
      return '배가 부서졌다';
    })();
    if (this.failUi.badge) this.failUi.badge.textContent = label;
    if (this.failUi.time) this.failUi.time.textContent = formatClearTime(this.simTime);
    this.failUi.overlay?.classList.remove('hidden');
    document.getElementById('btn-fail-retry')?.focus();
    this.cue('lose');
  }

  /**
   * 다음 바다로. 사이 대사(`interlude`)가 있으면 메뉴가 대사를 다 보여 준 뒤 진행을 올리고,
   * 대사가 없으면 여기서 곧바로 올린다. 어느 쪽이든 한 사건에서 정확히 한 번만 전진한다.
   *
   * ⚠ 대사가 있는데 먼저 올리면 새로고침으로 이야기를 건너뛸 수 있다. "대사를 봤다"와
   * "진행이 올랐다"가 같은 사건이어야 한다.
   */
  toNextStage() {
    // base 가 '/sea-of-the-pen/' 이라 절대경로는 배포에서 404 다 — 상대경로로만 옮긴다.
    //
    // ★ **마지막 바다면 엔딩이다.** 진행을 올리지 않는다 — 올릴 다음이 없고, 올리면
    //   존재하지 않는 스테이지 인덱스가 남아 다음 실행이 빈 맵을 띄운다. 진행을 지우는
    //   것은 엔딩이 끝난 뒤 메뉴가 한다 (`playEnding`).
    if (!hasNextStage()) {
      location.href = 'index.html?ending=1';
      return;
    }
    const beat = this.stage.interlude;
    if (beat) {
      location.href = `index.html?beat=${encodeURIComponent(beat)}`;
      return;
    }
    advanceStage();
    location.href = 'sail.html';
  }

  updateCamera() {
    // 고정 아레나는 추적하지 않는다. 카메라는 생성자·resize 에서 이미 못 박혀 있다.
    if (this.arena) return;
    const player = findCrewBody(this.bodies);
    const at = crewWorldPoint(player);
    if (at) this.view.follow(at);
  }

  /**
   * 물보라를 뿌리는 강체 — 내 배의 조각들과 해적선. 물을 가르는 것은 전부 같은 규칙을 탄다.
   * (해적선도 `setLinearVelocity` 로 진짜 속도를 들고 다니므로 `spray.js` 가 구분하지 않는다.)
   */
  * sprayBodies() {
    yield* this.bodies;
    yield* this.pirates.keys();
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

  /** @returns {object|null} `applyImpact` 결과. 호출부는 지금까지처럼 진리값으로 써도 된다. */
  carveMember(set, body, at, radius) {
    if (!set.has(body) || this.map.damage === false) return null;
    const outcome = applyImpact(this.world, body, at, radius);
    if (!outcome) return null;
    set.delete(body);
    for (const next of outcome.bodies) set.add(next);
    return outcome;
  }

  /**
   * 해적선용 `carveMember` — `this.pirates` 는 Set 이 아니라 Map(body → 이동·발사 컨트롤러)
   * 이므로, 쪼개져 나온 조각마다 `rebindPirate` 로 컨트롤러를 옮겨 붙인다. 항로·발사 리듬은
   * `physics/body.js#respawnPieces` 가 모르는 화면 전용 상태라 여기서 직접 승계한다.
   */
  carvePirate(body, at, radius) {
    const ctrl = this.pirates.get(body);
    if (!ctrl || this.map.damage === false) return false;
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
      if (this.bodies.has(impact.body)) {
        // 주인공의 배만 실패 판정을 낸다 — 표적·해적·난파선은 부서져도 항해가 계속된다.
        const out = this.carveMember(this.bodies, impact.body, impact.at, impact.radius);
        // 내 배가 깎였다 — 네 바다 전부에서 이제 소리가 난다 (지금까지 미배선이었다).
        if (out) this.cue('damage');
        if (out?.result.destroyed || out?.result.crewLost) {
          this.releaseInput();
          this.showFailResult(out.result.crewLost ? 'crewLost' : 'destroyed');
        }
      } else if (this.targets.has(impact.body)) this.carveMember(this.targets, impact.body, impact.at, impact.radius);
      else if (this.pirates.has(impact.body)) this.carvePirate(impact.body, impact.at, impact.radius);
      else if (this.wrecks.has(impact.body)) this.carveMember(this.wrecks, impact.body, impact.at, impact.radius);
      else if (this.boss?.parts.has(impact.body)) this.carveBoss(impact.body, impact.at, impact.radius);
    }
  }

  /**
   * 보스 피격 — **깎는 것은 모두와 같은 `carveMember`** 이고, 다른 것은 그 결과를 보스에게
   * 알려 페이즈를 옮기는 한 줄뿐이다.
   *
   * ★ 입이 닫혀 있으면 **아예 깎지 않는다.** 몸만 깎고 진행을 막으면 "때렸는데 아무 일도
   *   없다"가 되어 플레이어가 무엇이 유효타인지 배울 수 없다. 흡입 직후의 취약 창이 유일한
   *   진행 수단이라는 규칙이 화면에서도 그대로 읽혀야 한다.
   */
  carveBoss(body, at, radius) {
    const boss = this.boss;
    if (!boss.open || boss.fallen) {
      // 튕겨 냈다는 표시만 남긴다 — 무반응이면 버그처럼 보인다.
      this.addSpark(at, 'glance', Math.max(radius, CANNON_TUNING.radius));
      return false;
    }
    if (!this.carveMember(boss.parts, body, at, radius)) return false;
    boss.takeHit();
    this.cue('hit');
    return true;
  }

  cullShots() {
    for (const dead of cullProjectiles(this.world, this.simTime, this.map.bounds)) {
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
    // 하니스와 같은 순서 — 규칙·충돌이 지목한 강체를 물리 스텝 밖에서 재생성한다. 포탄은
    // Impact 가 강체 참조를 들고 있으므로 반드시 충격 큐를 먼저 소비한 뒤 수명 컬링을 한다.
    this.consumeRuleEvents();
    this.consumeImpacts();
    this.cullShots();
    this.swallowWrecks();
    this.drawMapIfOpen();
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

    // 반짝임의 시계는 물리 시각이다 — 벽시계로 두면 일시정지·프레임 드랍에서 표면만 따로 흐른다.
    const surface = this.map.surface ?? null;
    // 흡입이 있는 바다는 **칸마다** 흐름을 묻는다 — 방사장을 카메라 중심 한 점으로 재면
    // 화면 전체가 한쪽으로 미끄러져 물이 어디로 가는지 거짓말을 한다 (`drawWater` 주석).
    const flowAt = surface?.flowField && this.boss
      ? (x, y) => this.fields.sampleVector(surface.flowField, x, y, this.simTime)
      : null;
    const flow = surface?.flowField && !flowAt
      ? this.fields.sampleVector(surface.flowField, view.center.x, view.center.y, this.simTime)
      : { x: 0, y: 0 };
    drawWater(ctx, view, this.simTime, { ...this.map.weather, surface, flow, flowAt });
    // 콜라이더가 없는 하반신 — 물 **위에** 그리고 그 위에 수몰 베일을 덮는다. 물이 맨 처음
    // 불투명하게 화면을 덮으므로(render.js) 물보다 먼저 그린 것은 어차피 지워진다.
    if (this.boss) drawBoss(ctx, view, this.boss, { sec: this.simTime, pass: 'deep', surface });
    // 도착 지점은 수면 위 표식이라 배·암초보다 **아래**에 깐다 — 도착하는 순간 배가 고리를
    // 가리는 것이 맞다 (고리 위에 배가 올라앉아야 "들어갔다"로 읽힌다).
    drawGoal(ctx, view, this.goal, { cleared: this.cleared, sec: this.simTime });
    // 화면 밖 장애물을 거르는 것은 `drawObstacle` 안에서 한다 — 암초밭이 해역 전체를 덮어
    // 60개가 넘고, 그중 화면에 걸치는 것은 늘 몇 개뿐이다.
    for (const body of this.obstacles) {
      const spec = body.getUserData()?.obstacle?.spec;
      // 보스의 팔은 암초가 아니다 — 회색 바위로 칠하고 톱니를 내면 안 된다. `bossart.js` 가
      // **createObstacle 에 넘긴 바로 그 점 목록**을 그린다.
      if (spec?.boss) continue;
      drawObstacle(ctx, view, spec, { shoal: surface?.shoal });
    }
    // 빔 — 수면 위, 배 아래. 경고선과 발사선이 같은 [from,to] 를 쓴다.
    if (this.boss) drawBeam(ctx, view, this.boss, { sec: this.simTime });
    drawWake(ctx, this.wake, { color: surface?.wake });
    for (const [set, target] of [
      [this.targets, true], [this.pirates.keys(), true], [this.wrecks, true], [this.bodies, false],
    ]) {
      for (const body of set) {
        const p = body.getPosition();
        const angle = body.getAngle();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        // 돛이 부푸는 정도는 §3 의 그 힘식과 같은 정렬도를 읽는다(`drawSail`) — 표적·해적·
        // 잔해는 돛을 달지 않으므로(`items:[]`) 이 계산은 플레이어 선체에만 하면 된다.
        const vLocal = target ? null : body.getLocalVector(body.getLinearVelocity());
        const sailInputs = target ? {} : {
          windLocal: toLocalVector(
            this.fields.sampleVector('wind', p.x, p.y, this.simTime), angle,
          ),
          vel: { u: vLocal.x, v: vLocal.y },
        };
        drawHullBody(ctx, body.getUserData().hull, { target, ...sailInputs });
        ctx.restore();
      }
    }
    // 물보라는 **배보다 위**다. 뱃머리와 노깃에서 나오는 물이라 선체 가장자리를 덮어야
    // "배가 물을 가른다"로 읽힌다 — 밑에 깔면 항적과 구분되지 않는 옅은 띠가 된다.
    drawSpray(ctx, this.spray, this.simTime, { surface });
    // ★ 보스의 콜라이더는 **배보다 위**다. 배가 팔을 덮으면 지나갈 수 있다고 읽히는데,
    //   물리적으로 겹칠 수 없으니 팔이 위에 있어도 잃는 것이 없고 불변식을 산다.
    if (this.boss) drawBoss(ctx, view, this.boss, { sec: this.simTime, pass: 'solid', surface });

    const crewAt = crewWorldPoint(findCrewBody(this.bodies)) ?? view.center;
    const wind = this.fields.sampleVector('wind', view.center.x, view.center.y, this.simTime);
    drawWeather(ctx, view, { sec: this.simTime, rain: this.map.weather?.rain ?? 0, wind });
    drawDarkness(ctx, view,
      this.fields.sampleScalar('darkness', crewAt.x, crewAt.y, this.simTime));
    drawCombatEffects(ctx, view, this.projectiles, this.sparks, this.simTime, SPARK_LIFE);

    // 화면 밖일 때만 가장자리 화살표가 뜬다 — 판단은 `drawGoalCompass` 안에서 한다.
    drawGoalCompass(ctx, view, this.goal, crewAt, { cleared: this.cleared });
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

  /**
   * 보스의 잔여 몸.
   *
   * ★ **HP 가 아니라 남은 선체 면적이다.** 대포가 실제로 깎아 낸 폴리곤 면적을 그대로
   *   읽으므로 새 상태가 하나도 없고, 화면에 보이는 형상 손실과 항상 같은 값을 말한다.
   *   §7.1 이 "배는 닳는 것이지 체력이 줄지 않는다"고 쓴 것과 어긋나지 않는 이유다 —
   *   닳는 것을 세는 계기판이지 별도 자원이 아니다.
   */
  updateBossHud() {
    const el = this.hud.bossHp;
    if (!el) return;
    if (!this.boss) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const boss = this.boss;
    boss.measure();
    // 쓰러지는 문턱(`fallAt`)을 0 으로 보이게 다시 스케일한다 — 바가 62% 에서 멈추면
    // 플레이어는 "아직 남았는데 왜 끝났지"로 읽는다. 눈금은 **싸움의 진행도**여야 한다.
    const span = 1 - BOSS_TUNING.fallAt;
    const left = clamp01(span > 0 ? (boss.health - BOSS_TUNING.fallAt) / span : 0);
    this.hud.bossBar.style.width = `${(left * 100).toFixed(1)}%`;
    this.hud.bossPhase.textContent = boss.fallen ? '쓰러졌다' : boss.phase.name;
  }

  updateHud() {
    this.updateEquipmentHud();
    this.updateBossHud();
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
