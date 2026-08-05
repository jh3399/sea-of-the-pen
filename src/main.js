// D0 검증 하니스 — 세 스파이크를 한 화면에서 동시에 계측한다.
//
// 스파이크를 세 개의 독립 데모로 나누지 않은 이유: 프레임 드랍은 각 모듈이 아니라 셋이 함께
// 돌 때 나타난다. 그리고 D1 부터 이 화면이 그대로 설계-항해 루프로 자란다.
import './ui/harness.css';
import { createWorld, FixedStepper, Vec2 } from './physics/world.js';
import { applyHydroToWorld } from './physics/hydro.js';
import { applySternThrust, inputFromKeys } from './physics/thrust.js';
import { createHullBody } from './physics/body.js';
import { strokeToHull, HULL_DEFAULTS } from './hull/polygon.js';
import { computeHullParams } from './hull/params.js';
import { StrokeCapture } from './hull/strokes.js';
import { CORPUS, CORPUS_LABELS } from './hull/corpus.js';
import { applyImpact } from './damage/apply.js';
import { View, drawSeaGrid, tracePolygon, traceOpenPath, fillPolygonWithHoles } from './render/view.js';
import { Metrics } from './ui/metrics.js';
import { rotate, translate, bounds } from './geom/poly.js';

const PPM = HULL_DEFAULTS.pixelsPerMeter;
const IMPACT_RADIUS = 0.8;

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
    this.stepper = new FixedStepper(this.world, {
      onPreStep: (dt) => {
        this.applyThrust();
        applyHydroToWorld(this.world, dt);
      },
    });

    this.mode = 'design';
    this.stroke = [];
    this.design = null;
    this.bodies = new Set();
    this.keys = new Set();
    this.stress = { remaining: 0, rng: null, samples: [] };
    this.lastFrame = performance.now();
    this.status = '선체를 그리세요 — 폐곡선 하나면 됩니다.';

    this.capture = new StrokeCapture(this.canvas, {
      onStart: () => {
        if (this.mode !== 'design') return;
        this.stroke = [];
        this.design = null;
      },
      onUpdate: (pts) => {
        if (this.mode === 'design') this.stroke = pts;
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
    document.getElementById('btn-load').onclick = () => this.loadCorpus(select.value);
    document.getElementById('btn-reset').onclick = () => this.enterDesign();
    document.getElementById('btn-sail').onclick = () => this.enterSail();
    document.getElementById('btn-stress').onclick = () => this.startStress();
    document.getElementById('btn-clear-worst').onclick = () => this.metrics.resetWorst();
  }

  onKey(e, down) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (down) this.keys.add(e.key);
      else this.keys.delete(e.key);
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

  buildFromStroke(points) {
    const result = strokeToHull(points, { pixelsPerMeter: PPM });
    this.metrics.push('hull', result.diagnostics.ms);
    this.design = result;

    if (!result.ok) {
      this.setStatus(`변환 실패 — ${result.message} (${result.reason})`, 'bad');
      document.getElementById('btn-sail').disabled = true;
      this.renderParams(null, result);
      return;
    }

    const warn = result.warnings.length ? ` · 경고: ${result.warnings.join(', ')}` : '';
    this.setStatus(`선체 확정 — 정점 ${result.diagnostics.verts}개${warn}`, warn ? 'warn' : 'ok');
    document.getElementById('btn-sail').disabled = false;
    this.renderParams(this.previewCache(), result);
  }

  // ------------------------------------------------------- 모드 전환

  enterDesign() {
    for (const body of this.bodies) this.world.destroyBody(body);
    this.bodies.clear();
    this.stroke = [];
    this.design = null;
    this.mode = 'design';
    this.stress.remaining = 0;
    this.capture.enabled = true;
    this.capture.clear();
    this.view.ppm = PPM;
    this.view.snapTo({ x: this.view.width / 2 / PPM, y: -this.view.height / 2 / PPM });
    document.getElementById('btn-sail').disabled = true;
    document.body.dataset.mode = 'design';
    this.setStatus('선체를 그리세요 — 폐곡선 하나면 됩니다. (또는 코퍼스 불러오기)');
    this.renderParams(null, null);
  }

  enterSail() {
    if (!this.design?.ok) return;

    // 정규화된 선체를 원점에 세운다. 뱃머리가 +X 를 향한다.
    const items = markerItems(this.design.outline);
    const body = createHullBody(
      this.world,
      { outline: this.design.outline, holes: [], items },
      { position: { x: 0, y: 0 }, angle: 0, material: 'wood' },
    );
    if (!body) {
      this.setStatus('강체 생성 실패 — 분해 결과가 비었습니다.', 'bad');
      return;
    }

    this.bodies.add(body);
    this.initialItemCount = body.getUserData().hull.items.length;
    this.mode = 'sail';
    this.capture.enabled = false;
    this.view.ppm = PPM * 0.7;
    this.view.snapTo({ x: 0, y: 0 });
    document.body.dataset.mode = 'sail';
    this.setStatus('방향키로 추력 · 선체를 클릭하면 그 지점이 깎입니다.', 'ok');
    this.renderParams(body.getUserData().hull.params, this.design);
  }

  // ------------------------------------------------------- 스파이크 ③

  applyThrust() {
    const input = inputFromKeys(this.keys);
    for (const body of this.bodies) applySternThrust(body, input);
  }

  // ------------------------------------------------------- 스파이크 ②

  strikeAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.view.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    this.carve(world, IMPACT_RADIUS);
  }

  carve(worldPoint, radius) {
    const target = this.bodyNear(worldPoint);
    if (!target) return;

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
      this.stepStress();

      const primary = [...this.bodies][0];
      if (primary) this.view.follow(primary.getPosition());
    }

    this.render();
    this.metrics.push('frame', performance.now() - frameStart);
    this.metrics.render(now);
    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const { ctx, view } = { ctx: this.view.ctx, view: this.view };
    view.begin();
    drawSeaGrid(ctx, view);

    if (this.mode === 'design') this.renderDesign(ctx, view);
    else this.renderSail(ctx, view);
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

    this.drawOverlays(ctx, view, this.design.origin, this.design.angle, this.previewCache());
    this.drawVertices(ctx, view, world);
  }

  renderSail(ctx, view) {
    for (const body of this.bodies) {
      const hull = body.getUserData().hull;
      const pos = body.getPosition();
      const angle = body.getAngle();

      const world = translate(rotate(hull.outline, angle), pos.x, pos.y);
      const worldHoles = hull.holes.map((h) => translate(rotate(h, angle), pos.x, pos.y));

      fillPolygonWithHoles(ctx, world, worldHoles, hull.params.material.color + 'aa');
      ctx.lineWidth = view.px(2);
      ctx.strokeStyle = '#f0c987';
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

      // 부착물 마커 — 절단 시 소속 조각을 따라가는지 눈으로 확인한다.
      ctx.fillStyle = '#7fe3ff';
      for (const item of hull.items) {
        const w = translate(rotate([item], angle), pos.x, pos.y)[0];
        ctx.beginPath();
        ctx.arc(w.x, w.y, view.px(4), 0, Math.PI * 2);
        ctx.fill();
      }

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
      this._previewParams = computeHullParams(this.design.outline, { material: 'wood' });
      this._previewFor = this.design;
    }
    return this._previewParams;
  }

  renderParamsFromBodies() {
    const primary = [...this.bodies][0];
    this.renderParams(primary?.getUserData().hull.params ?? null, this.design);
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
      <div class="p-row"><span>질량</span><b>${(params.mass / 1000).toFixed(2)} t</b></div>
      <div class="p-row"><span>관성 모멘트</span><b>${params.inertia.toFixed(0)} kg·m²</b></div>
      <div class="p-row"><span>흘수</span><b>${params.draft.toFixed(3)} m</b></div>
      <div class="p-row hl"><span>저항 전/후</span><b>${params.drag.x.toFixed(0)}</b></div>
      <div class="p-row hl"><span>저항 좌/우</span><b>${params.drag.y.toFixed(0)}</b></div>
      <div class="p-row hl"><span>이방성 비</span><b>${(params.drag.y / Math.max(params.drag.x, 1e-6)).toFixed(1)} : 1</b></div>
      ${result ? diagRows(result) : ''}`;
  }
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

/** 선체에 임시로 얹는 마커 3개 — §7.5 "아이템은 소속 폴리곤을 따라간다" 검증용. */
function markerItems(outline) {
  const bb = bounds(outline);
  return [
    { key: 'A', x: bb.minX + bb.width * 0.2, y: 0 },
    { key: 'B', x: bb.minX + bb.width * 0.5, y: 0 },
    { key: 'C', x: bb.minX + bb.width * 0.8, y: 0 },
  ];
}

// 디버그 핸들 — 콘솔·자동화 테스트에서 물리 상태를 직접 들여다보기 위한 것.
window.shipwright = new Harness();
