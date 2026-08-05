// 카메라 + 월드 좌표 렌더 헬퍼.
//
// 설계 문서의 카메라 규칙: 위치는 추적하고 줌은 허용하되 **회전은 금지**한다.
// 화면이 같이 돌면 플레이어가 심적 회전을 강요당해 "내 배가 어느 쪽으로 미끄러지는지"를
// 읽지 못하게 되고, 그러면 저항 타원을 체감할 수 없다.
import { bounds } from '../geom/poly.js';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.center = { x: 0, y: 0 };
    this.ppm = 40; // pixels per meter (줌)
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  /** 이후 그리기는 전부 월드 좌표(m, Y-up)로 한다. */
  begin() {
    const { ctx, dpr, ppm, width, height, center } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const s = ppm * dpr;
    ctx.setTransform(s, 0, 0, -s, (width / 2) * dpr - center.x * s, (height / 2) * dpr + center.y * s);
  }

  /** 화면 기준 굵기(CSS px)를 월드 단위로 환산 — 줌이 변해도 선 굵기가 일정해진다. */
  px(cssPixels) {
    return cssPixels / this.ppm;
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2) / this.ppm + this.center.x,
      y: -(sy - this.height / 2) / this.ppm + this.center.y,
    };
  }

  worldToScreen(p) {
    return {
      x: (p.x - this.center.x) * this.ppm + this.width / 2,
      y: this.height / 2 - (p.y - this.center.y) * this.ppm,
    };
  }

  /** 부드러운 추적. 회전은 따라가지 않는다. */
  follow(target, alpha = 0.12) {
    this.center.x += (target.x - this.center.x) * alpha;
    this.center.y += (target.y - this.center.y) * alpha;
  }

  snapTo(target) {
    this.center.x = target.x;
    this.center.y = target.y;
  }

  /**
   * 주어진 점들이 전부 화면에 들어오도록 **줌만** 조절한다 (세 척 동시 주행용).
   * 회전은 여전히 건드리지 않는다 — 카메라 규칙은 비교 모드에서도 예외가 없다.
   *
   * @param {Array<{x,y}>} points 월드 좌표
   * @param {{padding?:number, alpha?:number, minPpm?:number, maxPpm?:number}} options
   *        padding 은 CSS 픽셀 (상단바·패널에 가려지는 영역을 감안해 넉넉히 준다).
   */
  fitTo(points, options = {}) {
    if (points.length === 0) return;
    const { padding = 90, alpha = 0.08, minPpm = 3, maxPpm = 60 } = options;
    const bb = bounds(points);

    const availW = Math.max(this.width - padding * 2, 40);
    const availH = Math.max(this.height - padding * 2, 40);
    const target = Math.min(availW / Math.max(bb.width, 1e-3), availH / Math.max(bb.height, 1e-3));

    this.ppm += (Math.min(Math.max(target, minPpm), maxPpm) - this.ppm) * alpha;
    this.follow({ x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }, alpha);
  }

  /**
   * 화면 좌표계(CSS px, Y-down)로 잠깐 되돌아가 그린다.
   * 월드 변환은 Y 가 뒤집혀 있어 텍스트를 그대로 그리면 거꾸로 나온다.
   */
  screenSpace(draw) {
    const { ctx, dpr } = this;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx);
    ctx.restore();
  }
}

/** 월드 좌표계 위에 그리는 바다 격자. */
export function drawSeaGrid(ctx, view, spacing = 2) {
  const halfW = view.width / 2 / view.ppm;
  const halfH = view.height / 2 / view.ppm;
  const x0 = Math.floor((view.center.x - halfW) / spacing) * spacing;
  const x1 = view.center.x + halfW;
  const y0 = Math.floor((view.center.y - halfH) / spacing) * spacing;
  const y1 = view.center.y + halfH;

  ctx.lineWidth = view.px(1);
  ctx.strokeStyle = 'rgba(120, 190, 220, 0.16)';
  ctx.beginPath();
  for (let x = x0; x <= x1; x += spacing) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += spacing) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}

export function tracePolygon(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

export function traceOpenPath(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

/** 채운 폴리곤 + 구멍 (evenodd 로 구멍을 뚫는다). */
export function fillPolygonWithHoles(ctx, outline, holes, fillStyle) {
  ctx.beginPath();
  const add = (pts) => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };
  add(outline);
  for (const hole of holes) add(hole);
  ctx.fillStyle = fillStyle;
  ctx.fill('evenodd');
}
