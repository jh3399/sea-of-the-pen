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
import { oarAnchorsAt } from '../items/defaults.js';
import { MATERIALS } from '../hull/params.js';
import { unlockedItems, unlockedMaterials } from '../game/progress.js';
import { TEMPLATES, TEMPLATE_LABELS, TEMPLATE_ORDER } from './templates.js';
import { DrawTutorial } from './tutorial.js';
import {
  itemIconSVG, templateThumbSVG, drawItemMarker, drawCrewSprite,
  markerAngleToward, itemMarkerSize, OAR_PUSH,
} from './icons.js';

/** 이미지 순서 그대로 — 대포·키·돛·부스터. 대포는 배치만(발사 로직은 D3 예약, 이번 범위 밖). */
const PALETTE_ITEMS = ['cannon', 'rudder', 'sail', 'booster'];
const PALETTE_MATERIALS = ['wood', 'iron'];

// 열려 있는 것은 **진행도가 정한다** (`game/progress.js` 의 STAGES[].items/materials).
// 팔레트 순서(위 두 배열)는 최종 구성 그대로 두고 여기서 걸러 내므로, 언락은 그 데이터에
// 키를 넣는 것으로 끝난다 — 이 파일은 안 고친다.
//
// ★ **첫 배는 노만 단다.** 연습 해역이 노 젓기를 익히는 바다라, 키도 돛도 아직 없다.
//   키는 시작의 섬에서 세렌을 만난 뒤에 열린다 ([S-06]) — 미리 달 수 있으면 그 장면이
//   통째로 의미를 잃고 "노만 달고 왔어?" 라는 세렌의 첫 대사가 거짓말이 된다.

const ITEM_MARKER_HIT_PX = 16;

/** 노 배치 모드의 의사 타입 — 노는 카탈로그 아이템이 아니라 기본 장치라 `placing` 에만 산다. */
const PLACING_OAR = 'oar';

/** 노 마커의 한 칸 크기 (px). 부착 아이템 마커(3)보다 큰 것은 노가 **선체 밖으로 뻗는**
 *  장치라서다 — 다른 마커처럼 선체 안 점으로 찍으면 방향이 읽히지 않는다. */
const OAR_MARKER_PIXEL = 4;

class DrawScreen {
  constructor() {
    this.canvas = document.getElementById('ink');
    this.ctx = this.canvas.getContext('2d');
    this.page = document.getElementById('page');
    this.statusEl = document.getElementById('status');
    this.itemListEl = document.getElementById('item-list');
    this.deviceListEl = document.getElementById('device-list');
    this.materialListEl = document.getElementById('material-list');
    this.blueprintToggle = document.getElementById('blueprint-toggle');
    this.blueprintPanel = document.getElementById('blueprint-panel');
    this.clearBtn = document.getElementById('btn-clear');
    this.finishBtn = document.getElementById('btn-finish');
    this.menuBtn = document.getElementById('btn-menu');
    this.tutorialBtn = document.getElementById('btn-tutorial');

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
    // 플레이어가 찍은 노의 세로 위치(선체 로컬 x). 양현으로 벌리는 일은 defaults.js 가 한다.
    this.oarX = null;
    this.oarHoverX = null; // 배치 모드에서 커서를 따라다니는 미리보기

    this.capture = new StrokeCapture(this.canvas, {
      onStart: () => this.onStrokeStart(),
      onUpdate: (pts) => this.onStrokeUpdate(pts),
      onComplete: (pts) => this.onStrokeComplete(pts),
    });

    this.buildDeviceList();
    this.buildItemList();
    this.buildMaterialList();
    this.buildBlueprintPanel();
    this.bindTopControls();
    this.tutorial = new DrawTutorial({
      getSnapshot: () => this.tutorialSnapshot(),
      replayButton: this.tutorialBtn,
    });

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    requestAnimationFrame(() => this.tutorial.startIfNeeded());
  }

  tutorialSnapshot() {
    return {
      hasValidHull: Boolean(this.design?.ok),
      hasOar: this.oarX !== null,
      canFinish: !this.finishBtn.disabled,
    };
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
      this.oarX = null; //  ↳ 노 위치도 같은 이유로 무효 (로컬 x 의 뜻이 달라진다)
      this.oarHoverX = null;
      // 노는 필수라 바로 배치 모드로 들어간다 — 완성하기가 잠긴 이유를 손이 먼저 알게 한다.
      this.placing = PLACING_OAR;
      this.capture.enabled = false;
      this.setStatus('선체가 확정됐습니다. 노를 달 앞뒤 위치를 클릭하세요.', 'ok');
    } else {
      this.setStatus(this.failMessage(result), 'bad');
    }
    this.buildDeviceList();
    this.buildItemList();
    this.updateAboard();
    this.syncFinishButton();
    this.render();
    if (result.ok) this.tutorial.handle('HULL_CONFIRMED');
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
    const openMats = unlockedMaterials();
    for (const key of PALETTE_MATERIALS.filter((k) => openMats.has(k))) {
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

  // ── 기본 장치: 노 위치 ────────────────────────────────────
  //
  // 플레이어가 정하는 것은 **세로 위치 x 하나뿐**이다. 좌우로 벌리는 일(그 자리의 실제 선폭)
  // 과 중심선(sternAnchor 반직선)은 items/defaults.js 가 계산한다 — 조향 코드는 여전히 0줄이고,
  // 여기서 정해지는 두 수치가 곧 조향의 전부다:
  //   반폭      → 한쪽만 저을 때의 팔길이 (넓은 자리에 달수록 잘 돈다)
  //   중심선 y  → 양쪽을 고르게 저어도 남는 토크 (비대칭 배가 저절로 도는 경로)
  buildDeviceList() {
    this.deviceListEl.innerHTML = '';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `item-row${this.placing === PLACING_OAR ? ' selected' : ''}`;
    row.disabled = !this.design?.ok || this.finished;
    const state = this.oarX === null ? '위치 미정' : '위치 지정됨';
    row.innerHTML = `<span class="icon">${itemIconSVG(PLACING_OAR, { pixel: 3 })}</span>`
      + `<span>노 <small class="row-note">${state}</small></span>`;
    row.addEventListener('click', () => this.togglePlacing(PLACING_OAR));
    this.deviceListEl.appendChild(row);
  }

  /** 세로 위치 x 에 노를 달 수 있는가 — 두 부착점이 모두 선체 안이어야 한다.
   *  아이템·주인공과 **같은 판정**(canAttachAt)이다. 밖에 걸치면 §7.5 상 첫 파손에 사라진다. */
  oarPlacementAt(x) {
    if (!this.design?.ok) return null;
    const at = oarAnchorsAt(this.design.outline, x);
    const ok = at.halfBeam > 0
      && canAttachAt(this.design.outline, [], at.port)
      && canAttachAt(this.design.outline, [], at.starboard);
    return { ...at, ok };
  }

  placeOarAt(px) {
    const local = toHullLocal(this.design, pxToMetric(px));
    const at = this.oarPlacementAt(local.x);
    if (!at?.ok) {
      this.setStatus('그 자리는 노가 선체 밖으로 걸칩니다. 선체가 넓은 쪽을 골라 보세요.', 'bad');
      return;
    }
    this.oarX = local.x;
    this.placing = null;
    this.capture.enabled = true;
    this.buildDeviceList();
    this.syncFinishButton();
    this.setStatus(`노를 달았습니다. 노 간격 ${(at.halfBeam * 2).toFixed(2)} m.`, 'ok');
    this.tutorial.handle('OAR_PLACED');
  }

  // ── 아이템 팔레트 ─────────────────────────────────────────
  buildItemList() {
    this.itemListEl.innerHTML = '';
    const open = unlockedItems();
    // 열린 아이템이 없으면 칸을 통째로 숨긴다 — 빈 칸은 고장으로 읽힌다.
    const card = document.getElementById('item-card');
    if (card) card.hidden = open.size === 0;
    for (const type of PALETTE_ITEMS.filter((t) => open.has(t))) {
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
    this.oarHoverX = null;
    this.capture.enabled = !this.placing;
    this.buildDeviceList();
    this.buildItemList();
    this.setStatus(
      this.placing === PLACING_OAR
        ? '노를 달 앞뒤 위치를 클릭하세요 — 좌우로는 알아서 선체 가장자리에 붙습니다.'
        : this.placing
          ? `${ITEM_CATALOG[type].name}를 붙일 자리를 선체 안에서 클릭하세요 (다시 누르면 뗍니다).`
          : '선체가 확정됐습니다.',
      'ok',
    );
    this.render();
  }

  canvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  handleCanvasMove(e) {
    if (this.placing !== PLACING_OAR || !this.design?.ok) return;
    this.oarHoverX = toHullLocal(this.design, pxToMetric(this.canvasPoint(e))).x;
    this.render();
  }

  handleCanvasClick(e) {
    if (!this.placing || !this.design?.ok) return;
    const px = this.canvasPoint(e);
    if (this.placing === PLACING_OAR) {
      this.placeOarAt(px);
      this.render();
      return;
    }
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
    this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      if (this.oarHoverX === null) return;
      this.oarHoverX = null;
      this.render();
    });
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
    this.oarX = null;
    this.oarHoverX = null;
    this.setStatus('선체를 그려 주인공을 감싸세요.');
    this.buildDeviceList();
    this.buildItemList();
    this.buildBlueprintPanel();
    this.syncFinishButton();
    this.render();
    this.tutorial.handle('DESIGN_RESET');
  }

  finish() {
    if (!this.design?.ok || !this.aboard || this.oarX === null || this.finished) return;
    this.finished = true;
    this.capture.enabled = false;
    this.placing = null;
    this.oarHoverX = null;
    this.finishedDesign = {
      outline: this.design.outline,
      origin: this.design.origin,
      angle: this.design.angle,
      material: this.material,
      items: this.hull.items,
      crew: this.crewLocal,
      // 항해 화면이 defaultDevices(outline, { oarX }) 로 그대로 넘긴다.
      oarX: this.oarX,
    };
    this.buildDeviceList();
    this.buildItemList();
    this.setStatus('설계 완성! 항해로 이동합니다…', 'ok');
    this.syncFinishButton();
    this.tutorial.complete();
    // 항해 화면(sail.html)이 이어받는다 — 같은 폴더의 상대 경로라 dev/build 양쪽에서 그대로 동작.
    sessionStorage.setItem('shipwright:handoff', JSON.stringify(this.finishedDesign));
    location.href = 'sail.html';
  }

  syncFinishButton() {
    // 노 위치는 필수다 — 기본 장치를 어디에 다는가가 곧 이 배의 조향이라, 자동 배치로
    // 넘겨 주면 플레이어는 그 선택을 했다는 사실조차 모르고 출항한다.
    this.finishBtn.disabled = this.finished
      || !this.design?.ok || !this.aboard || this.oarX === null;
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

    // 확정된 노가 먼저, 그 위에 커서를 따라다니는 미리보기.
    if (this.oarX !== null) this.renderOarPair(ctx, this.oarPlacementAt(this.oarX), 1);
    if (this.placing === PLACING_OAR && this.oarHoverX !== null) {
      this.renderOarPair(ctx, this.oarPlacementAt(this.oarHoverX), 0.55);
    }

    for (const item of this.hull.items) {
      const p = this.localToPx({ x: item.x, y: item.y });
      drawItemMarker(ctx, item.type, p.x, p.y);
    }
  }

  /** 노 한 쌍 — 두 부착점을 잇는 선이 곧 "그 자리의 선폭"이라 팔길이가 눈에 보인다.
   *  노깃은 각자 현측 **바깥**을 향한다. 방향을 두 부착점의 차에서 뽑으므로 선체가
   *  어떤 각도로 놓여 있어도(design.angle) 따라온다 — 좌우 고정값을 쓰면 여기서 어긋난다. */
  renderOarPair(ctx, at, alpha) {
    if (!at) return;
    const port = this.localToPx(at.port);
    const starboard = this.localToPx(at.starboard);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = at.ok ? '#2f7a4a' : '#a33a2b';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(port.x, port.y);
    ctx.lineTo(starboard.x, starboard.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (at.ok) {
      // 현측 바깥 단위벡터 — 좌현은 두 부착점의 차, 우현은 그 반대.
      const dx = port.x - starboard.x;
      const dy = port.y - starboard.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const angle = markerAngleToward(ux, uy);
      const push = itemMarkerSize(PLACING_OAR, OAR_MARKER_PIXEL).h * OAR_PUSH;
      drawItemMarker(ctx, PLACING_OAR,
        port.x + ux * push, port.y + uy * push, OAR_MARKER_PIXEL, angle);
      drawItemMarker(ctx, PLACING_OAR,
        starboard.x - ux * push, starboard.y - uy * push, OAR_MARKER_PIXEL, angle + Math.PI);
    }
    ctx.restore();
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
