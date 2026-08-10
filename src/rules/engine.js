// §6 논리 엔진 — 재질 × (필드 | 상태) → 효과.
//
// **이 파일은 규칙을 하나도 모른다.** 무엇이 타고 무엇이 젖는지는 전부 table.json 에 있고,
// 여기 있는 것은 그 데이터를 해석하는 닫힌 동사 집합뿐이다. 맵이 코드를 실행할 구멍은
// 스키마에 존재하지 않으므로, "맵별 특수 코드 0줄"이 규약이 아니라 **불가능**이 된다 (원칙 1).
//
// 성능: 상태 전파는 10 Hz 로 돈다. 매 프레임 도는 것은 hydro 저항 적분뿐이라는 규약을
// 지키기 위해서다 (CLAUDE.md). 파라미터 재계산은 파괴 이벤트 시점에만 일어난다.
import { AMBIENT } from '../field/field.js';

/** 상태 전파 틱 간격 (s). */
export const RULE_TICK = 0.1;

/** engine 이 해석할 줄 아는 효과 동사 — 이 목록에 없으면 **로드 시점에** 거부한다. */
const EFFECTS = new Set(['set', 'clear', 'destroy', 'drain', 'enable', 'weaken']);
/** 조건에 쓸 수 있는 키. */
const CONDITIONS = new Set(['field', 'gte', 'lte', 'state', 'elapsed', 'and', 'on']);

/**
 * 규칙표를 검증해 로드한다. 스키마를 벗어난 줄은 **조용히 무시하지 않고 던진다** —
 * 오타 하나로 규칙이 사라지면 밸런싱 중에 그것을 물리 버그로 착각하게 된다.
 *
 * @param {{version:number, rules:Array}} json
 * @returns {Array<object>} 검증된 규칙 배열
 */
export function loadRules(json) {
  if (!json || !Array.isArray(json.rules)) throw new Error('규칙표 형식 오류: rules 배열이 없습니다.');

  return json.rules.map((r, i) => {
    const at = `규칙 #${i}(${r.id ?? '이름 없음'})`;
    if (!r.id) throw new Error(`${at}: id 가 필요합니다.`);
    if (!r.material) throw new Error(`${at}: material 이 필요합니다 ('*' 는 전 재질).`);
    if (!r.when || typeof r.when !== 'object') throw new Error(`${at}: when 이 필요합니다.`);
    if (!r.effect || typeof r.effect !== 'object') throw new Error(`${at}: effect 가 필요합니다.`);

    for (const k of Object.keys(r.when)) {
      if (!CONDITIONS.has(k)) throw new Error(`${at}: 모르는 조건 '${k}'.`);
    }
    const verbs = Object.keys(r.effect).filter((k) => EFFECTS.has(k));
    if (verbs.length === 0) {
      throw new Error(`${at}: 효과 동사가 없습니다 (${[...EFFECTS].join('|')}).`);
    }
    if (r.when.field && !(r.when.field in AMBIENT) && r.when.field !== 'wind') {
      throw new Error(`${at}: 모르는 필드 '${r.when.field}'.`);
    }
    return r;
  });
}

/** 대상이 이 규칙의 재질에 해당하는가. `'*'` 는 전 재질. */
function materialMatches(rule, materialKey) {
  return rule.material === '*' || rule.material === materialKey;
}

/**
 * 조건 판정. 대상은 선체 또는 아이템이며, 둘 다 `{material, status}` 를 갖는다.
 * @param {{temperature:number, moisture:number, wind:number}} sample 그 자리의 필드 값
 * @param {{burning:number, wet:number}} status 상태 타이머 (초)
 * @param {{hullBurning:boolean}} ctx 전파용 문맥
 */
function conditionHolds(when, sample, status, ctx) {
  if (when.field) {
    const v = sample[when.field] ?? 0;
    if (when.gte != null && !(v >= when.gte)) return false;
    if (when.lte != null && !(v <= when.lte)) return false;
    // 임계가 없는 필드 조건(`{field:'wind'}`)은 "그 필드가 있기만 하면"이다.
    if (when.gte == null && when.lte == null && !(v > 0)) return false;
  }
  if (when.state) {
    if (!(status[when.state] > 0)) return false;
    if (when.elapsed != null && !(status[when.state] >= when.elapsed)) return false;
  }
  if (when.and && !(status[when.and] > 0)) return false;
  // `on: 'hull'` — 선체가 그 상태일 때 아이템으로 옮겨붙는다 (§6.2 접촉 전파).
  if (when.on === 'hull' && !ctx.hullBurning) return false;
  return true;
}

/**
 * 규칙 엔진. `tick()` 을 onPreStep 에 물리면 된다.
 *
 * @param {Array} rules loadRules 결과
 * @param {object} fields createFields 결과
 */
export function createRuleEngine(rules, fields) {
  let accumulator = 0;
  /** 이번 틱에 발생한 이벤트. 소비자는 **스텝 밖에서** 비운다 (스텝 도중 강체 파괴 금지). */
  const events = [];

  /**
   * 한 대상(선체 또는 아이템)에 규칙을 적용한다.
   *
   * @returns {string|null} 파괴를 요청한 **규칙 id**, 없으면 null.
   *   ★ 불리언이 아니라 id 인 이유: 소비자가 "무엇이 죽였는가"를 알아야 어디가 깎이는지
   *     정할 수 있다. `sail/screen.js#burnSpot` 은 `fieldBehind(rules, ruleId)` 로 규칙이
   *     가리킨 필드를 되찾아 **그 필드가 가장 뜨거운 외곽점**을 태우는데, 여기서 id 를 흘리면
   *     그 분기가 영영 안 돌고 늘 직전 화점으로 되돌아간다. 균일 온도(3장 용암)에서는 모든
   *     외곽점이 똑같이 뜨거워 무해했지만, **좁은 띠(보스의 빔)에서는 실제로 닿은 부위가
   *     아니라 엉뚱한 자리가 깎인다.** 호출부가 `if (applyTo(...))` 로 쓰던 진리값 관례는
   *     비어 있지 않은 문자열이 참이라 그대로 유지된다.
   */
  function applyTo(target, materialKey, sample, dt, ctx) {
    const status = target.status ?? (target.status = {});
    let destroyedBy = null;
    /** 이번 틱에 이 대상에서 일어난 상태 변화. 끝에서 상쇄분을 걷어내고 발행한다. */
    const changes = [];

    // 상태 타이머 전진 — burning 은 누적(얼마나 오래 탔는가), wet 은 잔여(얼마나 남았는가).
    if (status.burning > 0) status.burning += dt;
    if (status.wet > 0) status.wet = Math.max(0, status.wet - dt);

    for (const rule of rules) {
      if (!materialMatches(rule, materialKey)) continue;
      if (!conditionHolds(rule.when, sample, status, ctx)) continue;

      const e = rule.effect;
      if (e.set && !(status[e.set] > 0)) {
        // 타이머는 아주 작은 양수로 시작한다 — 0 은 "없음"이라 다음 틱에 다시 켜진다.
        status[e.set] = e.duration ?? 1e-6;
        changes.push({ state: e.set, ruleId: rule.id, delta: 1 });
      } else if (e.set && e.duration) {
        status[e.set] = Math.max(status[e.set], e.duration); // 물웅덩이를 계속 지나면 갱신
      }
      if (e.clear && status[e.clear] > 0) {
        status[e.clear] = 0;
        changes.push({ state: e.clear, ruleId: rule.id, delta: -1 });
      }
      if (e.drain) status[e.drain] = Math.max(0, (status[e.drain] ?? 0) - dt * ((e.rate ?? 1) - 1));
      if (e.destroy) destroyedBy = rule.id;
      // enable·weaken 은 힘 함수가 status 를 직접 읽어 반영한다 (field/forces.js 의 wetScale).
      // 규칙표에 명시해 두는 이유는 그 조합이 **데이터에 선언돼 있어야** 하기 때문이다.
    }

    // ★ 같은 틱에 붙었다 꺼진 상태는 이벤트를 내지 않는다.
    //
    // 젖은 나무배가 화염 지대에 있으면 매 틱 wood-ignites 가 불을 붙이고 wet-suppresses-fire
    // 가 즉시 끈다. 거동은 옳지만(불이 끝내 붙지 못한다) 그대로 두면 초당 10건씩 이벤트가
    // 쏟아져 실패 분석 화면(D3)이 못 쓰게 된다. **관측 가능한 변화가 없으면 사건도 없다.**
    for (const c of changes) {
      const cancelled = changes.some((o) => o.state === c.state && o.delta === -c.delta);
      if (cancelled) continue;
      events.push({
        type: 'state',
        state: c.delta > 0 ? c.state : `-${c.state}`,
        on: target,
        ruleId: c.ruleId,
      });
    }
    return destroyedBy;
  }

  return {
    rules,
    events,

    /** 마지막 틱 이후 쌓인 이벤트를 비우며 돌려준다. */
    drain() {
      const out = events.slice();
      events.length = 0;
      return out;
    },

    /**
     * @param {World} world
     * @param {number} dt 물리 타임스텝 (누적해 RULE_TICK 마다만 실제로 돈다)
     */
    tick(world, dt, time = 0) {
      accumulator += dt;
      if (accumulator < RULE_TICK) return;
      const step = accumulator;
      accumulator = 0;
      if (!fields || fields.isEmpty || rules.length === 0) return;

      for (let body = world.getBodyList(); body; body = body.getNext()) {
        if (!body.isDynamic()) continue;
        const hull = body.getUserData()?.hull;
        if (!hull) continue;

        const c = body.getWorldCenter();
        const wind = fields.sampleVector('wind', c.x, c.y, time);
        const sample = {
          temperature: fields.sampleScalar('temperature', c.x, c.y, time),
          moisture: fields.sampleScalar('moisture', c.x, c.y, time),
          wind: Math.hypot(wind.x, wind.y),
        };

        const ctx = { hullBurning: hull.status?.burning > 0 };
        const destroyedBy = applyTo(hull, hull.params.material.key, sample, step, ctx);
        if (destroyedBy) {
          // ruleId 를 실어야 소비자가 `fieldBehind` 로 "어느 필드가 죽였는가"를 되찾을 수 있다.
          events.push({
            type: 'destroyed', body, at: { x: c.x, y: c.y }, target: hull, ruleId: destroyedBy,
          });
          // 연소 시계를 되감는다. 안 감으면 소비자가 조각을 남겼을 때 다음 틱에 곧바로 다시
          // 파괴 조건이 서서 0.1초마다 차감이 터진다. 되감으면 "한 구획이 무너지고, 남은
          // 부분이 다시 타들어간다"가 되어 §7 파손 지오메트리와 자연스럽게 이어진다.
          hull.status.burning = 1e-6;
          continue; // 파괴될 배의 아이템까지 굴릴 이유가 없다
        }

        // 아이템도 규칙표의 예외가 아니다 (§4.4). 천 돛은 화염에 타고, 그 상실이
        // 그대로 추진력 상실이 된다.
        const itemCtx = { hullBurning: hull.status?.burning > 0 };
        for (let i = hull.items.length - 1; i >= 0; i--) {
          const item = hull.items[i];
          const lostBy = applyTo(item, item.material, sample, step, itemCtx);
          if (lostBy) {
            hull.items.splice(i, 1);
            events.push({ type: 'itemLost', body, item, target: hull, ruleId: lostBy });
          }
        }
      }
    },
  };
}
