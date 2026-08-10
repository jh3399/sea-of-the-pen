// 기본 장치(§5.1)의 힘 모델 — 좌현 노 · 우현 노 · 닻, 그리고 아이템으로 강등된 키.
//
// hydro.js 와 같은 구조로 **순수 계산 함수 + 얇은 planck 적용부**로 나눈다. 순수 함수를
// 따로 두는 이유는 예측 궤적선(predict.js)이 같은 식을 그대로 호출해야 예측과 실제가
// 일치하기 때문이다.
//
// 조향 시스템 코드는 여기에도 없다. 노는 **선체 로컬의 한 점에 힘을 주는 것**이 전부이고,
// 선회는 τ = r × F 에서 저절로 나온다 (§4.1). D1 의 단일 노는 비대칭 선체에서만 팔길이를
// 얻었지만, 좌우로 나뉜 노는 **대칭 선체에서도** 한쪽만 저으면 팔길이를 얻는다 — 조향이
// 장치 배치의 순수한 결과가 되고 키의 전용 양력식은 기본 장착에서 빠진다.
import { Vec2, RevoluteJoint } from 'planck';
import { HYDRO_TUNING } from '../hull/params.js';
import {
  CANNON_TUNING, cannonEnvelope, cannonPeakForce, cannonShotRequest,
} from '../items/cannon.js';

export const DEVICE_TUNING = {
  // --- 노: 스트로크(한 번 젓기) 모델 ---
  //
  // 꾹 누르면 지속 추력이 나오던 D1 모델을 버리고 **누를 때마다 한 번 젓는** 방식으로 바꾼다.
  // 게임성 이유만이 아니다: 아래 oarMaxSpeed 감쇠가 지속 입력에서는 그저 종단 속도 상한으로만
  // 느껴지는데, 스트로크에서는 **최적 젓기 타이밍**이 된다 (속도가 붙었을 때 저으면 물을 헛젓고,
  // 조금 감속했을 때 저어야 온전한 추력이 나온다). 규칙을 더하지 않고 기존 항에서 리듬이 창발한다.

  /** 봉투 길이 D (s) — 입수 → 당김 → 회수 한 사이클. */
  oarStrokeDuration: 0.45,
  /**
   * 회수 쿨다운 C (s). 재입력을 막는 구간이라 최대 케이던스가 1/(D+C) 로 묶인다.
   *
   * ⚠ **연타 실험용 노브.** 0 이면 봉투가 끝나는 즉시 다시 저을 수 있어(2.22 회/s) 노가
   * 사실상 쉬지 않는다. 0.3 이면 1.33 회/s 로 "젓고 활공하기"가 강제된다.
   * 값을 바꿀 때 oarStrokePeak 도 같이 봐야 한다 — 듀티비 D/(D+C) 가 평균 추력을 정한다.
   */
  oarStrokeCooldown: 0,
  /**
   * 입력 버퍼 (s). 게이트가 열리기 이 시간 전까지의 입력은 **기억했다가 열리는 순간 발사**한다.
   *
   * 없으면 회수 중에 누른 키가 아무 반응 없이 사라져 "씹혔다"고 느껴진다. 연타의 체감은
   * 최대 케이던스보다 이쪽에 더 많이 걸려 있다 — 상한은 어차피 물리가 정하고, 플레이어가
   * 원하는 건 "누른 것이 언젠가는 반영된다"는 확신이다.
   * 창(窓)을 두는 이유는 유령 스트로크 방지다. 한참 전에 누른 것까지 기억하면 손을 뗀 뒤에도
   * 배가 혼자 한 번 더 젓는다.
   */
  oarStrokeBuffer: 0.25,
  /**
   * 노 하나의 피크 추력 (N/m², 갑판 면적당).
   *
   * 감쇠를 선형에서 `(1 − r²)²` 곡선으로 바꾸면서 250 → 400 으로 올렸다. 곡선은 종단 속도가
   * 서는 자리(r ≈ 0.8)에서 선형보다 낮아(0.123 vs 0.194) 그대로 두면 배가 느려진다.
   * 400 이면 종단이 2.91 m/s 로 선형 모델과 같고, 대신 **저·중속 가속만 살아난다** —
   * 곡선으로 바꾼 목적이 정확히 그것이다.
   *
   * 이 값을 건드리면 종단 속도가 움직이고, 종단 속도는 §6 화산대 통과 타이밍(가설 C)의
   * 전제다. 바꾼 뒤에는 반드시 `npm run bench` 로 젖은 나무배 케이스를 다시 봐야 한다.
   *
   * 800 → 550: 사람이 몰아 보고 "노가 배를 너무 세게 민다"는 판정이 나왔다. **여기가 한 번
   * 젓기의 체감을 정하는 노브다** — 정지에서 한 번 저었을 때 붙는 속도가 1.17 → 0.81 m/s 로
   * 31% 줄었다. 반면 종단은 거의 안 따라 내려온다 (같은 항력에서 4.66 → 4.44). falloff 곡선이
   * 종단을 `oarMaxSpeed` 에 묶어 두기 때문이다 — 즉 이 값은 **가속의 크기**를 정하고 최고
   * 속도는 `oarMaxSpeed` 가 정한다. "느려졌다"가 아니라 "한 번에 덜 튀어나간다"가 된다.
   * (같은 커밋에서 들어간 `HYDRO_TUNING.dragLowSpeed` 까지 합치면 종단 4.24 m/s.)
   */
  oarStrokePeak: 550,
  /**
   * 노깃의 스트로크 속도 (m/s). 배가 이만큼 빨라지면 노깃이 더 이상 물을 뒤로 밀지 못해
   * 추력이 0 이 된다 — 프로펠러의 전진비 한계와 같은 이야기다.
   *
   * ⚠ "배의 최고 속도"가 아니다. 노만으로는 종단이 2.9 m/s 라 여기에 점근적으로만 다가간다.
   * 이 벽에 실제로 닿는 것은 부스터·돛·해류에 실려 갈 때다 (그때 노는 가속을 못 한다).
   */
  oarMaxSpeed: 6.0,
  /** 역젓기는 더 약하다. */
  oarReverseScale: 0.45,

  // --- 키 (§5.1 "유속 비례 선회력, 정지 시 무효") — D2 부터는 부착 아이템이다 ---
  /** 키 날개 면적 = 갑판 면적 × 이 비율. 큰 배엔 큰 키를 달아 형상 비교를 공정하게 만든다. */
  rudderAreaRatio: 0.06,
  /** 양력 계수. 실제 값이 아니라 게임 튜닝 노브다. */
  rudderLift: 2.4,
  /** 최대 타각 (rad, ≈34°). */
  rudderMaxAngle: 0.6,
  /** 조타 속도 (rad/s). 즉시 꺾이면 배가 아니라 자동차가 된다. */
  rudderRate: 2.0,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * ★ 입력 매핑 — 어느 키가 어느 노를 젓는가. **조작 실험은 이 표만 고치면 된다.**
 *
 * Y-up · +X = 뱃머리이므로 좌현(port)은 y > 0, 우현(starboard)은 y < 0 이다. 노 하나가 내는
 * 토크는 τ = −y·F 이므로 **우현 노를 저으면 좌선회**한다 — 카누와 같다. 그래서 ← 가 우현 노다.
 *
 * ★ 방향키는 **한쪽 앞젓기 + 반대쪽 역젓기**, 즉 제자리 선회다. 두 노의 토크가 같은 부호로
 *   더해지고(≈1.45배) 전진 추력은 서로 깎여(0.55배) 선회 반경이 크게 준다 — 대신 **속도를
 *   판다.** 원칙 2 가 요구하는 대가가 `dir` 부호 하나에서 나오고 조향 코드는 여전히 0줄이다.
 *   고속에서도 듣는다: 앞젓기는 falloff 로 죽지만 역젓기는 `along < 0` 이라 감쇠가 없어
 *   순수 토크 + 제동만 남는다.
 *
 * ★ 그러면 "돌면서 나아가기"는 어디로 갔는가 — **상쇄 규칙**에서 저절로 나온다.
 *   같은 노에 반대 방향 요청이 겹치면 그 노는 물에 넣지 않는다 (노잡이가 한 노를 동시에
 *   두 방향으로 저을 수는 없다). 그래서 ↑ 를 함께 누르면 역젓기가 지워진다:
 *
 *     ←      좌현 −1 · 우현 +1                    제자리 선회
 *     ↑ + ←  좌현 +1 vs −1 → 0 · 우현 +1          우현만 = 넓은 선회 (속도 유지)
 *     ↓ + ←  좌현 −1 · 우현 −1 vs +1 → 0          좌현 역젓기 = 후진하며 선회
 *     ← + →  양쪽 다 0                            두 노 모두 물 밖 (아무 일도 없다)
 *
 *   순항 중에는 이미 ↑ 를 누르고 있으므로 방향키를 더하면 저절로 넓은 선회가 되고, 서서
 *   누르면 제자리로 돈다. 플레이어가 외울 조합이 없다 — **달리면서 꺾으면 넓게, 서서 꺾으면
 *   제자리**가 규칙 하나에서 나온다.
 *
 * ⚠ 상쇄는 교환법칙이 성립하므로 **키를 누른 순서가 거동을 바꿀 수 없다.** 이전의
 *   "나중 요청이 이긴다"에서는 ↓ 를 먼저 누르면 제자리 선회, ← 를 먼저 누르면 그냥 후진이
 *   나왔다 (같은 조합, 다른 거동). 규칙으로 막는 대신 표현 불가능하게 만든 것이다.
 */
export const STROKE_KEYMAP = {
  ArrowUp: [{ side: 'port', dir: 1 }, { side: 'starboard', dir: 1 }],
  ArrowDown: [{ side: 'port', dir: -1 }, { side: 'starboard', dir: -1 }],
  ArrowLeft: [{ side: 'starboard', dir: 1 }, { side: 'port', dir: -1 }],
  ArrowRight: [{ side: 'port', dir: 1 }, { side: 'starboard', dir: -1 }],
};


// ───────────────────────────────────────────────────────── 스트로크 순수 함수

/**
 * ★ 스트로크 시계는 **배에 하나뿐이다.** 노마다 따로 두지 않는다.
 *
 * 노잡이의 케이던스는 팔이 아니라 몸통의 리듬이라, 한쪽 노만 물에 넣든 양쪽을 다 넣든
 * 사이클 타이밍은 같다. 시계를 노마다 두면 위상이 어긋날 수 있는데, 실제로 어긋났다:
 * ← 를 잡고 우현만 젓다가 ↑ 로 바꾸면 쉬던 좌현 노는 즉시 시작하고 우현 노는 자기 게이트를
 * 기다리므로, 둘이 최대 반 사이클 어긋난 채 **영영 고정**돼 번갈아 젓는 꼴이 됐다.
 * (거동도 틀렸다 — 좌우 토크가 번갈아 들어와 직진해야 할 배가 뱀처럼 흔들린다.)
 *
 * `t` = 사이클 시작 후 경과(s), Infinity = 유휴.
 * `port`·`starboard` = 이번 사이클에 그 노가 물에 들어간 방향 (0 = 물 밖).
 * `queued` = 버퍼에 든 다음 사이클의 방향 맵 (null = 없음).
 */
export function createStrokeState() {
  return { t: Infinity, port: 0, starboard: 0, queued: null };
}

/** 스트로크 시계 깊은 복사 — predict.js 가 실제 상태를 앞당겨 돌리지 않게. */
export function cloneStrokeState(s) {
  if (!s) return createStrokeState();
  return { t: s.t, port: s.port, starboard: s.starboard, queued: s.queued ? { ...s.queued } : null };
}

/** 다음 스트로크를 시작할 수 있게 되는 시각 (스트로크 시작 기준, s). */
export function strokeGate() {
  return DEVICE_TUNING.oarStrokeDuration + DEVICE_TUNING.oarStrokeCooldown;
}

/**
 * ★ 노 추력 감쇠 — 진행 방향 속도 성분 `along` 에서 0..1 을 낸다.
 *
 * `(1 − r²)²` 곡선이다. 선형(1 − r)을 쓰면 감쇠가 두 군데서 어색했다:
 *  - **저·중속에서 너무 빨리 죽는다.** 2 m/s(r=0.56)에 벌써 절반 아래라 배가 붙기도 전에
 *    노가 먹통이 된다. 곡선은 같은 자리에서 0.49 → 0.56 으로 버틴다.
 *  - **상한에서 절벽이다.** 선형은 기울기 −1 로 내려오다 r=1 에서 툭 끊긴다. 곡선은 그
 *    지점의 기울기가 0 이라 "점점 헛젓다가 이윽고 안 먹는다"로 매끄럽게 붙는다.
 *
 * ⚠ **r 을 먼저 clamp 한 다음 곡선에 넣어야 한다.** 역젓기는 along < 0 이라 r < 0 인데,
 *   clamp 없이 넣으면 (1 − r²)² 이 다시 작아져 뒤로 젓는 힘이 고속에서 줄어든다.
 *   실제로는 정반대여야 한다 — 배가 빠를수록 역젓기는 물을 더 잘 잡는다.
 */
export function oarFalloff(along) {
  const r = clamp(along / DEVICE_TUNING.oarMaxSpeed, 0, 1);
  const s = 1 - r * r;
  return s * s;
}

/** 대포 하나의 고정 스텝 시계. `t` 는 직전 발사 후 경과, Infinity 면 미발사·장전 완료다. */
export function createCannonState() {
  return { t: Infinity, wasHeld: false };
}

/** 파손·예측용 깊은 복사. 강체나 아이템 참조는 상태에 넣지 않는다. */
export function cloneCannonState(state) {
  return state ? { t: state.t, wasHeld: !!state.wasHeld } : createCannonState();
}

/** 조종 상태의 기본값. 강체마다 하나씩 `hull.control` 에 산다. */
export function createControl() {
  return {
    stroke: createStrokeState(),
    /** 눌려 있는 트리거 바인딩 {KeyA: true, …} — 부스터·키·대포가 읽는다. */
    held: {},
    /** 아이템 고유 key → 독립 재장전·반동 시계. */
    cannons: {},
    steer: 0,
    rudder: 0,
    anchored: false,
  };
}

/** 예측이 실제 시계나 held 객체를 앞당기지 않게 하는 조종 상태 깊은 복사. */
export function cloneControl(control) {
  const out = createControl();
  if (!control) return out;
  out.stroke = cloneStrokeState(control.stroke);
  out.held = { ...(control.held ?? {}) };
  out.cannons = Object.fromEntries(
    Object.entries(control.cannons ?? {}).map(([key, state]) => [key, cloneCannonState(state)]),
  );
  out.steer = control.steer ?? 0;
  out.rudder = control.rudder ?? 0;
  out.anchored = !!control.anchored;
  return out;
}

/**
 * 스트로크 힘 봉투 — 0..1. sin² 이라 시작과 끝이 0 이고 미분도 연속이라, 임펄스처럼
 * 한 스텝에 속도가 튀지 않는다 (그래야 predict.js 가 같은 식으로 재현할 수 있다).
 */
export function strokeEnvelope(t) {
  const D = DEVICE_TUNING.oarStrokeDuration;
  if (!(t >= 0) || t >= D) return 0;
  const s = Math.sin((Math.PI * t) / D);
  return s * s;
}

/** 사이클 하나를 시작한다 (내부용). */
function beginCycle(state, sides) {
  state.t = 0;
  state.port = sides.port ?? 0;
  state.starboard = sides.starboard ?? 0;
  state.queued = null;
}

/**
 * 새 스트로크 사이클을 시작한다. 아직 젓는 중이면 **버퍼에 넣거나(게이트가 가까우면) 버린다.**
 *
 * 최대 케이던스 자체는 물리가 정한다(1/게이트). 여기서 정하는 것은 그 상한에 부딪혔을 때
 * 입력이 어떻게 느껴지는가다 — 그냥 버리면 "씹혔다"가 되고, 버퍼에 넣으면 "곧 나간다"가 된다.
 *
 * ★ 요청은 **사이클 단위**다. 어느 노를 넣을지는 사이클마다 통째로 정해지므로 두 노가
 *   위상이 어긋날 방법 자체가 없다. 한쪽만 젓다가 양쪽으로 바꾸면 다음 사이클부터 같이 젓고,
 *   그 사이 최대 한 게이트(0.45s)만큼 기다린다 — "노를 다시 맞춰 잡는" 시간이다.
 *
 * @param {object} state control.stroke
 * @param {{port?:number, starboard?:number}} sides 이번에 물에 넣을 노와 방향
 * @returns {boolean} 지금 즉시 시작했는지 (버퍼에 들어간 것은 false)
 */
export function startStroke(state, sides) {
  if (!state || !sides) return false;
  if (!sides.port && !sides.starboard) return false;

  const gate = strokeGate();
  // 1e-9 은 부동소수 여유 — 정확히 회수가 끝나는 순간의 입력은 받아 줘야 한다.
  // (없으면 dt 누산 오차 때문에 "최대 케이던스"가 실제로는 한 스텝 느려진다.)
  if (state.t < gate - 1e-9) {
    // 게이트가 코앞이면 기억해 둔다. 한참 전 입력까지 기억하면 손을 뗀 뒤에도
    // 배가 혼자 한 번 더 젓는 유령 스트로크가 된다.
    if (state.t >= gate - DEVICE_TUNING.oarStrokeBuffer) state.queued = { ...sides };
    return false;
  }
  beginCycle(state, sides);
  return true;
}

/**
 * 스트로크 시계를 dt 만큼 전진하고, 게이트가 열리면 버퍼에 든 사이클을 발사한다.
 * **스텝의 맨 끝에서** 호출한다 (predict.js 와 순서 일치).
 */
export function advanceStrokes(control, dt) {
  const s = control.stroke;
  if (!s) return;
  if (Number.isFinite(s.t)) s.t += dt;
  if (s.queued && s.t >= strokeGate() - 1e-9) beginCycle(s, s.queued);
}

/** 대포 반동·재장전 시계를 스텝 끝에서 함께 전진한다. */
export function advanceCannons(control, dt) {
  for (const state of Object.values(control.cannons ?? {})) {
    if (Number.isFinite(state.t)) state.t += dt;
  }
}

const inputActive = (source, bind) => source instanceof Set ? source.has(bind) : !!source?.[bind];

/**
 * 대포 입력 엣지를 소비해 이번 스텝의 발사 아이템을 돌려준다.
 *
 * 두 경로가 있고 **둘의 권한이 다르다**:
 *   `pressed` — 입력 계층이 `!e.repeat && !held` 로 걸러 낸 **진짜 새 키다운**. 무조건 엣지다.
 *   `held`    — 연속 상태. `wasHeld` 상승 엣지일 때만 엣지로 센다 (홀드 자동 연사 차단).
 *
 * ⚠ `pressed` 에도 `wasHeld` 를 걸면 안 된다. 한 물리 스텝 안에서 떼었다 다시 누르면
 *   `held` 는 다시 true 로 돌아와 `wasHeld` 와 구별되지 않아 **그 재입력이 통째로 삼켜진다**
 *   (실측: 눌러 1발 → 뗐다 다시 눌러 0발 → 세 번째에 1발). 그 스텝-사이 사건을 알고 있는
 *   유일한 증거가 `pressed` 라서, 이 래치는 `wasHeld` 보다 세야 한다.
 *
 * 재장전 중 들어온 엣지는 어느 쪽이든 저장하지 않는다 — 다시 눌러야 발사된다.
 */
export function fireCannons(devices, control, held = {}, pressed = {}) {
  const fired = [];
  const liveKeys = new Set();
  for (const d of devices) {
    if (d.type !== 'cannon' || !d.key) continue;
    liveKeys.add(d.key);
    const state = (control.cannons[d.key] ??= createCannonState());
    const isHeld = inputActive(held, d.bind);
    // pressed 는 입력 계층이 이미 key-repeat 을 걸러 낸 새 키다운이라 그 자체로 엣지다.
    // held 만 있을 때는 wasHeld 상승분만 엣지로 센다.
    const edge = inputActive(pressed, d.bind) || (isHeld && !state.wasHeld);
    if (edge && state.t >= CANNON_TUNING.reload - 1e-9) {
      state.t = 0;
      fired.push(d);
    }
    state.wasHeld = isHeld;
  }
  // 탈락한 대포의 시계는 더 이상 필요 없다. 키 기반이라 다른 아이템 상태와 섞이지 않는다.
  for (const key of Object.keys(control.cannons)) {
    if (!liveKeys.has(key)) delete control.cannons[key];
  }
  return fired;
}

/** 그 노가 지금 물을 젓고 있는 세기 (렌더·패널 표시용). */
export function strokeProgress(control, side) {
  const s = control?.stroke;
  if (!s || !s[side]) return 0;
  return strokeEnvelope(s.t);
}

/**
 * ★ 그 노가 이번 사이클에 그리는 **스윙 위상** −1..+1 (렌더 전용, 힘에는 쓰지 않는다).
 *
 * 힘 봉투가 sin² 이므로 스윙은 **제곱하기 전의 그 sin** 을 그대로 쓴다. 그래서 노깃이 가장
 * 멀리 밀려난 순간이 곧 추력이 가장 큰 순간이고, 노브(`oarStrokeDuration`)를 돌리면 그림과
 * 힘이 같이 따라온다 — 렌더가 자기 시계를 따로 갖지 않는다.
 *
 * 부호는 젓는 방향(`dir`)이라 역젓기는 반대로 돈다. 값이 **0 에서 시작해 0 으로 끝나므로**
 * 사이클이 이어 붙어도, 젓기를 그만둬도, 방향을 바꿔도 각도가 튀는 자리가 없다 —
 * 최대 케이던스에서는 듀티비가 1.0 이라 회수 구간 자체가 없어서(D2), 쉬는 자세로 돌아갈
 * 시간을 따로 낼 수 없기 때문이다.
 */
export function strokeSwing(control, side) {
  const s = control?.stroke;
  const dir = s?.[side] ?? 0;
  if (!dir) return 0;
  const D = DEVICE_TUNING.oarStrokeDuration;
  if (!(s.t >= 0) || s.t >= D) return 0;
  return dir * Math.sin((Math.PI * s.t) / D);
}

/**
 * 진단용 — 최대 케이던스로 계속 저을 때의 종단 속도 추정치 (m/s).
 *
 * 균형식: `peak × area × mean(env) × duty × 2자루 × falloff(v) = drag.x × v²`.
 * sin² 봉투의 시간 평균이 0.5 라 노 둘의 duty 1.0 기준 좌변이 `peak × area × falloff(v)` 로
 * 깔끔하게 정리된다. falloff 가 4차라 해석해 대신 이분법으로 푼다 — UI 한 줄 값이라 충분하다.
 *
 * 튜닝 슬라이더가 이 값을 실시간으로 띄운다. 60초 몰아보지 않고도 "이 설정이면 얼마나
 * 빠른가"를 알 수 있어야 노브를 감으로 돌릴 수 있다. 실측과 1% 안쪽으로 맞는다.
 */
export function estimateOarTerminal(params) {
  if (!params?.area || !(params.drag?.x > 0)) return 0;
  const supply = (v) => DEVICE_TUNING.oarStrokePeak * params.area * oarFalloff(v);
  // 저속 항(HYDRO_TUNING.dragLowSpeed)까지 넣어야 실측과 맞는다 — hydroForcesLocal 과 같은 식.
  const demand = (v) => params.drag.x * (v + HYDRO_TUNING.dragLowSpeed) * v;
  let lo = 0;
  let hi = DEVICE_TUNING.oarMaxSpeed;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (supply(mid) > demand(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 목표 타각으로 서서히 이동시킨다 (조타 지연). 키 아이템을 장착했을 때만 의미가 있다.
 * @param {number} current 현재 타각 (rad)
 * @param {number} steer -1..1 (+ = 좌현)
 */
export function stepRudder(current, steer, dt) {
  const target = clamp(steer, -1, 1) * DEVICE_TUNING.rudderMaxAngle;
  const maxDelta = DEVICE_TUNING.rudderRate * dt;
  return current + clamp(target - current, -maxDelta, maxDelta);
}

// ───────────────────────────────────────────────────────────── 힘 (순수 함수)

/**
 * ★ 순수 함수 — 장치들이 만드는 로컬 좌표계 합력·합토크.
 *
 * @param {object} params computeHullParams 결과
 * @param {Array<object>} devices hull.items 중 type 을 가진 것들
 * @param {{u:number,v:number,w:number}} vel 로컬 전진·횡·각속도
 * @param {object} control createControl() 결과 (스트로크 상태 포함)
 * @returns {{fx:number, fy:number, torque:number}}
 */
export function deviceForcesLocal(params, devices, vel, control) {
  const t = DEVICE_TUNING;
  const u = vel.u;
  let fx = 0;
  let fy = 0;
  let torque = 0;

  for (const d of devices) {
    if (d.type === 'oar') {
      // 이번 사이클에 이 노가 물에 안 들어갔거나 봉투가 0 이면 힘이 정확히 0.
      const s = control.stroke;
      const dir = s?.[d.side] ?? 0;
      if (!dir) continue;
      const env = strokeEnvelope(s.t);
      if (env === 0) continue;

      // 진행 방향 성분이 커질수록 추력이 죽는다. 종단 속도를 묶는 동시에,
      // 스트로크 모델에서는 "언제 젓는가"를 실력으로 만든다.
      //
      // `along` 은 **젓는 방향 기준** 속도라, 5 m/s 로 달리며 뒤로 저으면 along = −5 →
      // 감쇠 없음이 된다. 그래서 고속에서 노는 가속을 못 해도 제동과 역젓기 조향은 만력으로
      // 한다 — 조건 분기가 아니라 u·dir 부호 하나에서 나온다.
      const along = u * dir;
      const falloff = oarFalloff(along);
      const scale = dir < 0 ? t.oarReverseScale : 1;
      const f = t.oarStrokePeak * params.area * env * dir * scale * falloff;

      fx += f;
      // ★ 팔길이 창발. 좌우 노의 y 부호가 반대라 한쪽만 저으면 선회하고, 양쪽을 저으면
      //   토크가 상쇄돼 직진한다 — 단, 비대칭 선체는 두 부착점의 중점이 y=0 이 아니라서
      //   양쪽을 저어도 저절로 돈다. 조향 코드는 여전히 0줄이다.
      torque += -d.y * f;
    } else if (d.type === 'rudder') {
      // L = ½ρ·C_L·A·u·|u|·sin δ — 로컬 y 방향, 타판 부착점에 작용.
      //
      // u·|u| 라서 **정지 시 정확히 0**이고 **후진 시 자동으로 반전**된다. 두 성질 모두
      // 조건 분기가 아니라 식 자체에서 나온다 (§5.1 "키는 물살이 있어야 듣는다").
      //
      // 여기에 "타판이 만나는 실제 물살 각도"(ω·x_r 로 인한 사향류) 항을 넣어 볼 수 있으나
      // 넣지 않는다: 그 항은 키를 강한 요잉 감쇠기로 만들어 §4.1 의 비대칭 창발
      // (직진 입력만으로 선회)을 20초에 70° → 10° 로 눌러 버린다. D1 에서 실측했다.
      const area = t.rudderAreaRatio * params.area;
      const lift = -0.5 * HYDRO_TUNING.waterDensity * t.rudderLift * area
        * u * Math.abs(u) * Math.sin(control.rudder ?? 0);
      fy += lift;
      torque += d.x * lift; // τ = x·Fy − y·Fx, 키는 Fx = 0
    } else if (d.type === 'cannon') {
      // 대포 반동 — 포신의 반대 방향으로 sin² 봉투 힘을 가한다. 순간 임펄스로 속도를 직접
      // 바꾸지 않으므로 planck 과 predict.js 가 같은 고정 스텝 순서로 정확히 재현할 수 있다.
      const state = control.cannons?.[d.key];
      const env = cannonEnvelope(state?.t);
      if (env === 0) continue;
      const f = -cannonPeakForce(d.impulse) * env;
      const fxi = f * Math.cos(d.angle ?? 0);
      const fyi = f * Math.sin(d.angle ?? 0);
      fx += fxi;
      fy += fyi;
      torque += d.x * fyi - d.y * fxi;
    } else if (d.type === 'booster') {
      // §4.2 부스터 — **부착 방향으로 미는 상시력.** 트리거를 누르고 있는 동안만.
      //
      // ★ 여기가 가설 B 의 검증체다. 조향 코드는 없고 아래 세 줄이 전부인데,
      //   중심선 후미에 달면 직진, 좌우 비대칭으로 달면 자동 선회, 측면을 향하게 달면
      //   게걸음이 나온다. 차이는 오로지 (x, y, angle) 셋에서 온다.
      if (!control.held?.[d.bind]) continue;
      const fxi = (d.force ?? 0) * Math.cos(d.angle);
      const fyi = (d.force ?? 0) * Math.sin(d.angle);
      fx += fxi;
      fy += fyi;
      // 일반형 외적. 위의 노(Fy=0)와 키(Fx=0)는 이 식의 특수화일 뿐이다.
      torque += d.x * fyi - d.y * fxi;
    }
  }

  return { fx, fy, torque };
}

/**
 * 키(방향타) 아이템의 조타 입력. 방향키는 노가 가져갔으므로 Q/E 를 쓴다.
 * 부호는 §5.1 과 같이 **좌현 = +**.
 */
export function steerFromHeld(held) {
  if (!held) return 0;
  return (held.KeyQ ? 1 : 0) - (held.KeyE ? 1 : 0);
}

// ─────────────────────────────────────────────────────────── planck 적용부

/** 닻 조인트가 물릴 static 바닥. 월드당 하나면 충분하다. */
const GROUNDS = new WeakMap();

function groundBody(world) {
  let g = GROUNDS.get(world);
  if (!g) {
    g = world.createBody({ type: 'static', position: new Vec2(0, 0) });
    GROUNDS.set(world, g);
  }
  return g;
}

/**
 * 기본 닻 — 누르면 그 순간의 닻 위치에 RevoluteJoint 를 만들고, 놓으면 부순다.
 * 회전은 막지 않으므로 §4.2 "그 점을 축으로 도는" 거동이 자동으로 따라온다.
 */
function syncAnchor(body, hull, wanted) {
  const has = hull.anchorJoint != null;
  if (wanted === has) return;

  const world = body.getWorld();
  if (wanted) {
    const dev = hull.items.find((it) => it.type === 'anchor');
    if (!dev) return; // 파손으로 닻을 잃었으면 멈출 수 없다 (§5.2 원칙 3)
    const at = body.getWorldPoint(new Vec2(dev.x, dev.y));
    hull.anchorJoint = world.createJoint(new RevoluteJoint({}, groundBody(world), body, at));
  } else {
    world.destroyJoint(hull.anchorJoint);
    hull.anchorJoint = null;
  }
  hull.control.anchored = hull.anchorJoint != null;
}

const NO_STROKES = [];
const NO_HELD = {};

/**
 * 강체 하나에 장치 입력을 적용한다. **매 물리 스텝 직전**에 호출할 것 —
 * 렌더 프레임마다 넣으면 planck 이 스텝 후 힘 누산기를 비우는 탓에 조종감이 주사율에 좌우된다.
 *
 * ★ 스텝당 순서는 predict.js 가 그대로 재현한다. 바꾸면 예측선이 어긋난다:
 *   ① 스트로크·대포 엣지 소비 → ② 조타 지연 → ③ 힘 계산 → ④ 힘 적용
 *   → ⑤ 스트로크·대포 시계 전진
 *
 * @param {Body} body 선체 강체
 * @param {{strokes?:Array<{side,dir}>, held?:object, pressed?:object, steer?:number,
 *          anchor?:boolean, now?:number}} input
 * @param {number} dt 고정 타임스텝
 * @returns {Array<{type:'cannonFire', body:Body, item:object, request:object}>} 발사 이벤트
 */
export function applyDevices(body, input = {}, dt) {
  const hull = body.getUserData()?.hull;
  if (!hull || dt <= 0) return [];

  const control = (hull.control ??= createControl());

  // ① 스트로크 요청 소비. 이번 스텝의 요청을 **한 사이클로 합쳐** 넘긴다 — ↑ 와 ← 를 같이
  //    누르고 있어도 사이클은 하나이고, 그래서 두 노가 어긋날 방법이 없다.
  //    요청 배열은 세 척이 공유하지만 수락/거절은 배마다 따로 판단한다.
  //
  //    ★ 같은 노에 **반대 방향**이 겹치면 그 노는 물에 넣지 않는다(0). 한 노를 동시에 두
  //      방향으로 저을 수는 없기 때문이고, 이 상쇄에서 넓은 선회가 나온다 (STROKE_KEYMAP).
  //      0 은 흡수원소라 결과가 "전부 같은 방향이면 그 방향, 아니면 0"으로 확정된다 —
  //      **요청 순서에 무관**하다.
  let sides = null;
  if (input.strokes?.length) {
    for (const req of input.strokes) {
      const cur = (sides ??= {})[req.side];
      sides[req.side] = cur === undefined || cur === req.dir ? req.dir : 0;
    }
  }
  if (sides) startStroke(control.stroke, sides);

  const devices = hull.items.filter((it) => it.type);
  const held = input.held ?? NO_HELD;
  const fired = fireCannons(devices, control, held, input.pressed ?? NO_HELD);
  const events = fired.map((item) => ({
    type: 'cannonFire',
    body,
    item,
    request: cannonShotRequest(body, item, input.now),
  }));

  control.held = held;
  control.steer = clamp(input.steer ?? steerFromHeld(control.held), -1, 1);
  // ② 조타 지연
  control.rudder = stepRudder(control.rudder, control.steer, dt);

  syncAnchor(body, hull, !!input.anchor);

  if (devices.length > 0) {
    const vLocal = body.getLocalVector(body.getLinearVelocity());
    // ③ 힘
    const f = deviceForcesLocal(
      hull.params,
      devices,
      { u: vLocal.x, v: vLocal.y, w: body.getAngularVelocity() },
      control,
    );

    // ④ 힘을 무게중심에, 토크를 따로 넣는다 — 순수 함수가 낸 (fx, fy, τ) 와 완전히 같은
    //    결과이고, predict.js 가 재현해야 하는 것도 정확히 이 셋이다.
    body.applyForceToCenter(body.getWorldVector(new Vec2(f.fx, f.fy)), true);
    body.applyTorque(f.torque, true);
  }

  // ⑤ 스트로크·대포 시계 전진
  advanceStrokes(control, dt);
  advanceCannons(control, dt);
  return events;
}

/** 월드의 모든 선체에 같은 입력을 적용 (세 척 동시 주행 비교용). */
export function applyDevicesToWorld(world, input, dt) {
  const events = [];
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    if (body.isDynamic()) events.push(...applyDevices(body, input, dt));
  }
  return events;
}

/** 홀드 상태(닻·트리거)만 뽑는다. 스트로크는 홀드가 아니라 keydown 엣지에서 온다. */
export function inputFromKeys(keys) {
  return { anchor: keys.has(' '), strokes: NO_STROKES, held: NO_HELD };
}
