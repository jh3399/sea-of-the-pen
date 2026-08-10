// 칩튠 오디오 시스템 진입점 — WebAudio 코드 작곡. 외부 오디오 파일 없음.
// 그래프: (노트 보이스들) → 트랙게인 → bgmGain ┐
//                                (효과음) → sfxGain ┴→ master → 컴프레서 → destination
// 박자는 setInterval 시각이 아니라 AudioContext 절대 시간으로 예약하므로
// 타이머 드리프트가 생겨도 박자가 밀리지 않는다 (25ms 틱, 120ms 선행 예약).
//
// BGM 트랙 (playBgm(key)):
// | key     | 용도          | 분위기                              |
// |---------|---------------|-------------------------------------|
// | title   | 타이틀        | 잔잔한 밤바다, 단조 아르페지오      |
// | harbor  | 부두          | 밝은 장조 뱃노래 (셔플)             |
// | sail    | 항해          | 힘찬 장조 멜로디 + 달리는 베이스    |
// | village | 마을          | 3/4 왈츠, 목가풍 삼각파             |
// | battle  | 전투          | 빠른 단조, 드라이빙 베이스 + 하이햇 |
// | tension | 긴장/불길     | 저음 드론 + 반음계 모티프           |
// | victory | 승리 팡파르   | 원샷 — 루프 없음, 끝나면 자동 정지  |
//
// SFX (sfx(name)):
// | name    | 용도             | name    | 용도               |
// |---------|------------------|---------|--------------------|
// | click   | UI 버튼          | win     | 전투 승리 징글     |
// | submit  | 그림 제출/확정   | lose    | 패배 징글          |
// | brush   | 붓질             | talk    | 대화 타자기 블립   |
// | hit     | 공격 적중        | pickup  | 아이템/조각 획득   |
// | damage  | 피격             | dock    | 입항/정박          |
// | cancel  | 취소/뒤로        | charge  | 빔 충전(경고선)    |
// | row     | 노 젓기          | suck    | 보스 물 빨아들이기 |
// | booster | 부스터 점화      | roar    | 보스 페이즈 전환   |
// | cannon  | 대포 발사        | laser   | 레이저 빔 발사     |
// | wreck   | 난파선 투척      |         |                    |

import { TRACKS } from './tracks.js';
import { SFX } from './sfx.js';
import { tone, noiseHit } from './synth.js';

const TICK_MS = 25;      // 스케줄러 틱 간격
const LOOKAHEAD = 0.12;  // 선행 예약 구간 (초)
const FADE = 0.25;       // 곡 교체 페이드아웃 (초)

let ctx = null;          // AudioContext (initAudio 전에는 null)
let master = null;
let bgmGain = null;
let sfxGain = null;

let bgmVol = 0.7;        // init 전에 설정해도 기억했다가 반영
let sfxVol = 0.9;

let cur = null;          // 재생 중 트랙 상태 { key, track, gain, spb, loopDur, base, ptr, live, timer }
let curKey = null;       // 현재(또는 예약된) BGM 키 — currentBgm()의 답
let pendingKey = null;   // init 전에 요청된 BGM
let switchTimer = 0;     // 페이드아웃 → 다음 곡 시작 타이머

/** 첫 사용자 제스처에서 호출. AudioContext 생성/resume. 중복 호출 안전. */
export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    flushPending();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // WebAudio 미지원 — 전부 무음 no-op
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor(); // 채널이 겹쳐도 클리핑 방지
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(comp);
  comp.connect(ctx.destination);
  bgmGain = ctx.createGain();
  bgmGain.gain.value = bgmVol;
  bgmGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = sfxVol;
  sfxGain.connect(master);
  if (ctx.state === 'suspended') ctx.resume();
  flushPending();
}

function flushPending() {
  if (!pendingKey) return;
  const key = pendingKey;
  pendingKey = null;
  curKey = null; // playBgm의 "같은 키 무시" 가드를 통과시킨다
  playBgm(key);
}

/** BGM 재생. 같은 키 재호출은 무시, 다른 곡이면 짧은 페이드아웃 후 교체. */
export function playBgm(key) {
  if (!TRACKS[key]) {
    console.warn('[audio] 없는 BGM 키:', key);
    return;
  }
  if (key === curKey) return;
  if (!ctx) { // init 전 — 기억해뒀다 initAudio 때 재생
    pendingKey = key;
    curKey = key;
    return;
  }
  curKey = key;
  if (switchTimer) {
    clearTimeout(switchTimer);
    switchTimer = 0;
  }
  if (cur) {
    fadeOutCur();
    switchTimer = setTimeout(() => {
      switchTimer = 0;
      if (curKey === key) startTrack(key);
    }, FADE * 1000);
  } else {
    startTrack(key);
  }
}

/** BGM 정지 (페이드아웃). */
export function stopBgm() {
  pendingKey = null;
  curKey = null;
  if (switchTimer) {
    clearTimeout(switchTimer);
    switchTimer = 0;
  }
  if (cur) fadeOutCur();
}

/** 현재 BGM 키 (없으면 null). */
export function currentBgm() {
  return curKey;
}

/** 효과음 1회 재생. init 전엔 무음 no-op. */
export function sfx(name) {
  if (!ctx) return;
  const fn = SFX[name];
  if (!fn) {
    console.warn('[audio] 없는 SFX 이름:', name);
    return;
  }
  if (ctx.state === 'suspended') ctx.resume();
  fn(ctx, sfxGain);
}

/** BGM 볼륨 0..1 */
export function setBgmVolume(v) {
  bgmVol = clamp(v, 0, 1);
  if (ctx) bgmGain.gain.setTargetAtTime(bgmVol, ctx.currentTime, 0.03);
}

/**
 * 효과음 버스 볼륨. **1을 넘겨도 된다** — 뒤에 달린 컴프레서(`initAudio`)가 마스터에서
 * 받아 주므로, 개별 파형을 하나하나 다시 그리는 대신 이 버스 게인 하나로 "전체적으로 더
 * 크게"를 낼 수 있다. 상한 4 는 짧은 원샷 여러 개가 우연히 겹쳐도 컴프레서가 받아 줄
 * 여유를 남긴 값이다 — 이 위로 더 올리면 겹칠 때 찌그러질 수 있다.
 */
export function setSfxVolume(v) {
  sfxVol = clamp(v, 0, 4);
  if (ctx) sfxGain.gain.setTargetAtTime(sfxVol, ctx.currentTime, 0.03);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Number(v) || 0));
}

// ---- 내부: 룩어헤드 스케줄러 -------------------------------------------

function startTrack(key) {
  const track = TRACKS[key];
  const gain = ctx.createGain(); // 트랙 전용 게인 — 페이드아웃이 bgm 볼륨 설정을 건드리지 않게
  gain.gain.value = 1;
  gain.connect(bgmGain);
  const spb = 60 / track.bpm; // 박당 초
  const c = {
    key, track, gain, spb,
    loopDur: track.beats * spb,
    base: ctx.currentTime + 0.06,          // 이번 루프의 0박 시각
    ptr: track.channels.map(() => 0),      // 채널별 다음 예약 노트 인덱스
    live: new Set(),                       // 아직 울리는 소스 노드 (즉시 정지용)
    timer: 0,
  };
  cur = c;
  c.timer = setInterval(() => tick(c), TICK_MS);
  tick(c);
}

function tick(c) {
  const horizon = ctx.currentTime + LOOKAHEAD;
  let guard = 0;
  while (guard++ < 64) {
    // 1) 시야(horizon) 안에 든 노트를 채널별로 예약
    let allDone = true;
    c.track.channels.forEach((ch, ci) => {
      const notes = ch.notes;
      let i = c.ptr[ci];
      while (i < notes.length && c.base + notes[i][0] * c.spb < horizon) {
        const [beat, len, midi] = notes[i];
        scheduleNote(c, ch, c.base + beat * c.spb, Math.max(0.03, len * c.spb), midi);
        i++;
      }
      c.ptr[ci] = i;
      if (i < notes.length) allDone = false;
    });
    if (!allDone) break;
    // 2) 이번 루프의 노트를 전부 예약했다
    if (c.track.loop === false) {
      // 원샷 트랙(victory): 곡 끝 시각에 정리 예약하고 스케줄러 종료
      clearInterval(c.timer);
      const endMs = Math.max(0, (c.base + c.loopDur - ctx.currentTime) * 1000);
      setTimeout(() => {
        if (cur === c) {
          cur = null;
          curKey = null;
          c.gain.disconnect();
        }
      }, endMs + 200);
      break;
    }
    if (c.base + c.loopDur >= horizon) break; // 다음 루프 첫 박이 아직 시야 밖
    c.base += c.loopDur;                      // 다음 루프로 — 절대 시간 기준이라 드리프트 없음
    c.ptr = c.track.channels.map(() => 0);
  }
}

function scheduleNote(c, ch, t, dur, midi) {
  const peak = ch.gain != null ? ch.gain : 0.2;
  const node = ch.wave === 'noise'
    ? noiseHit(ctx, c.gain, midi, t, dur, peak)
    : tone(ctx, c.gain, ch.wave, midi, t, dur, peak);
  c.live.add(node);
  node.onended = () => c.live.delete(node);
}

function fadeOutCur() {
  const c = cur;
  cur = null;
  clearInterval(c.timer); // 스케줄러 정리 (원샷 트랙이면 이미 꺼져 있어도 안전)
  const now = ctx.currentTime;
  c.gain.gain.cancelScheduledValues(now);
  c.gain.gain.setValueAtTime(c.gain.gain.value, now);
  c.gain.gain.linearRampToValueAtTime(0.0001, now + FADE);
  setTimeout(() => { // 페이드가 끝나면 남은 노트를 전부 끊고 노드 해제
    for (const node of c.live) {
      try { node.stop(); } catch (e) { /* 이미 멈춘 노드 */ }
    }
    c.live.clear();
    c.gain.disconnect();
  }, FADE * 1000 + 60);
}
