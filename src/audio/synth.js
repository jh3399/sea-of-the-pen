// 공용 신스 유틸 — BGM 스케줄러(audio.js)와 효과음(sfx.js)이 함께 쓰는 저수준 보이스.
// 규칙: 모든 노트에 어택/릴리즈 엔벨로프를 걸어 클릭 노이즈를 막는다.
//       노이즈 버퍼는 시드 고정 LCG로 만든다 (Math.random() 없이 재현 가능).

/** MIDI 노트 번호 → 주파수(Hz). 소수 midi(미세 피치)도 허용. */
export function midiHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 화이트노이즈 1초 버퍼 — 컨텍스트당 1회만 생성해 재사용
let noiseBuf = null;
export function noiseBuffer(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let s = 22222; // 시드 고정 LCG
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s / 2147483648 - 1; // [-1, 1)
    }
  }
  return noiseBuf;
}

/**
 * 오실레이터 노트 1개를 t초(AudioContext 시간)에 예약한다.
 * 반환한 소스 노드는 .stop()으로 즉시 끊을 수 있다.
 */
export function tone(ctx, dest, wave, midi, t, dur, peak) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = midiHz(midi);
  const g = ctx.createGain();
  const atk = Math.min(0.01, dur * 0.2);   // 어택
  const rel = Math.min(0.08, dur * 0.35);  // 릴리즈
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak, Math.max(t + atk, t + dur - rel));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}

/**
 * 노이즈 노트 1개 예약. midi는 음높이가 아니라 "밝기"로 쓴다:
 *  - midi < 55 : 저역 럼블 (파도·쿵 — 로우패스)
 *  - midi >= 55: 하이햇·스네어 (하이패스, 높을수록 얇고 밝게)
 * atk를 넘기면 스웰(붓질 등), 생략하면 길이에 따라 자동.
 */
export function noiseHit(ctx, dest, midi, t, dur, peak, atk) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  if (midi < 55) {
    f.type = 'lowpass';
    f.frequency.value = Math.min(4000, midiHz(midi) * 10);
  } else {
    f.type = 'highpass';
    f.frequency.value = Math.min(12000, 400 * Math.pow(2, (midi - 60) / 12));
  }
  const a = atk != null ? atk : (dur > 0.5 ? dur * 0.3 : 0.003);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(a + 0.02, dur));
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.05);
  return src;
}

/** 주파수 스윕 원샷 (효과음용): f0 → f1 지수 활강 + 엔벨로프. */
export function sweep(ctx, dest, wave, f0, f1, t, dur, peak) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return osc;
}
