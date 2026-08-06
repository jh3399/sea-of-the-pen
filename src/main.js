// D0/D1 하니스 — 설계 ↔ 항해 ↔ 파손을 한 화면에서 돌리며 계측한다.
//
// D0 은 "세 스파이크가 프레임 드랍 없이 도는가"를 물었고, D1 은 가설 A —
// **"배를 그리는 것 자체가 재미있는가"** 를 묻는다. 그래서 이 화면의 주역이 바뀌었다:
// 계측 HUD 옆에 **세 척 동시 주행**이 붙는다. 같은 입력을 세 척에 그대로 흘려보내고
// 조작감 차이가 눈에 보이면 가설 A 가 선다.
import './ui/harness.css';
import { createWorld, FixedStepper, Vec2 } from './physics/world.js';
import { applyHydroToWorld } from './physics/hydro.js';
import { applyFieldsToWorld } from './physics/fields.js';
import { createFields } from './field/field.js';
import { createRuleEngine, loadRules } from './rules/engine.js';
import ZONES from './field/zones.json';
import RULE_TABLE from './rules/table.json';
import {
  applyDevices, STROKE_KEYMAP, strokeProgress, strokeGate, estimateOarTerminal, DEVICE_TUNING,
} from './physics/devices.js';
import { predictPath } from './physics/predict.js';
import { createHullBody } from './physics/body.js';
import { defaultDevices, sideAnchors } from './items/defaults.js';
import { attachItem, nextBind, itemsExtraMass, canAttachAt } from './items/attach.js';
import { ITEM_CATALOG, ATTACHABLE, bindLabel } from './items/catalog.js';
import { strokeToHull, HULL_DEFAULTS } from './hull/polygon.js';
import { computeHullParams, MATERIALS } from './hull/params.js';
import { StrokeCapture } from './hull/strokes.js';
import { CORPUS, CORPUS_LABELS } from './hull/corpus.js';
import { applyImpact } from './damage/apply.js';
import { hottestOutlinePoint, nearestOutlinePoint, mostExposedPoint } from './damage/hotspot.js';
import { burnRadius } from './damage/impact.js';
import { fieldBehind } from './rules/provenance.js';
import { View, drawSeaGrid, tracePolygon, traceOpenPath, fillPolygonWithHoles } from './render/view.js';
import { Metrics } from './ui/metrics.js';
import { rotate, translate, bounds } from './geom/poly.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const IMPACT_RADIUS = 0.8;

/** 세 척 비교의 출연진. 같은 입력을 받고 형상만 다르다. */
const COMPARE_CAST = [
  { corpus: 'sloop', label: '길쭉한 배', color: '#f0c987' },
  { corpus: 'round', label: '둥근 배', color: '#8ce99a' },
  { corpus: 'lopsided', label: '비대칭 배', color: '#ff9f7f' },
];
/** 세 척을 세로로 벌려 놓는 간격 (m). */
const COMPARE_SPACING = 14;
/** 설계 중 실시간 오버레이 갱신 간격 (입력 점 수). 2000점 낙서가 17ms 라 매 프레임은 위험하다. */
const LIVE_PREVIEW_EVERY = 15;
/** 흘수 게이지의 만수위 기준 (m). 나무 단일 재질이면 0.30 m 근처가 정상이다. */
const DRAFT_GAUGE_MAX = 1.0;
/** 트리거로 쓰는 키 코드 — 부스터 바인딩 풀(A~H)과 키 조타(Q/E). T·C 는 하니스 단축키다. */
const TRIGGER_KEYS = new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyQ', 'KeyE']);
/**
 * ★ 노 튜닝 슬라이더 (§5.2 "밸런싱 중 항상 정답이 나오면 약점을 추가한다").
 *
 * DEVICE_TUNING 을 직접 쓴다. 예측 궤적선도 벤치도 같은 객체를 읽으므로, 슬라이더를 돌리면
 * 물리·예측·계측이 한꺼번에 따라온다 — 튜닝을 한 곳에 모아 둔 것의 배당금이다.
 *
 * "젓는 속도"는 봉투 길이가 아니라 **회/s** 로 노출한다. 쿨다운이 0 인 지금은 최대 케이던스가
 * 곧 1/봉투길이라, 플레이어가 실제로 조절하고 싶은 양은 이쪽이다.
 */
const OAR_SLIDERS = [
  {
    key: 'rate', label: '젓는 속도', unit: '회/s', min: 1, max: 6, step: 0.1,
    note: '빠를수록 짧고 촘촘하게 젓는다',
    get: () => 1 / strokeGate(),
    set: (v) => {
      DEVICE_TUNING.oarStrokeDuration = Math.max(0.08, 1 / v - DEVICE_TUNING.oarStrokeCooldown);
    },
    fmt: (v) => v.toFixed(2),
  },
  {
    key: 'peak', label: '젓는 힘', unit: 'N/m²', min: 100, max: 1600, step: 25,
    note: '갑판 면적당 피크 추력 — 저속 가속을 지배한다',
    get: () => DEVICE_TUNING.oarStrokePeak,
    set: (v) => { DEVICE_TUNING.oarStrokePeak = v; },
    fmt: (v) => v.toFixed(0),
  },
  {
    key: 'max', label: '한계 속도', unit: 'm/s', min: 2, max: 12, step: 0.2,
    note: '노깃의 스트로크 속도 — 여기 닿으면 추력이 0',
    get: () => DEVICE_TUNING.oarMaxSpeed,
    set: (v) => { DEVICE_TUNING.oarMaxSpeed = v; },
    fmt: (v) => v.toFixed(1),
  },
];

/** 부착 시 고를 수 있는 방향 (§4.1 의 "방향"). 라디안, +X = 뱃머리. */
const ATTACH_ANGLES = [
  { label: '앞으로 ↑', value: 0 },
  { label: '뒤로 ↓', value: Math.PI },
  { label: '좌현 ←', value: Math.PI / 2 },
  { label: '우현 →', value: -Math.PI / 2 },
];

/** 스트레스 테스트용 결정론적 난수 — 매 실행 같은 지점을 깎아야 수치를 비교할 수 있다. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

class Harness {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.view = new View(this.canvas);
    this.metrics = new Metrics(document.getElementById('metrics'));

    this.world = createWorld();
    // 추력도 저항과 같이 **물리 스텝마다** 넣어야 한다. 렌더 프레임마다 넣으면 한 프레임이
    // 2스텝을 돌 때 둘째 스텝은 힘이 0이 되고(planck 은 스텝 후 힘 누산기를 비운다), 반대로
    // 스텝이 안 도는 프레임에서는 힘이 중복 누적된다. 조향이 전부 힘에서 나오는 게임이라
    // 이게 틀리면 D1·D2 의 모든 조종감이 화면 주사율에 따라 달라진다.
    // 규칙표는 **로드 시점에** 검증한다. 오타 하나로 규칙이 조용히 사라지면 밸런싱 중에
    // 그것을 물리 버그로 착각하게 된다.
    this.rules = loadRules(RULE_TABLE);
    this.material = 'wood';
    this.setZone('calm');

    this.stepper = new FixedStepper(this.world, {
      onPreStep: (dt) => {
        this.applyControls(dt);
        applyHydroToWorld(this.world, dt);
        applyFieldsToWorld(this.world, this.fields, dt);
        this.engine.tick(this.world, dt);
      },
    });

    this.mode = 'design';
    this.stroke = [];
    this.design = null;
    this.bodies = new Set();
    this.keys = new Set();
    /**
     * ★ 노 입력은 **홀드**다. 누르고 있는 동안 매 물리 스텝 젓기를 요청하고, 회수가 끝나
     * 게이트가 열리는 순간 `startStroke` 가 받아 준다 — 리듬을 맞추지 않아도 최대 케이던스가
     * 저절로 나온다. 힘 모델은 그대로라 봉투·활공·타이밍 감쇠는 전부 살아 있다.
     *
     * 탭도 그대로 된다: 짧게 누르면 게이트가 한 번만 열려 한 번만 젓는다. 즉 홀드 방식은
     * 엣지 방식의 상위 집합이라 두 조작을 다 지원한다.
     */
    this.heldStrokes = new Set();
    /**
     * 마지막 물리 스텝 이후 눌린 적이 있는 키. 물리 스텝 사이(<16ms)에 눌렀다 뗀 아주 짧은
     * 탭이 통째로 사라지는 것을 막는다 — 홀드 Set 만 보면 그 입력은 존재한 적이 없게 된다.
     */
    this.tappedStrokes = new Set();
    /** 눌려 있는 트리거 바인딩 {KeyA: true, …} — 부스터·키가 읽는다 (§4.3). */
    this.held = {};
    /** 설계 단계에서 손으로 붙인 아이템들 (선체 로컬 좌표). launch() 가 기본 장치에 더한다. */
    this.attached = [];
    /** 부착 모드에서 선택된 카탈로그 타입. null 이면 그리기 모드. */
    this.attachType = null;
    this.attachAngle = 0;
    this.compare = false;
    this.showTrajectory = true;
    this.stress = { remaining: 0, rng: null, samples: [] };
    this.lastFrame = performance.now();
    this.status = '선체를 그리세요 — 폐곡선 하나면 됩니다.';

    this.capture = new StrokeCapture(this.canvas, {
      onStart: () => {
        if (this.mode !== 'design') return;
        this.stroke = [];
        this.design = null;
        this.liveMark = 0;
      },
      onUpdate: (pts) => {
        if (this.mode !== 'design') return;
        this.stroke = pts;
        // 그리는 도중에도 오버레이(G · 저항 타원 · 흘수)를 갱신한다 — §2.3 이 요구하는
        // "그리면서 보는" 피드백. 매 프레임 변환은 낙서에서 17ms 를 먹으므로 점 수로 throttle.
        if (pts.length - this.liveMark >= LIVE_PREVIEW_EVERY) {
          this.liveMark = pts.length;
          this.buildFromStroke(pts, { live: true });
        }
      },
      onComplete: (pts) => {
        if (this.mode === 'design') this.buildFromStroke(pts);
      },
    });

    this.bindUI();
    window.addEventListener('resize', () => this.view.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'sail') this.strikeAt(e);
      else if (this.attachType) this.attachAt(e);
    });

    this.enterDesign();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------- UI

  bindUI() {
    const select = document.getElementById('corpus');
    for (const [key, label] of Object.entries(CORPUS_LABELS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    }

    // 아이템 부착 (§4.1) — 종류와 방향을 고르고 선체를 클릭하면 그 자리에 붙는다.
    const itemSel = document.getElementById('item-type');
    for (const type of ATTACHABLE) {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = `${ITEM_CATALOG[type].name} (${ITEM_CATALOG[type].mass}kg)`;
      itemSel.appendChild(opt);
    }
    const angleSel = document.getElementById('item-angle');
    for (const a of ATTACH_ANGLES) {
      const opt = document.createElement('option');
      opt.value = String(a.value);
      opt.textContent = a.label;
      angleSel.appendChild(opt);
    }
    document.getElementById('btn-attach').onclick = () => this.toggleAttach(itemSel.value);
    angleSel.onchange = () => { this.attachAngle = Number(angleSel.value); };
    itemSel.onchange = () => {
      if (this.attachType) this.toggleAttach(itemSel.value, true);
    };
    document.getElementById('btn-detach').onclick = () => this.clearAttached();

    this.bindTuner();

    // 환경 존 (§6.1) · 선체 재질 (§3) — 둘 다 데이터 선택일 뿐이다.
    const zoneSel = document.getElementById('zone');
    for (const [key, zone] of Object.entries(ZONES.zones)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = zone.label;
      zoneSel.appendChild(opt);
    }
    zoneSel.onchange = () => {
      this.setZone(zoneSel.value);
      this.setStatus(`${this.zone.label} — ${this.zone.hint}`, 'ok');
    };
    const matSel = document.getElementById('material');
    for (const key of ['wood', 'iron']) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = MATERIALS[key].name;
      matSel.appendChild(opt);
    }
    matSel.onchange = () => {
      this.material = matSel.value;
      this._previewFor = null;
      this.renderParams(this.previewCache(), this.design);
    };

    document.getElementById('btn-load').onclick = () => this.loadCorpus(select.value);
    document.getElementById('btn-reset').onclick = () => this.enterDesign();
    document.getElementById('btn-sail').onclick = () => this.enterSail();
    document.getElementById('btn-compare').onclick = () => this.enterCompare();
    document.getElementById('btn-stress').onclick = () => this.startStress();
    document.getElementById('btn-clear-worst').onclick = () => this.metrics.resetWorst();
  }

  /** 노 튜닝 슬라이더를 세운다. 값은 DEVICE_TUNING 에 바로 쓴다 — 다음 물리 스텝부터 반영. */
  bindTuner() {
    // 기본값은 처음 한 번만 떠 둔다. 슬라이더가 원본을 덮어쓰기 전에 잡아야 한다.
    this.tunerDefaults = OAR_SLIDERS.map((s) => s.get());

    const host = document.getElementById('tuner-rows');
    this.tunerInputs = OAR_SLIDERS.map((spec, i) => {
      const row = document.createElement('div');
      row.className = 't-row';
      row.innerHTML = `<div class="t-head"><span>${spec.label}</span>` +
        `<b id="tuner-v-${spec.key}"></b></div>` +
        `<div class="t-note">${spec.note}</div>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(this.tunerDefaults[i]);
      input.oninput = () => {
        spec.set(Number(input.value));
        this.refreshTuner();
      };
      row.appendChild(input);
      host.appendChild(row);
      return input;
    });

    document.getElementById('btn-tuner-reset').onclick = () => {
      OAR_SLIDERS.forEach((spec, i) => spec.set(this.tunerDefaults[i]));
      this.syncTunerInputs();
      this.refreshTuner();
      this.setStatus('노 튜닝을 기본값으로 되돌렸습니다.', '');
    };

    this.syncTunerInputs();
    this.refreshTuner();
  }

  /** 슬라이더 손잡이를 현재 DEVICE_TUNING 값에 맞춘다 (리셋·외부 변경 후). */
  syncTunerInputs() {
    OAR_SLIDERS.forEach((spec, i) => { this.tunerInputs[i].value = String(spec.get()); });
  }

  /**
   * 숫자 표시 갱신. **예상 종단 속도를 같이 띄우는 게 핵심**이다 — 60초 몰아보지 않고도
   * "이 설정이면 얼마나 빠른가"를 알 수 있어야 노브를 감으로 돌릴 수 있다.
   */
  refreshTuner() {
    for (const spec of OAR_SLIDERS) {
      document.getElementById(`tuner-v-${spec.key}`).textContent =
        `${spec.fmt(spec.get())} ${spec.unit}`;
    }
    document.getElementById('tuner-cadence').textContent =
      `${(1 / strokeGate()).toFixed(2)} 회/s (봉투 ${DEVICE_TUNING.oarStrokeDuration.toFixed(2)}s)`;

    const params = [...this.bodies][0]?.getUserData().hull.params ?? this.previewCache();
    const v = params ? estimateOarTerminal(params) : 0;
    document.getElementById('tuner-terminal').textContent = params
      ? `${v.toFixed(2)} m/s` : '선체 없음';

    // 패널의 "종단 N m/s 이하" 문구도 같은 값을 봐야 한다.
    if (this.design || this.bodies.size) this.renderParamsFromCurrent();
  }

  /** 지금 화면이 무엇이든 그에 맞는 파라미터로 패널을 다시 그린다. */
  renderParamsFromCurrent() {
    if (this.compare) return; // 비교 표는 자기 주기로 갱신된다
    if (this.mode === 'sail') this.renderParamsFromBodies();
    else this.renderParams(this.previewCache(), this.design);
  }

  onKey(e, down) {
    if (STROKE_KEYMAP[e.key]) {
      e.preventDefault(); // 방향키는 스크롤을 유발한다
      // 홀드 Set 이라 OS 자동 반복(e.repeat)은 그냥 무해하다 — 같은 키를 다시 넣을 뿐이다.
      // 케이던스는 키보드 반복 속도가 아니라 `strokeGate()` 가 정한다.
      if (down) {
        if (this.mode !== 'sail') return;
        this.heldStrokes.add(e.key);
        this.tappedStrokes.add(e.key);
      } else {
        this.heldStrokes.delete(e.key);
      }
      return;
    }
    if (e.key === ' ') {
      e.preventDefault(); // Space 는 버튼 재활성화를 유발한다
      if (down) this.keys.add(e.key);
      else this.keys.delete(e.key);
      return;
    }
    // 트리거 바인딩(§4.3) — 홀드다. 부스터는 누르는 동안 켜지고 키는 누르는 동안 꺾인다.
    if (TRIGGER_KEYS.has(e.code)) {
      if (down) this.held[e.code] = true;
      else delete this.held[e.code];
      return;
    }
    if (!down) return;
    const k = e.key.toLowerCase();
    if (k === 't') {
      this.showTrajectory = !this.showTrajectory;
      this.setStatus(`예측 궤적선 ${this.showTrajectory ? '켬' : '끔'} — 실제 경로와 겹치는지 보세요.`, 'ok');
    } else if (k === 'c') {
      this.enterCompare();
    }
  }

  setStatus(text, tone = '') {
    this.status = text;
    const el = document.getElementById('status');
    el.textContent = text;
    el.className = `status ${tone}`;
  }

  // ------------------------------------------------------- 스파이크 ①

  loadCorpus(key) {
    this.enterDesign();
    const pts = CORPUS[key](this.view.width / 2, this.view.height / 2);
    this.stroke = pts;
    this.buildFromStroke(pts);
  }

  /** @param {{live?: boolean}} options live 는 그리는 도중의 미리보기 — 확정 문구를 쓰지 않는다. */
  buildFromStroke(points, options = {}) {
    const result = strokeToHull(points, { pixelsPerMeter: PPM });
    if (!options.live) this.metrics.push('hull', result.diagnostics.ms);
    this.design = result;

    if (!result.ok) {
      // 미리보기 단계에서는 "아직 면적이 안 나왔다" 정도라 실패를 붉게 띄우지 않는다.
      if (options.live) this.setStatus('그리는 중…', '');
      else this.setStatus(`변환 실패 — ${result.message} (${result.reason})`, 'bad');
      document.getElementById('btn-sail').disabled = true;
      this.renderParams(null, options.live ? null : result);
      return;
    }

    const warn = result.warnings.length ? ` · 경고: ${result.warnings.join(', ')}` : '';
    // §2.3 — 자기교차는 그리는 즉시 알려야 손이 아직 움직이는 동안 고칠 수 있다.
    this.setStatus(options.live
      ? `그리는 중 — 면적 ${result.diagnostics.area.toFixed(1)} m²${warn}`
      : `선체 확정 — 정점 ${result.diagnostics.verts}개${warn}`, warn ? 'warn' : 'ok');
    document.getElementById('btn-sail').disabled = false;
    this.renderParams(this.previewCache(), result);
    this.refreshTuner();
  }

  // ------------------------------------------------------- 필드 · 규칙 (§6)

  /**
   * 테스트 존 전환. **맵을 바꾸는 코드는 이 세 줄이 전부다** — 필드 정의(JSON)를 갈아 끼우고
   * 규칙 엔진을 그 위에 새로 세운다. 존마다 다른 처리는 없고, 있을 수도 없다 (원칙 1).
   */
  setZone(key) {
    const zone = ZONES.zones[key] ?? ZONES.zones.calm;
    this.zoneKey = key;
    this.zone = zone;
    this.fields = createFields(zone.fields ?? {});
    this.engine = createRuleEngine(this.rules, this.fields);
    for (const body of this.bodies ?? []) {
      const hull = body.getUserData().hull;
      hull.status = {};
      for (const it of hull.items) it.status = {};
    }
  }

  /**
   * 규칙 엔진이 낸 이벤트를 **스텝 밖에서** 소비한다. 스텝 도중에 강체를 부수면 planck 의
   * 내부 순회가 깨지고, 파라미터 재계산은 어차피 이벤트 시점에만 해야 한다.
   */
  consumeRuleEvents() {
    for (const ev of this.engine.drain()) {
      if (ev.type === 'destroyed') {
        // 연소 파괴는 **가장 뜨거운 외곽선 위**를 도려낸다 — D3 의 carve 입력이 이 경로다.
        this.metrics.note('규칙 이벤트', `${ev.target.params.material.name} 연소 파괴`);
        const spot = this.burnSpot(ev);
        // 반경은 **출항 면적** 기준이다 (현재 면적이면 지수 감쇠라 배가 영영 안 죽는다).
        this.carveBody(ev.body, spot.world, burnRadius(ev.target.launchArea ?? ev.target.params.area));
        this.setStatus(`${ev.target.params.material.name} 선체의 ${spot.where}이(가) 타서 ` +
          `무너졌습니다 — ${this.zone.label}의 온도와 재질만으로. 맵에는 코드가 없습니다.`, 'bad');
      } else if (ev.type === 'itemLost') {
        this.setStatus(`${ev.item.name}(${ev.item.material})이(가) 불타 사라졌습니다 — ` +
          `장치 상실이 곧 창발 이벤트입니다 (§5.2 원칙 3).`, 'warn');
        this.renderParamsFromBodies();
      } else if (ev.type === 'state') {
        this.metrics.note('규칙 이벤트', `${ev.ruleId} → ${ev.state}`);
      }
    }
  }

  /**
   * 연소 파괴가 **어디를** 도려낼 것인가 (§7.3.1).
   *
   * 무게중심을 깎으면 clipper 결과가 구멍이 되어 outline 이 그대로 남고, 저항 타원도
   * 무게중심도 안 움직인다 — "어느 쪽이 탔는가"라는 정보를 통째로 버리는 셈이라 원칙 3
   * 위반이다. 열원 쪽 외곽선을 깎으면 배가 저절로 편향하고, 그 편향이 곧 피해 표시다.
   *
   * 필드 이름은 **규칙표에서** 온다 (`fieldBehind`). 여기에 'temperature' 를 쓰면
   * 규칙표 밖에 규칙이 하나 생긴다.
   */
  burnSpot(ev) {
    const hull = ev.target;
    const body = ev.body;
    const field = fieldBehind(this.rules, ev.ruleId);

    const local = (() => {
      if (field) {
        const hot = hottestOutlinePoint(
          hull.outline,
          (x, y) => body.getWorldPoint(new Vec2(x, y)),
          (x, y) => this.fields.sampleScalar(field, x, y),
        );
        // 구배가 없으면 어느 쪽이 더 탔는지 말할 근거가 없다 — 폴백으로 넘어간다.
        if (hot && hot.spread > 1e-3) return hot.local;
      }
      // 균일한 지대에서는 직전 화점에서 번진다. "가장 먼 점"을 반복하면 배가 원이 된다.
      return nearestOutlinePoint(hull.outline, hull.burnAt)
        ?? mostExposedPoint(hull.outline)
        ?? { x: 0, y: 0 };
    })();

    // 다음 사이클이 여기서 이어 붙는다. 조각으로 쪼개져도 승계된다 (body.js).
    hull.burnAt = { x: local.x, y: local.y };
    const w = body.getWorldPoint(new Vec2(local.x, local.y));
    return { world: { x: w.x, y: w.y }, where: sideName(local) };
  }

  // ------------------------------------------------------- 아이템 부착 (§4.1)

  /**
   * 부착 모드 토글. 켜져 있는 동안은 그리기를 멈추고 캔버스 클릭이 부착이 된다.
   * 별도의 모드를 만들지 않는 이유는 설계와 부착이 §4.3 이 말하는 **같은 한 작업**이기
   * 때문이다 — "언제 무엇을 작동시킬지까지가 설계의 일부".
   */
  toggleAttach(type, force = false) {
    if (!this.design?.ok) {
      this.setStatus('선체를 먼저 확정하세요 — 아이템은 선체 로컬에 붙습니다.', 'warn');
      return;
    }
    this.attachType = (!force && this.attachType === type) ? null : type;
    this.capture.enabled = !this.attachType;
    document.getElementById('btn-attach').classList.toggle('primary', !!this.attachType);
    this.setStatus(this.attachType
      ? `부착 모드 — ${ITEM_CATALOG[this.attachType].name} 을(를) 놓을 자리를 선체 위에서 클릭하세요.`
      : '부착 모드 해제 — 다시 그릴 수 있습니다.', this.attachType ? 'ok' : '');
    this.renderParams(this.previewCache(), this.design);
  }

  /** 캔버스 클릭 지점을 선체 로컬 좌표로 되돌려 아이템을 붙인다. */
  attachAt(event) {
    if (!this.design?.ok) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = this.view.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);

    // 설계 화면은 선체를 원래 그린 자리(origin, angle)에 되돌려 그린다 — 그 변환의 역.
    const dx = w.x - this.design.origin.x;
    const dy = w.y - this.design.origin.y;
    const c = Math.cos(-this.design.angle);
    const s = Math.sin(-this.design.angle);
    const local = { x: dx * c - dy * s, y: dx * s + dy * c };

    // ★ 선체 밖에는 못 붙인다. §7.5 소속 폴리곤 판정이 "아이템은 선체 안에 있다"를 전제해서,
    //   밖에 붙은 것은 첫 파손에 그대로 탈락한다 (그 전까지는 팔길이만 늘어난 치트가 된다).
    if (!canAttachAt(this.design.outline, this.design.holes, local)) {
      this.setStatus('선체 안을 클릭하세요 — 밖에 붙은 아이템은 첫 파손에 떨어져 나갑니다 (§7.5).',
        'warn');
      return;
    }

    const hull = { items: this.attached };
    const item = attachItem(hull, this.attachType, {
      x: local.x, y: local.y, angle: this.attachAngle,
      bind: ITEM_CATALOG[this.attachType].bind === null ? null : nextBind(this.attached),
    });
    if (!item) return;

    this._previewFor = null; // 흘수·관성이 바뀐다 — 미리보기 캐시 무효화
    this.setStatus(`${item.name} 부착 — (${item.x.toFixed(2)}, ${item.y.toFixed(2)}) · ` +
      `트리거 ${bindLabel(item.bind)} · 무게중심에서 팔길이 ${Math.hypot(item.x, item.y).toFixed(2)} m`, 'ok');
    this.renderParams(this.previewCache(), this.design);
  }

  clearAttached() {
    this.attached = [];
    this._previewFor = null;
    this.setStatus('부착 아이템을 모두 떼었습니다.', '');
    this.renderParams(this.previewCache(), this.design);
  }

  // ------------------------------------------------------- 모드 전환

  enterDesign() {
    this.clearBodies();
    this.stroke = [];
    this.design = null;
    this.mode = 'design';
    this.compare = false;
    this.liveMark = 0;
    this.stress.remaining = 0;
    this.attached = [];
    this.attachType = null;
    this._previewFor = null;
    document.getElementById('btn-attach').classList.remove('primary');
    this.capture.enabled = true;
    this.capture.clear();
    this.view.ppm = PPM;
    this.view.snapTo({ x: this.view.width / 2 / PPM, y: -this.view.height / 2 / PPM });
    document.getElementById('btn-sail').disabled = true;
    document.body.dataset.mode = 'design';
    this.setStatus('선체를 그리세요 — 폐곡선 하나면 됩니다. (또는 코퍼스 불러오기 / C = 세 척 비교)');
    this.renderParams(null, null);
  }

  clearBodies() {
    for (const body of this.bodies) this.world.destroyBody(body);
    this.bodies.clear();
    // 모드를 옮기는 순간이다. 누르고 있던 키를 남겨 두면 새 배가 태어나자마자 저절로 젓는다.
    this.heldStrokes.clear();
    this.tappedStrokes.clear();
  }

  /** 선체 로컬 폴리곤 하나를 기본 장치 + 부착 아이템을 얹은 강체로 만든다. */
  launch(outline, placement = {}) {
    // ★ 여기가 §5.1 "선체 확정 시 자동 장착". 장치 질량은 extraMass 로 흘수에 반영된다.
    // 손으로 붙인 아이템(§4.1)은 같은 배열에 그대로 얹힌다 — 기본 장치와 아무 차이가 없다.
    const items = defaultDevices(outline)
      .concat((placement.attached ?? []).map((it) => ({ ...it })));
    const body = createHullBody(
      this.world,
      { outline, holes: [], items, tag: placement.tag ?? null },
      {
        position: placement.position ?? { x: 0, y: 0 },
        angle: placement.angle ?? 0,
        material: placement.material ?? this.material ?? 'wood',
        extraMass: itemsExtraMass(items),
      },
    );
    if (body) this.bodies.add(body);
    return body;
  }

  enterSail() {
    if (!this.design?.ok) return;

    // 정규화된 선체를 원점에 세운다. 뱃머리가 +X 를 향한다.
    this.clearBodies();
    const body = this.launch(this.design.outline, { attached: this.attached });
    if (!body) {
      this.setStatus('강체 생성 실패 — 분해 결과가 비었습니다.', 'bad');
      return;
    }

    this.initialItemCount = body.getUserData().hull.items.length;
    this.compare = false;
    this.mode = 'sail';
    this.capture.enabled = false;
    this.view.ppm = PPM * 0.7;
    this.view.snapTo({ x: 0, y: 0 });
    document.body.dataset.mode = 'sail';
    this.setStatus('↑ 꾹 눌러 젓기 · ← → 한쪽 노만(선회) · ↓ 역젓기 · Space 닻 · ' +
      'T 궤적선 · 선체 클릭 = 그 지점 차감', 'ok');
    this.renderParams(body.getUserData().hull.params, this.design);
    this.refreshTuner(); // 예상 종단은 선체 저항에 달렸다 — 배가 바뀌면 다시 잰다
  }

  /**
   * ★ 가설 A 판정 장치 — 세 척을 나란히 띄우고 **같은 입력**을 흘려보낸다.
   * 조작감 차이를 말로 설명할 수 있으면 D1 통과다.
   */
  enterCompare() {
    this.clearBodies();
    const spawned = [];
    for (const [i, cast] of COMPARE_CAST.entries()) {
      const result = strokeToHull(CORPUS[cast.corpus](0, 0), { pixelsPerMeter: PPM });
      if (!result.ok) continue;
      const body = this.launch(result.outline, {
        position: { x: 0, y: (1 - i) * COMPARE_SPACING },
        tag: { label: cast.label, color: cast.color },
      });
      if (body) spawned.push(body);
    }

    if (spawned.length === 0) {
      this.setStatus('비교 선체 생성 실패.', 'bad');
      return;
    }

    this.design = null;
    this.initialItemCount = spawned.reduce((s, b) => s + b.getUserData().hull.items.length, 0);
    this.compare = true;
    this.mode = 'sail';
    this.capture.enabled = false;
    // 설계 화면의 카메라(캔버스 좌상단 기준)에서 곧장 fitTo 로 넘어가면 첫 1초가 흔들린다.
    this.view.snapTo({ x: 0, y: 0 });
    this.view.ppm = PPM * 0.4;
    document.body.dataset.mode = 'sail';
    this.setStatus(`세 척 동시 주행 — 같은 입력, 다른 형상. ↑ 를 꾹 눌러 가속 차이를, ` +
      `그다음 ← 로 선회 반경 차를 보세요.`, 'ok');
    this.refreshTuner();
  }

  // ------------------------------------------------------- 장치 · 저항

  applyControls(dt) {
    // 눌려 있는 키 + 이번 스텝 사이에 스쳐 간 탭 → 이번 스텝의 젓기 요청.
    // 매 스텝 요청해도 회수가 안 끝난 노는 `startStroke` 가 거절하므로, 홀드가 곧
    // "게이트가 열릴 때마다 자동으로 한 번 더"가 된다.
    const strokes = [];
    for (const key of this.heldStrokes) strokes.push(...STROKE_KEYMAP[key]);
    for (const key of this.tappedStrokes) {
      if (!this.heldStrokes.has(key)) strokes.push(...STROKE_KEYMAP[key]);
    }
    this.tappedStrokes.clear();

    // 요청 배열은 세 척이 **공유**한다. 수락/거절은 배마다 따로 판단하므로, 비교 주행에서
    // 무거운 배만 젓기를 놓치는 일은 생기지 않는다.
    const input = { strokes, held: this.held, anchor: this.keys.has(' ') };
    for (const body of this.bodies) applyDevices(body, input, dt);
  }

  // ------------------------------------------------------- 스파이크 ②

  strikeAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.view.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    this.carve(world, IMPACT_RADIUS);
  }

  /**
   * 마우스 클릭 파손 — 어느 강체를 맞혔는지 **추정**해야 하는 유일한 경로다.
   * 규칙·충돌·피탄은 강체를 직접 알려주므로 `carveBody` 를 바로 부른다.
   */
  carve(worldPoint, radius) {
    const target = this.bodyNear(worldPoint);
    if (target) this.carveBody(target, worldPoint, radius);
  }

  /**
   * 지목된 강체를 깎는다.
   *
   * ★ `bodyNear` 를 다시 타면 안 된다. 조각이 겹쳐 있을 때 **엉뚱한 조각**이 잡히고,
   *   호출자(규칙 엔진·접촉 리스너)는 이미 정확한 강체를 손에 쥐고 있다.
   */
  carveBody(target, worldPoint, radius) {
    if (!target || !this.bodies.has(target)) return;

    const outcome = applyImpact(this.world, target, worldPoint, radius);
    if (!outcome) return;

    this.metrics.push('carve', outcome.result.ms + (outcome.result.rebuildMs ?? 0));
    this.bodies.delete(target);
    for (const body of outcome.bodies) this.bodies.add(body);

    if (outcome.result.destroyed) {
      this.setStatus('선체 전손 — 남은 조각이 없습니다.', 'bad');
    } else if (outcome.result.split) {
      this.setStatus(`절단! ${outcome.result.pieces.length}조각으로 분리 — 각각 독립 강체입니다.`, 'ok');
    }
    this.metrics.note('강체/조각', `${this.bodies.size}개 · 탈락 아이템 ${this.droppedItemCount()}`);
    this.renderParamsFromBodies();
  }

  bodyNear(worldPoint) {
    let best = null;
    let bestDist = Infinity;
    for (const body of this.bodies) {
      const local = body.getLocalPoint(new Vec2(worldPoint.x, worldPoint.y));
      const bb = bounds(body.getUserData().hull.outline);
      // bbox 를 조금 넓혀 스치는 타격도 허용 — 빗맞으면 carve 가 형상 변화 0으로 되돌린다.
      const pad = IMPACT_RADIUS;
      if (local.x < bb.minX - pad || local.x > bb.maxX + pad) continue;
      if (local.y < bb.minY - pad || local.y > bb.maxY + pad) continue;
      const d = Math.hypot(local.x, local.y);
      if (d < bestDist) {
        bestDist = d;
        best = body;
      }
    }
    return best;
  }

  droppedItemCount() {
    let alive = 0;
    for (const body of this.bodies) alive += body.getUserData().hull.items.length;
    return Math.max(0, (this.initialItemCount ?? 0) - alive);
  }

  startStress() {
    if (this.mode !== 'sail' || this.bodies.size === 0) {
      this.setStatus('스트레스 테스트는 출항 후에 실행하세요.', 'warn');
      return;
    }
    this.stress = { remaining: 20, rng: lcg(20260805), samples: [] };
    this.metrics.resetWorst();
    this.setStatus('연속 차감 20회 진행 중…', 'warn');
  }

  stepStress() {
    if (this.stress.remaining <= 0 || this.bodies.size === 0) return;
    const bodies = [...this.bodies];
    const body = bodies[Math.floor(this.stress.rng() * bodies.length)];
    const outline = body.getUserData().hull.outline;
    const vertex = outline[Math.floor(this.stress.rng() * outline.length)];
    const worldPoint = body.getWorldPoint(new Vec2(vertex.x, vertex.y));

    const before = performance.now();
    this.carve({ x: worldPoint.x, y: worldPoint.y }, 0.45);
    this.stress.samples.push(performance.now() - before);

    this.stress.remaining--;
    if (this.stress.remaining === 0) {
      const s = this.stress.samples;
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      const max = Math.max(...s);
      this.setStatus(
        `연속 차감 20회 완료 — 평균 ${avg.toFixed(2)}ms / 최대 ${max.toFixed(2)}ms · 남은 조각 ${this.bodies.size}`,
        max <= 8 ? 'ok' : 'warn',
      );
    }
  }

  // ---------------------------------------------------------------- 루프

  loop(now) {
    const frameStart = performance.now();
    this.metrics.beat(now);
    const elapsed = Math.min((now - this.lastFrame) / 1000, 0.25);
    this.lastFrame = now;

    if (this.mode === 'sail') {
      const { ms } = this.stepper.advance(elapsed);
      this.metrics.push('physics', ms);
      this.consumeRuleEvents();
      this.stepStress();
      this.updateCamera();
      // 패널은 계측 HUD 와 같은 이유로 초당 몇 번이면 충분하다 — 매 프레임 innerHTML 을
      // 새로 쓰면 비교 화면이 재려는 그 프레임 예산을 패널이 갉아먹는다.
      if (this.compare && now - (this._lastTable ?? 0) > 150) {
        this._lastTable = now;
        this.renderCompareTable();
      }
    }

    this.render();
    this.metrics.push('frame', performance.now() - frameStart);
    this.metrics.render(now);
    requestAnimationFrame((t) => this.loop(t));
  }

  /** 비교 모드는 세 척을 모두 담도록 줌만 조절하고, 단독 항해는 그 배를 추적한다. */
  updateCamera() {
    if (this.bodies.size === 0) return;
    if (!this.compare) {
      const primary = [...this.bodies][0];
      if (primary) this.view.follow(primary.getPosition());
      return;
    }
    const points = [];
    for (const body of this.bodies) {
      const c = body.getWorldCenter();
      const r = body.getUserData().hull.params.length * 0.6;
      points.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    }
    this.view.fitTo(points, { padding: 120 });
  }

  render() {
    const { ctx, view } = { ctx: this.view.ctx, view: this.view };
    view.begin();
    drawSeaGrid(ctx, view);
    this.drawFields(ctx, view);

    if (this.mode === 'design') this.renderDesign(ctx, view);
    else this.renderSail(ctx, view);
  }

  /**
   * 환경 필드 오버레이 (§6.1). 필드는 눈에 보이지 않으면 배울 수가 없다 — 왜 배가 밀리는지,
   * 어디가 뜨거운지가 보여야 플레이어가 규칙표를 추론할 수 있다.
   *
   * 화면에 보이는 영역만 격자로 샘플한다. 존마다 다른 그리기 코드는 없다 — 같은 샘플러를
   * 같은 방식으로 훑을 뿐이라, 새 필드 정의를 넣어도 이 함수는 그대로다.
   */
  drawFields(ctx, view) {
    if (this.fields.isEmpty) return;
    const min = view.screenToWorld(0, view.height);
    const max = view.screenToWorld(view.width, 0);
    const stepM = Math.max(4, Math.round((max.x - min.x) / 26));

    for (let x = Math.floor(min.x / stepM) * stepM; x <= max.x; x += stepM) {
      for (let y = Math.floor(min.y / stepM) * stepM; y <= max.y; y += stepM) {
        // 스칼라장 — 온도는 붉게, 습기는 푸르게.
        const temp = this.fields.sampleScalar('temperature', x, y);
        const wet = this.fields.sampleScalar('moisture', x, y);
        if (temp > 25) {
          ctx.fillStyle = `rgba(255, 90, 50, ${Math.min((temp - 20) / 500, 0.35)})`;
          ctx.fillRect(x - stepM / 2, y - stepM / 2, stepM, stepM);
        }
        if (wet > 0.02) {
          ctx.fillStyle = `rgba(90, 180, 255, ${Math.min(wet * 0.3, 0.3)})`;
          ctx.fillRect(x - stepM / 2, y - stepM / 2, stepM, stepM);
        }

        // 벡터장 — 바람 화살표.
        const wind = this.fields.sampleVector('wind', x, y);
        const mag = Math.hypot(wind.x, wind.y);
        if (mag < 0.05) continue;
        const len = Math.min(mag * 0.22, stepM * 0.42);
        const ux = wind.x / mag;
        const uy = wind.y / mag;
        ctx.strokeStyle = 'rgba(200, 230, 255, 0.35)';
        ctx.lineWidth = view.px(1.2);
        ctx.beginPath();
        ctx.moveTo(x - ux * len, y - uy * len);
        ctx.lineTo(x + ux * len, y + uy * len);
        ctx.lineTo(x + ux * len - (ux + uy) * len * 0.35, y + uy * len - (uy - ux) * len * 0.35);
        ctx.stroke();
      }
    }
  }

  renderDesign(ctx, view) {
    // 원본 스트로크 (px → m, Y 뒤집기: polygon.js 와 같은 변환)
    if (this.stroke.length > 1) {
      const metric = this.stroke.map((p) => ({ x: p.x / PPM, y: -p.y / PPM }));
      ctx.lineWidth = view.px(2);
      ctx.strokeStyle = 'rgba(245, 230, 200, 0.5)';
      traceOpenPath(ctx, metric);
      ctx.stroke();
    }

    if (!this.design?.ok) return;

    // 변환 결과를 원래 그린 자리에 되돌려 겹쳐 그린다 — 스파이크 ①의 육안 검증.
    const world = translate(rotate(this.design.outline, this.design.angle),
      this.design.origin.x, this.design.origin.y);

    fillPolygonWithHoles(ctx, world, [], 'rgba(168, 118, 62, 0.35)');
    ctx.lineWidth = view.px(2.5);
    ctx.strokeStyle = '#f0c987';
    tracePolygon(ctx, world);
    ctx.stroke();

    const params = this.previewCache();
    // 설계 화면에서도 아이템을 항해 화면과 **같은 코드로** 그린다. 부착점과 방향이 곧
    // 조향 특성이므로 (§4.1), 출항 전에 그 배치를 보고 거동을 예상할 수 있어야 한다.
    if (this.attached.length) {
      this.drawDevices(ctx, view,
        { items: this.attached, control: { held: this.held }, params, anchorJoint: null },
        this.design.origin, this.design.angle);
    }
    this.drawOverlays(ctx, view, this.design.origin, this.design.angle, params);
    this.drawVertices(ctx, view, world);
    this.drawDraftGauge(view, params);
  }

  /**
   * 흘수 게이지 (§2.3 오버레이 요구사항). 값은 패널에도 있지만, 숫자보다 "물에 얼마나
   * 잠겼는가"가 눈에 먼저 들어와야 재질·장치 질량의 대가가 체감된다.
   */
  drawDraftGauge(view, params) {
    if (!params) return;
    const ratio = Math.min(params.draft / DRAFT_GAUGE_MAX, 1);
    const H = 150;
    const W = 22;
    const x = 20;
    const y = Math.max((view.height - H) / 2, 90);

    view.screenSpace((c) => {
      c.fillStyle = 'rgba(8, 20, 32, 0.8)';
      c.fillRect(x, y, W, H);
      c.fillStyle = 'rgba(127, 227, 255, 0.45)';
      c.fillRect(x, y + H * (1 - ratio), W, H * ratio);
      c.strokeStyle = ratio >= 1 ? '#ff6b6b' : 'rgba(240, 201, 135, 0.6)';
      c.lineWidth = 2;
      c.strokeRect(x, y, W, H);

      c.font = "12px 'NeoDunggeunmo', monospace";
      c.textAlign = 'center';
      c.fillStyle = '#f5e6c8';
      c.fillText('흘수', x + W / 2, y - 8);
      c.fillText(`${params.draft.toFixed(2)}`, x + W / 2, y + H + 15);
      c.fillText('m', x + W / 2, y + H + 28);
    });
  }

  renderSail(ctx, view) {
    // 스트로크는 넘기지 않는다 — "지금 더 젓지 않으면 어디로 가는가"가 정직한 질문이다
    // (predict.js 머리말). 반면 트리거 홀드는 유지 가정이 정의되므로 그대로 넘긴다.
    const input = { held: this.held };
    const labels = [];

    for (const body of this.bodies) {
      const hull = body.getUserData().hull;
      const pos = body.getPosition();
      const angle = body.getAngle();
      const accent = hull.tag?.color ?? '#f0c987';

      if (this.showTrajectory) this.drawTrajectory(ctx, view, body, input, accent);

      const world = translate(rotate(hull.outline, angle), pos.x, pos.y);
      const worldHoles = hull.holes.map((h) => translate(rotate(h, angle), pos.x, pos.y));

      fillPolygonWithHoles(ctx, world, worldHoles, hull.params.material.color + 'aa');
      ctx.lineWidth = view.px(2);
      ctx.strokeStyle = accent;
      tracePolygon(ctx, world);
      ctx.stroke();
      for (const hole of worldHoles) {
        tracePolygon(ctx, hole);
        ctx.stroke();
      }

      // 볼록 분해 결과 (fixture 경계)
      ctx.lineWidth = view.px(0.7);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      for (const part of hull.parts) {
        tracePolygon(ctx, translate(rotate(part, angle), pos.x, pos.y));
        ctx.stroke();
      }

      this.drawDevices(ctx, view, hull, pos, angle);

      const com = body.getWorldCenter();
      this.drawOverlays(ctx, view, { x: com.x, y: com.y }, angle, hull.params);

      // 속도 벡터
      const v = body.getLinearVelocity();
      if (v.length() > 0.05) {
        ctx.lineWidth = view.px(2);
        ctx.strokeStyle = '#7fe3ff';
        ctx.beginPath();
        ctx.moveTo(com.x, com.y);
        ctx.lineTo(com.x + v.x * 0.4, com.y + v.y * 0.4);
        ctx.stroke();
      }

      if (hull.tag) {
        labels.push({
          at: view.worldToScreen({ x: com.x, y: com.y + hull.params.beam * 0.5 + 1.2 }),
          color: accent,
          text: `${hull.tag.label}  ${v.length().toFixed(2)} m/s  ` +
            `${(body.getAngularVelocity() * 180 / Math.PI).toFixed(0)}°/s`,
        });
      }
    }

    if (labels.length) {
      view.screenSpace((c) => {
        c.font = "13px 'NeoDunggeunmo', monospace";
        c.textAlign = 'center';
        for (const l of labels) {
          c.fillStyle = 'rgba(8, 20, 32, 0.75)';
          const w = c.measureText(l.text).width + 12;
          c.fillRect(l.at.x - w / 2, l.at.y - 15, w, 19);
          c.fillStyle = l.color;
          c.fillText(l.text, l.at.x, l.at.y);
        }
      });
    }
  }

  /**
   * 예측 궤적선 — predict.js 가 hydro·devices 의 순수 함수로 적분한 경로를 그대로 그린다.
   * 실제 항적과 어긋나 보이면 그것은 UI 버그가 아니라 예측이 거짓말을 하고 있다는 뜻이다.
   */
  drawTrajectory(ctx, view, body, input, color) {
    const path = predictPath(body, input, { fields: this.fields });
    if (path.length < 2) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = view.px(1.6);
    ctx.strokeStyle = color;
    ctx.setLineDash([view.px(5), view.px(5)]);
    traceOpenPath(ctx, path);
    ctx.stroke();
    ctx.setLineDash([]);
    // 끝점 — 2.5초 뒤 무게중심이 있을 자리
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(path.at(-1).x, path.at(-1).y, view.px(3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 기본 장치. 노는 **젓는 동안 부풀고 물 밖으로 뻗는다** — 스트로크 모델은 리듬이 눈에
   * 보이지 않으면 조작감이 잡히지 않는다. 키(아이템)는 실제 타각만큼 꺾여 그려진다.
   */
  drawDevices(ctx, view, hull, pos, angle) {
    const rudderAngle = hull.control?.rudder ?? 0;
    for (const item of hull.items) {
      const w = translate(rotate([item], angle), pos.x, pos.y)[0];
      const anchored = item.type === 'anchor' && hull.anchorJoint != null;

      if (item.type === 'rudder') {
        // 타판을 선분으로 — 길이는 팔길이가 아니라 보기용 고정값.
        const len = Math.max(hull.params.length * 0.12, 0.3);
        const a = angle + Math.PI + rudderAngle;
        ctx.lineWidth = view.px(3);
        ctx.strokeStyle = '#ffd35c';
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + Math.cos(a) * len, w.y + Math.sin(a) * len);
        ctx.stroke();
      }

      if (item.type === 'booster') {
        // 추력 방향으로 화살촉 — 켜져 있으면 불꽃이 길어진다. §4.1 의 "방향"이 눈에 보여야
        // "왜 이 배가 도는가"를 부착점만 보고 설명할 수 있다.
        const on = !!hull.control?.held?.[item.bind];
        const a = angle + item.angle;
        const len = Math.max(hull.params.length * 0.18, 0.5) * (on ? 1.6 : 0.8);
        ctx.lineWidth = view.px(on ? 5 : 3);
        ctx.strokeStyle = on ? '#ff9f7f' : 'rgba(255,159,127,0.55)';
        ctx.beginPath();
        ctx.moveTo(w.x - Math.cos(a) * len * 0.3, w.y - Math.sin(a) * len * 0.3);
        ctx.lineTo(w.x + Math.cos(a) * len * 0.7, w.y + Math.sin(a) * len * 0.7);
        ctx.stroke();
      }

      if (item.type === 'sail') {
        // 돛은 법선이 item.angle 이므로 **돛폭은 그 수직 방향**으로 그린다.
        const a = angle + item.angle + Math.PI / 2;
        const len = Math.sqrt(item.area ?? 6) * 0.6;
        ctx.lineWidth = view.px(4);
        ctx.strokeStyle = '#e8dcc0';
        ctx.beginPath();
        ctx.moveTo(w.x - Math.cos(a) * len, w.y - Math.sin(a) * len);
        ctx.lineTo(w.x + Math.cos(a) * len, w.y + Math.sin(a) * len);
        ctx.stroke();
      }

      let env = 0;
      if (item.type === 'oar') {
        env = strokeProgress(hull.control, item.side);
        // 노깃을 현측 바깥으로 — 봉투가 클수록 길게 뻗는다.
        const out = Math.sign(item.y || 1);
        const len = Math.max(hull.params.beam * 0.35, 0.4) * (0.35 + env * 0.65);
        const a = angle + (out > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.lineWidth = view.px(2 + env * 3);
        ctx.strokeStyle = env > 0 ? '#ffd35c' : 'rgba(127,227,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + Math.cos(a) * len, w.y + Math.sin(a) * len);
        ctx.stroke();
      }

      ctx.fillStyle = anchored ? '#ff6b6b'
        : env > 0 ? '#ffd35c'
          : item.kind === 'mass' ? '#8892a0'
            : item.type ? '#7fe3ff' : 'rgba(127,227,255,0.5)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, view.px((anchored ? 6 : 4) + env * 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 무게중심 G · 저항 타원 · 헤딩 인디케이터 (설계 문서 §2.3 오버레이 요구사항). */
  drawOverlays(ctx, view, center, angle, params) {
    if (!params) return;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);

    // 저항 타원
    ctx.lineWidth = view.px(1.5);
    ctx.strokeStyle = 'rgba(127, 227, 255, 0.75)';
    ctx.setLineDash([view.px(6), view.px(4)]);
    ctx.beginPath();
    ctx.ellipse(0, 0, params.dragEllipse.rx, params.dragEllipse.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 헤딩 (뱃머리 = +X)
    ctx.strokeStyle = '#ffd35c';
    ctx.lineWidth = view.px(2);
    const reach = params.length * 0.62;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(reach, 0);
    ctx.lineTo(reach - view.px(9), view.px(6));
    ctx.moveTo(reach, 0);
    ctx.lineTo(reach - view.px(9), -view.px(6));
    ctx.stroke();
    ctx.restore();

    // 무게중심 G
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(center.x, center.y, view.px(5), 0, Math.PI * 2);
    ctx.fill();
  }

  drawVertices(ctx, view, pts) {
    ctx.fillStyle = 'rgba(240, 201, 135, 0.9)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, view.px(2.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- 패널

  previewCache() {
    if (!this.design?.ok) return null;
    if (this._previewFor !== this.design) {
      // 설계 화면의 흘수도 **장치와 부착 아이템을 얹은 뒤**의 값이어야 정직하다.
      // 밸러스트를 붙이면 여기서 곧바로 흘수 게이지가 내려간다 — 대가가 즉시 보인다.
      this._previewParams = computeHullParams(this.design.outline, {
        material: this.material ?? 'wood',
        extraMass: itemsExtraMass(defaultDevices(this.design.outline)) + itemsExtraMass(this.attached),
      });
      this._previewFor = this.design;
    }
    return this._previewParams;
  }

  renderParamsFromBodies() {
    const primary = [...this.bodies][0];
    this.renderParams(primary?.getUserData().hull.params ?? null, this.design);
  }

  /** 세 척 비교 패널 — 같은 입력 아래 세 배가 지금 어떻게 다른지를 한 표에 놓는다. */
  renderCompareTable() {
    const rows = [...this.bodies]
      .filter((b) => b.getUserData().hull.tag)
      .map((b) => {
        const hull = b.getUserData().hull;
        const v = b.getLinearVelocity();
        const drift = Math.abs(b.getLocalVector(v).y); // 뱃머리와 진행 방향의 어긋남
        return `
          <div class="p-sep" style="color:${hull.tag.color}">${hull.tag.label}
            <span style="opacity:.6">· 세장비 ${hull.params.slenderness.toFixed(2)}</span></div>
          <div class="p-row"><span>속도</span><b>${v.length().toFixed(2)} m/s</b></div>
          <div class="p-row"><span>선회율</span><b>${(b.getAngularVelocity() * 180 / Math.PI).toFixed(1)} °/s</b></div>
          <div class="p-row"><span>옆밀림</span><b>${drift.toFixed(2)} m/s</b></div>
          <div class="p-row"><span>노 (좌/우)</span><b>${strokeBar(hull.control, 'port')} ${strokeBar(hull.control, 'starboard')}</b></div>`;
      });

    document.getElementById('params').innerHTML = rows.join('')
      || '<div class="p-row dim">배가 없습니다</div>';
  }

  renderParams(params, result) {
    const el = document.getElementById('params');
    if (!params) {
      el.innerHTML = result && !result.ok
        ? `<div class="p-row bad">변환 실패 — ${result.message}</div>${diagRows(result)}`
        : '<div class="p-row dim">선체 없음</div>';
      return;
    }
    el.innerHTML = `
      <div class="p-row"><span>면적</span><b>${params.area.toFixed(2)} m²</b></div>
      <div class="p-row"><span>길이 × 선폭</span><b>${params.length.toFixed(2)} × ${params.beam.toFixed(2)} m</b></div>
      <div class="p-row"><span>세장비</span><b>${params.slenderness.toFixed(2)}</b></div>
      <div class="p-row"><span>질량</span><b>${(params.mass / 1000).toFixed(2)} t
        <span style="opacity:.55">(장치 ${params.extraMass.toFixed(0)} kg)</span></b></div>
      <div class="p-row"><span>관성 모멘트</span><b>${params.inertia.toFixed(0)} kg·m²</b></div>
      <div class="p-row"><span>흘수</span><b>${params.draft.toFixed(3)} m</b></div>
      <div class="p-row hl"><span>저항 전/후</span><b>${params.drag.x.toFixed(0)}</b></div>
      <div class="p-row hl"><span>저항 좌/우</span><b>${params.drag.y.toFixed(0)}</b></div>
      <div class="p-row hl"><span>이방성 비</span><b>${(params.drag.y / Math.max(params.drag.x, 1e-6)).toFixed(1)} : 1</b></div>
      ${this.deviceRows()}
      ${this.attachedRows()}
      ${result ? diagRows(result) : ''}`;
  }

  /**
   * 기본 장치(§5.1)와 그 부착점. 좌우 노가 만드는 두 수치가 조향의 전부다:
   *  - **반폭** = 한쪽만 저을 때의 팔길이 → 넓은 배가 잘 돈다
   *  - **중점 y** = 양쪽을 저어도 남는 토크 → 비대칭 배가 저절로 돈다
   * 둘 다 형상에서 바로 나오므로, 조향 코드가 0줄이라는 사실이 패널에서 확인된다.
   */
  deviceRows() {
    const outline = this.design?.ok
      ? this.design.outline
      : [...this.bodies][0]?.getUserData().hull.outline;
    if (!outline) return '';

    const devices = defaultDevices(outline);
    const oars = devices.filter((d) => d.type === 'oar');
    const rows = devices.map((d) =>
      `<div class="p-row"><span>${d.name} <span style="opacity:.5">${d.bind}</span></span>` +
      `<b>(${d.x.toFixed(2)}, ${d.y.toFixed(2)}) · ${d.mass} kg</b></div>`).join('');

    const span = oars.length === 2 ? sideAnchors(outline, oars[0].x) : null;
    const offset = span ? Math.abs(span.center) : 0;
    const emergent = span
      ? `<div class="p-row hl"><span>노 반폭 (한쪽 젓기)</span><b>${span.halfBeam.toFixed(2)} m</b></div>` +
        (offset > 0.02
          ? `<div class="p-row hl"><span>노 중점 어긋남</span><b>${offset.toFixed(3)} m → 양쪽 저어도 선회</b></div>`
          : '<div class="p-row"><span>노 중점 어긋남</span><b>0 — 대칭, 직진</b></div>')
      : '';

    const params = this.mode === 'sail'
      ? [...this.bodies][0]?.getUserData().hull.params
      : this.previewCache();
    const terminal = params ? estimateOarTerminal(params) : 0;
    return `<div class="p-sep">기본 장치 (§5.1) · ${(1 / strokeGate()).toFixed(1)}회/s · ` +
      `종단 ${terminal.toFixed(2)} / 한계 ${DEVICE_TUNING.oarMaxSpeed.toFixed(1)} m/s</div>` +
      `${rows}${emergent}`;
  }

  /**
   * 손으로 붙인 아이템 (§4.1). **팔길이 y 와 방향이 곧 조향 특성**이라, 출항 전에 이 표만
   * 보고 "이 배가 어느 쪽으로 돌지"를 말할 수 있어야 한다. 그게 가설 B 의 통과 조건이다.
   */
  attachedRows() {
    const items = this.mode === 'sail'
      ? ([...this.bodies][0]?.getUserData().hull.items ?? []).filter((it) => it.kind && it.kind !== 'oar')
      : this.attached;
    if (!items.length) return '';

    const rows = items.map((it) => {
      const dir = ATTACH_ANGLES.find((a) => Math.abs(a.value - (it.angle ?? 0)) < 1e-6);
      const arm = it.kind === 'thruster' || it.kind === 'sail'
        // 그 힘이 만드는 토크의 팔길이 — 방향에 수직인 성분만 센다.
        ? Math.abs(it.x * Math.sin(it.angle) - it.y * Math.cos(it.angle))
        : Math.hypot(it.x, it.y);
      return `<div class="p-row"><span>${it.name} ` +
        `<span style="opacity:.5">${bindLabel(it.bind)} ${dir ? dir.label.slice(-1) : ''}</span></span>` +
        `<b>(${it.x.toFixed(1)}, ${it.y.toFixed(1)}) · 팔 ${arm.toFixed(2)} m</b></div>`;
    }).join('');

    return `<div class="p-sep">부착 아이템 (§4.1) · 팔길이 0 이면 직진, 크면 선회</div>${rows}`;
  }
}

/** 노 한 자루의 상태를 세 칸 막대로 — 젓는 중 ▓ / 회수 중 ▒ / 물 밖 ░. */
/**
 * 선체 로컬 좌표 → 부위 이름. 좌현이 +Y 인 것은 `defaults.js` 의 `sideAnchors` 규약이다.
 * 표시용일 뿐이고 물리에는 영향이 없다.
 */
function sideName(local) {
  if (Math.abs(local.x) >= Math.abs(local.y)) return local.x >= 0 ? '뱃머리' : '선미';
  return local.y >= 0 ? '좌현' : '우현';
}

function strokeBar(control, side) {
  const s = control?.stroke;
  if (!s || !Number.isFinite(s.t) || !s[side]) return '░░░';
  const env = strokeProgress(control, side);
  if (env > 0) {
    const filled = Math.max(1, Math.round(env * 3));
    return `<span style="color:#ffd35c">${'▓'.repeat(filled)}</span>${'░'.repeat(3 - filled)}`;
  }
  const span = DEVICE_TUNING.oarStrokeDuration + DEVICE_TUNING.oarStrokeCooldown;
  return s.t < span ? '<span style="opacity:.45">▒▒▒</span>' : '░░░';
}

function diagRows(result) {
  const d = result.diagnostics;
  if (!d) return '';
  return `
    <div class="p-sep">스파이크 ① 진단</div>
    <div class="p-row"><span>입력 점</span><b>${d.rawPoints} → ${d.dedupedPoints ?? '-'}</b></div>
    <div class="p-row"><span>Union 링</span><b>외곽 ${d.ringsAfterUnion ?? '-'} · 구멍 ${d.holesDropped ?? 0}</b></div>
    <div class="p-row"><span>단순화</span><b>${d.vertsBeforeSimplify ?? '-'} → ${d.verts ?? '-'} (ε ${(d.epsilonUsed ?? 0).toFixed(3)})</b></div>
    <div class="p-row"><span>폐곡선 간극</span><b>${(d.closeGap ?? 0).toFixed(2)} m</b></div>
    <div class="p-row"><span>변환 시간</span><b>${(d.ms ?? 0).toFixed(2)} ms</b></div>`;
}

// 디버그 핸들 — 콘솔·자동화 테스트에서 물리 상태를 직접 들여다보기 위한 것.
window.shipwright = new Harness();
