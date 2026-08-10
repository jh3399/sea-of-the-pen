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
  constructor({ getSnapshot, replayButton, getReplaySteps }) {
    this.getSnapshot = getSnapshot;
    this.replayButton = replayButton;
    // "? 튜토리얼" 버튼이 다시 보여줄 단계 목록을 늦게(클릭 시점에) 묻는다 — 스테이지가
    // 바뀌어 새로 열린 것이 있으면 그것도 같이 보여주고 싶은데, 그 목록은 지금 스테이지에
    // 달려 있어 생성 시점에 한 번만 고정해 두면 stale 해진다. 없으면 기본 목록으로 되돌린다.
    this.getReplaySteps = getReplaySteps ?? (() => TUTORIAL_STEPS);
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

    this.steps = TUTORIAL_STEPS;
    this.storageKey = STORAGE_KEY;
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
    this.steps = TUTORIAL_STEPS;
    this.storageKey = STORAGE_KEY;
    if (this.readStored()) return;
    this.open();
  }

  /**
   * 스테이지가 바뀌며 새로 열린 아이템·재질을 짚어주는 짧은 안내를 연다 — 기본 튜토리얼과
   * 같은 오버레이(고리·카드·리스너)를 그대로 쓰되 단계 목록과 저장 키만 갈아 낀다. DOM도
   * 이벤트 리스너도 하나뿐이라야 인스턴스를 두 개 두고 같은 버튼이 두 번 반응하는 사고가
   * 안 난다. 기본 튜토리얼이 이미 열려 있으면(첫 방문) 자리를 내주지 않는다.
   */
  startUnlockIfNeeded(steps, storageKey) {
    if (!steps.length || this.isOpen() || this.readStored(storageKey)) return;
    this.steps = steps;
    this.storageKey = storageKey;
    this.open();
  }

  replay() {
    this.steps = this.getReplaySteps();
    this.storageKey = STORAGE_KEY;
    this.open(true);
  }

  open(replay = false) {
    if (this.isOpen()) this.disconnectTarget();
    this.previousFocus = document.activeElement;
    this.state = replay
      ? reduceTutorial(this.state ?? createTutorialState(), 'REPLAY', {}, this.steps)
      : createTutorialState();
    this.layer.hidden = false;
    this.render();
  }

  isOpen() {
    return !this.layer.hidden && this.state?.status === 'active';
  }

  handle(event) {
    if (!this.isOpen()) return;
    const next = reduceTutorial(this.state, event, this.getSnapshot(), this.steps);
    if (next === this.state) return;
    this.state = next;
    if (this.state.status !== 'active') {
      // 기본 튜토리얼은 마지막 단계가 '완성하기' 버튼(action)이라 여기로 안 온다 — 실제
      // 완료는 `complete()` 가 외부에서 부른다. 하지만 언락 안내는 전 단계가 정보문이라
      // "다음"만 눌러도 여기서 끝까지 도달하므로, 그 경로에서도 저장해야 다시 안 뜬다.
      if (this.state.status === 'completed') this.writeStored('completed');
      this.close();
      return;
    }
    this.render();
  }

  /** `finish()` 에서만 부른다 — **항상 기본 튜토리얼의 키**를 완료 처리한다. 완성하기를
   *  누른 시점에 언락 안내가 열려 있었더라도(`this.storageKey` 가 그쪽을 가리키고 있어도)
   *  이 호출이 뜻하는 것은 "그리기 화면을 한 번 완주했다"이지 언락 안내와는 무관하다. */
  complete() {
    this.writeStored('completed', STORAGE_KEY);
    if (!this.isOpen()) return;
    this.state = reduceTutorial(this.state, 'FINISHED', this.getSnapshot(), this.steps);
    this.close(false);
  }

  skip() {
    if (!this.isOpen()) return;
    this.writeStored('dismissed');
    this.state = reduceTutorial(this.state, 'SKIP', this.getSnapshot(), this.steps);
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
    const step = currentTutorialStep(this.state, this.steps);
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
    this.stepEl.textContent = `${this.state.index + 1} / ${this.steps.length}`;
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

  readStored(key = this.storageKey) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  writeStored(value, key = this.storageKey) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 저장소가 막혀도 현재 페이지의 튜토리얼은 정상적으로 끝낸다.
    }
  }
}
