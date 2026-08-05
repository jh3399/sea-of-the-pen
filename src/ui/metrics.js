// 계측 HUD — D0 의 통과 질문("세 실험이 프레임 드랍 없이 도는가")을 판정하는 유일한 근거.
// 마감까지 유지한다: 이후 단계에서 성능이 무너지는 순간을 즉시 알아채야 하기 때문이다.

const CAPACITY = 180; // 약 3초 분량

class Series {
  constructor(label, unit, budget) {
    this.label = label;
    this.unit = unit;
    this.budget = budget; // 초과 시 빨갛게 표시할 예산
    this.buf = new Float32Array(CAPACITY);
    this.count = 0;
    this.head = 0;
    this.worst = 0;
  }

  push(v) {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % CAPACITY;
    if (this.count < CAPACITY) this.count++;
    if (v > this.worst) this.worst = v;
  }

  stats() {
    if (this.count === 0) return { avg: 0, p95: 0, worst: this.worst };
    const arr = Array.from(this.buf.subarray(0, this.count)).sort((a, b) => a - b);
    const sum = arr.reduce((s, v) => s + v, 0);
    return {
      avg: sum / arr.length,
      p95: arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))],
      worst: this.worst,
    };
  }

  resetWorst() {
    this.worst = 0;
  }
}

export class Metrics {
  constructor(element) {
    this.el = element;
    this.visible = true;
    this.series = {
      // 프레임 "작업 시간"과 "간격"은 다른 값이다. 작업 시간만 보고 fps 를 역산하면
      // 실제로는 30fps 로 돌면서 "7000 fps" 라고 표시하게 된다.
      frame: new Series('프레임 작업', 'ms', 16.6),
      interval: new Series('프레임 간격', 'ms', 17.5),
      physics: new Series('physics', 'ms', 4),
      hull: new Series('hull 변환', 'ms', 30),
      carve: new Series('carve', 'ms', 8),
    };
    this._lastBeat = 0;
    this.notes = {};
    this._lastRender = 0;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  push(key, ms) {
    this.series[key]?.push(ms);
  }

  /** rAF 콜백 간격 — 실제 프레임률의 유일한 근거. */
  beat(now) {
    if (this._lastBeat) this.series.interval.push(now - this._lastBeat);
    this._lastBeat = now;
  }

  note(key, value) {
    this.notes[key] = value;
  }

  resetWorst() {
    for (const s of Object.values(this.series)) s.resetWorst();
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  /** 렌더는 초당 몇 번이면 충분하다 — HUD 자체가 프레임을 갉아먹으면 본말전도다. */
  render(now) {
    if (!this.visible || now - this._lastRender < 200) return;
    this._lastRender = now;

    const rows = Object.entries(this.series).map(([key, s]) => {
      const { avg, p95, worst } = s.stats();
      const over = p95 > s.budget;
      const fps = key === 'interval' && avg > 0 ? ` · ${(1000 / avg).toFixed(0)} fps` : '';
      return `<div class="m-row${over ? ' over' : ''}">
        <span class="m-key">${s.label}</span>
        <span class="m-val">${avg.toFixed(2)} / p95 ${p95.toFixed(2)} / max ${worst.toFixed(2)} ${s.unit}</span>
        <span class="m-budget">≤${s.budget}${fps}</span>
      </div>`;
    });

    const noteRows = Object.entries(this.notes).map(([k, v]) =>
      `<div class="m-row note"><span class="m-key">${k}</span><span class="m-val">${v}</span></div>`);

    this.el.innerHTML = `<div class="m-title">D0 계측 · F3 토글</div>${rows.join('')}${noteRows.join('')}`;
  }
}
