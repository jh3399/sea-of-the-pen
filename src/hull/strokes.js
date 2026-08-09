// 포인터 스트로크 캡처. 레거시 프로토타입(archive/src/drawing.js)의 캡처 로직을 발췌해
// 선체 그리기 전용으로 다듬은 것 — 선체는 폐곡선 하나이므로 단일 스트로크만 유지한다.

export class StrokeCapture {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onComplete?: (points: Array<{x,y}>) => void}} handlers
   */
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.points = [];
    this.drawing = false;
    this.enabled = true;

    canvas.addEventListener('pointerdown', (e) => this._start(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => this._end());
    window.addEventListener('pointercancel', () => this._end());
  }

  /** CSS 픽셀 기준 좌표 (렌더는 DPR 을 별도로 처리한다). */
  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _start(e) {
    if (!this.enabled) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 합성 이벤트 등 캡처 불가 시 무시 */
    }
    this.drawing = true;
    this.points = [this._pos(e)];
    this.handlers.onStart?.();
  }

  _move(e) {
    if (!this.drawing || !this.enabled) return;
    this.points.push(this._pos(e));
    this.handlers.onUpdate?.(this.points);
  }

  _end() {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.points.length >= 3) this.handlers.onComplete?.(this.points);
    this.handlers.onEnd?.();
  }

  clear() {
    this.points = [];
    this.drawing = false;
  }

  isEmpty() {
    return this.points.length < 3;
  }
}
