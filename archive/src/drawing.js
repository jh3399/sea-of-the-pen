// 드로잉 캔버스: 마우스/터치로 선을 그리고, 스트로크 데이터와 PNG를 내보낸다.
import { GUIDES } from './guides.js';

export class DrawingCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];        // [{ points: [{x,y}, ...] }]
    this.current = null;
    this.enabled = true;
    this.guideKey = null;     // 표시 중인 도안 키 (null이면 없음) — clear()로는 지워지지 않는다

    this._resize();
    window.addEventListener('resize', () => this._resize());

    canvas.addEventListener('pointerdown', (e) => this._start(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => this._end());
  }

  _resize() {
    // CSS 크기와 실제 픽셀 크기를 맞추고, 기존 그림은 다시 그린다.
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;   // CSS 픽셀 기준 크기 — 스트로크 좌표계의 기준 (내보내기 변환용)
    this.cssH = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._redraw();
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _start(e) {
    if (!this.enabled) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 캡처 불가 시 무시 */ }
    this.current = { points: [this._pos(e)] };
    this.strokes.push(this.current);
  }

  _move(e) {
    if (!this.current || !this.enabled) return;
    this.current.points.push(this._pos(e));
    this._redraw();
  }

  _end() {
    this.current = null;
  }

  // 도안(밑그림) 설정: GUIDES 의 키 또는 null(해제). clear()와 무관하게 유지된다.
  setGuide(key) {
    this.guideKey = key || null;
    this._redraw();
  }

  // 도안을 흐린 점선으로 그린다 — 화면 전용 (내보내기에는 절대 포함되지 않는다)
  // w/h: 도안 정규화 좌표(0..1)를 펼칠 크기 (화면에서는 CSS 픽셀 크기)
  _paintGuide(ctx, w, h) {
    const guide = this.guideKey ? GUIDES[this.guideKey] : null;
    if (!guide) return;
    ctx.save();
    ctx.strokeStyle = '#a8c0d8';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const line of guide.strokes) {
      if (line.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(line[0][0] * w, line[0][1] * h);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0] * w, line[i][1] * h);
      ctx.stroke();
    }
    ctx.restore(); // globalAlpha·점선·선 두께 원복
  }

  // 사용자 스트로크만 그린다 — 화면과 내보내기(판정 PNG/도트 변환)가 공용으로 쓴다.
  // w/h: 대상 캔버스의 픽셀 크기. 스트로크 좌표(CSS 픽셀)를 비율로 변환해 그린다.
  _paintStrokes(ctx, w, h) {
    const sx = w / (this.cssW || 1);
    const sy = h / (this.cssH || 1);
    ctx.save();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.strokeStyle = '#1c2733';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.strokes) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 도안을 사용자 선보다 먼저(아래에) 그린다
    this._paintGuide(ctx, this.cssW, this.cssH);
    this._paintStrokes(ctx, canvas.width, canvas.height);
  }

  clear() {
    this.strokes = [];
    this._redraw();
  }

  isEmpty() {
    return this.strokes.every((s) => s.points.length < 2);
  }

  // 판정용 스트로크 통계
  stats() {
    let totalLength = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this.strokes) {
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1], b = s.points[i];
        totalLength += Math.hypot(b.x - a.x, b.y - a.y);
      }
      for (const p of s.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    }
    const rect = this.canvas.getBoundingClientRect();
    const bboxArea = maxX > minX ? (maxX - minX) * (maxY - minY) : 0;
    return {
      strokeCount: this.strokes.filter((s) => s.points.length >= 2).length,
      totalLength,
      coverage: bboxArea / (rect.width * rect.height || 1),
    };
  }

  // 그림 → 도트 스프라이트 변환: 저해상도로 축소 후 잉크 픽셀을 지정 색으로 리컬러.
  // 확대 표시는 CSS(image-rendering: pixelated)가 담당.
  toPixelDataUrl(targetW = 72, ink = '#f5e6c8') {
    if (this.canvas.width === 0 || this.canvas.height === 0) this._resize();
    const srcW = Math.max(1, this.canvas.width);
    const srcH = Math.max(1, this.canvas.height);
    const w = targetW;
    const h = Math.max(10, Math.round(targetW * (srcH / srcW)));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const sctx = small.getContext('2d');
    this._paintStrokes(sctx, w, h); // 도안 제외 — 사용자 스트로크만 변환한다
    const img = sctx.getImageData(0, 0, w, h);
    const [r, g, b] = [parseInt(ink.slice(1, 3), 16), parseInt(ink.slice(3, 5), 16), parseInt(ink.slice(5, 7), 16)];
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] > 50) {
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      } else {
        img.data[i + 3] = 0;
      }
    }
    sctx.putImageData(img, 0, 0);
    return small.toDataURL();
  }

  // AI 판정에 보낼 이미지 (흰 배경 + 사용자 스트로크만).
  // 도안이 섞이면 안 그리고도 점수가 나오므로, 화면 캔버스를 복사하지 않고 스트로크만 다시 그린다.
  toPngDataUrl() {
    if (this.canvas.width === 0 || this.canvas.height === 0) this._resize();
    const out = document.createElement('canvas');
    out.width = Math.max(1, this.canvas.width);
    out.height = Math.max(1, this.canvas.height);
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
    this._paintStrokes(octx, out.width, out.height);
    return out.toDataURL('image/png');
  }
}
