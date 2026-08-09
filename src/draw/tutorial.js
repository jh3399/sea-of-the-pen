import {
  TUTORIAL_STEPS,
  createTutorialState,
  currentTutorialStep,
  isStepSatisfied,
  reduceTutorial,
} from './tutorial-flow.js';

const STORAGE_KEY = 'shipwright:drawTutorial:v1';
const TARGET_PAD = 8;
const CARD_GAP = 16;
const VIEWPORT_PAD = 12;

export class DrawTutorial {
  constructor({ getSnapshot, replayButton }) {
    this.getSnapshot = getSnapshot;
    this.replayButton = replayButton;
    this.layer = document.getElementById('draw-tutorial');
    this.ring = document.getElementById('tutorial-ring');
    this.shield = document.getElementById('tutorial-shield');
    this.card = document.getElementById('tutorial-card');
    this.stepEl = document.getElementById('tutorial-step');
    this.titleEl = document.getElementById('tutorial-title');
    this.bodyEl = document.getElementById('tutorial-body');
    this.hintEl = document.getElementById('tutorial-hint');
    this.nextBtn = document.getElementById('tutorial-next');
    this.skipBtn = document.getElementById('tutorial-skip');
    this.masks = [...this.layer.querySelectorAll('[data-tutorial-mask]')];

    this.state = null;
    this.target = null;
    this.previousFocus = null;
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.position());

    this.position = this.position.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.nextBtn.addEventListener('click', () => this.handle('NEXT'));
    this.skipBtn.addEventListener('click', () => this.skip());
    this.replayButton.addEventListener('click', () => this.replay());
    window.addEventListener('resize', this.position);
    window.addEventListener('keydown', this.onKeyDown);
  }

  startIfNeeded() {
    if (this.readStored()) return;
    this.open();
  }

  replay() {
    this.open(true);
  }

  open(replay = false) {
    if (this.isOpen()) this.disconnectTarget();
    this.previousFocus = document.activeElement;
    this.state = replay
      ? reduceTutorial(this.state ?? createTutorialState(), 'REPLAY')
      : createTutorialState();
    this.layer.hidden = false;
    this.render();
  }

  isOpen() {
    return !this.layer.hidden && this.state?.status === 'active';
  }

  handle(event) {
    if (!this.isOpen()) return;
    const next = reduceTutorial(this.state, event, this.getSnapshot());
    if (next === this.state) return;
    this.state = next;
    if (this.state.status !== 'active') {
      this.close();
      return;
    }
    this.render();
  }

  complete() {
    this.writeStored('completed');
    if (!this.isOpen()) return;
    this.state = reduceTutorial(this.state, 'FINISHED', this.getSnapshot());
    this.close(false);
  }

  skip() {
    if (!this.isOpen()) return;
    this.writeStored('dismissed');
    this.state = reduceTutorial(this.state, 'SKIP', this.getSnapshot());
    this.close();
  }

  close(restoreFocus = true) {
    this.disconnectTarget();
    this.layer.hidden = true;
    if (!restoreFocus) return;
    const fallback = this.replayButton;
    const focusTarget = this.previousFocus?.isConnected ? this.previousFocus : fallback;
    focusTarget?.focus();
  }

  render() {
    const step = currentTutorialStep(this.state);
    if (!step) {
      this.close();
      return;
    }

    const target = document.querySelector(step.target);
    if (!target) {
      console.warn(`[draw tutorial] target not found: ${step.target}`);
      this.skip();
      return;
    }

    this.disconnectTarget();
    this.target = target;
    this.resizeObserver?.observe(target);

    const snapshot = this.getSnapshot();
    const satisfied = isStepSatisfied(step, snapshot);
    const canUseNext = step.mode === 'info' || (satisfied && step.id !== 'finish');

    this.layer.dataset.mode = step.mode;
    this.stepEl.textContent = `${this.state.index + 1} / ${TUTORIAL_STEPS.length}`;
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;
    this.hintEl.textContent = canUseNext ? '' : (step.actionHint ?? '강조된 곳에서 직접 해 보세요.');
    this.hintEl.hidden = canUseNext;
    this.nextBtn.hidden = !canUseNext;
    this.shield.style.pointerEvents = step.mode === 'action' ? 'none' : 'auto';

    this.position();
    requestAnimationFrame(() => {
      this.position();
      if (canUseNext) this.nextBtn.focus();
    });
  }

  disconnectTarget() {
    if (this.target) this.resizeObserver?.unobserve(this.target);
    this.target = null;
  }

  position() {
    if (!this.isOpen() || !this.target) return;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const raw = this.target.getBoundingClientRect();
    const left = Math.max(0, raw.left - TARGET_PAD);
    const top = Math.max(0, raw.top - TARGET_PAD);
    const right = Math.min(viewport.width, raw.right + TARGET_PAD);
    const bottom = Math.min(viewport.height, raw.bottom + TARGET_PAD);
    const rect = { left, top, right, bottom, width: right - left, height: bottom - top };

    this.setBox(this.ring, rect.left, rect.top, rect.width, rect.height);
    this.setBox(this.shield, rect.left, rect.top, rect.width, rect.height);
    this.setMaskBoxes(rect, viewport);
    this.positionCard(rect, viewport);
  }

  setMaskBoxes(rect, viewport) {
    const boxes = [
      [0, 0, viewport.width, rect.top],
      [0, rect.top, rect.left, rect.height],
      [rect.right, rect.top, viewport.width - rect.right, rect.height],
      [0, rect.bottom, viewport.width, viewport.height - rect.bottom],
    ];
    this.masks.forEach((mask, index) => this.setBox(mask, ...boxes[index]));
  }

  positionCard(rect, viewport) {
    const cardRect = this.card.getBoundingClientRect();
    const spaces = [
      { side: 'right', size: viewport.width - rect.right },
      { side: 'left', size: rect.left },
      { side: 'bottom', size: viewport.height - rect.bottom },
      { side: 'top', size: rect.top },
    ].sort((a, b) => b.size - a.size);
    const side = spaces[0].side;
    let x;
    let y;

    if (side === 'right') {
      x = rect.right + CARD_GAP;
      y = rect.top + (rect.height - cardRect.height) / 2;
    } else if (side === 'left') {
      x = rect.left - cardRect.width - CARD_GAP;
      y = rect.top + (rect.height - cardRect.height) / 2;
    } else if (side === 'bottom') {
      x = rect.left + (rect.width - cardRect.width) / 2;
      y = rect.bottom + CARD_GAP;
    } else {
      x = rect.left + (rect.width - cardRect.width) / 2;
      y = rect.top - cardRect.height - CARD_GAP;
    }

    x = Math.max(VIEWPORT_PAD, Math.min(x, viewport.width - cardRect.width - VIEWPORT_PAD));
    y = Math.max(VIEWPORT_PAD, Math.min(y, viewport.height - cardRect.height - VIEWPORT_PAD));
    this.card.style.left = `${Math.round(x)}px`;
    this.card.style.top = `${Math.round(y)}px`;
  }

  setBox(element, left, top, width, height) {
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.width = `${Math.max(0, Math.round(width))}px`;
    element.style.height = `${Math.max(0, Math.round(height))}px`;
  }

  onKeyDown(event) {
    if (event.key !== 'Escape' || !this.isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.skip();
  }

  readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  writeStored(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // 저장소가 막혀도 현재 페이지의 튜토리얼은 정상적으로 끝낸다.
    }
  }
}
