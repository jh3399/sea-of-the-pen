// 배 그리기 화면 — harness.html(엔지니어링 하니스)과 분리된 플레이어용 진입점.
// 카메라 팬/줌이 없는 고정 화면이라 render/view.js 의 월드 카메라는 쓰지 않는다. 캔버스는
// 잉크(스트로크·선체 채움·아이템 마커·주인공·도면 오버레이)만 그리고, 종이·나무 프레임·
// 스프링 제본·패널 카드는 draw.css 가 담당한다.
import './draw.css';
import { StrokeCapture } from '../hull/strokes.js';
import {
  strokeToHull, toHullLocal, toHullWorld, pxToMetric, metricToPx, HULL_DEFAULTS,
} from '../hull/polygon.js';
import { canAttachAt, attachItem, detachItem } from '../items/attach.js';
import { ITEM_CATALOG } from '../items/catalog.js';
import { MATERIALS } from '../hull/params.js';
import { TEMPLATES, TEMPLATE_LABELS, TEMPLATE_ORDER } from './templates.js';
import { itemIconSVG, templateThumbSVG, drawItemMarker, drawCrewSprite } from './icons.js';

/** 이미지 순서 그대로 — 대포·키·돛·부스터. 대포는 배치만(발사 로직은 D3 예약, 이번 범위 밖). */
const PALETTE_ITEMS = ['cannon', 'rudder', 'sail', 'booster'];
const PALETTE_MATERIALS = ['wood', 'iron'];

// 시작 시점에 열려 있는 것 — 나머지는 진행에 따라 언락된다. 팔레트 순서(위 두 배열)는
// 최종 구성 그대로 두고 여기서만 걸러 내므로, 언락은 이 Set 에 키를 넣는 것으로 끝난다.
const UNLOCKED_ITEMS = new Set(['rudder']);
const UNLOCKED_MATERIALS = new Set(['wood']);

const ITEM_MARKER_HIT_PX = 16;

class DrawScreen {
  constructor() {
    this.canvas = document.getElementById('ink');
    this.ctx = this.canvas.getContext('2d');
    this.page = document.getElementById('page');
    this.statusEl = document.getElementById('status');
    this.itemListEl = document.getElementById('item-list');
    this.materialListEl = document.getElementById('material-list');
    this.blueprintToggle = document.getElementById('blueprint-toggle');
    this.blueprintPanel = document.getElementById('blueprint-panel');
    this.clearBtn = document.getElementById('btn-clear');
    this.finishBtn = document.getElementById('btn-finish');
    this.menuBtn = document.getElementById('btn-menu');

    this.material = 'wood';
    this.template = null;
    this.design = null; // strokeToHull() 결과 — 유효한 폐곡선이 확정되면 채워진다
    this.hull = { items: [] }; // items/attach.js 가 기대하는 최소 형태
    this.placing = null; // 배치 모드 중인 아이템 타입
    this.finished = false;
    this.finishedDesign = null;
    this.liveRawPoints = null;
    this.aboard = false;
    this.crewLocal = null;
    this.center = { x: 0, y: 0 };

    this.capture = new StrokeCapture(this.canvas, {
      onStart: () => this.onStrokeStart(),
      onUpdate: (pts) => this.onStrokeUpdate(pts),
      onComplete: (pts) => this.onStrokeComplete(pts),
    });

    this.buildItemList();
    this.buildMaterialList();
    this.buildBlueprintPanel();
    this.bindTopControls();

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  // ── 레이아웃 ──────────────────────────────────────────────
  resize() {
    const rect = this.page.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.center = { x: this.cssWidth / 2, y: this.cssHeight / 2 };
    this.updateAboard();
    this.render();
  }

  // ── 스트로크 ──────────────────────────────────────────────
  onStrokeStart() {
    if (this.finished) return;
    this.liveRawPoints = null;
  }

  onStrokeUpdate(pts) {
    if (this.finished) return;
    this.liveRawPoints = pts;
    this.render();
  }

  onStrokeComplete(pts) {
    this.liveRawPoints = null;
    if (this.finished) return;
    const result = strokeToHull(pts);
    if (result.ok) {
      this.design = result;
      this.hull = { items: [] }; // 새 선체는 로컬 좌표계가 달라지므로 부착물을 비운다
      this.placing = null;
      this.setStatus('선체가 확정됐습니다.', 'ok');
    } else {
      this.setStatus(this.failMessage(result), 'bad');
    }
    this.buildItemList();
    this.updateAboard();
    this.syncFinishButton();
    this.render();
  }

  failMessage(result) {
    if (result.reason === 'tooSmall') return '선체가 너무 작아요. 더 크게 그려 보세요.';
    if (result.reason === 'tooBig') return '선체가 너무 커요. 더 작게 그려 보세요.';
    return '점이 너무 적거나 도형이 무너졌어요. 다시 그려 보세요.';
  }

  // ── 주인공: 화면 정중앙 고정 + 감쌌는지 판정 ─────────────
  updateAboard() {
    if (!this.design?.ok) {
      this.aboard = false;
      this.crewLocal = null;
      return;
    }
    const metric = pxToMetric(this.center);
    const local = toHullLocal(this.design, metric);
    this.aboard = canAttachAt(this.design.outline, [], local);
    this.crewLocal = local; // sail.html 로 넘길 주인공 로컬 좌표 — finish() 가 그대로 쓴다
  }

  // 선체 로컬(m) → 캔버스 px. 확정 선체 외곽선·아이템 마커를 그릴 때 쓴다.
  localToPx(local) {
    return metricToPx(toHullWorld(this.design, local));
  }

  // ── 재질 = 펜 색 ──────────────────────────────────────────
  buildMaterialList() {
    this.materialListEl.innerHTML = '';
    for (const key of PALETTE_MATERIALS.filter((k) => UNLOCKED_MATERIALS.has(k))) {
      const mat = MATERIALS[key];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `material-row${key === this.material ? ' selected' : ''}`;
      row.innerHTML = `<span class="swatch" style="background:${mat.color}"></span><span>${mat.name}</span>`;
      row.addEventListener('click', () => {
        this.material = key;
        this.buildMaterialList();
        this.render();
      });
      this.materialListEl.appendChild(row);
    }
  }

  // ── 아이템 팔레트 ─────────────────────────────────────────
  buildItemList() {
    this.itemListEl.innerHTML = '';
    for (const type of PALETTE_ITEMS.filter((t) => UNLOCKED_ITEMS.has(t))) {
      const spec = ITEM_CATALOG[type];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `item-row${this.placing === type ? ' selected' : ''}`;
      row.disabled = !this.design?.ok || this.finished;
      row.innerHTML = `<span class="icon">${itemIconSVG(type, { pixel: 3 })}</span><span>${spec.name}</span>`;
      row.addEventListener('click', () => this.togglePlacing(type));
      this.itemListEl.appendChild(row);
    }
  }

  togglePlacing(type) {
    if (!this.design?.ok || this.finished) return;
    this.placing = this.placing === type ? null : type;
    this.capture.enabled = !this.placing;
    this.buildItemList();
    this.setStatus(
      this.placing
        ? `${ITEM_CATALOG[type].name}를 붙일 자리를 선체 안에서 클릭하세요 (다시 누르면 뗍니다).`
        : '선체가 확정됐습니다.',
      'ok',
    );
  }

  handleCanvasClick(e) {
    if (!this.placing || !this.design?.ok) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const local = toHullLocal(this.design, pxToMetric(px));

    const hitRadiusM = ITEM_MARKER_HIT_PX / HULL_DEFAULTS.pixelsPerMeter;
    const nearby = this.hull.items.find(
      (it) => it.type === this.placing && Math.hypot(it.x - local.x, it.y - local.y) < hitRadiusM,
    );
    if (nearby) {
      detachItem(this.hull, nearby.key);
      this.render();
      return;
    }
    if (!canAttachAt(this.design.outline, [], local)) {
      this.setStatus('선체 안쪽에 붙여야 해요.', 'bad');
      return;
    }
    attachItem(this.hull, this.placing, { x: local.x, y: local.y, angle: 0 });
    this.render();
  }

  // ── 도면 보기 ─────────────────────────────────────────────
  buildBlueprintPanel() {
    this.blueprintPanel.innerHTML = '';
    for (const id of TEMPLATE_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tmpl-btn${this.template === id ? ' selected' : ''}`;
      btn.innerHTML = `${templateThumbSVG(TEMPLATES[id]())}<span>${TEMPLATE_LABELS[id]}</span>`;
      btn.addEventListener('click', () => {
        this.template = this.template === id ? null : id;
        this.buildBlueprintPanel();
        this.render();
      });
      this.blueprintPanel.appendChild(btn);
    }
  }

  // ── 상단 컨트롤 ───────────────────────────────────────────
  bindTopControls() {
    this.blueprintToggle.addEventListener('click', () => {
      this.blueprintPanel.classList.toggle('hidden');
      this.blueprintToggle.classList.toggle('open');
    });
    this.clearBtn.addEventListener('click', () => this.resetAll());
    this.finishBtn.addEventListener('click', () => this.finish());
    // 상대경로 — base 가 '/sea-of-the-pen/' 이라 절대경로는 배포에서 404 다 (finish() 와 같은 방식).
    this.menuBtn.addEventListener('click', () => { location.href = 'index.html'; });
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
  }

  resetAll() {
    this.finished = false;
    this.finishedDesign = null;
    this.design = null;
    this.hull = { items: [] };
    this.placing = null;
    this.template = null;
    this.liveRawPoints = null;
    this.capture.clear();
    this.capture.enabled = true;
    this.aboard = false;
    this.crewLocal = null;
    this.setStatus('선체를 그려 주인공을 감싸세요.');
    this.buildItemList();
    this.buildBlueprintPanel();
    this.syncFinishButton();
    this.render();
  }

  finish() {
    if (!this.design?.ok || !this.aboard || this.finished) return;
    this.finished = true;
    this.capture.enabled = false;
    this.placing = null;
    this.finishedDesign = {
      outline: this.design.outline,
      origin: this.design.origin,
      angle: this.design.angle,
      material: this.material,
      items: this.hull.items,
      crew: this.crewLocal,
    };
    this.buildItemList();
    this.setStatus('설계 완성! 항해로 이동합니다…', 'ok');
    this.syncFinishButton();
    // 항해 화면(sail.html)이 이어받는다 — 같은 폴더의 상대 경로라 dev/build 양쪽에서 그대로 동작.
    sessionStorage.setItem('shipwright:handoff', JSON.stringify(this.finishedDesign));
    location.href = 'sail.html';
  }

  syncFinishButton() {
    this.finishBtn.disabled = this.finished || !this.design?.ok || !this.aboard;
  }

  setStatus(text, cls) {
    this.statusEl.textContent = text;
    this.statusEl.className = `page-status${cls ? ` ${cls}` : ''}`;
  }

  // ── 렌더 ──────────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    this.renderTemplate(ctx);
    if (this.design?.ok) this.renderHull(ctx);
    this.renderLiveStroke(ctx);
    this.renderCrew(ctx);
  }

  renderTemplate(ctx) {
    if (!this.template) return;
    const pts = TEMPLATES[this.template]();
    ctx.save();
    ctx.translate(this.center.x, this.center.y);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#5a4a34';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  renderHull(ctx) {
    const inkColor = MATERIALS[this.material].color;
    const pagePts = this.design.outline.map((p) => this.localToPx(p));
    ctx.save();
    ctx.fillStyle = `${inkColor}aa`;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    pagePts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    for (const item of this.hull.items) {
      const p = this.localToPx({ x: item.x, y: item.y });
      drawItemMarker(ctx, item.type, p.x, p.y);
    }
  }

  renderLiveStroke(ctx) {
    if (!this.liveRawPoints || this.liveRawPoints.length < 2) return;
    const inkColor = MATERIALS[this.material].color;
    ctx.save();
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 5;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    this.liveRawPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }

  renderCrew(ctx) {
    ctx.save();
    ctx.strokeStyle = this.aboard ? '#2f7a4a' : '#a33a2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawCrewSprite(ctx, this.center.x, this.center.y);
  }
}

new DrawScreen();
