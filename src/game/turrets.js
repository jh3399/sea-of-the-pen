// 포탑 — 맵 데이터가 만드는 주기 발사기.
//
// ★ **조준 로직이 0줄이다.** 포탑은 표적을 모르고, 월드를 모르고, planck 을 모른다. 방위와
//   주기가 전부 데이터이므로 "언제 지나갈 것인가"가 플레이어의 문제로 남는다 — 추적 포탑을
//   만들면 그 순간 게임 안에 판단하는 주체가 생기고, 이 프로젝트는 "게임 안에 AI 는 없다"를
//   전제로 서 있다. 난도는 조준이 아니라 **배치**(맵 데이터)로 올린다.
//
// ★ **누산을 하지 않는다.** 발사 시각은 `startedAt + phase + n × period` 라는 정수 n 의 함수다.
//   dt 를 더해 가는 구현은 (a) 부동소수점이 드리프트하고, 무엇보다 (b) 호출 간격이 바뀌면
//   결과가 바뀐다 — `FixedStepper.advance()` 는 한 프레임에 물리 스텝을 0~5번 돌리므로
//   (world.js), 누산형 포탑은 **발사 주기가 모니터 주사율에 종속된다.** D0 이 추력·저항에서
//   이미 한 번 밟은 함정과 같은 종류이고, 벤치가 히치를 섞어 그 회귀를 잡는다.
//
//   `step(now)` 이 `now` 의 순수 함수라는 것이 그 성질의 정확한 표현이다: 호출을 걸러 내도
//   같은 발사 열이 나온다.
import { MATERIALS } from '../hull/params.js';

export const TURRET_TUNING = {
  /** 발사 주기 (s). */
  period: 1.5,
  /** 사이클 내 오프셋 (s). 포탑 여럿의 위상을 어긋내 리듬을 만드는 유일한 노브. */
  phase: 0,
  /** 포탑 몸체(정적 강체) 반경 (m). 총구 오프셋의 기준이기도 하다. */
  radius: 1.2,
  /**
   * 포탄 초속 (m/s)과 질량 (kg).
   * 12 kg · 55 m/s → E = J²/2μ ≈ 18.1 kJ → 나무 반경 0.50 m · 철 0.13 m(함몰).
   * `carveRadiusFromImpact` 와 `MATERIALS` 의 내구 값에서 나온 수치다 (§7.4).
   */
  speed: 55,
  mass: 12,
  /** 포탄 반경 (m). */
  projectileRadius: 0.15,
  /**
   * 총구를 포탑 표면에서 얼마나 더 띄우는가 (m).
   *
   * ★ 이것이 자기 편 오사를 막는 **유일한** 방어선이다. 핸드오프는 "총구 오프셋 + 무장 지연
   *   두 겹"이라고 썼지만, 실제로는 한 겹이다 — `armDelay` 는 *파손*만 막고, 포탄이 접촉하면
   *   무장 전이라도 `spent` 로 찍혀 그 자리에서 소멸한다(projectile.js). 즉 오프셋이 모자라면
   *   포탑은 자기를 안 깎는 대신 **탄이 아예 안 나간다.**
   *   planck 의 linearSlop(0.005 m) 대비 20배라 접선으로 스치는 것도 걸리지 않는다.
   */
  muzzleMargin: 0.10,
  /** 표시용 재질. 파손 계산은 **맞는 쪽** 재질만 쓰므로 여기 값은 물리에 안 들어간다. */
  material: 'iron',
  /** 포탄 수명 (s). 55 × 6 = 330 m — 3장 맵 대각선보다 넉넉하다. */
  lifetime: 6,
};

/**
 * 허용 최소 주기 (s).
 *
 * 한 프레임 최대 물리 스텝(5 × 1/60 = 0.083 s)보다 넉넉히 커야 한 스텝에 두 발이 나오지 않는다.
 * 그보다 짧은 주기는 데이터 오류로 보고 **로드 시점에 던진다** — 조용히 유실되면 밸런싱 중에
 * 그것을 물리 버그로 착각하게 된다.
 */
export const MIN_PERIOD = 0.25;

/**
 * 한 번에 나가는 탄 수의 상한. 넘으면 로드 시점에 던진다 — 부채꼴은 한 스텝에 count 발을
 * 통째로 만들므로, 오타 하나(`count: 700`)가 프레임을 죽이고 `maxAlive` 백스톱까지 밟는다.
 */
export const MAX_COUNT = 24;

/** 스펙에 쓸 수 있는 키. 이 밖은 오타로 보고 거부한다. */
const SPEC_KEYS = new Set([
  'x', 'y', 'angle', 'period', 'phase', 'radius',
  'speed', 'mass', 'projectileRadius', 'material', 'lifetime',
  // 부채꼴 — 한 문이 한 주기에 여러 발을 부채처럼 편다.
  'count', 'spread', 'spin',
]);

const DEG = Math.PI / 180;

/**
 * 포탑 스펙 배열 → 발사 스케줄러.
 *
 * `loadRules` 와 같은 정신으로 스키마 밖이면 **로드 시점에 던진다.**
 *
 * @param {Array<{x:number, y:number, angle:number, period?:number, phase?:number,
 *                radius?:number, speed?:number, mass?:number, projectileRadius?:number,
 *                material?:string, lifetime?:number,
 *                count?:number, spread?:number, spin?:number}>} specs
 *   `angle` 은 **도(degree)** 다 — 맵 JSON 은 손으로 쓰는 파일이라 라디안을 적게 하면 안 된다.
 *   월드와 같은 규약: 0° = +X(동), +90° = +Y(북). 발사 요청은 라디안으로 나간다.
 *   `count`(기본 1)·`spread`(부채 **전체** 폭, 도)·`spin`(초당 도) 은 부채꼴 노브다.
 *   `spread` 는 양 끝 탄 사이의 각이라 `count` 를 늘려도 부채가 넓어지지 않고 촘촘해진다 —
 *   밀도와 폭을 따로 돌릴 수 있어야 "빽빽한 좁은 부채"와 "성긴 넓은 부채"가 둘 다 나온다.
 * @param {number} startedAt 시뮬레이션 시각의 기준점 (s). **출항 시각**을 넣는다 —
 *   페이지 로드 기준이면 "그림을 오래 그린 사람은 출항하자마자 피격"이 된다.
 */
export function createTurrets(specs, startedAt = 0) {
  if (!Array.isArray(specs)) throw new Error('포탑 스펙 형식 오류: 배열이 아닙니다.');
  if (!Number.isFinite(startedAt)) throw new Error('포탑 startedAt 이 유한수가 아닙니다.');

  const turrets = specs.map((raw, i) => {
    const at = `포탑 #${i}`;
    if (!raw || typeof raw !== 'object') throw new Error(`${at}: 객체가 아닙니다.`);
    for (const k of Object.keys(raw)) {
      if (!SPEC_KEYS.has(k)) throw new Error(`${at}: 모르는 키 '${k}'.`);
    }

    const num = (key, fallback) => {
      const v = raw[key] ?? fallback;
      if (!Number.isFinite(v)) throw new Error(`${at}: ${key} 가 유한수가 아닙니다.`);
      return v;
    };
    const positive = (key) => {
      const v = num(key, TURRET_TUNING[key]);
      if (!(v > 0)) throw new Error(`${at}: ${key} 는 0보다 커야 합니다 (받은 값 ${v}).`);
      return v;
    };

    const x = num('x', undefined);
    const y = num('y', undefined);
    const angle = num('angle', undefined) * DEG;
    const phase = num('phase', TURRET_TUNING.phase);
    if (phase < 0) throw new Error(`${at}: phase 는 음수일 수 없습니다.`);

    const period = positive('period');
    if (period < MIN_PERIOD) {
      throw new Error(`${at}: period ${period}s 가 최소 ${MIN_PERIOD}s 보다 짧습니다.`);
    }
    const radius = positive('radius');
    const speed = positive('speed');
    const mass = positive('mass');
    const projectileRadius = positive('projectileRadius');
    const lifetime = positive('lifetime');

    const count = num('count', 1);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new Error(`${at}: count 는 1..${MAX_COUNT} 의 정수여야 합니다 (받은 값 ${count}).`);
    }
    const spread = num('spread', 0) * DEG;
    if (spread < 0) throw new Error(`${at}: spread 는 음수일 수 없습니다.`);
    const spin = num('spin', 0) * DEG;
    // 부채는 기준 방위를 **가운데**에 두고 좌우로 편다. 양 끝 사이가 spread 이므로
    // 간격은 count-1 로 나눈다 (count 1 이면 간격이 없다 — 0 으로 나누지 않도록 분기).
    const spreadStep = count > 1 ? spread / (count - 1) : 0;

    const materialKey = raw.material ?? TURRET_TUNING.material;
    if (!MATERIALS[materialKey]) throw new Error(`${at}: 모르는 재질 '${materialKey}'.`);

    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    // 총구는 **파생값**이다. 맵에 상수로 적게 하면 몸체 반경과 갈라지고, 갈라지는 순간
    // 탄이 자기 포탑에 닿아 태어나자마자 소멸한다.
    const reach = radius + projectileRadius + TURRET_TUNING.muzzleMargin;
    const muzzle = { x: x + dir.x * reach, y: y + dir.y * reach };

    return {
      spec: raw,
      at: { x, y },
      dir,
      muzzle,
      period,
      phase,
      angle,
      count,
      spreadStep,
      spin,
      /** 총구 오프셋. 부채는 탄마다 방위가 다르므로 이 거리를 **탄의 방위로** 다시 밀어낸다. */
      reach,
      /**
       * 몸체용 장애물 스펙. ★ `createObstacle` 과 `createTurrets` 가 **같은 radius** 를 쓰게
       * 하는 장치다 — 스펙을 두 벌로 쪼개면 총구 오프셋이 몸체보다 작아지는 사고가 난다.
       */
      bodySpec: { shape: 'circle', x, y, radius, material: materialKey },
      /**
       * 발사 요청의 불변 부분. `radius` 는 **포탄** 반경이다 (포탑 몸체 반경이 아니다).
       * `turret` 은 어느 포탑이 쐈는지 — `spawnProjectile` 은 안 읽지만, 여러 문이 섞여
       * 날 때 발사 열을 포탑별로 갈라 볼 수 있어야 회귀가 "합계만 맞는" 착시를 안 만든다.
       */
      request: {
        turret: i,
        x: muzzle.x, y: muzzle.y, angle, speed,
        radius: projectileRadius, mass, material: materialKey, lifetime,
      },
      n: 1,   // 다음 발사 번호. 첫 발은 startedAt + phase + period.
    };
  });

  /** n 번째 발사 시각. 누산이 아니라 곱이라 호출 이력과 무관하다. */
  const fireTime = (t, n) => startedAt + t.phase + n * t.period;

  let fired = 0;

  return {
    /** 렌더용 읽기 뷰. */
    list: turrets,
    get fired() { return fired; },

    /**
     * @param {number} now 절대 시뮬레이션 시각 (s)
     * @returns {Array<object>} 이번 호출에서 나간 발사 요청들
     */
    step(now) {
      const out = [];
      for (const t of turrets) {
        // `if` 가 아니라 `while` 인 이유: MIN_PERIOD 검증이 뚫렸거나 호출이 걸러졌을 때
        // 발사가 **조용히 유실**되지 않게 하는 백스톱이다. 정상 경로에서는 한 번만 돈다.
        //
        // ⚠ 뒤집어 말하면, `step()` 을 **오래 건너뛰면 밀린 발사가 한 스텝에 쏟아진다.**
        //   페이즈로 발사기를 켜고 끄려면 `createTurrets(specs, 그 페이즈 시작 시각)` 으로
        //   새로 만들어야 하고(t.n 이 1 부터 다시 센다), 창을 열어 시계를 멈출 때는 넘기는
        //   `now` 자체를 멈춰야 한다. 둘 중 하나를 빼먹으면 재개 순간 볼리가 폭발한다.
        while (now >= fireTime(t, t.n)) {
          const ft = fireTime(t, t.n);
          // ★ 회전은 **발사 시각**에서 계산한다. `now` 로 재면 같은 발사가 호출 타이밍에 따라
          //   다른 방위로 나가 `step(now)` 이 `now` 의 순수 함수라는 성질이 깨진다 (파일 머리말).
          //   누산도 아니라 드리프트가 없다.
          const base = t.angle + t.spin * (ft - startedAt);
          for (let k = 0; k < t.count; k++) {
            const a = base + (k - (t.count - 1) / 2) * t.spreadStep;
            out.push({
              ...t.request,
              angle: a,
              // 총구는 **탄의 방위로** 밀어낸다. 몸체 중심에서 쏘면 태어나는 순간 자기 몸에
              // 닿아 `spent` 로 찍혀 사라진다 (아래 `reach` 주석 참조).
              x: t.at.x + Math.cos(a) * t.reach,
              y: t.at.y + Math.sin(a) * t.reach,
              firedAt: ft,
              bornAt: now,
            });
          }
          t.n += 1;
          fired += t.count;
        }
      }
      return out;
    },

    /**
     * 충전율 0..1 — 렌더 전용.
     *
     * ★ 조준이 없는 대신 플레이어가 할 일은 "타이밍을 읽고 지나가기"뿐이다. 이 값이 화면에
     *   안 보이면 포탑은 퍼즐이 아니라 무작위 피해가 된다.
     */
    charge(i, now) {
      const t = turrets[i];
      if (!t) return 0;
      const prev = fireTime(t, t.n - 1);
      return Math.max(0, Math.min(1, (now - prev) / t.period));
    },
  };
}
