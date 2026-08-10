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

  /**
   * 빔 충전 — 낮은 데서 높이 치솟는 스윕. **경고선이 켜지는 순간 한 번만** 부른다.
   * 프레임마다 부르면 스윕이 겹쳐 쌓여 화이트노이즈가 된다.
   */
  charge(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'sawtooth', 180, 1600, t, 0.9, 0.16);
  },

  /** 빨아들이기 — 높은 데서 낮게 꺼지는 스윕 + 저역 럼블. charge 의 정확한 반대 방향이다. */
  suck(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'triangle', 700, 90, t, 1.2, 0.22);
    noiseHit(ctx, dest, 46, t, 1.0, 0.14, 0.2);
  },

  /** 포효 — 페이즈가 넘어갈 때. 아주 낮게 떨어지는 스윕 + 거친 노이즈. */
  roar(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'sawtooth', 120, 58, t, 0.8, 0.3);
    noiseHit(ctx, dest, 52, t, 0.5, 0.22, 0.06);
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

  /**
   * 노 젓기 — 노깃이 물에 들어가는 짧은 물보라 + 낮은 삑. 스트로크 사이클이 시작될 때마다.
   * midi 를 밝게(58) 잡아야 highpass 노이즈가 걸려 "찰박" 소리가 또렷이 들린다 —
   * 낮은 midi(<55)는 lowpass 라 저역 웅얼거림이 되어 BGM 에 묻힌다.
   */
  row(ctx, dest) {
    const t = ctx.currentTime;
    noiseHit(ctx, dest, 58, t, 0.08, 0.34, 0.004);
    sweep(ctx, dest, 'triangle', 260, 150, t, 0.11, 0.3);
  },

  /** 부스터 점화 — 트리거를 누르는 순간 한 번. 상승 스윕 + 거친 노이즈로 추력을 표현. */
  booster(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'sawtooth', 110, 340, t, 0.24, 0.42);
    noiseHit(ctx, dest, 62, t, 0.22, 0.32, 0.015);
  },

  /**
   * 대포 발사 — 저역 쿵(body) + 고역 크랙(crack) 두 겹. 저역 노이즈 하나만으로는
   * lowpass 가 에너지를 깎아 먹어 "쿵"이 아니라 "웅"으로 들린다 — 밝은 크랙 층이
   * 귀에 꽂히는 어택을 담당하고 저역은 무게만 보탠다.
   */
  cannon(ctx, dest) {
    const t = ctx.currentTime;
    noiseHit(ctx, dest, 72, t, 0.05, 0.4, 0.002);
    noiseHit(ctx, dest, 42, t, 0.18, 0.48, 0.004);
    sweep(ctx, dest, 'square', 280, 55, t, 0.17, 0.36);
  },

  /** 레이저 빔 발사 — charge(충전)의 반대 극. 아주 밝고 빠른 하강 지그재그 스윕. */
  laser(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'sawtooth', 2200, 320, t, 0.24, 0.44);
    sweep(ctx, dest, 'square', 1400, 200, t + 0.02, 0.18, 0.28);
  },

  /** 난파선 투척 — 나무가 회전하며 날아가는 덜그럭 스윕 + 물에 떨어지는 저역 첨벙. */
  wreck(ctx, dest) {
    const t = ctx.currentTime;
    sweep(ctx, dest, 'square', 520, 120, t, 0.24, 0.36);
    noiseHit(ctx, dest, 46, t + 0.07, 0.32, 0.4, 0.05);
  },
};
