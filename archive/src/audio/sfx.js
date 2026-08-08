// 효과음 뱅크 — 엔벨로프 있는 짧은 원샷 모음.
// 각 항목은 (ctx, dest) => void. dest는 sfxGain (audio.js가 연결해서 넘긴다).
// talk의 피치 랜덤은 일회성 이벤트라 Math.random() 허용 (애니메이션 프레임 아님).

import { tone, noiseHit, sweep } from './synth.js';

export const SFX = {
  /** UI 버튼 클릭 — 짧고 높은 상행 블립 */
  click(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'square', 900, 1400, t, 0.06, 0.18);
  },

  /** 취소/뒤로 — 하강 블립 (click의 반대 방향) */
  cancel(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'square', 700, 350, t, 0.09, 0.18);
  },

  /** 그림 제출/확정 — 도→솔 상행 두 음 */
  submit(ctx, dest) {
    const t = ctx.currentTime;
    tone(ctx, dest, 'square', 76, t, 0.07, 0.2);
    tone(ctx, dest, 'square', 83, t + 0.08, 0.14, 0.2);
  },

  /** 붓질 — 스윽 하는 노이즈 스웰 */
  brush(ctx, dest) {
    const t = ctx.currentTime;
    noiseHit(ctx, dest, 78, t, 0.16, 0.12, 0.05);
  },

  /** 공격 적중 — 하강 스윕 + 노이즈 임팩트 */
  hit(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'square', 400, 80, t, 0.12, 0.25);
    noiseHit(ctx, dest, 74, t, 0.07, 0.2);
  },

  /** 피격 — 낮고 거친 하강 (hit보다 무겁게) */
  damage(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'sawtooth', 300, 55, t, 0.3, 0.3);
    noiseHit(ctx, dest, 62, t, 0.18, 0.15);
  },

  /** 전투 승리 징글 — 장조 아르페지오 상행 */
  win(ctx, dest) {
    const t = ctx.currentTime;
    tone(ctx, dest, 'square', 72, t, 0.09, 0.2);
    tone(ctx, dest, 'square', 76, t + 0.09, 0.09, 0.2);
    tone(ctx, dest, 'square', 79, t + 0.18, 0.09, 0.2);
    tone(ctx, dest, 'square', 84, t + 0.27, 0.4, 0.2);
  },

  /** 패배 징글 — 단조 하행, 마지막 음을 길게 */
  lose(ctx, dest) {
    const t = ctx.currentTime;
    tone(ctx, dest, 'triangle', 64, t, 0.16, 0.3);
    tone(ctx, dest, 'triangle', 60, t + 0.17, 0.16, 0.3);
    tone(ctx, dest, 'triangle', 55, t + 0.34, 0.16, 0.3);
    tone(ctx, dest, 'triangle', 51, t + 0.51, 0.5, 0.3);
  },

  /** 대화 타자기 블립 — 피치를 살짝 흔들어 단조로움 방지 */
  talk(ctx, dest) {
    const t = ctx.currentTime;
    const midi = 79 + (Math.random() * 3 - 1.5); // 일회성이므로 허용
    tone(ctx, dest, 'square', midi, t, 0.035, 0.07);
  },

  /** 아이템/도안 조각 획득 — 동전 소리풍 두 음 */
  pickup(ctx, dest) {
    const t = ctx.currentTime;
    tone(ctx, dest, 'square', 83, t, 0.05, 0.18);
    tone(ctx, dest, 'square', 88, t + 0.055, 0.12, 0.18);
  },

  /** 입항/정박 — 낮은 쿵 + 잔물결 */
  dock(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'triangle', 150, 55, t, 0.2, 0.45);
    noiseHit(ctx, dest, 46, t + 0.05, 0.35, 0.1);
  },
};
