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
import { applyDevices, DEVICE_TUNING, oarFalloff, strokeGate } from '../src/physics/devices.js';
import { predictPath } from '../src/physics/predict.js';
import { defaultDevices, deviceExtraMass, sternAnchor, sideAnchors } from '../src/items/defaults.js';
import { attachItem, itemsExtraMass } from '../src/items/attach.js';
import { ITEM_CATALOG } from '../src/items/catalog.js';
import { applyImpact } from '../src/damage/apply.js';
import { bounds } from '../src/geom/poly.js';
import { createFields } from '../src/field/field.js';
import { applyFieldsToWorld } from '../src/physics/fields.js';
import { createRuleEngine, loadRules, RULE_TICK } from '../src/rules/engine.js';
import { readFileSync } from 'node:fs';

const ZONES = JSON.parse(readFileSync(new URL('../src/field/zones.json', import.meta.url), 'utf8'));
const RULE_TABLE = JSON.parse(readFileSync(new URL('../src/rules/table.json', import.meta.url), 'utf8'));

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

/**
 * @param {{devices?: boolean, rudder?: boolean}} options
 *   devices 를 켜면 기본 장치(§5.1 좌현 노·우현 노·닻)를, rudder 를 켜면 **부착 아이템인**
 *   키를 추가로 얹는다. 키는 D2 부터 기본 장착이 아니라 선택지다 (§5.2 원칙 2).
 */
function spawn(key, options = {}) {
  const world = createWorld();
  const hull = hulls[key];
  const items = options.devices ? defaultDevices(hull.outline) : [];
  if (options.rudder) items.push(rudderItem(hull.outline));
  // §4.1 부착 아이템 — 기본 장치와 **같은 배열, 같은 형식**으로 얹힌다.
  for (const spec of options.attach ?? []) {
    attachItem({ items }, spec.type, spec);
  }
  const body = createHullBody(world, { outline: hull.outline, holes: [], items },
    {
      position: { x: 0, y: 0 },
      angle: 0,
      material: options.material ?? 'wood',
      extraMass: itemsExtraMass(items),
    });
  return { world, body };
}

/** 부착 아이템으로서의 키 — 선미 부착점, 나무 30 kg (§4.2 "후미일수록 효과적"). */
function rudderItem(outline) {
  const a = sternAnchor(outline);
  return {
    key: 'rudder', type: 'rudder', side: null, name: '키',
    mass: 30, material: 'wood', angle: 0, x: a.x, y: a.y,
  };
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

const EMPTY_INPUT = {};
/** 최대 케이던스 주기 (s) — 봉투 + 회수. 이보다 빨리 두드려도 노는 거절한다. */
const STROKE_SPAN = DEVICE_TUNING.oarStrokeDuration + DEVICE_TUNING.oarStrokeCooldown;

/**
 * 스트로크 스케줄 — period 초마다 지정한 노(들)를 젓는 입력 함수를 만든다.
 * 노는 keydown 엣지로 젓기 때문에 벤치도 "언제 눌렀는가"를 스텝 단위로 재현해야 한다.
 *
 * @param {Array<'port'|'starboard'>} sides
 * @param {{dir?:number, period?:number}} options period 기본값은 최대 케이던스
 */
function cadence(sides, options = {}) {
  const dir = options.dir ?? 1;
  const every = Math.max(1, Math.round((options.period ?? STROKE_SPAN) / FIXED_DT));
  const strokes = sides.map((side) => ({ side, dir }));
  return (step) => (step % every === 0 ? { strokes } : EMPTY_INPUT);
}

const BOTH = ['port', 'starboard'];

/**
 * 기본 장치를 얹고 seconds 초 시뮬레이션한다.
 * @param {object|function} input 고정 입력 객체, 또는 `(step) => 입력` (스트로크 스케줄)
 * @param {{seconds?:number, v?:{x,y}, w?:number, rudder?:boolean}} setup 초기 상태
 */
function drive(key, input, setup = {}) {
  const seconds = setup.seconds ?? 3;
  const { world, body } = spawn(key, {
    devices: setup.devices ?? true, rudder: setup.rudder, attach: setup.attach,
  });
  if (setup.v) body.setLinearVelocity(new Vec2(setup.v.x, setup.v.y));
  if (setup.w) body.setAngularVelocity(setup.w);
  const inputAt = typeof input === 'function' ? input : () => input;
  let step = 0;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(body, inputAt(step++), dt); applyHydroToWorld(world, dt); },
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
    fwd: drive(key, cadence(BOTH)).speed,
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
  `양노 최대 케이던스 3초 ${feel.sloop.fwd.toFixed(2)} > ${feel.round.fwd.toFixed(2)} m/s`);
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

// ─────────────────────────────────────────────── D2 기본 장치 (§5)
console.log('\n\x1b[36m▌D2 — 기본 장치 (§5.1 좌현 노 · 우현 노 · 닻)\x1b[0m\n');

// 두 노의 y **합의 절반**이 곧 "양쪽을 고르게 저어도 남는 팔길이"다. 대칭 배는 0 이어야 하고,
// 0 이 아닌 만큼 그 배는 직진 입력만으로 돈다 — 아래 20초 주행이 이 수치를 거동으로 확인한다.
for (const key of ['sloop', 'round', 'lopsided']) {
  const devices = defaultDevices(hulls[key].outline);
  const oars = devices.filter((d) => d.type === 'oar');
  const span = sideAnchors(hulls[key].outline, oars[0].x);
  const axis = (oars[0].y + oars[1].y) / 2;
  console.log(`  ${pad(CORPUS_LABELS[key], 14)}노 (${num(oars[0].x, 2, 6)}, ` +
    `${num(oars[0].y, 3, 7)}/${num(oars[1].y, 3, 7)})  반폭 ${num(span.halfBeam, 3, 6)} m  ` +
    `중심선 ${num(axis, 4, 8)} m  장치 ${deviceExtraMass(devices)} kg`);
}

// ── 노 스트로크: 한 번 젓기가 봉투를 그리는가 (임펄스가 아니다) ────────────────
//
// 스트로크 모델의 핵심은 "누른 순간 속도가 튀지 않는다"는 것이다. 봉투가 sin² 이라 힘이
// 0에서 시작해 0으로 끝나므로, 한 스텝의 속도 변화는 항상 작다. 임펄스로 바뀌면 여기가 깨진다.
const oneStroke = (() => {
  const { world, body } = spawn('sloop', { devices: true });
  let step = 0;
  const trace = [];
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyDevices(body, step++ === 0 ? { strokes: BOTH.map((side) => ({ side, dir: 1 })) } : EMPTY_INPUT, dt);
      applyHydroToWorld(world, dt);
    },
  });
  for (let i = 0; i < Math.round(1.2 / FIXED_DT); i++) {
    s.advance(FIXED_DT);
    trace.push(body.getLinearVelocity().x);
  }
  const jumps = trace.map((v, i) => (i === 0 ? v : v - trace[i - 1]));
  return {
    peak: Math.max(...trace),
    maxJump: Math.max(...jumps),
    rising: jumps.filter((j) => j > 1e-9).length,
    end: trace.at(-1),
  };
})();
// 봉투 길이만큼(0.45초 = 27스텝) 가속이 이어져야 한다. 임펄스라면 한 스텝에 끝난다.
const ENVELOPE_STEPS = Math.round(DEVICE_TUNING.oarStrokeDuration / FIXED_DT);
console.log(`  한 번 젓기 — 최고 ${oneStroke.peak.toFixed(3)} m/s · 가속 ${oneStroke.rising}스텝 ` +
  `(봉투 ${ENVELOPE_STEPS}스텝) · 스텝당 최대 증분 ${(oneStroke.maxJump * 1000).toFixed(2)} mm/s · ` +
  `1.2초 뒤 ${oneStroke.end.toFixed(3)} m/s`);
check('한 번 젓기는 임펄스가 아니라 시간 봉투다 (가속이 봉투 길이만큼 이어진다)',
  oneStroke.rising >= ENVELOPE_STEPS * 0.9 && oneStroke.maxJump < oneStroke.peak * 0.15
    && oneStroke.peak > 0.05,
  `가속 ${oneStroke.rising} ≥ ${Math.round(ENVELOPE_STEPS * 0.9)}스텝 · ` +
  `최대 증분이 최고 속도의 ${(oneStroke.maxJump / oneStroke.peak * 100).toFixed(1)}%`);
check('스트로크가 끝나면 배는 활공한다 (봉투 종료 후 감속)',
  oneStroke.end < oneStroke.peak,
  `최고 ${oneStroke.peak.toFixed(3)} → 1.2초 뒤 ${oneStroke.end.toFixed(3)} m/s`);

// ── ★ 홀드 입력: 꾹 누르면 게이트가 열릴 때마다 저절로 한 번 더 젓는다 ────────
//
// 하니스는 눌려 있는 동안 **매 물리 스텝** 젓기를 요청한다. 회수가 안 끝난 노는
// `startStroke` 가 거절하므로, 홀드가 곧 최대 케이던스가 된다 — 플레이어가 리듬을 맞추거나
// 연타할 필요가 없고, 그래도 상한은 입력이 아니라 물리가 정한다.
const heldInput = drive('sloop', cadence(BOTH, { period: FIXED_DT }), { seconds: 60 });
const maxCad = drive('sloop', cadence(BOTH), { seconds: 60 });
console.log(`  홀드 입력 — 매 스텝 요청 ${heldInput.speed.toFixed(2)} m/s vs ` +
  `게이트 케이던스 ${maxCad.speed.toFixed(2)} m/s (${(1 / STROKE_SPAN).toFixed(2)} 회/s · ` +
  `쿨다운 ${DEVICE_TUNING.oarStrokeCooldown}s)`);
check('★ 꾹 누르면 최대 케이던스가 나온다 (리듬도 연타도 필요 없다)',
  Math.abs(heldInput.speed - maxCad.speed) < 0.02,
  `홀드 ${heldInput.speed.toFixed(3)} ≈ 게이트 ${maxCad.speed.toFixed(3)} m/s`);
check('그래도 상한은 입력이 아니라 물리가 정한다 (홀드가 게이트를 넘지 못한다)',
  heldInput.speed <= maxCad.speed + 1e-6,
  `홀드 ${heldInput.speed.toFixed(3)} ≤ 게이트 ${maxCad.speed.toFixed(3)} m/s`);

// ── 입력 버퍼: 젓는 중에 누른 것이 씹히지 않는다 ──────────────────────────────
//
// 연타의 체감은 최고 케이던스보다 여기에 더 많이 걸려 있다. 상한은 어차피 물리가 정하고,
// 플레이어가 원하는 것은 "누른 것이 언젠가는 반영된다"는 확신이다. 다만 한참 전 입력까지
// 기억하면 손을 뗀 뒤에도 배가 혼자 한 번 더 젓는 **유령 스트로크**가 되므로 창이 필요하다.
const strokeStarts = (pressAt) => {
  const { world, body } = spawn('sloop', { devices: true });
  const pressSteps = new Set(pressAt.map((t) => Math.round(t / FIXED_DT)));
  const req = [{ side: 'port', dir: 1 }];
  let step = 0;
  let starts = 0;
  let prev = Infinity;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyDevices(body, pressSteps.has(step) ? { strokes: req } : EMPTY_INPUT, dt);
      applyHydroToWorld(world, dt);
      step++;
    },
  });
  for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
    s.advance(FIXED_DT);
    const t = body.getUserData().hull.control.stroke.t;
    if (t < prev) starts++; // 시계가 되감겼다 = 새 스트로크가 시작됐다
    prev = t;
  }
  return starts;
};
const GATE = STROKE_SPAN;
const buffered = strokeStarts([0, GATE - DEVICE_TUNING.oarStrokeBuffer * 0.5]);
const dropped = strokeStarts([0, GATE - DEVICE_TUNING.oarStrokeBuffer * 2]);
console.log(`  입력 버퍼 ${DEVICE_TUNING.oarStrokeBuffer}s — 게이트 직전 입력 ${buffered}회 젓기 · ` +
  `창 밖 입력 ${dropped}회 젓기`);
check('젓는 중에 누른 입력은 버려지지 않고 게이트가 열릴 때 발사된다',
  buffered === 2,
  `게이트 직전에 한 번 더 눌러 ${buffered}회 저었다`);
check('창 밖(너무 이른) 입력은 기억하지 않는다 — 손을 뗀 뒤 유령 스트로크 방지',
  dropped === 1,
  `버퍼 창보다 이른 입력은 무시 → ${dropped}회`);

// ── ★ 위상 동기: 한쪽만 젓다가 양쪽으로 바꿔도 두 노가 어긋나지 않는다 ────────
//
// 노마다 시계를 따로 두면, 한쪽만 젓다가 양쪽을 요청하는 순간 쉬던 노는 즉시 시작하고
// 젓던 노는 자기 게이트를 기다려 최대 반 사이클 어긋난 채 **영영 고정**된다. 두 노가
// 번갈아 젓는 꼴이 되고, 좌우 토크가 교대로 들어와 직진해야 할 배가 뱀처럼 흔들린다.
// 시계를 배에 하나만 두면 이 상태 자체가 표현 불가능해진다.
/** @param {number} switchSec 이 시각까지 우현만 젓고 그 뒤로 양쪽. 0 이면 처음부터 양쪽. */
const rowThenBoth = (switchSec) => {
  const { world, body } = spawn('sloop', { devices: true });
  const one = cadence(['starboard']);
  const both = cadence(BOTH);
  const SWITCH = Math.round(switchSec / FIXED_DT);
  let step = 0;
  let desynced = 0; // 전환 후 한 노만 물에 든 스텝 수
  const yaws = [];
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyDevices(body, step < SWITCH ? one(step) : both(step - SWITCH), dt);
      applyHydroToWorld(world, dt);
      step++;
    },
  });
  for (let i = 0; i < Math.round(20 / FIXED_DT); i++) {
    s.advance(FIXED_DT);
    if (i < SWITCH) continue;
    // 전환 후 "한쪽 노만 물에 든" 스텝을 **하나도 빠짐없이** 센다. 진행 중이던 사이클이
    // 끝나는 동안은 한쪽만 젓는 게 맞다(젓던 노를 사이클 도중에 빼거나 쉬던 노를 봉투
    // 중간에 집어넣을 수는 없다). 문제는 그게 **한 사이클 안에 끝나는가**다.
    const st = body.getUserData().hull.control.stroke;
    const rowing = Number.isFinite(st.t) && st.t < DEVICE_TUNING.oarStrokeDuration;
    if (rowing && !(st.port && st.starboard)) desynced++;
    if (i >= SWITCH + 30) yaws.push(body.getAngularVelocity());
  }
  // ⚠ 전환 직후의 큰 요잉률은 버그가 아니라 **잔여 회전**이다 (우현만 젓던 시간의 결과).
  //   그것은 천천히 가라앉기만 하므로 긴 구간의 최대−최소로 재면 감쇠 폭이 잡혀 진동과
  //   구분되지 않는다 (실측: 잔여 회전만으로 4초에 0.642°/s가 잡혔다).
  //   위상 어긋남의 흔적은 **한 사이클 안에서** 좌우로 튀는 것이므로 그 창에서 재야 한다.
  const cycle = Math.round(strokeGate() / FIXED_DT);
  const tail = yaws.slice(-Math.round(4 / FIXED_DT));
  let swing = 0;
  for (let i = 0; i + cycle <= tail.length; i++) {
    const win = tail.slice(i, i + cycle);
    swing = Math.max(swing, Math.max(...win) - Math.min(...win));
  }
  return { desynced, swing };
};

const switched = rowThenBoth(3.2);
const alwaysBoth = rowThenBoth(0); // 대조군: 처음부터 양쪽. 어긋날 기회가 없었던 배.
const deg = (w) => (w * 180 / Math.PI).toFixed(3);
// 봉투 길이만큼은 한쪽으로 끝날 수 있다 — 진행 중이던 사이클의 잔여분이다.
const ENVELOPE_LIMIT = Math.round(DEVICE_TUNING.oarStrokeDuration / FIXED_DT);
console.log(`  우현만 3.2초 → 양쪽 — 전환 후 한쪽만 든 스텝 ${switched.desynced}회 ` +
  `(진행 중이던 사이클 잔여분, 상한 ${ENVELOPE_LIMIT}) · ` +
  `사이클 내 요잉률 진폭 ${deg(switched.swing)}°/s ` +
  `(처음부터 양쪽인 대조군 ${deg(alwaysBoth.swing)}°/s)`);
check('★ 한쪽만 젓다가 양쪽으로 바꾸면 **한 사이클 안에** 두 노가 맞춰진다 (시계는 배에 하나)',
  switched.desynced <= ENVELOPE_LIMIT && alwaysBoth.desynced === 0,
  `전환 후 한쪽만 ${switched.desynced}스텝 ≤ 봉투 ${ENVELOPE_LIMIT}스텝 · ` +
  `대조군 ${alwaysBoth.desynced}스텝`);
// 어긋났다면 사이클마다 ±(반폭 × 추력) 토크가 교대로 들어와 진폭이 여러 °/s 가 된다.
// 한쪽 노만 8초 저으면 30° 도는 것에서 그 크기를 가늠할 수 있다.
check('사이클 안에서 좌우로 튀지 않는다 (어긋난 노가 만드는 교대 토크가 없다)',
  switched.swing * 180 / Math.PI < 0.5,
  `사이클 내 진폭 ${deg(switched.swing)}°/s < 0.5 (대조군 ${deg(alwaysBoth.swing)})`);

// ── 케이던스가 곧 추력 (봉투가 임펄스가 아니라 시간 힘이라는 회귀) ─────────────
//
// 게이트 배수가 아니라 **절대 케이던스**로 잰다. 쿨다운 노브를 돌려도 이 회귀가 같이
// 흔들리면 안 된다 — 실측상 게이트 아래에서는 두 모델의 종단 속도가 완전히 같다.
const SLOW_RATE = 0.5; // 회/s
const slowCad = drive('sloop', cadence(BOTH, { period: 1 / SLOW_RATE }), { seconds: 60 });
check('천천히 저으면 종단 속도가 유의미하게 낮아진다 (한 번 젓기 = 고정 임펄스가 아니다)',
  slowCad.speed < maxCad.speed * 0.8 && slowCad.speed > 0.3,
  `${(1 / STROKE_SPAN).toFixed(2)} 회/s ${maxCad.speed.toFixed(2)} vs ` +
  `${SLOW_RATE} 회/s ${slowCad.speed.toFixed(2)} m/s`);

// ── 기본 노: 맵 클리어 불가 수준의 미약한 추력 (§5.2 원칙 1) ────────────────────
console.log(`  노 종단 속도 — 60초 최대 케이던스 후 ${maxCad.speed.toFixed(2)} m/s ` +
  `(설계 상한 ${DEVICE_TUNING.oarMaxSpeed} m/s)`);
check('기본 노만으로는 종단 속도가 낮다 (§5.2 원칙 1 "맵 클리어 불가 수준")',
  maxCad.speed < DEVICE_TUNING.oarMaxSpeed && maxCad.speed > 1.0,
  `${maxCad.speed.toFixed(2)} m/s < ${DEVICE_TUNING.oarMaxSpeed} m/s`);

// ── ★ 한쪽만 젓기 = 선회. 조향 코드 0줄, τ = −y·F 하나에서 나온다 ───────────────
const portOnly = drive('sloop', cadence(['port']), { seconds: 8 });
const starOnly = drive('sloop', cadence(['starboard']), { seconds: 8 });
const bothEven = drive('sloop', cadence(BOTH), { seconds: 8 });
console.log(`  8초 젓기 — 좌현만 ${portOnly.yaw.toFixed(1)}° · 우현만 ${starOnly.yaw.toFixed(1)}° · ` +
  `양쪽 ${bothEven.yaw.toFixed(2)}°`);
check('★ 한쪽 노만 저으면 선회한다 (조향 코드 0줄 — §4.1 부착점 창발)',
  portOnly.turned > 20 && starOnly.turned > 20,
  `좌현만 ${portOnly.turned.toFixed(1)}° · 우현만 ${starOnly.turned.toFixed(1)}°`);
check('좌현 노와 우현 노는 서로 반대로 돈다 (카누와 같다 — 부호도 식에서 나온다)',
  Math.sign(portOnly.yaw) === -Math.sign(starOnly.yaw),
  `좌현 ${portOnly.yaw.toFixed(1)}° vs 우현 ${starOnly.yaw.toFixed(1)}°`);
check('대칭 선체는 양쪽을 저으면 토크가 상쇄돼 직진한다',
  bothEven.turned < portOnly.turned * 0.05,
  `양쪽 ${bothEven.turned.toFixed(3)}° < 한쪽 ${portOnly.turned.toFixed(1)}° × 0.05`);

// ── 넓은 배가 잘 돈다 — 팔길이가 반폭이므로 (형상 → 조향 특성) ──────────────────
const oarX = (key) => defaultDevices(hulls[key].outline).find((d) => d.type === 'oar').x;
const halfBeamOf = (key) => sideAnchors(hulls[key].outline, oarX(key)).halfBeam;
check('넓은 배가 한쪽 젓기로 더 잘 돈다 (팔길이 = 노 반폭)',
  halfBeamOf('round') > halfBeamOf('sloop'),
  `둥근 배 반폭 ${halfBeamOf('round').toFixed(2)} > 슬루프 ${halfBeamOf('sloop').toFixed(2)} m`);

// ── 부착 아이템으로서의 키: 유속 비례 선회력, 정지 시 무효 (§5.1) ───────────────
//
// D2 부터 키는 기본 장착이 아니다. 노 조향은 oarMaxSpeed 근처에서 죽으므로, 빠른 물살에서는
// 키를 달아야 한다 — §5.2 원칙 2 의 "탈착·교체가 실력 표현"이 여기서 성립한다.
const helmStill = drive('sloop', { steer: 1 }, { seconds: 2, rudder: true });
check('키는 정지 상태에서 무효다 (§5.1 "키는 물살이 있어야 듣는다")',
  helmStill.turned < 0.01 && Math.abs(helmStill.w) < 1e-6,
  `2초 조타 → ${helmStill.turned.toFixed(4)}° · ${helmStill.w.toFixed(6)} rad/s`);

// 같은 조타를 서로 다른 초기 유속에서. 힘이 u·|u| 라 유속이 2배면 선회 응답이 크게 벌어져야 한다.
const helmSlow = drive('sloop', { steer: 1 }, { seconds: 1, v: { x: 1.5, y: 0 }, rudder: true });
const helmFast = drive('sloop', { steer: 1 }, { seconds: 1, v: { x: 3.0, y: 0 }, rudder: true });
console.log(`  키 응답 — 유속 1.5 m/s → ${helmSlow.turned.toFixed(2)}° · ` +
  `3.0 m/s → ${helmFast.turned.toFixed(2)}° (1초 조타)`);
check('키의 선회력은 유속에 비례한다 (전진 속도 2배 → 선회 응답 급증)',
  helmFast.turned > helmSlow.turned * 2.5,
  `${helmFast.turned.toFixed(2)}° > ${helmSlow.turned.toFixed(2)}° × 2.5`);

// 후진 중에는 u·|u| 의 부호가 뒤집혀 같은 조타가 반대로 듣는다 — 조건 분기 없이 식에서 나온다.
const helmAstern = drive('sloop', { steer: 1 }, { seconds: 1, v: { x: -3.0, y: 0 }, rudder: true });
check('후진 중에는 같은 조타가 반대로 듣는다 (u·|u| 의 부호 반전)',
  Math.sign(helmAstern.yaw) === -Math.sign(helmFast.yaw) && helmAstern.turned > 0.5,
  `전진 ${helmFast.yaw.toFixed(1)}° vs 후진 ${helmAstern.yaw.toFixed(1)}°`);

// ── 노 추력 감쇠 곡선 (§5.1 "노깃이 물을 못 잡는다") ──────────────────────────
//
// `oarMaxSpeed` 는 배의 최고 속도가 아니라 **노깃의 스트로크 속도**다. 배가 그만큼 빨라지면
// 노깃이 더 이상 물을 뒤로 밀 수 없어 추력이 0 이 된다 (프로펠러의 전진비 한계와 같다).
const M = DEVICE_TUNING.oarMaxSpeed;
const curve = [0, 0.25, 0.5, 0.75, 0.9, 1].map((r) => oarFalloff(r * M));
console.log(`  감쇠 곡선 (r = u/${M}) — ${[0, 0.25, 0.5, 0.75, 0.9, 1]
  .map((r, i) => `${r}:${curve[i].toFixed(3)}`).join(' ')}`);
check('노 추력은 단조 감소하고 노깃 속도에서 정확히 0 이 된다',
  curve.every((v, i) => i === 0 || v <= curve[i - 1]) && curve.at(-1) === 0 && curve[0] === 1,
  `1.000 → 0.000 · ${M} m/s 이상은 전부 0 (${oarFalloff(M * 2).toFixed(3)})`);
// 선형이면 상단 기울기가 중간과 같아 r=1 에서 툭 끊긴다. 곡선은 그 지점 기울기가 0 이다.
const slopeMid = curve[2] - curve[3];   // r 0.50 → 0.75
const slopeTop = curve[4] - curve[5];   // r 0.90 → 1.00
check('상한에서 절벽이 아니라 매끄럽게 붙는다 (상단 기울기 < 중간 기울기)',
  slopeTop < slopeMid * 0.6,
  `중간 구간 −${slopeMid.toFixed(3)} vs 상단 구간 −${slopeTop.toFixed(3)}`);
check('★ 역젓기는 감쇠를 받지 않는다 — 빠를수록 물을 더 잘 잡는다 (r 을 먼저 clamp)',
  oarFalloff(-5) === 1 && oarFalloff(-0.1) === 1,
  `along −5 m/s → ${oarFalloff(-5).toFixed(3)}`);

// ★ 노 조향과 키 조향의 트레이드오프 — 키를 남겨 둔 이유가 수치로 성립하는가.
//
// ⚠ "고속에서 노가 죽는다"는 **앞으로 젓기에만** 해당한다. 역젓기는 along = u·dir 이 음수라
//   감쇠를 받지 않으므로 고속에서도 만력이다 — 그래서 노는 빠를 때 브레이크이자 역방향
//   조향 수단이 된다. 조건 분기가 아니라 부호 하나에서 나온다.
// ⚠ 시험 속도를 절대값으로 박으면 안 된다. 한계 속도는 튜닝 슬라이더로 움직이는 값이라,
//   5 m/s 로 고정해 두면 노브를 올리는 순간 시험 속도가 벽 아래로 내려가 회귀가 조용히
//   의미를 잃는다. 케이던스 회귀와 같은 교훈이다 — **설계 상수에 상대적으로** 잰다.
const FAST = M * 1.4;
const fastOar = drive('sloop', cadence(['port']), { seconds: 2, v: { x: FAST, y: 0 } });
const fastAstern = drive('sloop', cadence(['port'], { dir: -1 }), { seconds: 2, v: { x: FAST, y: 0 } });
const fastCoast = drive('sloop', EMPTY_INPUT, { seconds: 2, v: { x: FAST, y: 0 } });
const fastHelm = drive('sloop', { steer: 1 }, { seconds: 2, v: { x: FAST, y: 0 }, rudder: true });
const speedOf = (r) => r.body.getLinearVelocity().x;
console.log(`  고속(${FAST.toFixed(1)} m/s = 한계 ×1.4) 2초 — ` +
  `앞으로 젓기 ${fastOar.turned.toFixed(2)}° (${speedOf(fastOar).toFixed(2)} m/s) · ` +
  `역젓기 ${fastAstern.turned.toFixed(2)}° (${speedOf(fastAstern).toFixed(2)} m/s) · ` +
  `무입력 ${fastCoast.turned.toFixed(2)}° (${speedOf(fastCoast).toFixed(2)} m/s) · ` +
  `키 ${fastHelm.turned.toFixed(2)}°`);
check('고속에서 **앞으로** 젓기는 무입력과 완전히 같다 (가속도 조향도 0)',
  Math.abs(fastOar.turned - fastCoast.turned) < 1e-6
    && Math.abs(speedOf(fastOar) - speedOf(fastCoast)) < 1e-6,
  `앞으로 젓기 ${speedOf(fastOar).toFixed(4)} m/s = 무입력 ${speedOf(fastCoast).toFixed(4)} m/s`);
check('★ 고속에서도 한쪽 역젓기는 조향이 된다 (노가 완전히 무용해지지는 않는다)',
  fastAstern.turned > fastCoast.turned + 0.3 && speedOf(fastAstern) < speedOf(fastCoast),
  `역젓기 ${fastAstern.turned.toFixed(2)}° · 제동 ${speedOf(fastCoast).toFixed(2)} → ${speedOf(fastAstern).toFixed(2)} m/s`);
check('★ 그래도 고속 조향은 키가 압도한다 (키를 아이템으로 남긴 이유 — 원칙 2)',
  fastHelm.turned > fastAstern.turned * 10,
  `키 ${fastHelm.turned.toFixed(2)}° > 역젓기 ${fastAstern.turned.toFixed(2)}° × 10`);

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
  let step = 0;
  const row = cadence(BOTH);
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyDevices(body, { ...row(step++), anchor }, dt);
      applyHydroToWorld(world, dt);
    },
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
  straightRuns[key] = drive(key, cadence(BOTH), { seconds: STRAIGHT_RUN_SECONDS });
}
const turnRadius = (r) => r.speed / Math.max(Math.abs(r.w), 1e-9);
console.log(`  ↑ 만 ${STRAIGHT_RUN_SECONDS}초 — ${['sloop', 'round', 'lopsided']
  .map((k) => `${CORPUS_LABELS[k]} ${straightRuns[k].yaw.toFixed(1)}° (R ${turnRadius(straightRuns[k]).toFixed(0)} m)`)
  .join(' · ')}`);
check('★ 비대칭 선체는 양쪽을 고르게 저어도 선회한다 (조향 코드 0줄 — §4.1 부착점 창발)',
  straightRuns.lopsided.turned > 30 && turnRadius(straightRuns.lopsided) < 60,
  `↑ 만 ${STRAIGHT_RUN_SECONDS}초 → ${straightRuns.lopsided.yaw.toFixed(1)}° · ` +
  `선회 반경 ${turnRadius(straightRuns.lopsided).toFixed(0)} m`);
check('대칭 선체는 같은 입력에 똑바로 간다 (창발이 형상에서 온다는 대조군)',
  straightRuns.sloop.turned < straightRuns.lopsided.turned * 0.1
    && straightRuns.round.turned < straightRuns.lopsided.turned * 0.1,
  `슬루프 ${straightRuns.sloop.turned.toFixed(2)}° · 둥근 배 ${straightRuns.round.turned.toFixed(2)}°`);

// ─────────────────────────────── D2 [가설 B] 아이템 배치에서 조향이 창발하는가 (§4.1)
//
// 통과 질문: "조향 코드를 한 줄도 안 짰는데, 좌우 부스터 배치만으로 슬라럼을 통과하는가?
//             닻 드리프트가 성립하는가?"
//
// 슬라럼 실통과는 사람이 몰아 봐야 하지만, 그 전제인 **"부착점 (x, y, angle) 셋만 바꿔서
// 직진 · 좌선회 · 우선회 · 게걸음이 전부 나오는가"** 는 여기서 수치로 판정할 수 있다.
// 아래 다섯 케이스는 같은 부스터 정의를 위치와 방향만 달리해 얹은 것이다.
console.log('\n\x1b[36m▌D2 [가설 B] — 아이템 배치 = 조향 (§4.1 조향 코드 0줄)\x1b[0m\n');

const sloopBox = bounds(hulls.sloop.outline);
/** 부스터를 다는 선미 위치와 현측 오프셋 — 노와 같은 자리를 쓴다. */
const BOOST_X = sloopBox.minX + sloopBox.width * 0.15;
const BOOST_Y = sideAnchors(hulls.sloop.outline, BOOST_X).halfBeam;

const booster = (x, y, angle, bind = 'KeyA') => ({ type: 'booster', x, y, angle, bind });
const fire = (...binds) => {
  const held = {};
  for (const b of binds) held[b] = true;
  return { held };
};

const boost = {
  중심선: drive('sloop', fire('KeyA'), { seconds: 6, attach: [booster(BOOST_X, 0, 0)] }),
  좌현: drive('sloop', fire('KeyA'), { seconds: 6, attach: [booster(BOOST_X, BOOST_Y, 0)] }),
  우현: drive('sloop', fire('KeyA'), { seconds: 6, attach: [booster(BOOST_X, -BOOST_Y, 0)] }),
  양현: drive('sloop', fire('KeyA', 'KeyS'), {
    seconds: 6,
    attach: [booster(BOOST_X, BOOST_Y, 0, 'KeyA'), booster(BOOST_X, -BOOST_Y, 0, 'KeyS')],
  }),
  // 측면을 향하게 달면 §4.2 가 말하는 "게걸음"이 나온다 — 뱃머리는 그대로 두고 옆으로 간다.
  게걸음: drive('sloop', fire('KeyA'), {
    seconds: 6, attach: [booster(0, 0, -Math.PI / 2)],
  }),
};
for (const [label, r] of Object.entries(boost)) {
  const v = r.body.getLocalVector(r.body.getLinearVelocity());
  console.log(`  ${pad(label, 8)}6초 → 선수각 ${num(r.yaw, 1, 8)}°  ` +
    `전진 ${num(v.x, 2, 6)} m/s  옆 ${num(v.y, 2, 6)} m/s`);
}

check('부스터를 중심선에 달면 직진한다 (팔길이 0 → 토크 0)',
  boost.중심선.turned < 1.0,
  `6초 점화 → ${boost.중심선.yaw.toFixed(2)}°`);
check('★ 편측 부스터만으로 선회한다 (조향 코드 0줄 — 부착점 y 가 곧 팔길이)',
  boost.좌현.turned > 45 && boost.우현.turned > 45,
  `좌현 ${boost.좌현.yaw.toFixed(0)}° · 우현 ${boost.우현.yaw.toFixed(0)}°`);
check('좌우 미러 배치는 정확히 반대로 돈다 (부호도 τ = x·Fy − y·Fx 에서 나온다)',
  Math.sign(boost.좌현.yaw) === -Math.sign(boost.우현.yaw)
    && Math.abs(boost.좌현.turned - boost.우현.turned) < boost.좌현.turned * 0.1,
  `${boost.좌현.yaw.toFixed(0)}° vs ${boost.우현.yaw.toFixed(0)}°`);
check('양현 부스터를 동시에 켜면 토크가 상쇄돼 직진한다 (슬라럼의 전제)',
  boost.양현.turned < boost.좌현.turned * 0.05,
  `양현 ${boost.양현.turned.toFixed(2)}° < 편측 ${boost.좌현.turned.toFixed(0)}° × 0.05`);
{
  const v = boost.게걸음.body.getLocalVector(boost.게걸음.body.getLinearVelocity());
  check('측면을 향한 부스터는 게걸음을 만든다 (§4.2 — 방향 하나만 바꿨다)',
    Math.abs(v.y) > Math.abs(v.x) * 2,
    `옆 ${v.y.toFixed(2)} m/s vs 전진 ${v.x.toFixed(2)} m/s`);
}

// ── 슬라럼 대리 판정: 좌우를 번갈아 점화하면 실제로 지그재그가 되는가 ──────────
const slalom = (() => {
  const { world, body } = spawn('sloop', {
    devices: true,
    attach: [booster(BOOST_X, BOOST_Y, 0, 'KeyA'), booster(BOOST_X, -BOOST_Y, 0, 'KeyS')],
  });
  const PERIOD = Math.round(1.6 / FIXED_DT); // 1.6초마다 좌↔우 전환
  let step = 0;
  const yaws = [];
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      // 첫 구간만 반 주기다. 온전한 주기로 시작하면 진동의 중심이 0 이 아니라 한쪽으로
      // 치우쳐(첫 구간이 ω=0 에서 출발하므로) 지그재그가 아니라 완만한 나선이 된다.
      const left = Math.floor((step + PERIOD / 2) / PERIOD) % 2 === 0;
      applyDevices(body, fire(left ? 'KeyA' : 'KeyS'), dt);
      applyHydroToWorld(world, dt);
      step++;
    },
  });
  const heading = [];
  for (let i = 0; i < Math.round(12 / FIXED_DT); i++) {
    s.advance(FIXED_DT);
    yaws.push(body.getAngularVelocity());
    heading.push(body.getAngle());
  }
  // 각속도의 부호가 몇 번 뒤집히는가 = 몇 번 꺾었는가.
  // ⚠ 부호가 바뀌는 그 스텝은 ω ≈ 0 이라 잡음과 구분되지 않는다. **마지막으로 유의미했던
  //   부호**와 비교해야 한다 (스텝 대 스텝으로 비교하면 전환이 통째로 안 세진다).
  let flips = 0;
  let lastSign = 0;
  for (const w of yaws) {
    if (Math.abs(w) < 0.02) continue;
    const sign = Math.sign(w);
    if (lastSign !== 0 && sign !== lastSign) flips++;
    lastSign = sign;
  }
  // 지그재그와 나선을 가르는 것은 **선수각이 한쪽으로 쌓이지 않는가**다.
  const deg = heading.map((a) => a * 180 / Math.PI);
  return {
    flips,
    travelled: body.getPosition().length(),
    swing: Math.max(...deg) - Math.min(...deg),
    drift: Math.abs(deg.at(-1)),
  };
})();
console.log(`  좌↔우 1.6초 교대 12초 — 선회 방향 전환 ${slalom.flips}회 · ` +
  `선수각 진폭 ${slalom.swing.toFixed(1)}° · 최종 누적 ${slalom.drift.toFixed(1)}° · ` +
  `이동 ${slalom.travelled.toFixed(0)} m`);
check('★ 좌우 부스터를 번갈아 켜면 지그재그가 된다 (슬라럼 통과의 전제 — 나머지는 사람 판정)',
  slalom.flips >= 5 && slalom.travelled > 10 && slalom.drift < slalom.swing,
  `전환 ${slalom.flips}회 · 진폭 ${slalom.swing.toFixed(1)}° · ` +
  `누적 ${slalom.drift.toFixed(1)}° (나선이면 누적이 진폭을 넘는다)`);

// ── 닻 드리프트: 현측에 던진 닻은 그 점을 축으로 배를 돌린다 (§4.2) ─────────────
const anchorDrift = (side) => {
  const { world, body } = spawn('sloop', {
    devices: false,
    attach: [{ type: 'anchor', x: BOOST_X, y: side * BOOST_Y, angle: 0 }],
  });
  const anchorAt = body.getWorldPoint(new Vec2(BOOST_X, side * BOOST_Y)).clone();
  body.setLinearVelocity(new Vec2(5, 0));
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(body, { anchor: true }, dt); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < Math.round(3 / FIXED_DT); i++) s.advance(FIXED_DT);

  // 닻점이 제자리인가 = 정말 "그 점을 축으로" 도는가. 조인트가 이를 보장하지만,
  // 측정해 두면 나중에 닻을 다른 방식으로 바꿨을 때 이 성질이 깨지는 것을 잡는다.
  const now = body.getWorldPoint(new Vec2(BOOST_X, side * BOOST_Y));
  return {
    yaw: body.getAngle() * 180 / Math.PI,
    pivotSlip: Math.hypot(now.x - anchorAt.x, now.y - anchorAt.y),
  };
};
const driftSide = anchorDrift(1);
const driftCentre = anchorDrift(0);
console.log(`  5 m/s 주행 중 닻 투하 3초 — 현측 ${driftSide.yaw.toFixed(1)}° ` +
  `(닻점 이동 ${(driftSide.pivotSlip * 1000).toFixed(1)} mm) vs 중심선 ${driftCentre.yaw.toFixed(2)}°`);
check('★ 현측에 던진 닻은 그 점을 축으로 배를 돌린다 (닻 드리프트 — §4.2)',
  Math.abs(driftSide.yaw) > 10 && Math.abs(driftSide.yaw) > Math.abs(driftCentre.yaw) * 5
    && driftSide.pivotSlip < 0.05,
  `현측 ${driftSide.yaw.toFixed(1)}° vs 중심선 ${driftCentre.yaw.toFixed(2)}° · ` +
  `닻점 이동 ${(driftSide.pivotSlip * 1000).toFixed(1)} mm`);

// ── 밸러스트: 힘 코드 0줄. 질량만으로 흘수와 관성을 바꾼다 (§4.2) ───────────────
const bare = computeHullParams(hulls.sloop.outline, {
  material: 'wood', extraMass: itemsExtraMass(defaultDevices(hulls.sloop.outline)),
});
const ballasted = computeHullParams(hulls.sloop.outline, {
  material: 'wood',
  extraMass: itemsExtraMass(defaultDevices(hulls.sloop.outline)) + ITEM_CATALOG.ballast.mass,
});
console.log(`  밸러스트 ${ITEM_CATALOG.ballast.mass} kg — 흘수 ${bare.draft.toFixed(3)} → ` +
  `${ballasted.draft.toFixed(3)} m · 전진 저항 ${bare.drag.x.toFixed(0)} → ${ballasted.drag.x.toFixed(0)}`);
check('밸러스트는 힘 코드 0줄로 흘수와 저항을 바꾼다 (§4.2 "순수 질량")',
  ballasted.draft > bare.draft && ballasted.drag.x > bare.drag.x,
  `흘수 +${((ballasted.draft - bare.draft) * 100).toFixed(1)} cm · ` +
  `저항 +${(ballasted.drag.x - bare.drag.x).toFixed(0)}`);

// ── 예측 궤적선이 실제와 일치하는가 ──────────────────────────────────────────
console.log('\n\x1b[36m▌D1 — 예측 궤적선 (predict.js ↔ 실제 시뮬레이션)\x1b[0m\n');

/**
 * 예측 가정은 "진행 중인 봉투는 끝까지 재생하고 그 뒤로는 활공한다"이다. 그래서 검증도
 * **스트로크를 시작해 봉투 한가운데에서 예측을 뽑고, 그 뒤로 아무 입력 없이 실주행**해
 * 둘이 일치하는지를 본다. 봉투 중간에서 재는 것이 중요하다 — 활공만 재면 스트로크 상태
 * 복사가 통째로 빠져도 통과해 버린다.
 *
 * @param {{strokes?:Array, warmup?:number, seconds?:number, v?:{x,y}, rudder?:boolean, steer?:number}} opts
 */
const predictError = (key, opts = {}) => {
  const seconds = opts.seconds ?? 2.5;
  const { world, body } = spawn(key, { devices: true, rudder: opts.rudder });
  body.setLinearVelocity(new Vec2(opts.v?.x ?? 2.5, opts.v?.y ?? 0)); // 키가 들으려면 물살이 있어야 한다

  const hold = { steer: opts.steer ?? 0 };
  let pending = null;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyDevices(body, pending ?? hold, dt);
      pending = null;
      applyHydroToWorld(world, dt);
    },
  });

  // 스트로크를 시작하고 warmup 스텝만큼 진행 — 예측 시점에 봉투가 살아 있게 만든다.
  if (opts.strokes) {
    pending = { ...hold, strokes: opts.strokes };
    for (let i = 0; i < (opts.warmup ?? 6); i++) s.advance(FIXED_DT);
  }

  const envAtPredict = body.getUserData().hull.control?.stroke.t ?? Infinity;
  const path = predictPath(body, hold, { horizon: seconds, stride: 3 });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) s.advance(FIXED_DT);

  const actual = body.getWorldCenter();
  const predicted = path.at(-1);
  const start = path[0];
  const travelled = Math.hypot(actual.x - start.x, actual.y - start.y);
  const gap = Math.hypot(actual.x - predicted.x, actual.y - predicted.y);
  return {
    gap, travelled, rel: gap / Math.max(travelled, 1e-6), samples: path.length,
    phase: envAtPredict,
  };
};

const bothStroke = BOTH.map((side) => ({ side, dir: 1 }));
const predRuns = {
  '활공': predictError('sloop'),
  '봉투 재생 중': predictError('sloop', { strokes: bothStroke }),
  '한쪽 젓는 중': predictError('sloop', { strokes: [{ side: 'port', dir: 1 }] }),
  '비대칭 젓는 중': predictError('lopsided', { strokes: bothStroke }),
  '키 조타 중': predictError('sloop', { rudder: true, steer: 1, v: { x: 3, y: 0 } }),
};
for (const [label, r] of Object.entries(predRuns)) {
  // 오차를 mm 로 찍는다 — 0.00% 만 보이면 "예측을 안 돌린 것 아닌가"를 구분할 수 없다.
  console.log(`  ${pad(label, 16)}이동 ${num(r.travelled, 2, 6)} m · 오차 ${num(r.gap * 1000, 4, 9)} mm ` +
    `(${(r.rel * 100).toFixed(4)}%) · 샘플 ${r.samples}점`);
}
check('예측 궤적선과 실제 경로의 2.5초 오차가 이동 거리의 5% 이내',
  Object.values(predRuns).every((r) => r.rel < 0.05),
  `최대 ${(Math.max(...Object.values(predRuns).map((r) => r.rel)) * 100).toFixed(2)}%`);
check('★ 스트로크 봉투 재생이 비트 단위로 일치한다 (예측 전용 식이 없다는 증거)',
  predRuns['봉투 재생 중'].gap < 1e-6 && predRuns['한쪽 젓는 중'].gap < 1e-6,
  `봉투 중 예측 오차 ${(predRuns['봉투 재생 중'].gap * 1e6).toFixed(3)} µm · ` +
  `한쪽 ${(predRuns['한쪽 젓는 중'].gap * 1e6).toFixed(3)} µm`);

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

// ── 파손이 조종 특성을 바꾼다 (§5.2 원칙 3 의 토대) ────────────────────────────
//
// 좌우 노 체계에서는 "조향을 잃는다"가 아니라 **조향이 뒤바뀐다**. 한쪽 노를 잃으면 양쪽
// 젓기(↑)가 곧 한쪽 젓기가 되어 배가 저절로 돌기 시작한다 — 파손이 새 거동을 만드는 쪽이라
// 원칙 3("시스템이 이미 계산한 출력을 버리지 않는다")에 더 잘 맞는다.
const oarLoss = (() => {
  const { world, body } = spawn('sloop', { devices: true });
  const port = body.getUserData().hull.items.find((it) => it.side === 'port');
  const at = body.getWorldPoint(new Vec2(port.x, port.y));
  const out = applyImpact(world, body, { x: at.x, y: at.y }, 0.8);
  const survivor = out.bodies.reduce((a, b) =>
    (b.getUserData().hull.params.area > (a?.getUserData().hull.params.area ?? 0) ? b : a), null);
  const alive = survivor.getUserData().hull.items.map((i) => i.key);

  // 남은 배를 양쪽 젓기 입력으로 8초 몰아 본다 — 우현 노만 남았으니 돌아야 한다.
  let step = 0;
  const row = cadence(BOTH);
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(survivor, row(step++), dt); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < Math.round(8 / FIXED_DT); i++) s.advance(FIXED_DT);

  return {
    alive,
    dropped: out.result.droppedItems.map((i) => i.key),
    yaw: survivor.getAngle() * 180 / Math.PI,
  };
})();
console.log(`  좌현 노 상실 후 ↑ 만 8초 → ${oarLoss.yaw.toFixed(1)}° ` +
  `(생존 [${oarLoss.alive.join(',')}] · 탈락 [${oarLoss.dropped.join(',')}])`);
check('노 한 자루를 잃으면 양쪽 젓기가 한쪽 젓기가 되어 배가 돌기 시작한다 (§5.2 원칙 3)',
  oarLoss.dropped.includes('oarPort') && !oarLoss.alive.includes('oarPort')
    && Math.abs(oarLoss.yaw) > 10,
  `탈락 [${oarLoss.dropped.join(',')}] · 8초에 ${oarLoss.yaw.toFixed(1)}°`);

const rudderLoss = (() => {
  const { world, body } = spawn('sloop', { devices: true, rudder: true });
  const rudder = body.getUserData().hull.items.find((it) => it.type === 'rudder');
  const at = body.getWorldPoint(new Vec2(rudder.x, rudder.y));
  const out = applyImpact(world, body, { x: at.x, y: at.y }, 0.8);
  const alive = out.bodies.flatMap((b) => b.getUserData().hull.items.map((i) => i.type));
  return { alive, dropped: out.result.droppedItems.map((i) => i.type) };
})();
check('선미를 때려 키를 잃으면 그 조향 수단이 사라진다 (§5.2 원칙 3 — 규칙표 예외 없음)',
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

// ────────────────────── D2 [가설 C] 규칙표에서 의도하지 않은 해법이 나오는가 (§6)
//
// 통과 질문: "화염 지대 테스트 맵에서, 의도 해법(철배) 외에 **물웅덩이를 먼저 지나 젖은
//             나무배로 통과** 같은 비의도 해법이 규칙 조합만으로 실제 성립하는가?"
//
// 이 절의 모든 케이스는 **같은 코드**를 돌린다. 다른 것은 zones.json 의 필드 정의와
// table.json 의 규칙뿐이다. 맵별 분기가 하나라도 있으면 아래 판정은 의미를 잃는다.
console.log('\n\x1b[36m▌D2 [가설 C] — 규칙표에서 비의도 해법이 나오는가 (§6 맵 코드 0줄)\x1b[0m\n');

const RULES = loadRules(RULE_TABLE);
console.log(`  규칙표 v${RULE_TABLE.version} — ${RULES.length}줄 로드 · ` +
  `필드 정의 ${Object.keys(ZONES.zones).length}존`);
check('규칙표가 스키마 검증을 통과한다 (모르는 조건·효과는 로드 시점에 거부된다)',
  RULES.length >= 8 && RULES.every((r) => r.id && r.material && r.when && r.effect),
  `${RULES.length}줄 (D2 목표 8~12줄)`);
check('규칙표에 맵·존을 가리키는 필드가 없다 (원칙 1을 스키마 수준에서 강제)',
  !JSON.stringify(RULE_TABLE.rules).match(/"(map|zone|script|level)"\s*:/),
  '재질 × (필드|상태) → 효과 뿐');

for (const bad of [
  { rules: [{ id: 'x', material: 'wood', when: { curse: 1 }, effect: { set: 'burning' } }] },
  { rules: [{ id: 'x', material: 'wood', when: { state: 'burning' }, effect: { explode: true } }] },
  { rules: [{ id: 'x', material: 'wood', when: { field: 'gravity', gte: 1 }, effect: { destroy: true } }] },
]) {
  let threw = false;
  try { loadRules(bad); } catch { threw = true; }
  if (!threw) check('스키마 밖 규칙은 로드 시점에 거부된다', false, JSON.stringify(bad.rules[0]));
}
check('스키마 밖 규칙(모르는 조건·효과·필드)은 조용히 무시되지 않고 거부된다', true,
  '조건 3종 전부 throw');

/**
 * 배 한 척을 존 안에서 seconds 초 항해시키고 규칙 이벤트를 모은다.
 * @param {{zone:string, material?:string, attach?:Array, v?:{x,y}, seconds?:number}} opts
 */
function voyage(opts) {
  const zone = ZONES.zones[opts.zone];
  const fields = createFields(zone.fields ?? {});
  const { world, body } = spawn(opts.key ?? 'sloop', {
    devices: true, material: opts.material ?? 'wood', attach: opts.attach,
  });
  const engine = createRuleEngine(RULES, fields);
  if (opts.startX) body.setPosition(new Vec2(opts.startX, 0));
  if (opts.v) body.setLinearVelocity(new Vec2(opts.v.x, opts.v.y));

  let step = 0;
  const row = opts.row === false ? null : cadence(BOTH);
  const events = [];
  let alive = true;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyDevices(body, row ? row(step++) : EMPTY_INPUT, dt);
      applyHydroToWorld(world, dt);
      applyFieldsToWorld(world, fields, dt);
      engine.tick(world, dt);
    },
  });
  for (let i = 0; i < Math.round((opts.seconds ?? 20) / FIXED_DT); i++) {
    s.advance(FIXED_DT);
    for (const ev of engine.drain()) {
      events.push(ev);
      if (ev.type === 'destroyed') alive = false;
    }
    if (!alive) break;
  }

  const hull = body.getUserData().hull;
  return {
    body, alive, events,
    x: body.getPosition().x,
    status: { ...hull.status },
    items: hull.items.map((it) => it.type),
    destroyedBy: events.find((e) => e.type === 'destroyed') ? '연소' : null,
  };
}

// ── 의도 해법과 대조군 ────────────────────────────────────────────────────────
const woodBurns = voyage({ zone: 'furnace', material: 'wood', seconds: 12 });
const ironSurvives = voyage({ zone: 'furnace', material: 'iron', seconds: 12 });
console.log(`  화염 지대 12초 — 나무배 ${woodBurns.alive ? '생존' : '파괴'} · ` +
  `철배 ${ironSurvives.alive ? '생존' : '파괴'} (burning ${ironSurvives.status.burning ?? 0})`);
check('나무배는 화염 지대에서 탄다 (규칙 wood-ignites → wood-burns-down)',
  !woodBurns.alive,
  `${woodBurns.events.filter((e) => e.type === 'state').map((e) => e.ruleId)[0] ?? '-'} → 파괴`);
check('철배는 멀쩡하다 — 발화 규칙이 **없어서** 내화다 (규칙 부재가 곧 강점)',
  ironSurvives.alive && !(ironSurvives.status.burning > 0),
  `12초 생존 · burning ${ironSurvives.status.burning ?? 0}`);

// ── ★ 비의도 해법: 물웅덩이를 먼저 지나 젖은 나무배로 통과 ─────────────────────
//
// 두 항해는 **같은 존 · 같은 규칙 · 같은 코드**를 쓴다. 다른 것은 출발점 하나뿐이다:
// 하나는 물웅덩이(x=15)를 지나 화염(x=40)으로 들어가고, 다른 하나는 웅덩이를 건너뛴다.
// "젖으면 불이 안 붙는다"는 규칙 한 줄(wet-suppresses-fire)이고 웅덩이는 필드 정의 하나다.
// 둘을 잇는 코드는 어디에도 없다 — 그것이 가설 C 의 주장이다.
const ruleIds = (r) => [...new Set(r.events.filter((e) => e.type === 'state')
  .map((e) => `${e.ruleId}${e.state.startsWith('-') ? '(해제)' : ''}`))];

const throughPuddle = voyage({ zone: 'volcanic', material: 'wood', v: { x: 3, y: 0 }, seconds: 45 });
const skipPuddle = voyage({
  zone: 'volcanic', material: 'wood', startX: 26, v: { x: 3, y: 0 }, seconds: 45,
});
console.log(`  화산대 45초 — 웅덩이 경유 ${throughPuddle.alive ? '생존' : '파괴'} (x ${throughPuddle.x.toFixed(0)} m) · ` +
  `웅덩이 건너뜀 ${skipPuddle.alive ? '생존' : '파괴'} (x ${skipPuddle.x.toFixed(0)} m)`);
console.log(`  경유: ${ruleIds(throughPuddle).join(' → ') || '(없음)'}`);
console.log(`  직행: ${ruleIds(skipPuddle).join(' → ') || '(없음)'}`);
check('★ 젖은 나무배가 화염 지대를 통과한다 — 규칙 조합만으로 성립하는 비의도 해법 (가설 C)',
  throughPuddle.alive && !skipPuddle.alive
    && ruleIds(throughPuddle).some((id) => id.startsWith('any-gets-wet'))
    && !ruleIds(throughPuddle).some((id) => id.startsWith('wood-ignites')),
  `경유 ${throughPuddle.alive ? '생존' : '파괴'} vs 직행 ${skipPuddle.alive ? '생존' : '파괴'} · ` +
  `경유 중 발화 ${ruleIds(throughPuddle).some((id) => id.startsWith('wood-ignites')) ? '있음' : '없음'}`);
check('젖은 배는 아예 불이 붙지 않는다 (같은 틱에 붙었다 꺼지는 것은 사건이 아니다)',
  !(throughPuddle.status.burning > 0),
  `burning ${throughPuddle.status.burning ?? 0} · 통과 후 젖음 ${(throughPuddle.status.wet ?? 0).toFixed(1)}s 잔여`);

// ── 비의도 해법이 공짜가 아니다: 젖음은 화염 지대에서 두 배로 마른다 (원칙 2) ───
const lingering = voyage({
  zone: 'volcanic', material: 'wood', v: { x: 3, y: 0 }, seconds: 90, row: false,
});
console.log(`  젓지 않고 표류 90초 — ${lingering.alive ? '생존' : '파괴'} · x ${lingering.x.toFixed(0)} m`);
check('젖음 해법은 시간 제한이 있다 (꾸물대면 마르고 결국 탄다 — 원칙 2)',
  !lingering.alive,
  `90초 → ${lingering.alive ? '생존 (대가가 없다 — heat-dries 확인 필요)' : '파괴'}`);

// ── 돛: 천 + 바람 = 추력, 그리고 그 대가 ───────────────────────────────────────
const sailAt = (x, y, angle) => ({ type: 'sail', x, y, angle });
// 노는 끈다 — 돛의 부호를 보려는 자리라 노 추력이 섞이면 가려진다.
const withSail = (zone) => voyage({
  zone, material: 'wood', seconds: 10, row: false, attach: [sailAt(0, 0, 0)],
});
const following = withSail('following');
const headwind = withSail('headwind');
// 횡풍을 받으려면 돛 법선이 바람 쪽(+Y)이어야 한다 — 법선이 +X 면 dot = 0 이라 힘이 없다.
// 그 돛을 중심선 앞쪽(x = +2)에 달면 τ = x·Fy 로 요잉이 생긴다.
const crosswind = voyage({
  zone: 'crosswind', material: 'wood', seconds: 10, row: false,
  attach: [sailAt(2.0, 0, Math.PI / 2)],
});
const sailBurns = voyage({
  zone: 'furnace', material: 'iron', seconds: 12, attach: [sailAt(0, 0, 0)],
});
console.log(`  돛 10초 — 순풍 x ${following.x.toFixed(1)} m · 역풍 x ${headwind.x.toFixed(1)} m · ` +
  `횡풍 선수각 ${(crosswind.body.getAngle() * 180 / Math.PI).toFixed(1)}°`);
check('천 + 바람 = 추력 (§6.3 규칙표 1행)',
  following.x > 5,
  `순풍 10초 → ${following.x.toFixed(1)} m`);
check('역풍은 그대로 역추력이 된다 — 부호 보존형 식 하나에서, 조건 분기 없이 (원칙 2)',
  headwind.x < -5 && Math.sign(headwind.x) === -Math.sign(following.x),
  `순풍 ${following.x.toFixed(1)} m vs 역풍 ${headwind.x.toFixed(1)} m`);
check('중심선을 벗어난 돛은 바람만으로 요잉을 만든다 (§4.2 — 부착점 x 가 팔길이)',
  Math.abs(crosswind.body.getAngle() * 180 / Math.PI) > 5,
  `횡풍 10초 → ${(crosswind.body.getAngle() * 180 / Math.PI).toFixed(1)}°`);

// ★ D3 2장 커리큘럼 "1장의 정답이 페널티로 반전" — 같은 돛, 같은 배, 바람만 뒤집었다.
const rowNoSail = voyage({ zone: 'headwind', material: 'wood', seconds: 20 });
const rowWithSail = voyage({
  zone: 'headwind', material: 'wood', seconds: 20, attach: [sailAt(0, 0, 0)],
});
const sailPenalty = 1 - rowWithSail.x / rowNoSail.x;
console.log(`  역풍에서 노 젓기 20초 — 돛 없이 x ${rowNoSail.x.toFixed(1)} m · ` +
  `돛 달고 x ${rowWithSail.x.toFixed(1)} m (거리 ${(sailPenalty * 100).toFixed(0)}% 손해)`);
check('★ 역풍에서는 돛이 페널티가 된다 (D3 2장 "1장의 정답이 반전" — 규칙표는 그대로)',
  sailPenalty > 0.25,
  `${(sailPenalty * 100).toFixed(0)}% 손해 — D3 2장이 "돛을 떼라"를 강제하려면 이 값을 키운다`);
check('★ 철배의 천 돛은 화염에 탄다 — 아이템도 규칙표의 예외가 아니다 (§4.4)',
  sailBurns.alive && !sailBurns.items.includes('sail'),
  `선체 ${sailBurns.alive ? '생존' : '파괴'} · 남은 아이템 [${sailBurns.items.join(',')}]`);

// ── §5.2 원칙 1 점검: 기본 장치가 아이템을 이기면 안 된다 ─────────────────────
//
// "기본 장치만으로 어떤 맵도 클리어 불가"가 성립하려면, 노만 저어서 가는 속도가 아이템을
// 붙여서 가는 속도보다 낮아야 한다. 노 튜닝 슬라이더를 올리면 여기가 제일 먼저 깨진다 —
// 그래서 수치를 표로 찍는다. 밸런싱 중 "항상 정답"이 나오면 즉시 약점을 추가하라는 원칙 2 의
// 감시 지점이기도 하다.
const oarOnly = drive('sloop', cadence(BOTH), { seconds: 60 }).speed;
const sailOnly = voyage({
  zone: 'following', material: 'wood', seconds: 60, row: false, attach: [sailAt(0, 0, 0)],
}).body.getLinearVelocity().length();
const boosterOnly = drive('sloop', fire('KeyA'), {
  seconds: 60, attach: [booster(BOOST_X, 0, 0)],
}).speed;
console.log(`  추진 수단별 종단 — 기본 노 ${oarOnly.toFixed(2)} · ` +
  `돛(순풍 해협) ${sailOnly.toFixed(2)} · 부스터 ${boosterOnly.toFixed(2)} m/s`);
check('기본 노는 부스터보다 느리다 (§5.2 원칙 1 "기본 장치만으로 클리어 불가")',
  oarOnly < boosterOnly * 0.75,
  `노 ${oarOnly.toFixed(2)} < 부스터 ${boosterOnly.toFixed(2)} m/s × 0.75`);
if (oarOnly >= sailOnly) {
  console.log(`  \x1b[33m⚠ 기본 노가 순풍의 돛보다 빠르다 (${oarOnly.toFixed(2)} ≥ ${sailOnly.toFixed(2)} m/s).\x1b[0m`);
  console.log('    D3 1장 "천 + 바람 = 추력, 큰 돛이 정답"이 성립하지 않는다. 노 튜닝을 낮추거나,');
  console.log('    돛 면적·풍속을 올리거나, 1장을 노가 통하지 않는 맵으로 설계해야 한다.');
}
check('D3 1장이 성립한다: 순풍에서 돛이 기본 노보다 빠르다 (천 + 바람 = 추력이 정답)',
  sailOnly > oarOnly,
  `돛 ${sailOnly.toFixed(2)} vs 노 ${oarOnly.toFixed(2)} m/s`);

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
console.log('\n\x1b[36m▌D0 "프레임 드랍 없이 도는가?" · D1 "형상이 조작감을 만드는가?" · ' +
  'D2 "배치에서 조향이 창발하는가?"\x1b[0m\n');
if (failures.length === 0) {
  console.log('  \x1b[32m통과.\x1b[0m 스파이크는 예산 안에서 돌고, 좌우 노 스트로크와 비대칭 창발이 성립한다.\n');
} else {
  console.log(`  \x1b[31m미달 ${failures.length}건:\x1b[0m\n${failures.map((f) => `    - ${f}`).join('\n')}\n`);
  process.exitCode = 1;
}
