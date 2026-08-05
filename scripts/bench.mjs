// D0 · D1 통과 질문 판정 벤치 — `npm run bench`
//
// DOM 없이 돌려 수치로 판정한다. 브라우저 HUD 는 육안 확인용이고, 통과/미달의 근거는 이
// 스크립트의 출력이다. 코퍼스가 고정돼 있어 매 실행 결과가 재현된다.
//
// D0 은 성능("세 스파이크가 프레임 드랍 없이 도는가")을, D1 은 설계 의도가 코드로 성립하는지를
// 묻는다 — 정지 시 키가 무효인가, 비대칭 선체가 조향 코드 0줄로 도는가, 예측선이 정직한가.
import { strokeToHull } from '../src/hull/polygon.js';
import { computeHullParams, HYDRO_TUNING } from '../src/hull/params.js';
import { decomposeHull } from '../src/hull/decompose.js';
import { CORPUS, CORPUS_LABELS } from '../src/hull/corpus.js';
import { Settings } from 'planck';
import { createWorld, FixedStepper, FIXED_DT, Vec2 } from '../src/physics/world.js';
import { createHullBody } from '../src/physics/body.js';
import { applyHydroToWorld, applyHydroDrag } from '../src/physics/hydro.js';
import { applyDevices, DEVICE_TUNING } from '../src/physics/devices.js';
import { predictPath } from '../src/physics/predict.js';
import { defaultDevices, deviceExtraMass, sternAnchor } from '../src/items/defaults.js';
import { applyImpact } from '../src/damage/apply.js';
import { bounds } from '../src/geom/poly.js';

const BUDGET = { hull: 30, carve: 8, physics: 4 };
const failures = [];

const pad = (s, n) => String(s).padEnd(n);
const num = (v, d = 2, n = 8) => String(v.toFixed(d)).padStart(n);

function check(label, ok, detail) {
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${label}  ${detail}`);
  if (!ok) failures.push(label);
}

// ─────────────────────────────────────────────── 스파이크 ① 형상 변환
console.log('\n\x1b[36m▌스파이크 ① — 손그림 → 물리 폴리곤\x1b[0m\n');
console.log(`  ${pad('코퍼스', 18)}${pad('입력', 7)}${pad('정점', 7)}${pad('링', 5)}${pad('루프', 5)}${pad('구멍', 5)}${pad('ms', 8)}경고`);

const hulls = {};
let worstHullMs = 0;
for (const [key, label] of Object.entries(CORPUS_LABELS)) {
  const stroke = CORPUS[key](400, 300);
  // 최초 1회는 JIT 워밍업이 섞이므로 3회 중 중앙값을 쓴다.
  const runs = [0, 1, 2].map(() => strokeToHull(stroke, {}));
  const result = runs[1];
  const ms = runs.map((r) => r.diagnostics.ms).sort((a, b) => a - b)[1];
  worstHullMs = Math.max(worstHullMs, ms);
  hulls[key] = result;

  const d = result.diagnostics;
  const status = result.ok ? '' : `\x1b[31m실패:${result.reason}\x1b[0m `;
  console.log(`  ${pad(label, 18)}${pad(d.rawPoints, 7)}${pad(d.verts ?? '-', 7)}` +
    `${pad(d.ringsAfterUnion ?? '-', 5)}${pad(d.loops ?? '-', 5)}${pad(d.holesDropped ?? 0, 5)}` +
    `${num(ms, 2, 6)}  ${status}${result.warnings.join(',')}`);
}

check('모든 코퍼스가 폴리곤으로 변환됨', Object.values(hulls).every((h) => h.ok),
  `${Object.values(hulls).filter((h) => h.ok).length}/${Object.keys(hulls).length}`);
check('모든 결과 폴리곤이 단순(자기교차 없음)하다',
  Object.values(hulls).every((h) => !h.ok || h.diagnostics.simple),
  Object.entries(hulls).filter(([, h]) => h.ok && !h.diagnostics.simple).map(([k]) => k).join(',') || '전부 simple');
check('정점 밖 교차(나비넥타이)는 clipper 가 링을 쪼개고 큰 쪽이 채택된다',
  hulls.bowtie.ok && hulls.bowtie.diagnostics.ringsAfterUnion === 2 && hulls.bowtie.warnings.includes('multiRing'),
  `Union 외곽 링 ${hulls.bowtie.diagnostics.ringsAfterUnion}개`);
check('정점 교차(8자)는 핀치로 감지돼 로브가 분리된다',
  hulls.figure8.ok && hulls.figure8.warnings.includes('selfIntersect')
    && hulls.figure8.warnings.includes('pinchSplit') && hulls.figure8.diagnostics.loops === 2,
  `링 ${hulls.figure8.diagnostics.ringsAfterUnion} → 루프 ${hulls.figure8.diagnostics.loops} · ${hulls.figure8.warnings.join(',')}`);
check('열린 곡선이 경고와 함께 자동 폐곡선화', hulls.open.ok && hulls.open.warnings.includes('openCurve'),
  `간극 ${hulls.open.diagnostics.closeGap.toFixed(2)} m`);
check('2000점 낙서 변환 ≤ 30ms', hulls.scribble.diagnostics.ms <= BUDGET.hull,
  `${hulls.scribble.diagnostics.ms.toFixed(2)} ms`);
check(`전 코퍼스 변환 ≤ ${BUDGET.hull}ms`, worstHullMs <= BUDGET.hull, `최대 ${worstHullMs.toFixed(2)} ms`);

// ─────────────────────────────────────────────── 3대 파라미터 + 볼록 분해
console.log('\n\x1b[36m▌형상 → 3대 파라미터 (§2.1) + 볼록 분해\x1b[0m\n');
console.log(`  ${pad('코퍼스', 18)}${pad('면적', 9)}${pad('세장비', 8)}${pad('흘수', 8)}${pad('저항 전', 10)}${pad('저항 횡', 10)}${pad('이방성', 9)}파트`);

const paramTable = {};
for (const [key, label] of Object.entries(CORPUS_LABELS)) {
  const hull = hulls[key];
  if (!hull.ok) continue;
  const p = computeHullParams(hull.outline, { material: 'wood' });
  const parts = decomposeHull(hull.outline, []);
  paramTable[key] = { p, parts };
  const ratio = p.drag.y / p.drag.x;
  console.log(`  ${pad(label, 18)}${num(p.area, 2, 7)}  ${num(p.slenderness, 2, 6)}  ${num(p.draft, 3, 6)}  ` +
    `${num(p.drag.x, 0, 8)}  ${num(p.drag.y, 0, 8)}  ${num(ratio, 1, 6)}:1  ${parts.length}`);
}

const slender = paramTable.sloop.p;
const round = paramTable.round.p;
check('길쭉한 배가 둥근 배보다 전진 저항이 낮다',
  slender.drag.x < round.drag.x,
  `슬루프 ${slender.drag.x.toFixed(0)} < 둥근 배 ${round.drag.x.toFixed(0)}`);
check('길쭉한 배의 이방성이 둥근 배보다 크다',
  slender.drag.y / slender.drag.x > 3 * (round.drag.y / round.drag.x),
  `${(slender.drag.y / slender.drag.x).toFixed(1)}:1 vs ${(round.drag.y / round.drag.x).toFixed(1)}:1`);
check('모든 볼록 파트가 fixture 정점 한계 이내',
  Object.values(paramTable).every(({ parts }) => parts.every((p) => p.length <= 12)),
  `최대 ${Math.max(...Object.values(paramTable).flatMap(({ parts }) => parts.map((p) => p.length)))}정점`);

// 구멍 있는 선체는 earcut 경로를 타야 한다
const donutParts = decomposeHull(hulls.donut.outline, [[
  { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 },
]]);
check('구멍 있는 선체도 분해됨 (earcut 경로)', donutParts.length > 0, `${donutParts.length}개 파트`);

// ─────────────────────────────────────────────── 스파이크 ③ 이방성 저항
console.log('\n\x1b[36m▌스파이크 ③ — 이방성 저항 안정성\x1b[0m\n');

/** @param {{devices?: boolean}} options devices 를 켜면 기본 3종 장치(§5.1)를 얹는다. */
function spawn(key, options = {}) {
  const world = createWorld();
  const hull = hulls[key];
  const items = options.devices ? defaultDevices(hull.outline) : [];
  const body = createHullBody(world, { outline: hull.outline, holes: [], items },
    {
      position: { x: 0, y: 0 },
      angle: 0,
      material: 'wood',
      extraMass: deviceExtraMass(items),
    });
  return { world, body };
}

// 60초 정속 항해 — 종단 속도로 수렴하고 발산하지 않아야 한다.
// 여기는 저항 적분의 안정성만 보는 자리라 장치를 얹지 않고 임의의 기준 추력을 쓴다.
const REFERENCE_THRUST_PER_AREA = 300;
const sail = spawn('sloop');
const stepper = new FixedStepper(sail.world, { onPreStep: (dt) => applyHydroToWorld(sail.world, dt) });
const thrust = REFERENCE_THRUST_PER_AREA * paramTable.sloop.p.area;
let maxSpeed = 0;
let physicsMs = 0;
const speedTrace = [];
for (let i = 0; i < 3600; i++) {
  sail.body.applyForceToCenter(sail.body.getWorldVector(new Vec2(thrust, 0)), true);
  const { ms } = stepper.advance(FIXED_DT);
  physicsMs += ms;
  const speed = sail.body.getLinearVelocity().length();
  maxSpeed = Math.max(maxSpeed, speed);
  if (i % 600 === 599) speedTrace.push(speed);
}
const terminal = Math.sqrt(thrust / paramTable.sloop.p.drag.x);
console.log(`  10초 간격 속도: ${speedTrace.map((s) => s.toFixed(2)).join(' → ')} m/s`);
console.log(`  이론 종단 속도: ${terminal.toFixed(2)} m/s · 평균 물리 스텝 ${(physicsMs / 3600).toFixed(3)} ms`);
check('60초 항해가 종단 속도로 수렴 (발산 없음)',
  Number.isFinite(maxSpeed) && Math.abs(speedTrace.at(-1) - terminal) / terminal < 0.05,
  `최종 ${speedTrace.at(-1).toFixed(2)} vs 이론 ${terminal.toFixed(2)} m/s`);
check(`물리 스텝 ≤ ${BUDGET.physics}ms`, physicsMs / 3600 <= BUDGET.physics,
  `평균 ${(physicsMs / 3600).toFixed(3)} ms`);

// 옆으로 밀어보기 — 이방성이 실제 거동으로 나타나는지
const lateral = spawn('sloop');
lateral.body.setLinearVelocity(new Vec2(0, 6));
const latStepper = new FixedStepper(lateral.world, { onPreStep: (dt) => applyHydroToWorld(lateral.world, dt) });
for (let i = 0; i < 60; i++) latStepper.advance(FIXED_DT);
const lateralAfter = Math.abs(lateral.body.getLinearVelocity().y);

const forward = spawn('sloop');
forward.body.setLinearVelocity(new Vec2(6, 0));
const fwdStepper = new FixedStepper(forward.world, { onPreStep: (dt) => applyHydroToWorld(forward.world, dt) });
for (let i = 0; i < 60; i++) fwdStepper.advance(FIXED_DT);
const forwardAfter = Math.abs(forward.body.getLinearVelocity().x);

check('1초 후 횡속도가 전진속도보다 훨씬 많이 죽는다',
  lateralAfter < forwardAfter * 0.6,
  `횡 6.00 → ${lateralAfter.toFixed(2)} · 전진 6.00 → ${forwardAfter.toFixed(2)} m/s`);

// ── 형상별 조종 특성 (§2.1 표의 의도를 회귀 테스트로 고정) ───────────────
// 조향 코드는 한 줄도 없다. 아래 차이는 전부 형상 → 저항·관성 → 토크에서 창발한다.
console.log('\n  조향 코드 0줄 — 아래 차이는 전부 형상 → 저항·관성 → 토크에서 창발한다');
console.log(`  ${pad('', 14)}${pad('세장비', 8)}${pad('3초 전진', 11)}${pad('횡속 잔존', 11)}${pad('3초 선회', 10)}회전 정지`);

/**
 * 기본 3종 장치를 얹고 입력을 seconds 초 유지한다.
 * @param {{throttle?:number, steer?:number, anchor?:boolean}} input
 * @param {{seconds?:number, v?:{x,y}, w?:number}} setup 초기 상태
 */
function drive(key, input, setup = {}) {
  const seconds = setup.seconds ?? 3;
  const { world, body } = spawn(key, { devices: true });
  if (setup.v) body.setLinearVelocity(new Vec2(setup.v.x, setup.v.y));
  if (setup.w) body.setAngularVelocity(setup.w);
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(body, input, dt); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) s.advance(FIXED_DT);
  return {
    world, body,
    speed: body.getLinearVelocity().length(),
    turned: Math.abs(body.getAngle() * 180 / Math.PI),
    yaw: body.getAngle() * 180 / Math.PI,
    w: body.getAngularVelocity(),
  };
}

/**
 * §2.1 이 말하는 "회전 둔함"은 **선체의 성질**이지 키의 성질이 아니다. 키로 재면 길쭉한 배가
 * 더 빨라 유속 보너스를 받는 탓에 형상 항이 가려지므로, 여기서는 면적에 비례한 기준 토크를
 * 직접 넣어 형상 → 관성·회전저항만 본다. 키를 통한 선회는 아래 D1 절에서 따로 검사한다.
 */
function torqueTest(key, seconds = 3) {
  const { world, body } = spawn(key);
  const torque = 900 * paramTable[key].p.area;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { body.applyTorque(torque, true); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) s.advance(FIXED_DT);
  return Math.abs(body.getAngle() * 180 / Math.PI);
}

/** 초기 상태만 주고 감쇠를 본다 — 회전이 섞이지 않아 이방성을 깨끗하게 잰다. */
function decay(key, { v = null, w = 0 }, seconds = 1) {
  const { world, body } = spawn(key);
  if (v) body.setLinearVelocity(new Vec2(v.x, v.y));
  if (w) body.setAngularVelocity(w);
  const s = new FixedStepper(world, { onPreStep: (dt) => applyHydroToWorld(world, dt) });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) s.advance(FIXED_DT);
  return { speed: body.getLinearVelocity().length(), w: Math.abs(body.getAngularVelocity()) };
}

const feel = {};
for (const key of ['sloop', 'round']) {
  const p = paramTable[key].p;
  feel[key] = {
    fwd: drive(key, { throttle: 1 }).speed,
    slip: decay(key, { v: { x: 0, y: 6 } }).speed,   // 순수 횡속 6 m/s 를 1초 뒤에 얼마나 남기는가
    turn: torqueTest(key),                           // 같은 기준 토크로 3초 (형상 항만)
    stop: decay(key, { w: 1.0 }, 2).w,               // 각속도 1 rad/s 를 2초 뒤에 얼마나 남기는가
  };
  const f = feel[key];
  console.log(`  ${pad(CORPUS_LABELS[key], 14)}${num(p.slenderness, 2, 6)}  ${num(f.fwd, 2, 8)} m/s` +
    `${num(f.slip, 2, 8)} m/s${num(f.turn, 1, 8)}°  ${num(f.stop, 3, 8)} rad/s`);
}

check('길쭉한 배가 더 빠르다 (§2.1 "직진 빠름")',
  feel.sloop.fwd > feel.round.fwd,
  `기본 노 3초 ${feel.sloop.fwd.toFixed(2)} > ${feel.round.fwd.toFixed(2)} m/s`);
check('길쭉한 배가 옆으로 덜 밀린다 (§2.1 "옆밀림 적음")',
  feel.sloop.slip < feel.round.slip * 0.7,
  `횡속 6 m/s → 1초 뒤 ${feel.sloop.slip.toFixed(2)} vs ${feel.round.slip.toFixed(2)} m/s`);
check('길쭉한 배가 회전 시작이 둔하다 (§2.1 "회전 둔함" — 부가질량 과장)',
  feel.sloop.turn < feel.round.turn * 0.8,
  `같은 기준 토크 3초 ${feel.sloop.turn.toFixed(1)}° vs ${feel.round.turn.toFixed(1)}°`);
check('길쭉한 배가 회전 정지도 어렵다 (§2.1 "시작·정지가 모두 어려움")',
  feel.sloop.stop > feel.round.stop,
  `1 rad/s → 2초 뒤 ${feel.sloop.stop.toFixed(3)} vs ${feel.round.stop.toFixed(3)} rad/s`);
check('밸런싱 불변식: 회전 저항 과장 < 부가질량 과장 (넘으면 "정지도 어렵다"가 깨진다)',
  HYDRO_TUNING.angularSlendernessGain < HYDRO_TUNING.yawAddedMassGain,
  `저항 ${HYDRO_TUNING.angularSlendernessGain} < 부가질량 ${HYDRO_TUNING.yawAddedMassGain}`);

// ─────────────────────────────────────────────── D1 기본 3종 장치 (§5)
console.log('\n\x1b[36m▌D1 — 기본 3종 장치 (§5.1 키 · 노 · 닻)\x1b[0m\n');

for (const key of ['sloop', 'round', 'lopsided']) {
  const a = sternAnchor(hulls[key].outline);
  const devices = defaultDevices(hulls[key].outline);
  const oar = devices.find((d) => d.type === 'oar');
  console.log(`  ${pad(CORPUS_LABELS[key], 14)}선미 부착점 (${num(a.x, 2, 6)},${num(a.y, 3, 7)})  ` +
    `노 팔길이 ${num(Math.abs(oar.y), 3, 6)} m  장치 질량 ${deviceExtraMass(devices)} kg`);
}

// ── 기본 키: 유속 비례 선회력, 정지 시 무효 (§5.1 의 핵심 교육 장치) ────────────
const helmStill = drive('sloop', { steer: 1 }, { seconds: 2 });
check('기본 키는 정지 상태에서 무효다 (§5.1 "키는 물살이 있어야 듣는다")',
  helmStill.turned < 0.01 && Math.abs(helmStill.w) < 1e-6,
  `2초 조타 → ${helmStill.turned.toFixed(4)}° · ${helmStill.w.toFixed(6)} rad/s`);

// 같은 조타를 서로 다른 초기 유속에서. 힘이 u·|u| 라 유속이 2배면 선회 응답이 크게 벌어져야 한다.
const helmSlow = drive('sloop', { steer: 1 }, { seconds: 1, v: { x: 1.5, y: 0 } });
const helmFast = drive('sloop', { steer: 1 }, { seconds: 1, v: { x: 3.0, y: 0 } });
console.log(`  키 응답 — 유속 1.5 m/s → ${helmSlow.turned.toFixed(2)}° · ` +
  `3.0 m/s → ${helmFast.turned.toFixed(2)}° (1초 조타)`);
check('기본 키의 선회력은 유속에 비례한다 (전진 속도 2배 → 선회 응답 급증)',
  helmFast.turned > helmSlow.turned * 2.5,
  `${helmFast.turned.toFixed(2)}° > ${helmSlow.turned.toFixed(2)}° × 2.5`);

// 후진 중에는 u·|u| 의 부호가 뒤집혀 같은 조타가 반대로 듣는다 — 조건 분기 없이 식에서 나온다.
const helmAstern = drive('sloop', { steer: 1 }, { seconds: 1, v: { x: -3.0, y: 0 } });
check('후진 중에는 같은 조타가 반대로 듣는다 (u·|u| 의 부호 반전)',
  Math.sign(helmAstern.yaw) === -Math.sign(helmFast.yaw) && helmAstern.turned > 0.5,
  `전진 ${helmFast.yaw.toFixed(1)}° vs 후진 ${helmAstern.yaw.toFixed(1)}°`);

// ── 기본 노: 맵 클리어 불가 수준의 미약한 추력 (§5.2 원칙 1) ────────────────────
const oarLong = drive('sloop', { throttle: 1 }, { seconds: 60 });
console.log(`  노 종단 속도 — 60초 전력 젓기 후 ${oarLong.speed.toFixed(2)} m/s ` +
  `(설계 상한 ${DEVICE_TUNING.oarMaxSpeed} m/s)`);
check('기본 노만으로는 종단 속도가 낮다 (§5.2 원칙 1 "맵 클리어 불가 수준")',
  oarLong.speed < DEVICE_TUNING.oarMaxSpeed && oarLong.speed > 1.0,
  `${oarLong.speed.toFixed(2)} m/s < ${DEVICE_TUNING.oarMaxSpeed} m/s`);

// ── 기본 닻: 정지 수단 (§5.1) ─────────────────────────────────────────────────
const anchored = drive('sloop', { anchor: true }, { seconds: 1, v: { x: 5, y: 0 } });
check('기본 닻은 달리던 배를 그 자리에 세운다 (§5.1 "정지 수단")',
  anchored.speed < 0.05,
  `5.00 m/s → 1초 뒤 ${anchored.speed.toFixed(3)} m/s`);

const released = (() => {
  // 물었다 놓으면 조인트가 사라지고 다시 움직일 수 있어야 한다 (누르는 동안만 유효).
  const { world, body } = spawn('sloop', { devices: true });
  body.setLinearVelocity(new Vec2(5, 0));
  let anchor = true;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(body, { throttle: 1, anchor }, dt); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < 60; i++) s.advance(FIXED_DT);
  anchor = false;
  for (let i = 0; i < 120; i++) s.advance(FIXED_DT);
  return { speed: body.getLinearVelocity().length(), joint: body.getUserData().hull.anchorJoint };
})();
check('닻을 놓으면 조인트가 사라지고 다시 항해할 수 있다',
  released.joint == null && released.speed > 0.5,
  `해제 2초 후 ${released.speed.toFixed(2)} m/s · 조인트 ${released.joint == null ? '없음' : '남음'}`);

// ── ★ 비대칭 창발: 조향 코드 0줄로 직진 입력만으로 선회 ────────────────────────
//
// 관측 구간이 20초인 이유: 이 선회는 노의 작은 팔길이(≈0.2 m)가 만드는 것이라 각가속도가
// 작다. 몇 초로는 회전 저항과 구분이 안 되고, 지속 선회율에 수렴한 뒤라야 "저절로 돈다"가
// 수치로 성립한다. 실측 지속 선회 반경 ≈ 21 m — 화면에서 한눈에 보이는 크기다.
const STRAIGHT_RUN_SECONDS = 20;
const straightRuns = {};
for (const key of ['sloop', 'round', 'lopsided']) {
  straightRuns[key] = drive(key, { throttle: 1 }, { seconds: STRAIGHT_RUN_SECONDS });
}
const turnRadius = (r) => r.speed / Math.max(Math.abs(r.w), 1e-9);
console.log(`  ↑ 만 ${STRAIGHT_RUN_SECONDS}초 — ${['sloop', 'round', 'lopsided']
  .map((k) => `${CORPUS_LABELS[k]} ${straightRuns[k].yaw.toFixed(1)}° (R ${turnRadius(straightRuns[k]).toFixed(0)} m)`)
  .join(' · ')}`);
check('★ 비대칭 선체는 직진 입력만으로 선회한다 (조향 코드 0줄 — §4.1 부착점 창발)',
  straightRuns.lopsided.turned > 30 && turnRadius(straightRuns.lopsided) < 60,
  `↑ 만 ${STRAIGHT_RUN_SECONDS}초 → ${straightRuns.lopsided.yaw.toFixed(1)}° · ` +
  `선회 반경 ${turnRadius(straightRuns.lopsided).toFixed(0)} m`);
check('대칭 선체는 같은 입력에 똑바로 간다 (창발이 형상에서 온다는 대조군)',
  straightRuns.sloop.turned < straightRuns.lopsided.turned * 0.1
    && straightRuns.round.turned < straightRuns.lopsided.turned * 0.1,
  `슬루프 ${straightRuns.sloop.turned.toFixed(2)}° · 둥근 배 ${straightRuns.round.turned.toFixed(2)}°`);

// ── 예측 궤적선이 실제와 일치하는가 ──────────────────────────────────────────
console.log('\n\x1b[36m▌D1 — 예측 궤적선 (predict.js ↔ 실제 시뮬레이션)\x1b[0m\n');

const predictError = (key, input, seconds = 2.5) => {
  const { world, body } = spawn(key, { devices: true });
  body.setLinearVelocity(new Vec2(2.5, 0)); // 키가 들으려면 물살이 있어야 한다
  const path = predictPath(body, input, { horizon: seconds, stride: 3 });
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(body, input, dt); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) s.advance(FIXED_DT);

  const actual = body.getWorldCenter();
  const predicted = path.at(-1);
  const start = path[0];
  const travelled = Math.hypot(actual.x - start.x, actual.y - start.y);
  const gap = Math.hypot(actual.x - predicted.x, actual.y - predicted.y);
  return { gap, travelled, rel: gap / Math.max(travelled, 1e-6), samples: path.length };
};

const predRuns = {
  '직진': predictError('sloop', { throttle: 1 }),
  '선회': predictError('sloop', { throttle: 1, steer: 1 }),
  '비대칭 직진': predictError('lopsided', { throttle: 1 }),
};
for (const [label, r] of Object.entries(predRuns)) {
  // 오차를 mm 로 찍는다 — 0.00% 만 보이면 "예측을 안 돌린 것 아닌가"를 구분할 수 없다.
  console.log(`  ${pad(label, 14)}이동 ${num(r.travelled, 2, 6)} m · 오차 ${num(r.gap * 1000, 4, 9)} mm ` +
    `(${(r.rel * 100).toFixed(4)}%) · 샘플 ${r.samples}점`);
}
check('예측 궤적선과 실제 경로의 2.5초 오차가 이동 거리의 5% 이내',
  Object.values(predRuns).every((r) => r.rel < 0.05),
  `최대 ${(Math.max(...Object.values(predRuns).map((r) => r.rel)) * 100).toFixed(2)}%`);

const anchoredPath = (() => {
  const { world, body } = spawn('sloop', { devices: true });
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(body, { anchor: true }, dt); applyHydroToWorld(world, dt); },
  });
  s.advance(FIXED_DT);
  return predictPath(body, { anchor: true });
})();
check('닻이 물린 배는 궤적선을 그리지 않는다 (예측할 것이 없다)',
  anchoredPath.length === 0, `샘플 ${anchoredPath.length}점`);

// ── 파손으로 키를 잃으면 조향을 잃는다 (§5.2 원칙 3 의 토대) ────────────────────
const rudderLoss = (() => {
  const { world, body } = spawn('sloop', { devices: true });
  const rudder = body.getUserData().hull.items.find((it) => it.type === 'rudder');
  const at = body.getWorldPoint(new Vec2(rudder.x, rudder.y));
  const out = applyImpact(world, body, { x: at.x, y: at.y }, 0.8);
  const alive = out.bodies.flatMap((b) => b.getUserData().hull.items.map((i) => i.type));
  return { alive, dropped: out.result.droppedItems.map((i) => i.type) };
})();
check('선미를 때려 키를 잃으면 조향 장치가 사라진다 (§5.2 원칙 3 — 규칙표 예외 없음)',
  !rudderLoss.alive.includes('rudder') && rudderLoss.dropped.includes('rudder'),
  `생존 [${rudderLoss.alive.join(',')}] · 탈락 [${rudderLoss.dropped.join(',')}]`);

// ★ 발산 방지 클램프 검증.
//
// 2차 항력을 explicit Euler 로 적분하면 한 스텝의 속도 변화가 현재 속도의 2배를 넘는 순간
// 부호가 뒤집히고 다음 스텝에서 더 큰 힘이 나와 발산한다. 그 임계 속도는
//   |Δv| = (drag·v²/m)·dt > 2v  →  v > 2m / (drag·dt)
// 이다. 임계의 1.5배에서 나이브 적분과 클램프 적분을 비교한다.
function naiveDrag(body) {
  const drag = body.getUserData().hull.params.drag;
  const v = body.getLocalVector(body.getLinearVelocity());
  body.applyForceToCenter(body.getWorldVector(new Vec2(
    -drag.x * Math.abs(v.x) * v.x,
    -drag.y * Math.abs(v.y) * v.y,
  )), true);
}

// planck 자체가 스텝당 이동을 maxTranslation 으로 잘라 사실상의 속도 상한을 만든다.
// 큰 선체는 임계가 이 상한보다 높아 저절로 보호되지만, **파손으로 생긴 작은 파편**은
// 질량이 작고 저항 팔이 남아 임계가 상한 아래로 내려온다 — 클램프가 필요한 진짜 이유.
const PLANCK_MAX_SPEED = Settings.maxTranslation / FIXED_DT;

function spawnOutline(outline) {
  const world = createWorld();
  const body = createHullBody(world, { outline, holes: [], items: [] },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  return { world, body };
}

const threshold = (outline) => {
  const p = computeHullParams(outline, { material: 'wood' });
  const mass = p.area * p.material.areaDensity;
  return { p, limit: (2 * mass) / (p.drag.y * FIXED_DT) };
};

const shard = hulls.sloop.outline.map((p) => ({ x: p.x * 0.25, y: p.y * 0.25 }));
const full = threshold(hulls.sloop.outline);
const frag = threshold(shard);
const extremeSpeed = Math.min(frag.limit * 1.5, PLANCK_MAX_SPEED * 0.98);

function runExtreme(dragFn, outline, lateralSpeed) {
  const { world, body } = spawnOutline(outline);
  const s = new FixedStepper(world, { onPreStep: (dt) => dragFn(body, dt) });
  body.setLinearVelocity(new Vec2(0, lateralSpeed));
  const history = [];
  for (let i = 0; i < 240; i++) {
    s.advance(FIXED_DT);
    history.push(body.getLinearVelocity().y);
  }
  return history;
}

const naive = runExtreme(naiveDrag, shard, extremeSpeed);
const clamped = runExtreme(applyHydroDrag, shard, extremeSpeed);
const naiveDiverged = !Number.isFinite(naive.at(-1)) || Math.abs(naive.at(-1)) > extremeSpeed;
const clampedOk = Number.isFinite(clamped.at(-1)) && Math.abs(clamped.at(-1)) <= extremeSpeed
  && clamped.every((v, i) => i === 0 || Math.abs(v) <= Math.abs(clamped[i - 1]) + 1e-6);

console.log(`  planck 자체 속도 상한(maxTranslation/dt) = ${PLANCK_MAX_SPEED.toFixed(0)} m/s`);
console.log(`  발산 임계 2m/(drag·dt) — 온전한 선체 ${full.limit.toFixed(0)} m/s(상한 위, 안전) · ` +
  `1/4 크기 파편 ${frag.limit.toFixed(0)} m/s(상한 아래, 위험)`);
console.log(`  파편에 ${extremeSpeed.toFixed(1)} m/s 횡속도 투입 → 240스텝 후 ` +
  `나이브 ${fmtExtreme(naive.at(-1))} · 클램프 ${clamped.at(-1).toFixed(3)} m/s`);
check('작은 파편의 발산 임계는 planck 자체 상한 아래에 있다 (엔진만으론 못 막는다)',
  frag.limit < PLANCK_MAX_SPEED,
  `파편 임계 ${frag.limit.toFixed(0)} < planck 상한 ${PLANCK_MAX_SPEED.toFixed(0)} m/s`);
check('클램프 없는 나이브 적분은 임계 위에서 실제로 발산한다 (클램프의 존재 이유)', naiveDiverged,
  `${fmtExtreme(naive.at(-1))} m/s`);
check('클램프 적용 시 단조 감속, 부호 반전·발산 없음', clampedOk,
  `${clamped[0].toFixed(1)} → ${clamped.at(-1).toFixed(3)} m/s`);

function fmtExtreme(v) {
  if (!Number.isFinite(v)) return String(v);
  return Math.abs(v) > 1e6 ? v.toExponential(2) : v.toFixed(2);
}

// ─────────────────────────────────────────────── 스파이크 ② 불리언 차감
console.log('\n\x1b[36m▌스파이크 ② — 폴리곤 차감 · 절단 분리\x1b[0m\n');

// 아령의 얇은 목을 때려 두 동강 내기 (§7.3.4 다단 분리)
const split = spawn('barbell');
const bb = bounds(hulls.barbell.outline);
const splitResult = applyImpact(split.world, split.body, { x: 0, y: 0 }, 0.9);
console.log(`  아령 목 타격 → 조각 ${splitResult.result.pieces.length}개 · ` +
  `제거 면적 ${splitResult.result.removedArea.toFixed(2)} m² · ${splitResult.result.ms.toFixed(2)} ms`);
check('얇은 연결부를 때리면 두 개의 독립 강체로 분리 (§7.3.3)',
  splitResult.result.split && splitResult.bodies.length === 2,
  `조각 ${splitResult.result.pieces.length} · 강체 ${splitResult.bodies.length}`);
check('분리된 각 조각이 자기 파라미터를 새로 계산한다',
  splitResult.bodies.every((b) => b.getUserData().hull.params.area > 0),
  splitResult.bodies.map((b) => b.getUserData().hull.params.area.toFixed(2) + ' m²').join(' + '));

// 아이템 소속 판정 (§7.5)
const itemTest = (() => {
  const world = createWorld();
  const outline = hulls.barbell.outline;
  const b = bounds(outline);
  const items = [
    { key: 'A', x: b.minX + b.width * 0.15, y: 0 },
    { key: 'B', x: 0, y: 0 },
    { key: 'C', x: b.minX + b.width * 0.85, y: 0 },
  ];
  const body = createHullBody(world, { outline, holes: [], items },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  const out = applyImpact(world, body, { x: 0, y: 0 }, 0.9);
  const alive = out.bodies.flatMap((bd) => bd.getUserData().hull.items.map((i) => i.key));
  return { alive, dropped: out.result.droppedItems.map((i) => i.key) };
})();
console.log(`  아이템 마커 — 생존 [${itemTest.alive.join(',')}] · 탈락 [${itemTest.dropped.join(',')}]`);
check('아이템은 소속 폴리곤을 따라가고, 깎인 자리의 것은 탈락한다 (§7.5)',
  itemTest.alive.length === 2 && itemTest.dropped.includes('B'),
  `생존 ${itemTest.alive.length}개 · 탈락 ${itemTest.dropped.length}개`);

// 초승달: 무게중심이 선체 밖으로 나가는 케이스
const crescentParams = computeHullParams(hulls.crescent.outline, { material: 'wood' });
check('초승달형 선체도 강체로 성립한다 (무게중심 선체 밖 허용)',
  crescentParams !== null && spawn('crescent').body !== null,
  `면적 ${crescentParams.area.toFixed(2)} m² · 관성 ${crescentParams.inertia.toFixed(0)} kg·m²`);

// 20회 연속 차감 스트레스
const stress = spawn('sloop');
let bodies = [stress.body];
const carveMs = [];
let rngState = 20260805;
const rng = () => ((rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0) / 4294967296);

for (let i = 0; i < 20 && bodies.length > 0; i++) {
  const target = bodies[Math.floor(rng() * bodies.length)];
  const outline = target.getUserData().hull.outline;
  const v = outline[Math.floor(rng() * outline.length)];
  const wp = target.getWorldPoint(new Vec2(v.x, v.y));

  const t0 = performance.now();
  const out = applyImpact(stress.world, target, { x: wp.x, y: wp.y }, 0.45);
  carveMs.push(performance.now() - t0);

  bodies = bodies.filter((b) => b !== target).concat(out.bodies);
}

const avgCarve = carveMs.reduce((a, b) => a + b, 0) / carveMs.length;
const maxCarve = Math.max(...carveMs);
console.log(`  20회 연속 차감 — 평균 ${avgCarve.toFixed(2)} ms · 최대 ${maxCarve.toFixed(2)} ms · 남은 조각 ${bodies.length}`);
check(`차감 1회 ≤ ${BUDGET.carve}ms (재구성 포함)`, maxCarve <= BUDGET.carve, `최대 ${maxCarve.toFixed(2)} ms`);

// 차감된 선체로 계속 시뮬레이션이 도는지 (강체가 터지지 않는지)
const postStepper = new FixedStepper(stress.world, { onPreStep: (dt) => applyHydroToWorld(stress.world, dt) });
for (const b of bodies) b.setLinearVelocity(new Vec2(5, 2));
let postOk = true;
for (let i = 0; i < 600; i++) {
  postStepper.advance(FIXED_DT);
  for (const b of bodies) {
    const p = b.getPosition();
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) postOk = false;
  }
}
check('20회 차감 후에도 10초간 시뮬레이션이 안정적', postOk,
  `${bodies.length}개 조각 · 좌표 유한성 유지`);

// ─────────────────────────────────────────────── 종합
console.log('\n\x1b[36m▌D0 "세 실험이 프레임 드랍 없이 도는가?" · D1 "형상이 조작감을 만드는가?"\x1b[0m\n');
if (failures.length === 0) {
  console.log('  \x1b[32m통과.\x1b[0m 스파이크는 예산 안에서 돌고, 기본 3종 장치와 비대칭 창발이 성립한다.\n');
} else {
  console.log(`  \x1b[31m미달 ${failures.length}건:\x1b[0m\n${failures.map((f) => `    - ${f}`).join('\n')}\n`);
  process.exitCode = 1;
}
