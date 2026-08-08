// planck(Box2D 2.4 포트) 어댑터.
//
// 엔진 의존을 이 파일과 body.js 에만 가두어 둔다. D0 통과 질문에서 성능이 미달하면
// Rapier2D 로 갈아탈 수 있어야 하고, 그때 고쳐야 할 파일이 여기로 한정되게 하는 것이 목적이다.
import { World, Vec2 } from 'planck';

export const FIXED_DT = 1 / 60;
export const VELOCITY_ITERATIONS = 8;
export const POSITION_ITERATIONS = 3;
/** 한 프레임에 허용하는 최대 물리 스텝 — 탭 복귀 시 죽음의 나선을 막는다. */
const MAX_STEPS_PER_FRAME = 5;

/** 탑뷰라 중력은 0. 부력은 흘수 스칼라로 축약되어 §2.1 이 대신한다. */
export function createWorld() {
  return new World({ gravity: new Vec2(0, 0), allowSleep: false });
}

/**
 * 고정 타임스텝 누산기. 렌더 프레임률과 무관하게 물리를 1/60 로 굴린다.
 * 결정성이 확보돼야 D3 의 실패 분석(항적 재현)이 성립한다.
 */
export class FixedStepper {
  constructor(world, { onPreStep } = {}) {
    this.world = world;
    this.onPreStep = onPreStep;
    this.accumulator = 0;
    this.lastStepMs = 0;
  }

  /** @param {number} elapsed 초 단위 경과 시간 */
  advance(elapsed) {
    this.accumulator += Math.min(elapsed, 0.25);
    let steps = 0;
    const t0 = performance.now();
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.onPreStep?.(FIXED_DT);
      this.world.step(FIXED_DT, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // 밀린 시간은 버린다
    this.lastStepMs = performance.now() - t0;
    return { steps, ms: this.lastStepMs };
  }
}

export { Vec2 };
