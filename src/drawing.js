// 드로잉 캔버스: 마우스/터치로 선을 그리고, 스트로크 데이터와 PNG를 내보낸다.
export class DrawingCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = [];        // [{ points: [{x,y}, ...] }]
    this.current = null;
    this.enabled = true;

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

  _redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  // AI 판정에 보낼 이미지 (흰 배경 합성 PNG)
  toPngDataUrl() {
    if (this.canvas.width === 0 || this.canvas.height === 0) this._resize();
    const out = document.createElement('canvas');
    out.width = Math.max(1, this.canvas.width);
    out.height = Math.max(1, this.canvas.height);
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(this.canvas, 0, 0);
    return out.toDataURL('image/png');
  }
}
