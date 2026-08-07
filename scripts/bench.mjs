// D0 · D1 통과 질문 판정 벤치 — `npm run bench`
//
// DOM 없이 돌려 수치로 판정한다. 브라우저 HUD 는 육안 확인용이고, 통과/미달의 근거는 이
// 스크립트의 출력이다. 코퍼스가 고정돼 있어 매 실행 결과가 재현된다.
//
// D0 은 성능("세 스파이크가 프레임 드랍 없이 도는가")을, D1 은 설계 의도가 코드로 성립하는지를
// 묻는다 — 정지 시 키가 무효인가, 비대칭 선체가 조향 코드 0줄로 도는가, 예측선이 정직한가.
import { strokeToHull } from '../src/hull/polygon.js';
import { computeHullParams, HYDRO_TUNING, MATERIALS } from '../src/hull/params.js';
import { decomposeHull } from '../src/hull/decompose.js';
import { CORPUS, CORPUS_LABELS } from '../src/hull/corpus.js';
import { Settings, Box } from 'planck';
import { createWorld, FixedStepper, FIXED_DT, Vec2 } from '../src/physics/world.js';
import { createHullBody } from '../src/physics/body.js';
import { applyHydroToWorld, applyHydroDrag } from '../src/physics/hydro.js';
import {
  applyDevices, DEVICE_TUNING, oarFalloff, strokeGate, STROKE_KEYMAP,
} from '../src/physics/devices.js';
import { predictPath } from '../src/physics/predict.js';
import { defaultDevices, deviceExtraMass, sternAnchor, sideAnchors } from '../src/items/defaults.js';
import { attachItem, itemsExtraMass, canAttachAt } from '../src/items/attach.js';
import { ITEM_CATALOG } from '../src/items/catalog.js';
import { applyImpact } from '../src/damage/apply.js';
import { burnRadius, carveRadiusFromImpact, DAMAGE_TUNING } from '../src/damage/impact.js';
import { installImpactListener, offCooldown, CONTACT_TUNING } from '../src/damage/contact.js';
import { createObstacle } from '../src/physics/obstacle.js';
import { createTurrets, TURRET_TUNING, MIN_PERIOD } from '../src/game/turrets.js';
import {
  spawnProjectile, cullProjectiles, installProjectileContacts, PROJECTILE_TUNING,
} from '../src/damage/projectile.js';
import { fieldBehind } from '../src/rules/provenance.js';
import { crewWorldPoint, findCrewBody } from '../src/game/crew.js';
import { createGoal, goalDistance, goalReached } from '../src/game/goal.js';
import { bounds, rotate, translate } from '../src/geom/poly.js';
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

// ── ★ 방향키 = 제자리 선회, ↑ 를 얹으면 넓은 선회. 규칙 하나(상쇄)에서 둘 다 나온다 ──
//
// ← 는 우현 앞젓기 + 좌현 역젓기다. 두 노의 토크가 **같은 부호로 더해지고** 전진 추력은
// 서로 깎아, 카누처럼 제자리에 가까운 선회가 된다. 반경이 주는 대가로 속도를 판다.
// ↑ 를 함께 누르면 좌현에 +1 과 −1 이 겹쳐 **상쇄되어 그 노가 물 밖으로 나가고**, 남은
// 우현 앞젓기가 곧 예전의 "한쪽만 젓기" = 넓은 선회다. 새 힘도 새 조향 코드도 없다.
//
// ⚠ 이 케이스들은 반드시 **STROKE_KEYMAP 을 거쳐** 만들어야 한다. 손으로 쓴
//   [{port,−1},{starboard,+1}] 배열을 넣으면 키맵도 상쇄 규칙도 통째로 빠져도 통과해 버린다.
/** 눌린 키 조합을 최대 케이던스로 홀드하는 입력 함수 (게임과 같은 경로로 병합된다). */
const holdKeys = (...keys) => {
  const strokes = keys.flatMap((k) => STROKE_KEYMAP[k]);
  const every = Math.max(1, Math.round(STROKE_SPAN / FIXED_DT));
  return (step) => (step % every === 0 ? { strokes } : EMPTY_INPUT);
};

const pivotLeft = drive('sloop', holdKeys('ArrowLeft'), { seconds: 8 });
const pivotRight = drive('sloop', holdKeys('ArrowRight'), { seconds: 8 });
const wideLeft = drive('sloop', holdKeys('ArrowUp', 'ArrowLeft'), { seconds: 8 });
// 같은 조합을 반대 순서로 누른 배 — 상쇄는 교환법칙이 성립하므로 비트 단위로 같아야 한다.
const wideSwapped = drive('sloop', holdKeys('ArrowLeft', 'ArrowUp'), { seconds: 8 });
// 두 방향키를 동시에 — 양쪽 노 모두 상쇄돼 아무 노도 물에 들어가지 않는다.
const bothSteer = drive('sloop', holdKeys('ArrowLeft', 'ArrowRight'), { seconds: 8 });
const coast8 = drive('sloop', EMPTY_INPUT, { seconds: 8 });
const radiusOf = (r) => r.speed / Math.max(Math.abs(r.w), 1e-9);
console.log(`  8초 — 제자리(←) ${pivotLeft.yaw.toFixed(1)}° R ${radiusOf(pivotLeft).toFixed(1)} m ` +
  `${pivotLeft.speed.toFixed(2)} m/s · 넓게(↑+←) ${wideLeft.yaw.toFixed(1)}° ` +
  `R ${radiusOf(wideLeft).toFixed(1)} m ${wideLeft.speed.toFixed(2)} m/s`);
check('★ 방향키만 누르면 제자리 선회다 (반대쪽 역젓기 — 조향 코드 0줄)',
  radiusOf(pivotLeft) < radiusOf(wideLeft) * 0.5 && pivotLeft.turned > wideLeft.turned,
  `R ${radiusOf(pivotLeft).toFixed(1)} m < 넓은 선회 ${radiusOf(wideLeft).toFixed(1)} m × 0.5 · ` +
  `선회 ${pivotLeft.turned.toFixed(1)}° > ${wideLeft.turned.toFixed(1)}°`);
check('★ 그 대가로 느려진다 (원칙 2 — 빨리 돌려면 속도를 판다)',
  pivotLeft.speed < wideLeft.speed * 0.6,
  `제자리 ${pivotLeft.speed.toFixed(2)} m/s < 넓은 선회 ${wideLeft.speed.toFixed(2)} m/s × 0.6`);
check('★ ↑ 를 함께 누르면 역젓기가 상쇄돼 넓은 선회가 된다 (우현만 젓기와 비트 일치)',
  Math.abs(wideLeft.yaw - starOnly.yaw) < 1e-9 && Math.abs(wideLeft.speed - starOnly.speed) < 1e-9,
  `↑+← ${wideLeft.yaw.toFixed(4)}° = 우현만 ${starOnly.yaw.toFixed(4)}°`);
check('← 와 → 는 정확히 반대로 돈다 (부호도 τ = −y·F 에서 나온다)',
  Math.sign(pivotLeft.yaw) === -Math.sign(pivotRight.yaw)
    && Math.abs(pivotLeft.turned - pivotRight.turned) < pivotLeft.turned * 0.1,
  `← ${pivotLeft.yaw.toFixed(1)}° vs → ${pivotRight.yaw.toFixed(1)}°`);
check('★ 키를 누른 순서가 거동을 바꾸지 않는다 (상쇄는 교환법칙이 성립한다)',
  Math.abs(wideSwapped.yaw - wideLeft.yaw) < 1e-9
    && Math.abs(wideSwapped.speed - wideLeft.speed) < 1e-9,
  `←→↑ 순서 ${wideSwapped.yaw.toFixed(4)}° = ↑→← 순서 ${wideLeft.yaw.toFixed(4)}°`);
check('← 와 → 를 동시에 누르면 두 노 모두 물 밖이다 (무입력과 비트 일치)',
  Math.abs(bothSteer.yaw - coast8.yaw) < 1e-9 && Math.abs(bothSteer.speed - coast8.speed) < 1e-9,
  `←+→ ${bothSteer.speed.toFixed(4)} m/s = 무입력 ${coast8.speed.toFixed(4)} m/s`);

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

// ── 부착점은 선체 안이어야 한다 (§7.5 가 전제하는 불변식) ─────────────────────
//
// 파손 판정은 아이템을 담은 조각을 pointInPolygon 으로 찾고 어느 조각에도 없으면 탈락시킨다.
// 그래서 선체 밖 부착은 **첫 파손에 무조건 사라지고**, 그 전까지는 팔길이만 공짜로 늘어난
// 치트가 된다. UI 편의가 아니라 D3 파손 파이프라인의 전제라 여기서 회귀로 고정한다.
const attachBox = bounds(hulls.sloop.outline);
const insidePt = { x: 0, y: 0 };
const outsidePt = { x: attachBox.maxX + 3, y: attachBox.maxY + 3 };
const donutHole = [
  { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 },
];
console.log(`  부착 판정 — 선체 안 (0,0) ${canAttachAt(hulls.sloop.outline, [], insidePt)} · ` +
  `밖 (${outsidePt.x.toFixed(0)},${outsidePt.y.toFixed(0)}) ${canAttachAt(hulls.sloop.outline, [], outsidePt)} · ` +
  `구멍 속 ${canAttachAt(hulls.sloop.outline, [donutHole], insidePt)}`);
check('선체 밖·구멍 속에는 아이템을 붙일 수 없다 (§7.5 소속 폴리곤 판정의 전제)',
  canAttachAt(hulls.sloop.outline, [], insidePt)
    && !canAttachAt(hulls.sloop.outline, [], outsidePt)
    && !canAttachAt(hulls.sloop.outline, [donutHole], insidePt),
  '안 ✔ · 밖 ✘ · 구멍 속 ✘');

// 막지 않았다면 실제로 어떻게 됐는지 — 검증이 무엇을 막고 있는지 수치로 남긴다.
const strayLoss = (() => {
  const { world, body } = spawn('sloop', { devices: true });
  const hull = body.getUserData().hull;
  attachItem(hull, 'booster', { ...outsidePt, angle: 0, bind: 'KeyA' });
  // 선체 반대편 끝을 살짝 때린다 — 부스터 근처는 건드리지도 않는다.
  const at = body.getWorldPoint(new Vec2(attachBox.minX + 0.5, 0));
  const out = applyImpact(world, body, { x: at.x, y: at.y }, 0.5);
  return out.result.droppedItems.map((i) => i.type);
})();
check('실제로 선체 밖 아이템은 스치는 타격 한 번에 탈락한다 (검증이 막고 있는 것)',
  strayLoss.includes('booster'),
  `부스터 근처를 건드리지도 않았는데 탈락 [${strayLoss.join(',')}]`);

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

// ─────────────────────────────────────────────── D3 ① 파손이 거동으로 읽히는가
//
// D3 통과 질문 (a): "HP바 없이 **거동 변화만으로** 자기 배의 피해 상태를 인지하는가."
// 최종 판정은 사람이 몰아 보고 해야 하지만, 그 **전제**는 여기서 잰다 —
// 깎인 형상이 실제로 조종 특성을 바꾸는가.
//
// ★ 지금 코드가 이걸 못 지키는 이유: `main.js` 의 연소 파괴는 **무게중심에서** 깎는데,
//   그 원이 선체 안쪽이면 clipper 결과가 hole 이 되어 `outline` 이 그대로 남는다.
//   `projectedExtent` 로 뽑는 length·beam 이 안 변하니 저항 타원도 안 변한다.
console.log('\n\x1b[36m▌D3 ① — 파손이 거동으로 읽히는가 (통과 질문 a 의 전제)\x1b[0m\n');

/**
 * 선체를 한 번 깎고 나서 **같은 입력**(양쪽 고르게 젓기)으로 몰아 본다.
 *
 * 20초를 도는 이유는 D1 에서 배운 그대로다 (CLAUDE.md): 비대칭 선회는 각가속도가 작아
 * 몇 초로는 회전 저항과 구분되지 않는다.
 *
 * @param {{x,y}|null} at 선체 로컬 차감 지점. null 이면 무손상 대조군.
 */
function driveAfterCarve(key, at, radius, seconds = 20) {
  const { world, body } = spawn(key, { devices: true });
  const before = body.getUserData().hull;
  const area0 = before.params.area;
  const beam0 = before.params.beam;

  let fleet = [body];
  if (at) {
    const wp = body.getWorldPoint(new Vec2(at.x, at.y));
    const out = applyImpact(world, body, { x: wp.x, y: wp.y }, radius);
    fleet = out.bodies;
  }
  // 파편이 아니라 "그 배"의 거동을 본다 — 가장 큰 조각만 몬다.
  const ship = fleet.sort((a, b) =>
    b.getUserData().hull.params.area - a.getUserData().hull.params.area)[0];
  if (!ship) return null;

  const hull = ship.getUserData().hull;
  // 두 노의 y 합 — 0 이 아니면 τ = −y·F 가 상쇄되지 않는다. 비대칭 창발의 단일 원인.
  const oars = hull.items.filter((it) => it.type === 'oar');
  const oarOffset = oars.reduce((s, it) => s + it.y, 0);

  const row = cadence(BOTH);
  let step = 0;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => { applyDevices(ship, row(step++), dt); applyHydroToWorld(world, dt); },
  });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) s.advance(FIXED_DT);

  return {
    yaw: ship.getAngle() * 180 / Math.PI,
    oarOffset,
    areaLost: 1 - hull.params.area / area0,
    beamChanged: Math.abs(hull.params.beam - beam0) > 1e-6,
  };
}

// 대칭 선체를 골라야 한다 — 애초에 비대칭인 배를 쓰면 파손 때문인지 형상 때문인지 모른다.
const CARVE_KEY = 'round';
const carveOutline = hulls[CARVE_KEY].outline;
const carveArea = paramTable[CARVE_KEY].p.area;
/** §7 의 "한 번의 연소가 깎는 몫" — 선체 크기 비례 (고정 반경은 큰 배를 긁고 작은 배를 죽인다). */
const CARVE_R = Math.sqrt(carveArea) * 0.30;
const pickOutline = (score) => carveOutline.reduce((b, p) => (score(p) > score(b) ? p : b));

const portPoint = pickOutline((p) => p.y);        // 좌현 현측 (+Y)
const starPoint = pickOutline((p) => -p.y);       // 우현 현측 (−Y)
const bowPoint = pickOutline((p) => p.x);         // 뱃머리 — 중심선 위라 대칭이 유지된다

const intact = driveAfterCarve(CARVE_KEY, null, 0);
const portCarved = driveAfterCarve(CARVE_KEY, portPoint, CARVE_R);
const starCarved = driveAfterCarve(CARVE_KEY, starPoint, CARVE_R);
const bowCarved = driveAfterCarve(CARVE_KEY, bowPoint, CARVE_R);

console.log(`  차감 반경 ${CARVE_R.toFixed(2)} m (√면적 × 0.30) · 대칭 코퍼스 '${CORPUS_LABELS[CARVE_KEY] ?? CARVE_KEY}'`);
console.log(`  ${pad('', 18)}${pad('20초 요잉', 12)}${pad('노 y 합', 11)}${pad('면적 손실', 11)}선폭 변화`);
for (const [label, r] of [['무손상 (대조군)', intact], ['좌현 차감', portCarved],
  ['우현 차감', starCarved], ['뱃머리 차감', bowCarved]]) {
  console.log(`  ${pad(label, 18)}${pad(num(r.yaw, 2, 7) + '°', 12)}` +
    `${pad(num(r.oarOffset * 100, 2, 6) + ' cm', 11)}${pad(num(r.areaLost * 100, 1, 5) + '%', 11)}` +
    `${r.beamChanged ? '있음' : '없음'}`);
}

// ⚠ 판정은 **무손상 대비**로 한다. 0 과 비교하면 안 된다 — 완전히 대칭인 코퍼스도 RDP
//   단순화가 남긴 미세 비대칭(여기서는 노 y 합 0.8 cm)으로 20초에 십수 도를 돈다.
//   그 노이즈를 기준선으로 두지 않으면 이 케이스가 무엇을 보증하는지 알 수 없다 (D2 의 교훈).
const NOISE = Math.abs(intact.yaw);

check('★ 한쪽 현측을 깎으면 같은 입력에 배가 돌기 시작한다 (통과 질문 a 의 전제)',
  Math.abs(portCarved.yaw) > NOISE * 10 && Math.abs(portCarved.yaw) >= 90,
  `무손상 ${intact.yaw.toFixed(2)}° → 좌현 차감 ${portCarved.yaw.toFixed(2)}° (${(Math.abs(portCarved.yaw) / NOISE).toFixed(0)}배)`);

check('★ 대조군: 중심선 위를 같은 반경으로 깎으면 무손상과 같은 수준이다 (원인은 차감이 아니라 비대칭)',
  bowCarved.areaLost > 0.01 && Math.abs(bowCarved.yaw) < NOISE * 2 + 5,
  `뱃머리 차감 ${bowCarved.yaw.toFixed(2)}° vs 무손상 ${intact.yaw.toFixed(2)}° · 면적 −${(bowCarved.areaLost * 100).toFixed(1)}%`);

check('깎인 쪽이 선회 부호를 정한다 (좌현 차감과 우현 차감이 반대로 돈다)',
  Math.sign(portCarved.yaw) === -Math.sign(starCarved.yaw)
    && Math.abs(starCarved.yaw) > NOISE * 10,
  `좌현 ${portCarved.yaw.toFixed(2)}° vs 우현 ${starCarved.yaw.toFixed(2)}°`);

// ★ 기전 자체를 직접 재는 케이스 — 요잉은 끝단 관측이라 노이즈가 섞이지만 노 y 합은 안 섞인다.
check('비대칭 선회의 단일 원인은 두 노의 y 합이다 (조향 코드 0줄 — τ = −y·F)',
  Math.abs(portCarved.oarOffset) > 0.2 && Math.abs(bowCarved.oarOffset) < 0.02,
  `현측 차감 ${(portCarved.oarOffset * 100).toFixed(1)} cm · 중심선 차감 ${(bowCarved.oarOffset * 100).toFixed(2)} cm · ` +
  `무손상 ${(intact.oarOffset * 100).toFixed(2)} cm`);

// ── 연소 파괴는 **가장 뜨거운 쪽**을 깎아야 한다 ──────────────────────────────
//
// 무게중심을 깎으면 열원이 어디 있든 같은 자리가 사라져 "어느 쪽이 탔는가"라는 정보가
// 통째로 버려진다 (원칙 3 위반). 지점은 **외곽선 위**여야 outline 이 실제로 바뀐다.
let hotspot = null;
try {
  hotspot = await import('../src/damage/hotspot.js');
} catch {
  // S1 에서 만든다. 없으면 아래 두 케이스가 FAIL 로 남아 판정선 노릇을 한다.
}

const hotFields = createFields({
  temperature: [{ shape: 'disc', x: 0, y: 12, radius: 20, falloff: 0.35, value: 380 }],
});
const flatFields = createFields({});
const identity = (x, y) => ({ x, y });
const sampleWith = (fields) => (x, y) => fields.sampleScalar('temperature', x, y);

const hotPick = hotspot
  ? hotspot.hottestOutlinePoint(carveOutline, identity, sampleWith(hotFields))
  : null;
const flatPick = hotspot
  ? hotspot.hottestOutlinePoint(carveOutline, identity, sampleWith(flatFields))
  : null;
const exposed = hotspot ? hotspot.mostExposedPoint(carveOutline) : null;
const { nearestOutlinePoint, mostExposedPoint } = hotspot ?? {};
const maxReach = Math.max(...carveOutline.map((p) => Math.hypot(p.x, p.y)));

if (hotPick) {
  console.log(`\n  열원 +Y 12 m — 가장 뜨거운 외곽점 (${hotPick.local.x.toFixed(2)}, ` +
    `${hotPick.local.y.toFixed(2)}) · ${hotPick.value.toFixed(0)}° · 구배 ${hotPick.spread.toFixed(1)}°`);
  console.log(`  필드 평평 — 구배 ${flatPick.spread.toFixed(3)}° · ` +
    `가장 돌출한 점 반경 ${Math.hypot(exposed.x, exposed.y).toFixed(2)} / 최대 ${maxReach.toFixed(2)} m`);
} else {
  console.log('\n  src/damage/hotspot.js 없음 — S1 에서 만든다');
}

check('★ 연소 파괴는 가장 뜨거운 쪽을 깎는다 (열원 쪽 외곽선 위)',
  !!hotPick && hotPick.local.y > 0 && hotPick.spread > 1e-3
    && carveOutline.some((p) => p.x === hotPick.local.x && p.y === hotPick.local.y),
  hotPick ? `로컬 y ${hotPick.local.y.toFixed(2)} m · 구배 ${hotPick.spread.toFixed(1)}°` : 'hotspot.js 미구현');

check('첫 발화는 가장 돌출한 부위에서 시작한다 (§2.2 "뾰족한 돌출부에 데미지 집중")',
  !!exposed && flatPick?.spread < 1e-3
    && Math.abs(Math.hypot(exposed.x, exposed.y) - maxReach) < 1e-9,
  exposed ? `반경 ${Math.hypot(exposed.x, exposed.y).toFixed(3)} = 최대 ${maxReach.toFixed(3)} m` : 'hotspot.js 미구현');

// ── ★ 균일한 화염 지대에서 배가 원이 되지 않는가 ─────────────────────────────────
//
// §6.1 의 disc 는 `radius × (1−falloff)` 안쪽이 평평하다 (화염 지대는 27 m, 화산대는 7.15 m).
// 그 안에서는 구배가 0 이라 폴백이 거의 항상 쓰인다. 그런데 "가장 먼 점"을 반복하면 그것은
// **폴리곤을 원으로 만드는 알고리즘**이다 — 실측으로 차감 지점이 26°→358°→50°→339°→317°
// 처럼 반대편을 오가며 선체를 빙 돈다. 플레이어가 그린 설계가 지워진다.
// 직전 화점에서 번지게 하면 한쪽 호를 따라 기어가고 반대편은 손대지 않은 채 남는다.
function burnWalk(key, mode, rounds = 12) {
  const src = hulls[key];
  const world = createWorld();
  let body = createHullBody(world, { outline: src.outline, holes: [], items: [] },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  const octants = new Set();
  let cycles = 0;
  for (let i = 0; i < rounds; i++) {
    const h = body.getUserData().hull;
    const local = mode === 'far'
      ? mostExposedPoint(h.outline)
      : (nearestOutlinePoint(h.outline, h.burnAt) ?? mostExposedPoint(h.outline));
    if (!local) break;
    h.burnAt = { x: local.x, y: local.y };
    const a = (Math.atan2(local.y, local.x) * 180 / Math.PI + 360) % 360;
    octants.add(Math.floor(a / 45));
    cycles++;
    const w = body.getWorldPoint(new Vec2(local.x, local.y));
    const out = applyImpact(world, body, { x: w.x, y: w.y },
      burnRadius(mode === 'far' ? h.params.area : (h.launchArea ?? h.params.area)));
    if (!out || out.bodies.length === 0) return { octants: octants.size, cycles, dead: true };
    body = out.bodies.sort((x, y) =>
      y.getUserData().hull.params.area - x.getUserData().hull.params.area)[0];
  }
  return { octants: octants.size, cycles, dead: false };
}

const walkFar = burnWalk('round', 'far');
const walkSpread = burnWalk('round', 'spread');
const walkFarSloop = burnWalk('sloop', 'far');
const walkSpreadSloop = burnWalk('sloop', 'spread');
console.log(`\n  12회 연속 연소, 차감 지점이 건드린 8분면 (적을수록 한쪽만 먹는다)`);
console.log(`  ${pad('', 14)}${pad('가장 먼 점', 12)}번짐`);
console.log(`  ${pad('둥근 배', 14)}${pad(walkFar.octants + '/8', 12)}${walkSpread.octants}/8`);
console.log(`  ${pad('슬루프', 14)}${pad(walkFarSloop.octants + '/8', 12)}${walkSpreadSloop.octants}/8`);
check('★ 균일한 화염에서도 배가 원이 되지 않는다 (직전 화점에서 번진다)',
  walkSpread.octants < walkFar.octants && walkSpread.octants <= 4,
  `둥근 배 — 가장 먼 점 ${walkFar.octants}/8 vs 번짐 ${walkSpread.octants}/8`);

// ── ★ 배가 유한 사이클에 전손하는가 ─────────────────────────────────────────────
//
// 반경을 √현재면적 으로 두면 매 사이클 일정 **비율**만 사라져 지수 감쇠가 되고 배가 영영
// 안 죽는다 (실측 8사이클에 −28%, 최소 파편까지 약 78사이클 = 5분). 출항 면적으로 고정한다.
const doomed = burnWalk('sloop', 'spread', 60);
const survives = burnWalk('sloop', 'far', 60);
console.log(`  전손까지 — 출항 면적 기준 ${doomed.dead ? doomed.cycles + '사이클' : '60+ (안 죽음)'} · ` +
  `현재 면적 기준 ${survives.dead ? survives.cycles + '사이클' : '60+ (안 죽음)'}`);
check('★ 연소는 유한 사이클에 전손시킨다 (반경이 출항 면적 기준이라 지수 감쇠가 아니다)',
  doomed.dead && doomed.cycles <= 30,
  `${doomed.cycles}사이클에 전손 (규칙표 4초 주기 → 약 ${(doomed.cycles * 4)}초)`);

const fixedR = (() => {
  const world = createWorld();
  const body = createHullBody(world, { outline: hulls.sloop.outline, holes: [], items: [] },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  const h = body.getUserData().hull;
  const before = burnRadius(h.launchArea);
  const out = applyImpact(world, body, body.getWorldPoint(new Vec2(mostExposedPoint(h.outline).x,
    mostExposedPoint(h.outline).y)), before);
  const next = out.bodies[0].getUserData().hull;
  return { before, after: burnRadius(next.launchArea), area: next.params.area, launch: next.launchArea };
})();
check('연소 반경의 기준(출항 면적)이 조각에 승계된다',
  Math.abs(fixedR.before - fixedR.after) < 1e-9 && fixedR.launch > fixedR.area,
  `반경 ${fixedR.before.toFixed(2)} m 유지 · 면적 ${fixedR.area.toFixed(2)} < 출항 ${fixedR.launch.toFixed(2)} m²`);

// ── 필드 이름은 **규칙표에서** 온다 (코드가 'temperature' 를 알면 규칙표 밖에 규칙이 생긴다) ──
//
// 파괴를 낸 규칙(wood-burns-down)에는 필드가 없다. 불을 붙인 규칙(wood-ignites)에만 있으므로
// 한 단계 거슬러 올라가야 한다. 이 한 단계가 조용히 null 이 되면 열원 판정이 통째로 폴백으로
// 새어 나가고, 겉보기에는 "그냥 돌출부가 깎이는" 정상 동작처럼 보인다.
const direct = fieldBehind(RULES, 'wood-ignites');
const viaState = fieldBehind(RULES, 'wood-burns-down');
const viaWet = fieldBehind(RULES, 'wet-suppresses-fire');
// 현 규칙표에는 필드로 환원되지 않는 규칙이 없다. 폴백 경로는 합성 규칙으로 잰다 —
// 규칙표에 시험용 줄을 넣으면 그 줄이 곧 게임 밸런스가 된다.
const orphan = fieldBehind([{ id: 'x', material: '*', when: { state: 'cursed' }, effect: { destroy: true } }], 'x');
const unknown = fieldBehind(RULES, '없는-규칙');
console.log(`\n  규칙 → 필드 — 직접 '${direct}' · 상태 경유 '${viaState}' · 젖음 경유 '${viaWet}' · ` +
  `환원 불가 ${orphan} · 모르는 id ${unknown}`);
check('파괴를 낸 규칙에 필드가 없으면 그 상태를 켠 규칙까지 거슬러 올라간다',
  direct === 'temperature' && viaState === 'temperature' && viaWet === 'moisture',
  `wood-burns-down(필드 없음) → ${viaState} · wet-suppresses-fire → ${viaWet}`);
check('환원되지 않으면 조용히 아무 필드나 고르지 않고 null 을 낸다 (호출자가 돌출부로 폴백)',
  orphan === null && unknown === null,
  `환원 불가 ${orphan} · 모르는 id ${unknown}`);

const rBig = burnRadius(paramTable.sloop.p.area * 4);
const rSmall = burnRadius(paramTable.sloop.p.area);
check('연소 반경이 선체 크기에 비례한다 (고정 반경은 큰 배를 긁고 작은 배를 죽인다)',
  Math.abs(rBig / rSmall - 2) < 1e-9,
  `면적 4배 → 반경 ${rSmall.toFixed(2)} → ${rBig.toFixed(2)} m (정확히 2배)`);

// ─────────────────────────────────────────────── D3 ② 충돌 파손
//
// §7.2 의 입력 중 "암초 충돌"을 실제 물리 접촉에서 만든다. planck 의 post-solve 는
// 강체를 만들거나 부술 수 없으므로 큐에만 쌓고 스텝 밖에서 소비한다.
console.log('\n\x1b[36m▌D3 ② — 충돌 파손 (암초 · 재질 내구)\x1b[0m\n');

/**
 * 배를 암초에 정면으로 박아 본다.
 * @returns {{hits, removed, split, alive, radius, energy, bodies}}
 */
function ram(key, { material = 'wood', speed = 6, seconds = 3, reefX = 14 } = {}) {
  const { world, body } = spawn(key, { devices: true, material });
  const area0 = body.getUserData().hull.params.area;
  createObstacle(world, { shape: 'circle', x: reefX, y: 0, radius: 3, material: 'rock' });

  let elapsed = 0;
  const queue = installImpactListener(world, { now: () => elapsed });
  let fleet = new Set([body]);
  const hits = [];

  const s = new FixedStepper(world, { onPreStep: (dt) => applyHydroToWorld(world, dt) });
  for (const b of fleet) b.setLinearVelocity(new Vec2(speed, 0));

  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    s.advance(FIXED_DT);
    elapsed += FIXED_DT;
    // ── 스텝 밖 ── 여기서만 강체가 나고 죽는다.
    for (const im of queue.drain()) {
      if (!fleet.has(im.body)) continue;               // 이미 파괴된 강체 (댕글링)
      const out = applyImpact(world, im.body, im.at, im.radius);
      if (!out) continue;
      hits.push({ radius: im.radius, energy: im.energy, removed: out.result.removedArea, source: im.source });
      fleet.delete(im.body);
      for (const nb of out.bodies) fleet.add(nb);
    }
  }

  const alive = [...fleet];
  const areaNow = alive.reduce((t, b) => t + b.getUserData().hull.params.area, 0);
  return {
    hits, alive, bodies: alive.length,
    removed: 1 - areaNow / area0,
    split: alive.length > 1,
    radius: hits.length ? Math.max(...hits.map((h) => h.radius)) : 0,
    energy: hits.length ? Math.max(...hits.map((h) => h.energy)) : 0,
    finite: alive.every((b) => Number.isFinite(b.getPosition().x) && Number.isFinite(b.getPosition().y)),
  };
}

const hardHit = ram('sloop', { speed: 6 });
const softHit = ram('sloop', { speed: 1.5 });
const ironHit = ram('sloop', { speed: 6, material: 'iron' });

console.log(`  ${pad('', 20)}${pad('타격', 7)}${pad('최대 에너지', 13)}${pad('반경', 9)}${pad('면적 손실', 11)}조각`);
for (const [label, r] of [['나무 6 m/s', hardHit], ['나무 1.5 m/s (스침)', softHit], ['철 6 m/s', ironHit]]) {
  console.log(`  ${pad(label, 20)}${pad(r.hits.length + '회', 7)}${pad(num(r.energy / 1000, 1, 8) + ' kJ', 13)}` +
    `${pad(num(r.radius, 2, 5) + ' m', 9)}${pad(num(r.removed * 100, 1, 5) + '%', 11)}${r.bodies}개`);
}

check('세게 부딪히면 깎이고 살살 스치면 흠집도 안 난다 (임계는 에너지, 재질이 정한다)',
  hardHit.removed > 0.01 && softHit.hits.length === 0,
  `6 m/s → −${(hardHit.removed * 100).toFixed(1)}% · 1.5 m/s → 타격 ${softHit.hits.length}회`);

check('★ 철은 함몰만 한다 (§7.4 "고내구 — 대포알에 함몰만, 관통 어려움")',
  ironHit.removed < hardHit.removed / 4 && !ironHit.split,
  `나무 −${(hardHit.removed * 100).toFixed(1)}% vs 철 −${(ironHit.removed * 100).toFixed(1)}% · 철 반경 ${ironHit.radius.toFixed(2)} m`);

check('암초는 안 깎인다 — hull userData 가 없어서 (물리·규칙 어디에도 장애물 분기 0줄)',
  (() => {
    const w = createWorld();
    const rock = createObstacle(w, { shape: 'circle', x: 0, y: 0, radius: 3, material: 'rock' });
    return applyImpact(w, rock, { x: 0, y: 0 }, 1.0) === null;
  })(),
  'applyImpact → null');

// ── ★ 연속 충돌: post-solve 가 **매 스텝** 불린다는 함정의 회귀 ─────────────────
//
// ⚠ 그냥 벽에 밀어붙이면 이 회귀는 아무것도 검증하지 못한다. 지속 압력의 스텝당 임펄스는
//   F·dt = 150 N·s 이고 에너지는 J²/2μ ≈ 2.8 J — 나무 임계(8 kJ)의 3천분의 1이라
//   쿨다운을 통째로 없애도 차감이 안 일어난다. **임계를 넘는 충격이 반복돼야** 쿨다운이
//   짐을 진다. 그래서 매 스텝 암초 쪽으로 6 m/s 를 다시 실어 준다 (계속 들이받는 배).
function grindReef(seconds = 30) {
  const { world, body } = spawn('sloop', { devices: true });
  const area0 = body.getUserData().hull.params.area;
  createObstacle(world, { shape: 'circle', x: 11, y: 0, radius: 3, material: 'rock' });
  let elapsed = 0;
  const queue = installImpactListener(world, { now: () => elapsed });
  let fleet = new Set([body]);
  let carves = 0;
  const s = new FixedStepper(world, { onPreStep: (dt) => applyHydroToWorld(world, dt) });
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    for (const b of fleet) b.setLinearVelocity(new Vec2(6, 0));
    s.advance(FIXED_DT);
    elapsed += FIXED_DT;
    for (const im of queue.drain()) {
      if (!fleet.has(im.body)) continue;                 // 이미 파괴된 강체 (댕글링)
      const out = applyImpact(world, im.body, im.at, im.radius);
      if (!out) continue;
      carves++;
      fleet.delete(im.body);
      for (const nb of out.bodies) fleet.add(nb);
    }
  }
  const alive = [...fleet];
  const areaNow = alive.reduce((t, b) => t + b.getUserData().hull.params.area, 0);
  return {
    carves, bodies: alive.length, removed: 1 - areaNow / area0,
    finite: alive.every((b) => Number.isFinite(b.getPosition().x) && Number.isFinite(b.getPosition().y)),
  };
}

const realGrind = grindReef();
console.log(`\n  30초 연속 충돌 (매 스텝 6 m/s 재장전) — 차감 ${realGrind.carves}회 · ` +
  `면적 −${(realGrind.removed * 100).toFixed(1)}% · 조각 ${realGrind.bodies}개 · ` +
  `좌표 ${realGrind.finite ? '유한' : '발산'}`);
check('30초 연속 충돌 후에도 강체가 터지지 않는다',
  realGrind.finite && hardHit.finite && realGrind.bodies > 0,
  `조각 ${realGrind.bodies}개 · 면적 −${(realGrind.removed * 100).toFixed(1)}%`);

// ── 지속 접촉을 실제로 막는 것은 무엇인가 ────────────────────────────────────────
//
// 처음에는 쿨다운이라고 적었지만 A/B 로 재 보니 아니었다. 벽에 기댄 스텝당 임펄스는
// F·dt = 150 N·s 이고 에너지는 J²/2μ ≈ 2.8 J — 나무 임계(8 kJ)의 3천분의 1이다. 설령
// 임계를 넘겨도 반경이 √(1.8/40000) = 0.007 m 라 minCarveRadius(0.12)에서 걸린다.
// **짐을 지는 것은 임계와 최소 반경 둘이고, 쿨다운은 밸런싱 중 임계를 낮췄을 때를 위한
// 백스톱이다.** 그러니 그 둘을 재고, 쿨다운은 판정과 승계를 직접 잰다.
const leanImpulse = 9000 * FIXED_DT;
const leanEnergy = (leanImpulse * leanImpulse) / (2 * spawn('sloop', { devices: true }).body.getMass());
const leanRadius = carveRadiusFromImpact({
  impulse: leanImpulse, effectiveMass: spawn('sloop', { devices: true }).body.getMass(),
  material: MATERIALS.wood, hullArea: paramTable.sloop.p.area,
});
console.log(`  벽에 기대기(9000 N) — 스텝당 에너지 ${leanEnergy.toFixed(1)} J vs 나무 임계 ` +
  `${MATERIALS.wood.impactThreshold} J → 반경 ${leanRadius.toFixed(3)} m`);
check('지속 압력은 애초에 임계를 못 넘는다 (기대는 것으로는 배가 안 깎인다)',
  leanEnergy < MATERIALS.wood.impactThreshold && leanRadius === 0,
  `${leanEnergy.toFixed(1)} J < ${MATERIALS.wood.impactThreshold} J`);

// ★ 진짜 버그였던 것: 쿨다운을 **강체로** 키잉하면 respawnPieces 가 강체를 갈아치울 때마다
//   초기화된다. 차감하는 순간이 곧 쿨다운 해제라서, 쿨다운 0.2s 와 0 의 결과가 한 치도
//   다르지 않았다. 시각은 hull 에 얹고 status 처럼 조각에 승계돼야 한다.
const inherit = (() => {
  const { world, body } = spawn('barbell', { devices: true });
  body.getUserData().hull.lastCarveAt = 12.5;
  const out = applyImpact(world, body, { x: 0, y: 0 }, 0.9);
  return out.bodies.map((b) => b.getUserData().hull.lastCarveAt);
})();
console.log(`  절단 후 조각들의 lastCarveAt — [${inherit.join(', ')}] (원본 12.5)`);
check('★ 차감 쿨다운 시각이 조각에 승계된다 (안 그러면 차감이 곧 쿨다운 초기화다)',
  inherit.length > 1 && inherit.every((t) => t === 12.5),
  `조각 ${inherit.length}개 전부 12.5`);

const cdHull = { lastCarveAt: 10 };
// 경계값(정확히 창 끝)으로 재지 않는다 — 10 + 0.2 − 10 = 0.19999999999999929 라
// 부동소수점에서 미끄러진다. 가드가 보장하는 것은 "창 안은 막고 창 밖은 통과"뿐이다.
check('쿨다운 창 안이면 거절하고 밖이면 허용한다',
  !offCooldown(cdHull, 10 + CONTACT_TUNING.cooldown * 0.5)
    && offCooldown(cdHull, 10 + CONTACT_TUNING.cooldown * 1.5)
    && offCooldown({}, 0),
  `${CONTACT_TUNING.cooldown}s 창 · 이력 없으면 즉시 허용`);

// ─────────────────────────────────────────────── D3 ③ 포탄 · 포탑
//
// 3장에서 배가 **받는** 파손 셋 중 마지막. 피탄 → 파손은 위 ② 와 **완전히 같은 경로**라
// (`contact.js` 가 `{hull, projectile}` 쌍을 이미 처리한다) 새 파손 코드가 0줄이다.
// 여기서 재는 것은 그 전제들이다 — 탄이 제대로 나고, 직선으로 날고, 관통하지 않는가.
console.log('\n\x1b[36m▌D3 ③ — 포탄 · 포탑\x1b[0m\n');

// ── 먼저 순수 스케줄러부터. 물리 없이 도는 케이스라 벤치 시간에 영향이 없고,
//    "발사 시각이 호출 이력과 무관하다"는 프레임률 독립의 **정의**를 직접 잰다.

const turretThrows = [
  ['미지 키', { x: 0, y: 0, angle: 0, script: 'boom' }],
  ['angle 없음', { x: 0, y: 0 }],
  ['angle 이 비유한수', { x: 0, y: 0, angle: NaN }],
  [`period < ${MIN_PERIOD}s`, { x: 0, y: 0, angle: 0, period: 0.05 }],
  ['period 0', { x: 0, y: 0, angle: 0, period: 0 }],
  ['모르는 재질', { x: 0, y: 0, angle: 0, material: 'adamantium' }],
];
const turretRejected = turretThrows.filter(([, spec]) => {
  try { createTurrets([spec]); return false; } catch { return true; }
});
check('포탑 스펙이 스키마 밖이면 로드 시점에 던진다 (조용히 안 쏘면 물리 버그로 착각한다)',
  turretRejected.length === turretThrows.length,
  `${turretRejected.length}/${turretThrows.length}종 거부`);

// ★ 총구는 데이터가 아니라 **파생값**이어야 한다. 몸체 반경과 갈라지는 순간 탄이 자기 포탑에
//   닿아 태어나자마자 소멸한다. 같은 스펙에서 나온 두 산출물이 같은 radius 를 쓰는지 본다.
const muzzleT = createTurrets([{ x: 10, y: 0, angle: 0, radius: 2 }]).list[0];
const muzzleReach = Math.hypot(muzzleT.muzzle.x - muzzleT.at.x, muzzleT.muzzle.y - muzzleT.at.y);
check('총구는 포탑 몸체 밖이고, 몸체 스펙과 같은 반경에서 파생된다',
  muzzleReach > muzzleT.bodySpec.radius && muzzleT.bodySpec.radius === 2
    && muzzleReach === 2 + TURRET_TUNING.projectileRadius + TURRET_TUNING.muzzleMargin,
  `몸체 r 2 → 총구 ${muzzleReach.toFixed(3)} m`);

// ★★ 누산 드리프트 회귀 — 이 케이스가 프레임률 독립의 **기계 증거**다.
//
//    한쪽은 매 스텝 step() 을 부르고, 다른 쪽은 5스텝마다 한 번만 부른다(같은 now 값으로).
//    내부에서 dt 를 누산하는 구현은 호출을 걸러 내는 순간 결과가 달라진다.
//    값 비교를 `===` 로 해도 되는 이유는 양쪽 다 `phase + n × period` 를 **같은 정수 n** 에서
//    계산하기 때문이다 — 누산이 없으니 비교할 부동소수점 경계 자체가 없다.
const scheduleSpec = [{ x: 0, y: 0, angle: 0, period: 1.5 }, { x: 5, y: 0, angle: 90, period: 0.4, phase: 0.17 }];
const everyStep = createTurrets(scheduleSpec);
const sparse = createTurrets(scheduleSpec);
// ⚠ 포탑별로 갈라서 비교한다. 합쳐 놓고 보면 **방출 순서**가 달라 실패한다 — 5스텝에 한 번
//   부르면 그 사이에 밀린 두 문의 발사가 포탑 번호 순으로 한꺼번에 나오기 때문이다.
//   그건 스케줄이 아니라 배출 타이밍의 차이라 이 케이스가 보증할 대상이 아니다.
const firedDense = [[], []];
const firedSparse = [[], []];
for (let k = 1; k <= 1200; k++) {
  const now = k * FIXED_DT;
  for (const r of everyStep.step(now)) firedDense[r.turret].push(r.firedAt);
  if (k % 5 === 0) for (const r of sparse.step(now)) firedSparse[r.turret].push(r.firedAt);
}
console.log(`  같은 20초를 매 스텝 호출 vs 5스텝마다 호출 — 포탑별 발사 ` +
  `[${firedDense.map((a) => a.length)}] / [${firedSparse.map((a) => a.length)}]`);
check('★ 포탑 발사 시각은 now 의 순수 함수다 (호출을 걸러 내도 같은 열이 나온다 = 프레임률 독립)',
  firedDense.every((seq, t) => seq.length > 0 && seq.length === firedSparse[t].length
    && seq.every((v, i) => v === firedSparse[t][i])),
  `${firedDense.flat().length}발 전부 일치`);

// 충전율은 렌더 전용이지만, 이게 없으면 조준 없는 포탑이 무작위 피해가 된다.
const chargeT = createTurrets([{ x: 0, y: 0, angle: 0, period: 2 }]);
check('충전율이 0 에서 1 로 자라고 발사 직후 되감긴다',
  chargeT.charge(0, 0) === 0 && chargeT.charge(0, 1) === 0.5
    && chargeT.charge(0, 1.999) > 0.99
    && (chargeT.step(2.0), chargeT.charge(0, 2.0) === 0),
  '0 → 0.5 → ~1 → 발사 → 0');

// ── 이제 탄 자체의 성질. 셋 다 "그럴 것이다"가 아니라 실제로 그런지를 잰다.

/** 월드에 살아 있는 포탄 수. Set 이 아니라 **월드**를 세는 것이 요점이다 (누수 케이스 참조). */
function countProjectiles(world) {
  let n = 0;
  for (let b = world.getBodyList(); b; b = b.getNext()) if (b.getUserData()?.projectile) n++;
  return n;
}

/** 포탄 하나를 빈 월드에 쏘고 스텝을 돈다. 표적 없이 탄만 본다. */
function soloShot(overrides = {}, steps = 6, { fields = null } = {}) {
  const world = createWorld();
  const req = {
    x: 0, y: 0, angle: 0, speed: TURRET_TUNING.speed, radius: TURRET_TUNING.projectileRadius,
    mass: TURRET_TUNING.mass, material: 'iron', bornAt: 0, lifetime: TURRET_TUNING.lifetime,
    ...overrides,
  };
  installProjectileContacts(world);
  const shot = spawnProjectile(world, req);
  const engine = fields ? createRuleEngine(RULES, fields) : null;
  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      applyHydroToWorld(world, dt);
      if (fields) applyFieldsToWorld(world, fields, dt);
      engine?.tick(world, dt);
    },
  });
  const track = [];
  for (let i = 0; i < steps; i++) {
    s.advance(FIXED_DT);
    const p = shot.getPosition();
    const v = shot.getLinearVelocity();
    track.push({ x: p.x, y: p.y, vx: v.x, vy: v.y });
  }
  return { world, shot, track };
}

// ★ 관통 회귀는 **A/B 로만** 의미가 있다. 한쪽만 재면 물리가 정한 수를 가드의 공으로 읽는다.
//   벽 위치를 상수로 박지 않고 `speed × FIXED_DT × 1.5` 로 유도하는 이유도 같다 — 탄속을
//   올리는 순간 시험 벽이 샘플 지점 위로 올라가 회귀가 조용히 의미를 잃는다.
//
// ⚠ 표적은 반드시 **동적**이어야 이 A/B 가 성립한다. planck 은 `isBullet() || !isDynamic()` 일
//   때 TOI 를 돌리므로 정적 암초는 bullet 없이도 CCD 가 공짜로 걸린다 (실제로 정적 벽으로
//   재 보니 A/B 가 한 치도 같았다). 그런데 이 게임에서 포탄이 맞히는 것은 **선체 — 동적 강체**다.
//   특히 §7.3.4 다단 분리가 만든 얇은 파편이 정확히 이 위험에 노출된다.
const stepLen = TURRET_TUNING.speed * FIXED_DT;
const wallX = stepLen * 1.5;   // 샘플 x = 0, 0.92, 1.83 … 의 정확히 한가운데
const pierce = ['ccd', 'noccd'].map((mode) => {
  const world = createWorld();
  installProjectileContacts(world);
  const target = world.createBody({ type: 'dynamic', position: new Vec2(wallX, 0) });
  target.createFixture({ shape: new Box(0.05, 5), density: 500, friction: 0.4, restitution: 0 });
  const shot = spawnProjectile(world, {
    x: 0, y: 0, angle: 0, speed: TURRET_TUNING.speed, radius: TURRET_TUNING.projectileRadius,
    mass: TURRET_TUNING.mass, material: 'iron', bornAt: 0, lifetime: 9,
  });
  if (mode === 'noccd') shot.setBullet(false);
  const s = new FixedStepper(world, {});
  for (let i = 0; i < 6; i++) s.advance(FIXED_DT);
  return shot.getPosition().x;
});
console.log(`  두께 0.1 m 동적 표적(x=${wallX.toFixed(3)}) 에 ${TURRET_TUNING.speed} m/s 사격 — ` +
  `CCD 켜면 x ${pierce[0].toFixed(2)} · 끄면 x ${pierce[1].toFixed(2)} (스텝당 ${stepLen.toFixed(3)} m)`);
check('★ 포탄이 얇은 벽을 관통하지 않는다 (CCD A/B — 끄면 실제로 뚫린다)',
  pierce[0] < wallX && pierce[1] > wallX,
  `켬 ${pierce[0].toFixed(2)} < ${wallX.toFixed(2)} < 끔 ${pierce[1].toFixed(2)}`);
check('탄속이 planck 의 스텝당 이동 상한 아래다 (넘으면 클램프돼 탄도가 거짓말이 된다)',
  stepLen < Settings.maxTranslation,
  `${stepLen.toFixed(3)} m < ${Settings.maxTranslation} m`);

// ★ 직선 탄도 — hull userData 가 없다는 사실 하나가 hydro·fields·규칙 세 가드를 동시에
//   통과시키는지를 end-to-end 로 증명한다. 허용 오차가 아니라 **정확히 0** 으로 재는 이유:
//   중력 0 · 힘 0 · damping 0 이면 v += 0 과 v *= 1/(1+0) 이라 부동소수점이 값을 못 바꾼다.
//   즉 힘이 단 한 번이라도 들어가면 즉시 y ≠ 0 이 된다. 오차를 두면 아주 작은 진짜 항력이
//   그 안에 숨고, 항력이 조금이라도 있으면 55 m/s 전제와 E = J²/2μ 가 통째로 어긋난다.
const crossFields = createFields(ZONES.zones.crosswind.fields);
const ballistic = soloShot({}, 300, { fields: crossFields });
const driftFree = ballistic.track.every((t) => t.y === 0 && t.vy === 0);
const speedKept = ballistic.track.at(-1).vx === TURRET_TUNING.speed;
const furnace = soloShot({}, 300, { fields: createFields(ZONES.zones.furnace.fields) });
console.log(`  측풍 존에서 300스텝 — 횡변위 ${ballistic.track.at(-1).y} m · 속도 ` +
  `${ballistic.track.at(-1).vx} m/s (초기 ${TURRET_TUNING.speed})`);
check('★ 포탄은 항력·바람·규칙을 하나도 안 받는다 (hull 이 없어서 — 분기 코드 0줄)',
  driftFree && speedKept && furnace.shot.getUserData().projectile.spent === false,
  '측풍 300스텝 y 정확히 0 · 속도 불변 · 화염 존 생존');

check('포탄 질량이 스펙과 정확히 일치한다 (contact.js 가 이 값을 μ 로 직접 읽는다)',
  Math.abs(soloShot().shot.getMass() - TURRET_TUNING.mass) < 1e-9,
  `${soloShot().shot.getMass().toFixed(6)} kg`);

// 수명은 **스텝 인덱스 창**으로 잰다. 경계 시각을 부동소수점으로 비교하면 미끄러진다
// (10 + 0.2 − 10 = 0.19999999999999929 — 위 쿨다운 케이스와 같은 교훈).
const lifeWorld = createWorld();
installProjectileContacts(lifeWorld);
spawnProjectile(lifeWorld, {
  x: 0, y: 0, angle: 0, speed: TURRET_TUNING.speed, radius: TURRET_TUNING.projectileRadius,
  mass: TURRET_TUNING.mass, material: 'iron', bornAt: 0, lifetime: 2,
});
const lifeStepper = new FixedStepper(lifeWorld, {});
let aliveAt100 = 0;
let aliveAt140 = 0;
for (let k = 1; k <= 140; k++) {
  lifeStepper.advance(FIXED_DT);
  cullProjectiles(lifeWorld, k * FIXED_DT);
  if (k === 100) aliveAt100 = countProjectiles(lifeWorld);
  if (k === 140) aliveAt140 = countProjectiles(lifeWorld);
}
check('수명이 다한 포탄이 사라진다 (수명 2s — 100스텝 생존 · 140스텝 소멸)',
  aliveAt100 === 1 && aliveAt140 === 0,
  `100스텝 ${aliveAt100}발 → 140스텝 ${aliveAt140}발`);

// ★ 누수는 **월드를 직접 순회해** 센다. 잡으려는 버그가 정확히 "Set 과 월드가 어긋난다"라서,
//   Set 만 세면 그 버그가 자기 자신을 통과시킨다. 동시에 cullProjectiles 의 반환 계약
//   (하니스가 이걸로 Set 을 동기화한다)이 실제로 지켜지는지도 여기서 걸린다.
const leakWorld = createWorld();
installProjectileContacts(leakWorld);
const leakTurrets = createTurrets([{ x: 0, y: 0, angle: 0 }, { x: 0, y: 40, angle: -90, period: 0.5 }]);
const leakSet = new Set();
let leakPeak = 0;
let leakSim = 0;
const leakStepper = new FixedStepper(leakWorld, {
  onPreStep: () => {
    for (const req of leakTurrets.step(leakSim)) {
      const b = spawnProjectile(leakWorld, req);
      if (b) leakSet.add(b);
    }
  },
});
for (let k = 1; k <= 3600; k++) {
  leakSim = k * FIXED_DT;
  leakStepper.advance(FIXED_DT);
  for (const b of cullProjectiles(leakWorld, leakSim)) leakSet.delete(b);
  leakPeak = Math.max(leakPeak, countProjectiles(leakWorld));
}
console.log(`  포탑 2문 · 60초 (${leakTurrets.fired}발 발사) — 동시 생존 최대 ${leakPeak}발 · ` +
  `종료 시 월드 ${countProjectiles(leakWorld)} / Set ${leakSet.size}`);
check('포탄이 누수되지 않고 월드와 Set 이 어긋나지 않는다',
  leakTurrets.fired > 100 && leakPeak <= PROJECTILE_TUNING.maxAlive
    && countProjectiles(leakWorld) === leakSet.size,
  `최대 ${leakPeak}발 ≤ ${PROJECTILE_TUNING.maxAlive} · 월드 = Set`);

// ── 포탑 × 선체. `ram()` 과 **같은 소비 루프**를 쓴다 — 암초든 포탄이든 큐 소비자는 출처를
//    모르는 것이 §2·§3 이 한 경로로 합쳐진다는 설계의 요점이라, 벤치도 그 사실을 재사용한다.

/** 포탑 하나가 배를 쏜다. 총구–선체 표면 거리가 `gap` 이 되도록 포탑을 놓는다. */
function bombard({
  key = 'sloop', material = 'wood', gap = 15, ahead = 0,
  shipV = null, seconds = 6, reef = false, period = TURRET_TUNING.period,
} = {}) {
  const { world, body } = spawn(key, { devices: true, material });
  const p0 = body.getUserData().hull.params;
  const area0 = p0.area;
  // 총구 오프셋을 빼서 놓아야 `gap` 이 실제 **비행 거리**가 된다. 포탑 중심으로 재면
  // 무장 지연 케이스가 재려는 값(= 비행 시간)이 오프셋만큼 어긋난다.
  const reach = TURRET_TUNING.radius + TURRET_TUNING.projectileRadius + TURRET_TUNING.muzzleMargin;
  const turretY = p0.beam / 2 + reach + gap;
  const turrets = createTurrets([{ x: ahead, y: turretY, angle: -90, period }]);
  createObstacle(world, turrets.list[0].bodySpec);
  if (reef) {
    createObstacle(world, {
      shape: 'circle', x: ahead, y: p0.beam / 2 + gap * 0.5, radius: 2.5, material: 'rock',
    });
  }

  installProjectileContacts(world);
  let elapsed = 0;
  const queue = installImpactListener(world, { now: () => elapsed });
  const fleet = new Set([body]);
  const hits = [];
  let spent = 0;

  const s = new FixedStepper(world, {
    onPreStep: (dt) => {
      for (const req of turrets.step(elapsed)) spawnProjectile(world, req);
      applyHydroToWorld(world, dt);
    },
  });

  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    if (shipV) for (const b of fleet) b.setLinearVelocity(new Vec2(shipV.x, shipV.y));
    s.advance(FIXED_DT);
    elapsed += FIXED_DT;
    // ── 스텝 밖 ── 여기서만 강체가 나고 죽는다.
    for (const im of queue.drain()) {
      if (!fleet.has(im.body)) continue;                 // 이미 파괴된 강체 (댕글링)
      // 맞은 자리가 선체 무게중심의 어느 쪽인가. **차감하기 전에** 재야 한다 —
      // applyImpact 가 강체를 갈아치우면 그 중심이 사라진다.
      const side = im.at.y - im.body.getWorldCenter().y;
      const out = applyImpact(world, im.body, im.at, im.radius);
      if (!out) continue;
      hits.push({ radius: im.radius, energy: im.energy, source: im.source, side });
      fleet.delete(im.body);
      for (const nb of out.bodies) fleet.add(nb);
    }
    // 포탄 소멸은 큐 소비 **뒤**다 — Impact 가 포탄 강체 참조를 들고 있어 먼저 부수면 댕글링.
    for (const dead of cullProjectiles(world, elapsed)) {
      if (dead.getUserData().projectile.spent) spent++;
    }
  }

  const alive = [...fleet];
  const areaNow = alive.reduce((t, b) => t + b.getUserData().hull.params.area, 0);
  return {
    hits, spent, fired: turrets.fired, bodies: alive.length,
    removed: 1 - areaNow / area0,
    split: alive.length > 1,
  };
}

const shelled = bombard();
console.log(`  정지한 배에 6초 사격 — ${shelled.fired}발 중 ${shelled.hits.length}발 명중 · ` +
  `면적 −${(shelled.removed * 100).toFixed(1)}% · 최대 반경 ` +
  `${Math.max(0, ...shelled.hits.map((h) => h.radius)).toFixed(2)} m`);
// 판정에 해석 반경(0.502)을 박지 않는다. 솔버가 실제로 내는 임펄스는 해석값과 다르고
// (TOI 와 이산 아일랜드로 나뉠 수 있다) `pending` 은 합이 아니라 최대를 남기므로,
// 절대값으로 박으면 planck 마이너 업그레이드에 조용히 깨진다. source 를 같이 보는 이유는
// 태그가 틀리면 S5 디브리프 배지가 원인을 오분류하는데 면적만 보면 통과해 버리기 때문이다.
check('★ 포탑 탄이 배를 깎는다 (피탄 → 파손은 암초 충돌과 완전히 같은 경로다 — 새 코드 0줄)',
  shelled.removed > 0.01 && shelled.hits.length > 0
    && shelled.hits.every((h) => h.source === 'shot'),
  `${shelled.hits.length}발 명중 · −${(shelled.removed * 100).toFixed(1)}%`);

// ★★ 이음매 회귀. 선체는 볼록 조각 여럿으로 분해돼 있어서 포탄이 조각 경계에 떨어지면 planck 이
//    한 번의 충돌을 post-solve **두 번**으로 나눠 준다. 실측(수정 전): 깨끗한 명중은
//    J=689(19.8 kJ) 하나였는데 이음매 명중은 6.6 kJ + 4.3 kJ 로 갈라져 **둘 다 나무 임계
//    8 kJ 아래**라 아무 일도 안 일어났다 — 3발 중 2발이 그냥 통과했다.
//    플레이어에겐 "포탄이 가끔 안 박힌다"로 보이고 그 '가끔'의 정체가 눈에 안 보이는 분해
//    이음매라 학습이 불가능하다. contact.js 가 한 스텝의 같은 (선체, 상대) 쌍을 합치는 이유다.
//
//    판정을 **에너지**로 하는 이유: 명중 횟수만 보면 갈라진 임펄스가 우연히 둘 다 임계를
//    넘는 배치에서 통과해 버린다. 포구 에너지의 70% 를 밑돌면 갈라진 것이다.
const muzzleEnergy = 0.5 * TURRET_TUNING.mass * TURRET_TUNING.speed ** 2;
console.log(`  명중 에너지 [${shelled.hits.map((h) => (h.energy / 1000).toFixed(1)).join(', ')}] kJ ` +
  `(포구 ${(muzzleEnergy / 1000).toFixed(1)} kJ)`);
check('★ 한 발의 충격이 볼록 분해 이음매에서 갈라지지 않는다 (갈라지면 임계를 못 넘어 무해해진다)',
  shelled.hits.length === shelled.fired
    && shelled.hits.every((h) => h.energy > muzzleEnergy * 0.7),
  `${shelled.fired}발 전부 명중 · 최소 ${(Math.min(...shelled.hits.map((h) => h.energy)) / 1000).toFixed(1)} kJ`);

const passing = bombard({ ahead: 25, shipV: { x: 4, y: 0 }, seconds: 12 });
check('★ 지나가는 배는 포탑이 있는 쪽 옆구리를 깎인다 (부호를 반대로 쓰면 반대편이 깎인다)',
  passing.hits.length > 0 && passing.hits.every((h) => h.side > 0),
  `${passing.hits.length}발 전부 +Y(포탑 쪽) · 최대 ${Math.max(...passing.hits.map((h) => h.side)).toFixed(2)} m`);

// ★ 무장 지연은 시간이 아니라 **거리 게이트**로 체감된다. 거리를 상수로 박으면 armDelay 나
//   탄속을 돌릴 때 두 지점이 같은 쪽으로 넘어가 회귀가 조용히 의미를 잃는다.
const armGap = CONTACT_TUNING.armDelay * TURRET_TUNING.speed;
const pointBlank = bombard({ gap: armGap * 0.5 });
const standoff = bombard({ gap: armGap * 3 });
console.log(`  무장 거리 ${armGap.toFixed(1)} m — 근접(${(armGap * 0.5).toFixed(1)} m) 명중 ` +
  `${pointBlank.hits.length}회·소진 ${pointBlank.spent}발 / 원거리(${(armGap * 3).toFixed(1)} m) 명중 ` +
  `${standoff.hits.length}회·소진 ${standoff.spent}발`);
// `hits === 0` 만 보면 "포탑이 안 쐈다"와 "무장 전이라 무해했다"가 구분되지 않는다.
// 후자여야 가드를 검증한 것이므로 `spent ≥ 1` 절이 반드시 붙는다.
check('★ 무장 지연 안쪽에서는 탄이 배를 못 깎는다 (맞기는 맞는다 — 근접은 사각지대다)',
  pointBlank.hits.length === 0 && pointBlank.spent >= 1 && standoff.hits.length >= 1,
  `근접 0회(소진 ${pointBlank.spent}발) vs 원거리 ${standoff.hits.length}회`);

// ★ 엄폐도 A/B 로만 의미가 있다. 그리고 여기서도 `spent ≥ 1` 이 "안 맞았다"와 "안 쐈다"를 가른다.
const covered = bombard({ reef: true });
console.log(`  총구와 항로 사이에 암초 — 명중 ${covered.hits.length}회 · 암초에서 소진 ${covered.spent}발 ` +
  `(엄폐 없을 때 ${shelled.hits.length}회)`);
check('★ 암초 뒤에 숨으면 안 맞는다 — 엄폐가 규칙이 아니라 기하에서 나온다 (코드 0줄)',
  covered.hits.length === 0 && covered.spent >= 1 && shelled.hits.length >= 1,
  `엄폐 0회(소진 ${covered.spent}발) vs 노출 ${shelled.hits.length}회`);

// ★ 같은 탄, 재질만 교체. **배율로 재는 이유**: shot 분기라 μ 가 두 실행에서 똑같이 포탄
//   질량(12 kg)이다 — 선체 밀도가 3배 달라도. 그래서 솔버가 낸 미지의 실제 임펄스가 상쇄되고
//   남는 것은 impactThreshold/toughness 차이뿐이다. 위 `source:'reef'` 케이스(reducedMass
//   분기)와 짝을 이룬다 — 같은 결론이 두 코드 경로에서 따로 성립한다.
const ironShelled = bombard({ material: 'iron' });
console.log(`  같은 탄 — 나무 −${(shelled.removed * 100).toFixed(1)}% vs 철 ` +
  `−${(ironShelled.removed * 100).toFixed(2)}% (철 최대 반경 ` +
  `${Math.max(0, ...ironShelled.hits.map((h) => h.radius)).toFixed(2)} m)`);
check('★ 철 선체는 포탄에 함몰만 한다 (§7.4 — 대포알에 함몰만, 관통 어려움)',
  ironShelled.hits.length > 0 && ironShelled.removed > 0
    && ironShelled.removed < shelled.removed / 4 && !ironShelled.split,
  `나무 −${(shelled.removed * 100).toFixed(1)}% vs 철 −${(ironShelled.removed * 100).toFixed(2)}%`);

// ── ★ 입사각 감쇠는 **재질이 정한다** (`MATERIALS[m].deflection`) ─────────────────
//
// 접촉의 법선 임펄스는 그 자체로 `E_총 × cos²(입사각)` 이라, 노브가 없으면 **모든 재질이
// 경사 장갑을 공짜로 얻는다** — 나무배도 45°로 맞으면 절반을 튕겨 낸다. 그건 틀렸다.
// 경사 장갑은 매끄럽고 질긴 강판의 성질이고, 나무는 빗맞아도 섬유가 쪼개지며 뚫린다.
//
// 입사각을 **정확히** 통제하려고 직사각형 선체를 쓴다. 코퍼스는 RDP 로 단순화된 다각형이라
// 국소 법선이 매끄럽지 않아, 오프셋을 훑는 방식으로는 각도와 꼭짓점 효과가 섞인다.
const PLATE = [{ x: -4, y: -2 }, { x: 4, y: -2 }, { x: 4, y: 2 }, { x: -4, y: 2 }];

/** 판때기를 thetaDeg 만큼 돌려 놓고 +X 로 한 발 쏜다. θ=45° 면 입사각도 정확히 45°. */
function obliqueShot(material, thetaDeg) {
  const world = createWorld();
  const body = createHullBody(world, { outline: PLATE, holes: [], items: [] },
    { position: { x: 0, y: 0 }, angle: thetaDeg * Math.PI / 180, material, extraMass: 0 });
  const area0 = body.getUserData().hull.params.area;
  installProjectileContacts(world);
  let elapsed = 0;
  const queue = installImpactListener(world, { now: () => elapsed });
  spawnProjectile(world, {
    x: -25, y: 0, angle: 0, speed: TURRET_TUNING.speed,
    radius: TURRET_TUNING.projectileRadius, mass: TURRET_TUNING.mass,
    material: 'iron', bornAt: 0, lifetime: 4,
  });
  const s = new FixedStepper(world, {});
  for (let i = 0; i < 120; i++) {
    s.advance(FIXED_DT);
    elapsed += FIXED_DT;
    for (const im of queue.drain()) {
      const out = applyImpact(world, im.body, im.at, im.radius);
      return { radius: im.radius, removed: out ? out.result.removedArea / area0 : 0 };
    }
  }
  return { radius: 0, removed: 0 };   // 튕겨 나갔다 (임계·최소 반경 미달)
}

const plate = {
  woodHead: obliqueShot('wood', 0), woodTilt: obliqueShot('wood', 45),
  ironHead: obliqueShot('iron', 0), ironTilt: obliqueShot('iron', 45),
};
console.log(`  8×4 판때기에 한 발 — 나무 정타 ${plate.woodHead.radius.toFixed(3)} m / 45° ` +
  `${plate.woodTilt.radius.toFixed(3)} m · 철 정타 ${plate.ironHead.radius.toFixed(3)} m / 45° ` +
  `${plate.ironTilt.radius.toFixed(3)} m`);

// A/B 의 짝. 둘을 **같이** 봐야 "각도가 무의미해졌다"와 "각도가 전부다"를 구분한다.
check('★ 나무는 빗맞아도 뚫린다 (각도로 도망칠 수 없는 것이 나무의 약점이다)',
  plate.woodTilt.radius > 0 && plate.woodTilt.radius > plate.woodHead.radius * 0.6,
  `45° 반경 ${plate.woodTilt.radius.toFixed(3)} m = 정타의 ` +
  `${(plate.woodTilt.radius / plate.woodHead.radius * 100).toFixed(0)}%`);

check('★ 철은 빗맞으면 미끄러진다 — 경사 장갑 (비스듬히 몰면 조선이 곧 방어다)',
  plate.ironHead.radius > 0 && plate.ironTilt.radius === 0,
  `정타 ${plate.ironHead.radius.toFixed(3)} m → 45° 무해`);

// ★ 튕긴 사실이 **보고돼야** 한다. 조용히 사라지면 플레이어에게 그 화면은 "이음매에서
//   갈라져 무해해지던 버그"와 구분되지 않는다 — 둘 다 "맞았는데 아무 일도 안 남"이다.
//   경사 장갑이 배울 수 있는 규칙이 되려면 튕겼다는 사실 자체가 관측 가능해야 한다.
function glancesOf(material, thetaDeg) {
  const world = createWorld();
  createHullBody(world, { outline: PLATE, holes: [], items: [] },
    { position: { x: 0, y: 0 }, angle: thetaDeg * Math.PI / 180, material, extraMass: 0 });
  installProjectileContacts(world);
  let elapsed = 0;
  const queue = installImpactListener(world, { now: () => elapsed });
  spawnProjectile(world, {
    x: -25, y: 0, angle: 0, speed: TURRET_TUNING.speed,
    radius: TURRET_TUNING.projectileRadius, mass: TURRET_TUNING.mass,
    material: 'iron', bornAt: 0, lifetime: 4,
  });
  const s = new FixedStepper(world, {});
  const out = [];
  let carves = 0;
  for (let i = 0; i < 120; i++) {
    s.advance(FIXED_DT); elapsed += FIXED_DT;
    carves += queue.drain().length;
    out.push(...queue.drainGlances());
  }
  return { glances: out, carves };
}

const ricochet = glancesOf('iron', 45);
const punched = glancesOf('wood', 45);
const g0 = ricochet.glances[0];
console.log(`  철 45° — 튕김 보고 ${ricochet.glances.length}건` +
  `${g0 ? ` (입사 ${(g0.incidence * 180 / Math.PI).toFixed(0)}° · ${(g0.energy / 1000).toFixed(1)} kJ · ${g0.reason})` : ''}` +
  ` · 나무 45° — 튕김 ${punched.glances.length}건 / 차감 ${punched.carves}회`);
check('★ 튕긴 탄이 조용히 사라지지 않는다 (안 그러면 파손 버그와 구분되지 않는다)',
  ricochet.glances.length === 1 && ricochet.carves === 0
    && g0.reason === 'deflected' && g0.incidence > 0.5 && g0.material.key === 'iron',
  `1건 · 입사 ${(g0.incidence * 180 / Math.PI).toFixed(0)}° · ${(g0.energy / 1000).toFixed(1)} kJ`);

// 짝. 뚫린 탄까지 튕김으로 보고하면 상태줄이 거짓말을 한다.
check('뚫은 탄은 튕김으로 보고되지 않는다 (나무는 같은 45°에서 뚫린다)',
  punched.glances.length === 0 && punched.carves === 1,
  `나무 튕김 0건 · 차감 ${punched.carves}회`);

// ★ 나무는 **어느 각도에서도** 튕기지 않는다. 실효 에너지의 바닥이 `(1−deflection) × E_총`
//   = 11.8 kJ 이라 임계 8 kJ 아래로 내려갈 수가 없다. 각도 몇 개를 찍어 보는 대신 바닥을
//   직접 잰다 — 각도를 훑으면 판때기 기하에 따라 어느 면을 맞는지가 섞여 무엇을 보증하는지
//   알 수 없게 된다 (실제로 그렇게 재다 한 번 잘못 읽었다).
const woodFloor = carveRadiusFromImpact({
  impulse: 0,                                    // 법선분 0 = 입사각 90°(스치기)의 극한
  effectiveMass: TURRET_TUNING.mass, material: MATERIALS.wood, hullArea: 32,
  strikeEnergy: 0.5 * TURRET_TUNING.mass * TURRET_TUNING.speed ** 2,
});
check('★ 나무는 어떤 입사각에서도 튕기지 않는다 (스치기 극한에서도 뚫린다)',
  woodFloor >= DAMAGE_TUNING.minCarveRadius,
  `입사 90° 극한 반경 ${woodFloor.toFixed(3)} m ≥ ${DAMAGE_TUNING.minCarveRadius}`);

// ★ 쿨다운은 **지속 접촉**의 백스톱이지 발사 속도 제한이 아니다.
//   포탄까지 막으면 연사가 조용히 먹혀 "탄이 가끔 안 박힌다"가 된다 — 방금 고친 이음매
//   버그와 플레이어에게 구분되지 않는 증상이다. 쿨다운 창(0.2s)보다 촘촘히 때려 본다.
function rapidFire() {
  const world = createWorld();
  const body = createHullBody(world, { outline: PLATE, holes: [], items: [] },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood', extraMass: 0 });
  installProjectileContacts(world);
  let elapsed = 0;
  const queue = installImpactListener(world, { now: () => elapsed });
  const fleet = new Set([body]);
  const at = [];
  const s = new FixedStepper(world, {});
  const flight = 25 / TURRET_TUNING.speed;
  // 쿨다운의 절반 간격으로 두 발. 도착 간격도 그대로 0.1s 다 (탄속이 같으므로).
  const fireAt = [0, CONTACT_TUNING.cooldown * 0.5];
  let fired = 0;
  for (let i = 0; i < 120; i++) {
    while (fired < fireAt.length && elapsed >= fireAt[fired]) {
      spawnProjectile(world, {
        x: -25, y: 0, angle: 0, speed: TURRET_TUNING.speed,
        radius: TURRET_TUNING.projectileRadius, mass: TURRET_TUNING.mass,
        material: 'iron', bornAt: elapsed, lifetime: 4,
      });
      fired++;
    }
    s.advance(FIXED_DT);
    elapsed += FIXED_DT;
    for (const im of queue.drain()) {
      if (!fleet.has(im.body)) continue;
      const out = applyImpact(world, im.body, im.at, im.radius);
      at.push(+elapsed.toFixed(3));
      if (!out) continue;
      fleet.delete(im.body);
      for (const nb of out.bodies) fleet.add(nb);
    }
    cullProjectiles(world, elapsed);
  }
  return { at, gap: at.length > 1 ? at[1] - at[0] : Infinity, flight };
}
const rapid = rapidFire();
console.log(`  쿨다운 창(${CONTACT_TUNING.cooldown}s) 안에 두 발 — 차감 ${rapid.at.length}회 · ` +
  `간격 ${rapid.gap.toFixed(3)}s`);
check('★ 쿨다운이 연사를 먹지 않는다 (지속 접촉의 백스톱이지 발사 속도 제한이 아니다)',
  rapid.at.length === 2 && rapid.gap < CONTACT_TUNING.cooldown,
  `${rapid.at.length}발 전부 차감 · 간격 ${rapid.gap.toFixed(3)}s < ${CONTACT_TUNING.cooldown}s`);

check('감쇠 노브의 방향이 뒤집히지 않는다 (나무 < 철)',
  MATERIALS.wood.deflection < MATERIALS.iron.deflection && MATERIALS.iron.deflection === 1,
  `나무 ${MATERIALS.wood.deflection} < 철 ${MATERIALS.iron.deflection}`);

// ★ 감쇠 노브가 **정타를 건드리면 안 된다.** 건드리면 D3 ② 의 암초 밸런스와 위 명중 수치가
//   통째로 흔들린다. 정타에서는 법선분이 곧 총 에너지라 되돌려 줄 접선분이 0 이다.
const headOnUnaffected = carveRadiusFromImpact({
  impulse: 690, effectiveMass: TURRET_TUNING.mass, material: MATERIALS.wood, hullArea: 32,
}) === carveRadiusFromImpact({
  impulse: 690, effectiveMass: TURRET_TUNING.mass, material: MATERIALS.wood, hullArea: 32,
  strikeEnergy: 0.5 * TURRET_TUNING.mass * TURRET_TUNING.speed ** 2,
});
check('입사각 감쇠는 정타를 건드리지 않는다 (기존 암초·정타 밸런스가 그대로여야 한다)',
  headOnUnaffected, '법선분 ≥ 총 에너지면 되돌려 줄 접선분이 0');

// ★★ 핸드오프가 요구한 「포탑은 자기 탄에 안 맞는다」는 **동어반복이라 쓰지 않는다.**
//    포탑 몸체는 createObstacle 산물이라 hull userData 가 없고 contact.js 가 무조건 먼저
//    빠지므로, 그 시험은 **총구 오프셋이 0 이어도 통과한다.** 실제 위험은 정반대 방향이다:
//    "어떤 접촉에서든 spent" 규칙은 무장 여부를 안 보므로, 오프셋이 모자라면 탄이 자기
//    포탑을 스치며 그 자리에서 죽는다 — 포탑이 자기를 안 깎는 대신 **아무것도 안 쏜다.**
const escape = (() => {
  const world = createWorld();
  installProjectileContacts(world);
  const turrets = createTurrets([{ x: 0, y: 0, angle: 0 }]);
  createObstacle(world, turrets.list[0].bodySpec);
  let now = 0;
  let shot = null;
  const s = new FixedStepper(world, {
    onPreStep: () => { for (const r of turrets.step(now)) shot = spawnProjectile(world, r); },
  });
  while (!shot) { now += FIXED_DT; s.advance(FIXED_DT); }
  const bornX = shot.getPosition().x;
  for (let i = 0; i < 20; i++) { now += FIXED_DT; s.advance(FIXED_DT); }
  return { spent: shot.getUserData().projectile.spent, flew: shot.getPosition().x - bornX };
})();
check('★ 탄이 자기 총구를 살아서 벗어난다 (오프셋이 모자라면 포탑이 아무것도 못 쏜다)',
  escape.spent === false && escape.flew > armGap,
  `20스텝에 ${escape.flew.toFixed(1)} m 비행 · 소진 안 됨`);

// ★★ 프레임률 독립 — S3 에서 가장 값비싼 회귀.
//
//    핸드오프의 스텝 순서는 `turrets.step()` 을 스텝 **밖**에 뒀다. 그대로 하면 발사 주기가
//    모니터 주사율에 종속된다 — D0 이 추력·저항에서 이미 밟은 함정과 같은 종류다.
//    시계를 스텝 안(`onPreStep`)에 두고 `simTime = stepIndex × FIXED_DT` 로 굴려야 한다.
//
//    ⚠ 종료 조건을 `advance` **호출 횟수가 아니라 물리 스텝 수**(1200)로 고정한다. 그래야
//      세 변형이 정확히 같은 연산 열을 같은 순서로 돌아 좌표를 허용 오차 없이 비교할 수 있다.
//      오차를 두면 스텝 밖 시계 버그가 그 오차 안에 숨는다.
function turretRun(feed) {
  const world = createWorld();
  installProjectileContacts(world);
  const turrets = createTurrets([{ x: 0, y: 0, angle: 0, period: 0.4 }]);
  let stepN = 0;
  let last = null;
  const s = new FixedStepper(world, {
    onPreStep: () => {
      stepN += 1;
      for (const req of turrets.step(stepN * FIXED_DT)) last = spawnProjectile(world, req);
    },
  });
  // 1200 **스텝**을 채울 때까지 먹인다. 호출 횟수는 변형마다 다르다 — 그게 요점이다.
  for (let call = 0; stepN < 1200; call++) s.advance(feed(call));
  return { fired: turrets.fired, x: last.getPosition().x, y: last.getPosition().y, stepN };
}

const steady = turretRun(() => FIXED_DT);
const doubled = turretRun(() => 2 * FIXED_DT);
// ★ 히치 섞기가 없으면 이 케이스는 판별력이 없다. `advance(0.5)` 는 world.js 가 0.25 로
//   클램프하고 남은 시간을 **버리므로**(steps === MAX 이면 accumulator = 0), 한 호출에
//   렌더 시간 0.5s 대 시뮬 시간 0.083s — 6배로 갈라진다.
//   버그판(스텝 밖에서 렌더 elapsed 로 굴리는 판)을 일부러 만들어 재 봤다:
//     균일 50발 vs 50발 · 2배속 50발 vs 50발 · **히치 50발 vs 258발**
//   즉 앞의 두 변형만으로는 버그판이 그대로 통과한다. 판별력은 전부 히치에서 나온다.
const hitchy = turretRun((call) => (call % 2 === 0 ? 0.5 : FIXED_DT));
console.log(`  1200스텝을 세 가지로 구동 — 균일 ${steady.fired}발 · 2배속 ${doubled.fired}발 · ` +
  `히치 ${hitchy.fired}발 (히치는 ${hitchy.stepN}스텝)`);
check('★ 포탑 발사가 렌더 프레임률에 종속되지 않는다 (히치를 섞어도 스텝 수가 같으면 같다)',
  steady.fired === doubled.fired && steady.fired === hitchy.fired
    && steady.x === doubled.x && steady.x === hitchy.x
    && steady.y === doubled.y && steady.y === hitchy.y,
  `${steady.fired}발 · 마지막 탄 좌표 비트 일치`);

// ─────────────────────────────────────────────── D3 ④ 주인공 · 도착 판정
//
// D3 통과 질문 (b): "3맵 전부 클리어 가능한가." 그 판정의 **주체**를 여기서 못 박는다.
//
// 도착하는 것은 배가 아니라 주인공이다. 선체 폴리곤이 골에 겹치는지로 재면 두 가지가 새는데,
// 둘 다 §7 이 배를 쪼갤 수 있게 만든 순간 실제로 일어난다:
//  ① 뱃머리만 밀어 넣고 클리어 — 길쭉한 배가 §2.1 의 대가는 다 치르고 라인만 먼저 받는다.
//  ② 잘려 나간 파편이 표류해 들어가면 클리어 — 주인공은 반대편 조각에서 가라앉는 중인데도.
// 아래 네 케이스가 각각을 재고, 절단 시 주인공이 **자기가 서 있던 조각**을 타는지도 본다.
console.log('\n\x1b[36m▌D3 ④ — 주인공 (도착 판정의 주체 · §7.5 소속 폴리곤)\x1b[0m\n');

/** 선체 로컬 outline 을 월드로 옮긴 정점들 (골 겹침을 재기 위한 것). */
const worldOutline = (body) => {
  const hull = body.getUserData().hull;
  const p = body.getPosition();
  return translate(rotate(hull.outline, body.getAngle()), p.x, p.y);
};

// ① 뱃머리만 들어가도 클리어가 아니다 — 이 벤치의 핵심 케이스.
const arrival = (() => {
  const goal = createGoal({ x: 0, y: 0, radius: 5 });
  const world = createWorld();
  const outline = hulls.sloop.outline;
  // 주인공은 무게중심에 세운다. 뱃머리는 여기서 +5 m 앞이라 배가 골을 먼저 만난다.
  const body = createHullBody(world, { outline, holes: [], items: [], crew: { x: 0, y: 0 } },
    { position: { x: 8, y: 0 }, angle: 0, material: 'wood' });

  const overlapAt = (x) => {
    body.setPosition(new Vec2(x, 0));
    const verts = worldOutline(body).filter((v) => Math.hypot(v.x - goal.x, v.y - goal.y) <= goal.radius);
    const at = crewWorldPoint(body);
    return { verts: verts.length, dist: goalDistance(goal, at), reached: goalReached(goal, at) };
  };
  return { near: overlapAt(8), deep: overlapAt(4.5), length: hulls.sloop.diagnostics.area };
})();
console.log(`  골(r=5)에 뱃머리만 걸친 배 — 골 안 정점 ${arrival.near.verts}개 · ` +
  `주인공 ${arrival.near.dist.toFixed(2)} m · 클리어 ${arrival.near.reached ? 'O' : 'X'}`);
console.log(`  같은 배를 더 밀어 넣으면 — 골 안 정점 ${arrival.deep.verts}개 · ` +
  `주인공 ${arrival.deep.dist.toFixed(2)} m · 클리어 ${arrival.deep.reached ? 'O' : 'X'}`);
check('★ 뱃머리가 도착 지점에 들어가도 클리어가 아니다 (배가 아니라 주인공이 도착한다)',
  arrival.near.verts > 0 && !arrival.near.reached,
  `선체는 정점 ${arrival.near.verts}개가 골 안 · 주인공은 ${arrival.near.dist.toFixed(2)} m 밖`);
check('주인공이 실제로 들어오면 클리어된다 (판정이 그냥 빡빡한 게 아니다)',
  arrival.deep.reached, `주인공 ${arrival.deep.dist.toFixed(2)} m ≤ 반경 5 m`);

// ② 절단 — 주인공은 자기가 서 있던 조각을 타고 간다 (§7.5 아이템과 같은 판정).
const crewSplit = (() => {
  const world = createWorld();
  const outline = hulls.barbell.outline;
  const b = bounds(outline);
  // 왼쪽 로브 위에 세우고 목(원점)을 때린다.
  const crew = { x: b.minX + b.width * 0.15, y: 0 };
  const body = createHullBody(world, { outline, holes: [], items: [], crew },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  const before = crewWorldPoint(body);
  const out = applyImpact(world, body, { x: 0, y: 0 }, 0.9);
  // ★ 주인공을 태우지 않은 조각을 **일부러 맨 앞에** 놓는다. `bodies[0]` 을 플레이어의
  //   배로 삼는 구현이면 여기서 걸린다 (절단 뒤 카메라가 빈 잔해를 따라가는 버그).
  const carrier = out.bodies.find((bd) => bd.getUserData().hull.crew);
  const bodiesOut = out.bodies.filter((bd) => bd !== carrier).concat(carrier);
  const rider = findCrewBody(bodiesOut);
  const after = crewWorldPoint(rider);
  return {
    pieces: out.bodies.length,
    carrying: out.bodies.filter((bd) => bd.getUserData().hull.crew).length,
    lost: out.result.crewLost,
    orderProof: bodiesOut[0] !== rider && rider === carrier,
    drift: before && after ? Math.hypot(after.x - before.x, after.y - before.y) : Infinity,
  };
})();
console.log(`  아령 목 타격 — 조각 ${crewSplit.pieces}개 중 주인공을 태운 조각 ` +
  `${crewSplit.carrying}개 · 월드 좌표 이동 ${(crewSplit.drift * 1000).toFixed(4)} mm`);
check('★ 절단되면 주인공은 자기가 서 있던 조각 하나에만 실린다 (§7.5 아이템과 같은 판정)',
  crewSplit.pieces === 2 && crewSplit.carrying === 1 && !crewSplit.lost,
  `조각 ${crewSplit.pieces} · 태운 조각 ${crewSplit.carrying} · 물에 빠짐 ${crewSplit.lost}`);
check('그 조각의 무게중심이 새로 잡혀도 주인공의 월드 위치는 그대로다 (좌표 변환 회귀)',
  crewSplit.drift < 1e-9, `이동 ${(crewSplit.drift * 1000).toFixed(6)} mm`);
check('주인공 조회가 조각 순서에 의존하지 않는다 (bodies[0] 을 보면 여기서 걸린다)',
  crewSplit.orderProof, '빈 조각을 맨 앞에 놓아도 태운 조각을 찾는다');

// ③ 발밑이 잘리면 물에 빠진다 — 아이템의 "탈락"과 같은 판정, 다른 결과.
const crewLost = (() => {
  const world = createWorld();
  const outline = hulls.barbell.outline;
  const body = createHullBody(world, { outline, holes: [], items: [], crew: { x: 0, y: 0 } },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  const out = applyImpact(world, body, { x: 0, y: 0 }, 0.9);
  return {
    lost: out.result.crewLost,
    carrying: out.bodies.filter((bd) => bd.getUserData().hull.crew).length,
    alive: out.bodies.length,
  };
})();
console.log(`  주인공을 목 위에 세우고 같은 자리를 타격 — 남은 조각 ${crewLost.alive}개 · ` +
  `태운 조각 ${crewLost.carrying}개`);
check('★ 발밑이 잘려 나가면 주인공을 잃는다 (조각이 남아 있어도 항해는 끝난다)',
  crewLost.lost && crewLost.carrying === 0 && crewLost.alive === 2,
  `물에 빠짐 · 남은 조각 ${crewLost.alive}개는 주인공 없음`);

// ④ 주인공 없는 파편이 골에 표류해 들어가도 클리어가 아니다.
const driftClear = (() => {
  const goal = createGoal({ x: 0, y: 0, radius: 5 });
  const world = createWorld();
  const outline = hulls.barbell.outline;
  const b = bounds(outline);
  const body = createHullBody(world, { outline, holes: [], items: [], crew: { x: b.minX + b.width * 0.15, y: 0 } },
    { position: { x: 0, y: 0 }, angle: 0, material: 'wood' });
  const out = applyImpact(world, body, { x: 0, y: 0 }, 0.9);

  const rider = findCrewBody(out.bodies);
  const orphan = out.bodies.find((bd) => bd !== rider);
  orphan.setPosition(new Vec2(goal.x, goal.y));   // 파편만 골 한복판으로 표류시킨다
  rider.setPosition(new Vec2(60, 0));             // 주인공은 멀리 떨어뜨려 둔다
  const at = crewWorldPoint(findCrewBody(out.bodies));
  return {
    orphanDist: Math.hypot(orphan.getPosition().x - goal.x, orphan.getPosition().y - goal.y),
    crewDist: goalDistance(goal, at),
    reached: goalReached(goal, at),
  };
})();
console.log(`  잘려 나간 파편만 골 한복판(${driftClear.orphanDist.toFixed(2)} m)에 · ` +
  `주인공은 ${driftClear.crewDist.toFixed(0)} m 밖 — 클리어 ${driftClear.reached ? 'O' : 'X'}`);
check('★ 주인공 없는 파편이 도착 지점에 들어가도 클리어가 아니다 (§7 파손 = 실패의 전제)',
  !driftClear.reached && driftClear.orphanDist < 1e-9,
  `파편은 골 중심 · 주인공 ${driftClear.crewDist.toFixed(0)} m 밖`);

// ⑤ 주인공이 없는 배(비교 주행·벤치)는 그대로 돈다 — 파손 경로에 회귀가 없어야 한다.
check('주인공 없는 선체도 파손 경로를 그대로 탄다 (crew 는 물리에 아무 영향이 없다)',
  splitResult.result.crewLost === false && splitResult.bodies.every(
    (bd) => bd.getUserData().hull.crew === null),
  `조각 ${splitResult.bodies.length}개 · crew null · crewLost false`);

// ─────────────────────────────────────────────── 종합
console.log('\n\x1b[36m▌D0 "프레임 드랍 없이 도는가?" · D1 "형상이 조작감을 만드는가?" · ' +
  'D2 "배치에서 조향이 창발하는가?"\x1b[0m\n');
if (failures.length === 0) {
  console.log('  \x1b[32m통과.\x1b[0m 스파이크는 예산 안에서 돌고, 좌우 노 스트로크와 비대칭 창발이 성립한다.\n');
} else {
  console.log(`  \x1b[31m미달 ${failures.length}건:\x1b[0m\n${failures.map((f) => `    - ${f}`).join('\n')}\n`);
  process.exitCode = 1;
}
