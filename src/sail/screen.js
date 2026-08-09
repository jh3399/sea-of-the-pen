// 항해 화면 — `draw.html` 에서 이어지는 플레이어용 진입점. 물리·조향·필드·규칙 엔진은
// `main.js` 하니스가 이미 가진 순수 모듈을 그대로 재사용하고(설계 원칙 3), 렌더링만 하니스의
// 벡터 그림 대신 픽셀 그래픽(`sail/render.js`)으로 새로 짠다.
//
// 암초·화재가 만드는 손상도 하니스와 같은 `applyImpact` 한 경로를 탄다. 암초 자신은 `hull` 이
// 없는 정적 강체라 깎이지 않고, 맞은 선체의 폴리곤과 고정 픽셀 표면만 함께 줄어든다.
import './sail.css';
import { createWorld, FixedStepper, FIXED_DT, Vec2 } from '../physics/world.js';
import { applyHydroToWorld } from '../physics/hydro.js';
import { applyFieldsToWorld } from '../physics/fields.js';
import { createFields } from '../field/field.js';
import { createRuleEngine, loadRules } from '../rules/engine.js';
import RULE_TABLE from '../rules/table.json';
import { applyDevices, STROKE_KEYMAP } from '../physics/devices.js';
import { createHullBody } from '../physics/body.js';
import { createObstacle } from '../physics/obstacle.js';
import { defaultDevices } from '../items/defaults.js';
import { itemsExtraMass } from '../items/attach.js';
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
import { currentStage, hasNextStage, ROUTE, routeIndex } from '../game/progress.js';
import { initAudio, playBgm, sfx, setBgmVolume, setSfxVolume } from '../audio/audio.js';
import { drawVoyageMap } from '../scene/voyagemap.js';
import { View } from '../render/view.js';
import {
  drawWater, drawObstacle, drawHullBody, drawWake, drawGoal, drawGoalCompass,
  drawWeather, drawDarkness,
} from './render.js';
import { MAPS, boundaryWalls } from './map.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const HANDOFF_KEY = 'shipwright:handoff';
/** 트리거로 쓰는 키 코드 — 부착 아이템(부스터·키)의 bind 풀. `main.js` 와 같은 집합. */
const TRIGGER_KEYS = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyQ', 'KeyE']);
/** 항적 표시 간격 — 이 스텝 수마다 한 점씩 남긴다. */
const WAKE_EVERY_STEPS = 4;
const WAKE_MAX = 16;

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
    this.view.ppm = PPM * 0.5;

    // 어느 바다인가는 progress.js 가 정하고, 맵은 id 로 한 번만 고른다.
    this.stage = currentStage();
    this.map = MAPS[this.stage.id];
    if (!this.map) throw new Error(`스테이지에 대응하는 맵이 없습니다: ${this.stage.id}`);

    this.world = createWorld();
    this.rules = loadRules(RULE_TABLE);
    // 맵은 필드 데이터만 고르고, 힘·규칙·파손 경로는 모든 레벨이 똑같이 탄다.
    this.fields = createFields(this.map.fields ?? {});
    this.engine = createRuleEngine(this.rules, this.fields);

    this.stepIndex = 0;
    this.simTime = 0;
    this.impacts = installImpactListener(this.world, { now: () => this.simTime });
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
        // 창이 열려 있으면 조종을 받지 않는다 — 지도를 보는 동안 배가 혼자 달리면 안 된다.
        if (!this.cleared && !this.panelOpen()) this.applyControls(dt);
        applyHydroToWorld(this.world, dt);
        applyFieldsToWorld(this.world, this.fields, dt, this.simTime);
        this.engine.tick(this.world, dt, this.simTime);
        if (this.stepIndex % WAKE_EVERY_STEPS === 0) this.sampleWake();
      },
    });

    this.hud = {
      clock: document.getElementById('hud-clock'),
      barFill: document.getElementById('hud-bar-fill'),
      distance: document.getElementById('hud-distance'),
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
    //   정하므로, 배가 없는 상태로 부르면 아이템 줄이 영영 안 나온다.
    this.initHints();
    this.initAudioUi();
    // 장비 목록도 배를 읽으므로 여기서. (설정창은 배와 무관하지만 같이 묶어 둔다)
    this.initPanels();

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
    const holes = design.holes ?? [];
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
      const spot = this.burnSpot(ev);
      this.carveBody(ev.body, spot, burnRadius(ev.target.launchArea ?? ev.target.params.area));
    }
  }

  consumeImpacts() {
    // 현재 항해 HUD 에 튕김 문구는 없지만 큐 상한에 고이지 않도록 항상 비운다.
    this.impacts.drainGlances();
    for (const impact of this.impacts.drain()) {
      if (!this.bodies.has(impact.body)) continue;
      if (impact.projectile) impact.projectile.getUserData().projectile.spent = true;
      this.carveBody(impact.body, impact.at, impact.radius);
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
      : '모든 스테이지 완료';

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
    const primary = findCrewBody(this.bodies);
    if (primary) this.view.follow(crewWorldPoint(primary));
  }

  sampleWake() {
    const body = findCrewBody(this.bodies);
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
    // 하니스와 같은 순서 — 규칙·충돌이 지목한 강체를 물리 스텝 밖에서 재생성한다.
    this.consumeRuleEvents();
    this.consumeImpacts();
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

    // 반짝임의 시계는 물리 시각이다 — 벽시계로 두면 일시정지·프레임 드랍에서 물결만 따로 흐른다.
    drawWater(ctx, view, this.simTime, this.map.weather);
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

    const crewAt = crewWorldPoint(findCrewBody(this.bodies)) ?? view.center;
    const wind = this.fields.sampleVector('wind', view.center.x, view.center.y, this.simTime);
    drawWeather(ctx, view, { sec: this.simTime, rain: this.map.weather?.rain ?? 0, wind });
    drawDarkness(ctx, view,
      this.fields.sampleScalar('darkness', crewAt.x, crewAt.y, this.simTime));

    // 화면 밖일 때만 가장자리 화살표가 뜬다 — 판단은 `drawGoalCompass` 안에서 한다.
    drawGoalCompass(ctx, view, this.goal, crewAt, { cleared: this.cleared });
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
