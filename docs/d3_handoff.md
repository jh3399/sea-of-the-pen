# D3 인수인계 — S3부터 이어서

> 작성 2026-08-07 · 갱신 2026-08-07(S3 완료) · 브랜치 `feat/d3-projectile-turret`
> `npm run bench` **126/126 통과** · 빌드 정상
> 원래 계획: `C:\Users\Admin\.claude\plans\d3-synchronous-boot.md`
> ⚠ **그 계획서의 전제 네 개가 실측으로 뒤집혔다.** 아래 §3 을 먼저 읽고 계획서를 볼 것.

---

## 0. 새 세션에서 맨 먼저 할 일

```bash
npm run bench     # 126/126 여야 한다. 아니면 여기서 멈추고 원인부터
npm run dev       # http://localhost:5210/sea-of-the-pen/
```

읽을 순서: `CLAUDE.md` → 이 문서 → `docs/dev_plan.md` D3 절 → 계획서(§3·**§7** 정정 반영해서).

작업 브랜치는 `feat/d3-projectile-turret` 이다 (S0~S2 는 `docs/shipwright-dev-plan` 에 있다).

---

## 1. 끝난 것 (S0~S2)

| 커밋 | 내용 |
|---|---|
| `c0e53b6` | 벤치 판정선 먼저 + `damage/hotspot.js` |
| `cbdf42d` | 연소 파괴를 열원 쪽으로 배선 · `carveBody` 분리 · `rules/provenance.js` |
| `fe61126` | 충돌 파손 (`damage/contact.js` · 재질 내구 · `physics/obstacle.js`) |
| `95b32f9` | 불이 번지게 · 연소 반경을 출항 면적 기준으로 (육안 관찰 두 건의 수정) |
| `b0714de` | **S3** 포탑 발사 스케줄 (`game/turrets.js`, 순수 · 누산 없음) |
| `42b00af` | **S3** 포탄 강체 (`damage/projectile.js`, CCD · 직선 탄도 · 접촉 소진) |
| `e00c663` | **S3** 충격이 볼록 분해 이음매에서 갈라지던 것 수정 (`contact.js`) |
| `6bd02fb` | **S3** 발사 주기의 프레임률 독립 회귀 |
| `ca6d2dd` | **S3** 하니스 배선 + `포탑·암초 시험` 버튼 + 포탄·포탑 렌더 |

### 신규 모듈

| 파일 | 역할 |
|---|---|
| `src/damage/hotspot.js` | 차감 **지점**. `hottestOutlinePoint`(구배) · `nearestOutlinePoint`(번짐) · `mostExposedPoint`(첫 발화) |
| `src/damage/impact.js` | 차감 **크기**. `DAMAGE_TUNING` · `burnRadius` · `carveRadiusFromImpact` · `reducedMass` |
| `src/damage/contact.js` | post-solve 큐. `installImpactListener` · `offCooldown` · `CONTACT_TUNING` |
| `src/physics/obstacle.js` | `createObstacle` — 암초 정적 강체 |
| `src/rules/provenance.js` | `fieldBehind(rules, ruleId)` — 규칙 → 필드 역추적 |

### 기존 파일 변경
- `src/hull/params.js` — `MATERIALS` 에 `impactThreshold`·`toughness`·`maxCarveRadius` + `rock` 재질
- `src/physics/body.js` — hull 에 `lastCarveAt`·`launchArea`·`burnAt` 추가, **전부 조각에 승계**
- `src/main.js` — `burnSpot()` 신규, `carve` → `carve`(클릭 전용) + `carveBody`(지목형) 분리
- `src/ui/harness.css` — 노 튜닝 패널이 상태줄과 겹쳐서 `top: 58px → 132px`

### ~~⚠ 아직 하니스에 안 붙은 것~~ → **S3 에서 배선됐다**
`installImpactListener` · `createObstacle` 은 이제 `main.js` 생성자에서 걸린다. `포탑·암초 시험`
버튼이 뱃머리 앞에 암초·포탑을 깔아 주므로 **브라우저에서 충돌·피탄을 직접 볼 수 있다.**
S4 는 이 배선을 `session.js` 로 **옮긴다** (새로 짜는 게 아니다).

---

## 2. 남은 것

### ~~S3 — 포탄 · 포탑~~ ✅ 완료 (브랜치 `feat/d3-projectile-turret`, 벤치 126/126)

신규: `src/game/turrets.js`(순수) · `src/damage/projectile.js` · 하니스 `포탑·암초 시험` 버튼.
**§7 로 아래 항목이 추가**됐다 — S4 는 그것을 먼저 읽을 것. 아래 원래 사양은 기록으로 남긴다.

<details><summary>원래 S3 사양 (~1.5h)</summary>

플레이어 대포는 **범위 밖**이다. 사용자 결정: 3장에서 배가 *받는* 파손은 암초·포탑·연소 셋이고,
플레이어 대포는 폴백 1순위로 내렸다 (예측 비트 일치 회귀가 D3 에서 가장 비싸다).
`ITEM_CATALOG.cannon` 스키마는 그대로 두고 `ATTACHABLE` 에도 넣지 않는다.

```js
// src/damage/projectile.js (신규)
export function spawnProjectile(world, { x, y, angle, speed, radius, mass, material, bornAt })
export function cullProjectiles(world, now, bounds)   // 스텝 밖에서 호출 (강체를 부순다)

// src/game/turrets.js (신규, ~40줄)
export function createTurrets(specs)  // → { step(dt, now) → Array<spawnRequest> }
```

- userData 는 `{projectile:{bornAt, material, mass}}`. **`hull` 이 없어야** hydro·fields·규칙이 자동으로 건너뛴다.
- 피탄 → 파손은 **§2 충돌과 완전히 같은 경로다.** `contact.js` 가 `{hull, projectile}` 쌍을 이미
  처리한다 (`source:'shot'`, `μ = 포탄 질량`, `armDelay` 무장 지연). 새 파손 코드가 필요 없다.
- 자기 편 안 맞기: **owner 강체 참조를 쓰면 안 된다** — `respawnPieces` 가 강체를 바꿔치기해
  첫 파손에 참조가 죽는다. 총구 오프셋(선체 밖에서 스폰) + `CONTACT_TUNING.armDelay`(0.1s) 두 겹.
- 시작값: 질량 12 kg · 속도 55 m/s → E ≈ 18.2 kJ → 나무 r 0.50 m, 철 r 0.13 m(함몰).

벤치: 포탑 탄이 지나가는 배를 깎는다 · 포탑은 자기 탄에 안 맞는다.

</details>

### S4 — 맵 3장 + `session.js` (~2h) ★ 가장 큰 덩어리

```js
// src/maps/maps.json  — 배열 한 파일. 파일을 쪼개면 import 경로가 곧 "코드 안의 맵 이름"이
//                        되어 통과 질문 (c) 의 기계 판정이 약해진다.
// src/maps/load.js    — loadMaps(json). loadRules 와 같은 정신으로 스키마 밖이면 throw.
// src/game/objective.js — evaluate(snapshot, map, run) · withinDesignLimits(...)
// src/game/session.js   — createSession(map, rules). **DOM 0줄, 렌더 0줄.**
```

**`session.js` 를 DOM 없이 만드는 것이 타협 불가다.** 통과 질문 (b)"3맵 전부 클리어 가능한가"를
벤치로 판정하려면 목표 판정·파손 파이프라인·포탑이 헤드리스로 돌아야 하고, `Harness` 안에
있으면 main.js 의 것과 bench 의 것이 두 벌이 되어 서로 어긋난다.

`step()` 한 번의 순서 — **이게 D3 의 새 규약이다** (⚠ S3 에서 ④ 가 옮겨졌다):
```
stepper.advance(dt)
  ── onPreStep (= world.step 밖이라 강체를 만들어도 된다) ──
  ⓪ simTime = stepIndex × FIXED_DT · turrets.step(simTime) → spawnProjectile
     장치 → hydro → fields → rules (기존 그대로)
  ── 스텝 밖 ──
① engine.drain()  → burnSpot 으로 차감 지점 변환 → carveBody
② impactQueue.drain() → 강체별 최대 하나 · **이미 죽은 강체 스킵** (session.bodies 멤버십)
③ 차감 소비                       ← 여기서만 **선체가** 나고 죽는다
⑤ cullProjectiles()               ← 여기서만 **포탄이** 죽는다 (②보다 뒤! Impact 가 포탄 참조를 든다)
⑥ trace.sample()
⑦ objective.evaluate()
```
**④ 를 스텝 밖에 두면 발사 주기가 모니터 주사율에 종속된다** — `advance()` 는 프레임당 0~5스텝을
돌고 히치가 나면 클램프+잔여 폐기로 시계가 갈라진다. 실측(버그판): 히치를 섞으면 같은 1200스텝에
50발이 아니라 **258발**이 나갔다. `main.js` 의 배선이 정본이니 그대로 옮길 것.

`main.js` 의 `burnSpot()`(현재 Harness 메서드)을 여기로 옮긴다 — 지금은 하니스에만 있어
벤치가 못 돈다.

**스키마**(계획서 §4.2 참조). `goal` 은 **선택 필드**로 둘 것 — 없으면 `evaluate` 가 항상
`sailing` 을 내게 하면 "3장을 샌드박스로 격하"라는 폴백이 **JSON 한 줄 삭제**가 된다.
승리 판정은 `goalHullFraction = 0.35` (§7.3.4 다단 분리를 허용하되 파편 꼼수는 막는다).

**`src/field/zones.json` 은 손대지 말 것.** 맵이 아니라 회귀 픽스처다 — 목표·경계가 없어야
"같은 존·같은 규칙·같은 코드에서 한 변수만 다르다"는 D2 가설 C 판정(`bench.mjs`)이 성립한다.

**3맵 수치는 계획서 §4.3 에 있다.** 단 §3② 를 반영해 2장 역풍 판정을 다시 볼 것.

⚠ **`voyage()`(bench.mjs) 를 고치지 말 것.** `destroyed` 에서 주행을 중단하는데 D2 가설 C
케이스들이 그 동작에 의존한다. `createSession` 을 쓰는 새 헬퍼를 옆에 만든다.

### S5 — 정찰/설계 제약/디브리프 (~2h)
`this.mode`: `'design'|'sail'` → `'brief'|'design'|'sail'|'debrief'`.
`src/game/verdict.js` 의 `deriveBadges` — 배지 코드는 전부 시뮬레이션에서 도출(맵 문자열 0개).
`listing` 배지(`sideAnchors().center` 의 출항 대비 증가분)가 **통과 질문 (a) 를 직접 답한다.**
규칙 라벨은 `table.json` 의 destroy 규칙에 `"label"` 을 데이터로 추가한다 —
`loadRules` 는 최상위 미지 키를 검사하지 않으므로 **로더 수정 0줄**이다.

### S6 — 항적 고스트 (~1h)
`src/game/trace.js`. **입력 재현·시드 고정 불필요** (dev_plan 이 리플레이를 잘랐다).
10 Hz × 180 s ≈ 60 KB. `drawTrajectory()`(main.js)의 선 그리기를 재사용.

### 아직 안 쓴 벤치 (계획서 §5)
구조 검사 5종이 통째로 남았다 — **통과 질문 (c) 의 유일한 기계 증거**라 S4 와 같이 넣을 것:
1. `loadMaps` 통과 · 스키마 밖이면 throw
2. ★ **어떤 소스 파일도 맵 id 를 이름으로 참조하지 않는다** (`src/**` + `bench.mjs` 재귀 검색,
   `maps.json` 제외 0건). 벤치 자신도 `maps[0]` 인덱스로만 접근
3. 맵 JSON 에 `script|code|on|fn|expr|=>` 부재 + 모든 리프가 원시형
4. **선체에 HP 개념이 없다** — `\bhp\b|health|hitPoints` 0건
5. 의도 해법은 **bench 안에** 산다. `maps.json` 에 `solution` 을 넣으면 그게 곧 맵별 코드다

---

## 3. ★ 계획서에서 실측으로 뒤집힌 전제

계획서를 그대로 믿으면 안 되는 곳들이다.

**① 쿨다운은 지속 접촉의 가드가 아니다.**
계획서는 `CONTACT_TUNING.cooldown` 을 세 함정 중 하나로 꼽았지만, A/B 로 재니 쿨다운 0.2s 와
0 의 결과가 **한 치도 같았다**(20회 차감, −77.4%). 실제로 막는 것은 재질의 `impactThreshold` 와
`DAMAGE_TUNING.minCarveRadius` 둘이다 — 벽에 기댄 스텝당 에너지는 **2.9 J** 로 나무 임계
(8 kJ)에 못 미치고, 넘겨도 반경 0.007 m 가 최소 반경(0.12)에서 걸린다.
쿨다운은 밸런싱 중 임계를 낮췄을 때의 **백스톱**이다. 그렇게 주석에 적어 뒀다.

**② 역풍 돛 페널티는 38% 가 아니라 62% 다.**
`CLAUDE.md` 와 `docs/dev_plan.md:120` 의 "38%", `src/field/forces.js:12` 주석의 "41%" 는
**전부 낡은 기록**이다(`pressureCoeff` 를 6.5 로 올린 뒤 갱신 안 됨). 실측:
```
역풍에서 노 젓기 20초 — 돛 없이 x 87.3 m · 돛 달고 x 33.0 m (거리 62% 손해)
```
→ 2장에서 `SAIL_TUNING.pressureCoeff` 를 올릴 이유가 사라졌다. 사용자가 고른 레버는
**존 풍속**(계획서 §4.3 의 −16 m/s)이고, 목표는 "% 를 키우기"가 아니라 **부호를 뒤집기**다
(돛 단 배가 순 후퇴). 판정도 %가 아니라 부호로 — 노 튜닝 슬라이더에 안 흔들린다.

**③ 파손이 안 읽힌 진짜 이유는 "대칭"이 아니라 "외곽선에 안 닿는다"였다.**
무게중심을 깎으면 clipper 결과가 **구멍**이 되어 `outline` 이 그대로 남는다. `length`·`beam` 이
`projectedExtent(outline)` 에서 나오므로 저항 타원이 안 바뀐다. 지점이 외곽선 위여야 한다.

**④ 3장 파손 소스에서 "플레이어 대포"는 틀린 이름이었다.**
대포는 배가 *받는* 파손 소스가 아니다(반동 추진이거나, 부술 대상이 필요한데 암초는 안 깎인다).
사용자 재확인 결과 **암초 + 포탑**으로 확정.

---

## 4. 함정 목록 (전부 실제로 밟았거나 밟을 뻔한 것)

1. **`respawnPieces` 는 강체를 파괴하고 새로 만든다.** 강체를 키로 쓰는 상태(WeakMap·Map·참조)는
   전부 차감 순간에 리셋된다. 쿨다운이 이걸로 죽어 있었다. 강체에 붙는 상태는 **hull 에 얹고
   `respawnPieces` 에서 승계**할 것 (`status`·`lastCarveAt`·`launchArea`·`burnAt` 이 그 목록).
   `burnAt` 은 아이템과 **같은 재중심화 변환**을 받아야 한다.
2. **큐 소비 시 이미 파괴된 강체를 스킵**해야 한다. 한 프레임에 물리 스텝이 최대 5번 돌아
   (`world.js MAX_STEPS_PER_FRAME`) 큐에 여러 건이 쌓이고, ③에서 강체가 바뀌면 뒤따르는
   항목이 댕글링이 된다.
3. **post-solve 는 접촉이 지속되는 한 매 스텝 불린다.** 그리고 콜백 안에서 강체를 만들거나
   부술 수 없다 (planck 이 명시적으로 금지).
4. **`disc` 필드는 `radius × (1−falloff)` 안쪽이 평평하다.** 화염 지대(r=30, falloff 0.1)는
   **27 m 안이 균일**이라 구배 로직이 닿는 곳이 얇은 고리뿐이다. 3장 맵을 만들 때 `falloff` 를
   키우면 "열원 쪽이 먼저 탄다"가 더 자주 보인다 — **S4 에서 정할 것.**
5. **"가장 먼 점"을 반복 차감하면 폴리곤이 원이 된다.** 실측으로 차감 지점이
   `26°→358°→50°→339°→317°` 처럼 반대편을 오갔다(둥근 배 8분면 7/8). 번짐으로 4/8 로 내렸다.
6. **부동소수점 경계로 벤치를 쓰지 말 것.** `10 + 0.2 − 10 = 0.19999999999999929`.
7. **회귀는 무손상 대비로 잰다.** 완전히 대칭인 코퍼스도 RDP 미세 비대칭(노 y 합 0.83 cm)으로
   20초에 18° 돈다. 0 과 비교하면 무엇을 보증하는지 알 수 없다.
8. **A/B 없이 가드를 검증했다고 하지 말 것.** 한쪽만 재면 물리가 정한 수를 가드의 공으로 읽는다.
9. **`predict.js` 비트 일치** — 플레이어 대포를 되살린다면 반동은 임펄스가 아니라 **sin² 봉투**
   여야 하고 `cloneControl` 이 대포 시계와 `wasHeld` 를 깊은 복사해야 한다. 예측은 힘만 적분한다.

---

## 5. 사람 판정 대기 (벤치는 전제까지만 보증한다)

자동화 브라우저는 `visibilityState: hidden` 이라 rAF 가 **0 프레임**이다. 다만 `main.js` 가
`window.shipwright` 를 노출하므로 `loop()` 을 손으로 돌려 **기능 확인은 할 수 있다** —
S3 은 그렇게 확인했다. 손맛·가독성 판정만 사람이 창을 띄워야 한다.

S3 에서 스크립트로 확인한 것(재현 가능): 둥근 배로 사선을 가로지르며 **피탄 2회**
(16.4 kJ r=0.46 · 13.5 kJ r=0.37) → **정면 암초 충돌**(42.4 kJ r=0.93) → 면적 −7.1%.
선체에 물어뜯긴 자국이 그대로 보이고 저항 타원도 따라 찌그러진다. 다시 그리기·세 척 비교 뒤
유령 포탑 0. `simTime` 정상 증가.

**사람이 봐야 하는 것:**

1. **거동 인지 (통과 질문 a)** — `npm run dev` → 코퍼스 `둥근 배` → 존 `화염 지대` → 출항 →
   ↑ 꾹. 한쪽이 먹혀 들어가며 배가 저절로 편향해야 하고, 약 64초(16사이클)에 전손한다.
   상태줄이 `좌현이 타서 무너졌습니다` 처럼 부위를 말한다.
   - 안 읽히면 → `DAMAGE_TUNING.burnRadiusOfHull` 0.30 → 0.42
   - 너무 과하면(벤치 실측 좌현 차감 시 20초에 −770°) → 반대로 내린다
2. **★ 충전 표시만 보고 포탑 빔을 피할 수 있는가** — 출항 → ↑ 로 속도를 붙인 뒤
   `포탑·암초 시험`. 조준이 없으므로 이것이 성립해야 3장이 퍼즐이 되고, 안 되면 무작위 피해다.
   안 읽히면 주기를 늘리거나 포신 길이·색 대비를 키운다 (`drawObstacles`).
3. 노 튜닝 패널 위치 (`harness.css:155` `top: 132px`) 가 적당한지
4. 참고 — 브라우저 F3 에서 `carve` **최대 9.00 ms** (예산 8)를 한 번 봤다. 벤치의 같은 경로는
   20회 연속에서 최대 **1.40 ms** 이므로 JIT 콜드 스타트로 본다(벤치는 3회 중 중앙값을 쓴다).
   실기에서 반복되면 그때 다시 볼 것.

---

## 6. 문서 정정 TODO (D3 마무리에)

- `CLAUDE.md` D2 줄의 **"71/71 통과"** → 실제로는 D2 직후 이미 85건이었고 지금 **104건**이다
  (D2 이후 노 튜닝 커밋들이 케이스를 더했다)
- `CLAUDE.md` 와 `docs/dev_plan.md:120` 의 **역풍 페널티 38%** → **62%**
- `src/field/forces.js:12` 주석의 **"6.5 이면 41%"** → 62%
- `harness.html`(구 `index.html`) 의 `<title>`·`<h1>` 이 아직 **"D2 창발 조향 + 규칙 엔진"**
- `CLAUDE.md` 진행 상태에 D3 체크 + "D3 에서 확인된 사실" 절 (§3·§4·**§7** 을 옮겨 적을 것)

---

## 7. S3 에서 실측으로 드러난 것 (S4 가 전제로 쓸 것)

**① 한 번의 충격이 볼록 분해 이음매에서 갈라진다 — `contact.js` 를 고쳤다.**
선체는 볼록 조각 여럿의 fixture 라, 포탄이 조각 경계에 떨어지면 planck 이 한 충돌을 post-solve
**두 번**으로 나눠 준다. 실측: 깨끗한 명중은 J=689(19.8 kJ) 하나였는데 이음매 명중은
J=398(6.6 kJ) + J=320(4.3 kJ) 로 갈라져 **각각이 나무 임계 8 kJ 아래**라 아무 일도 안 일어났다.
3발 중 2발이 그냥 통과했다. 이제 **한 물리 스텝의 같은 (선체, 상대) 쌍은 임펄스를 합친다.**
암초 수치는 그대로고(원형 fixture 라 매니폴드가 하나), 연속 마찰만 34회/−77.3% → 18회/−82.3%.
회귀는 명중 **횟수가 아니라 에너지**로 잰다 — 횟수만 보면 갈라진 임펄스가 우연히 둘 다 임계를
넘는 배치에서 통과한다.

**② ★ 탄 간격(속도 × 주기) < 선체 길이 — S4 의 3장 포탑 주기 불변식.**
고정 1.5s 로 뒀더니 3.34 m/s 배에서 탄 간격이 5.0 m 인데 둥근 배 길이는 4.6 m 라,
**20발을 쏘는 동안 한 발도 안 맞았다.** 사선이 실제로 장벽이 되려면 이 부등식이 성립해야 한다.
계획서 §4.3 의 `period 2.4 s` 는 이 기준으로 **다시 봐야 한다** (2.4s × 3 m/s = 7.2 m).

**③ 무장 지연 5.5 m 는 사각지대이고, 배가 그 안에서 방패가 된다.**
`armDelay × speed = 0.1 × 55 = 5.5 m`. 그 안의 선체는 (a) 안 깎이고 (b) 탄을 소멸시킨다.
**S4 맵 불변식: 포탑–항로 최소 이격 > 5.5 m.** 좁히고 싶으면 `armDelay` 를 내린다 —
이 값을 읽는 곳은 `contact.js:94` 하나뿐이고 기존 벤치 중 의존하는 케이스가 없다.

**④ 핸드오프의 「포탑은 자기 탄에 안 맞는다」 벤치는 동어반복이었다.**
포탑 몸체는 `createObstacle` 산물이라 `hull` 이 없고 `contact.js` 가 무조건 먼저 빠진다 —
**총구 오프셋이 0 이어도 통과한다.** 실제 위험은 정반대다: "어떤 접촉에서든 `spent`" 규칙은
무장 여부를 안 보므로, 오프셋이 모자라면 탄이 자기 포탑을 스치며 죽어 **포탑이 아무것도 못 쏜다.**
그래서 판정을 「탄이 총구를 살아서 벗어나는가」로 뒤집었다. 핸드오프가 "총구 오프셋 + 무장 지연
두 겹"이라 쓴 것과 달리 실제로는 **오프셋 한 겹**이다.

**⑤ CCD A/B 는 표적이 동적이어야 성립한다.**
planck 은 `isBullet() || !isDynamic()` 일 때 TOI 를 돌려 **정적 암초는 bullet 없이도 CCD 가
공짜로 걸린다** (정적 벽으로 재니 A/B 가 한 치도 같았다). 포탄이 맞히는 것은 동적 선체이고,
특히 §7.3.4 다단 분리가 만든 얇은 파편이 이 위험에 노출된다.

**⑥ 포탑 스펙은 두 곳에서 소비된다.** `createObstacle`(몸체)과 `createTurrets`(발사).
`radius` 가 갈라지면 총구가 몸체 안으로 들어간다. `createTurrets` 가 `list[i].bodySpec` 을
같이 내주니 **`loadMaps` 는 그것을 그대로 `createObstacle` 에 넘길 것** — 스펙을 두 벌로 쪼개지 말 것.

**⑦ 프레임률 독립 회귀의 판별력은 전부 「히치」에서 나온다.**
버그판을 일부러 만들어 재 봤다 — 균일 50 vs 50 · 2배속 50 vs 50 · **히치 50 vs 258**.
배수 변형만으로는 버그판이 그대로 통과한다. `advance(0.5)` 가 `world.js` 의 0.25 클램프 +
잔여 폐기를 때려 렌더 0.5s 대 시뮬 0.083s 로 시계를 6배 갈라 놓는 것이 유일한 장치다.

**⑧ 포탄은 `view.px()` 로 그리면 안 된다.** 하니스의 다른 원 그리기는 전부 화면 고정 크기지만
포탄만은 **콜라이더 크기가 곧 게임플레이 정보**다. 보이는 크기와 실제 크기가 줌에 따라 갈라지면
아슬아슬한 회피가 거짓말이 된다.

**⑨ 입사각 감쇠는 이제 재질이 정한다 — `MATERIALS[m].deflection`.**
법선 임펄스는 그 자체로 `E_총 × cos²(입사각)` 이라, 노브가 없으면 **모든 재질이 경사 장갑을
공짜로 얻는다**(나무배도 45°에서 절반을 튕겨 냈다). 흘려보낸 접선분을 재질에 따라 되돌려 준다.
발사체만 `strikeEnergy` 를 들고 다녀서 `E_총` 이 정확하다 — 암초·선체끼리는 모르므로 법선분 그대로.

| 재질 | deflection | 정타 → 45° | 실효 차단각 |
|---|---|---|---|
| 나무 | 0.35 | 0.547 → 0.427 m (78%) | **없음 — 어느 각도에서도 뚫린다** |
| 철 | 1.0 | 0.158 → **무해** | 약 19° |

**정타는 한 치도 안 변한다**(법선분이 곧 총 에너지라 되돌려 줄 접선분이 0). 벤치가 그 무해성을
직접 잰다 — 안 그러면 §D3② 암초 밸런스가 통째로 흔들린다.
S4 에서 3장을 만들 때 이게 **철배를 고를 이유**다: 비스듬히 모는 것이 곧 방어가 된다.

> ⚠ 철의 실효 차단각을 정하는 것은 `impactThreshold`(24°)가 아니라 **`minCarveRadius` 0.12**(19°)다.
> 그건 성능 가드지 밸런스 노브가 아니고, `params.js` 주석이 §7.4 "관통 어려움"을 표현하는 항은
> **`maxCarveRadius` 캡 하나뿐**이라고 못박아 뒀는데 포탄은 그 캡(0.30)에 닿지도 않는다(정타 0.158).
> 암초 충돌에서는 캡이 제대로 작동한다. **S4 밸런싱에서 볼 것.**

**⑩ 포신 충전 표시가 조준 없는 포탑을 퍼즐로 만드는 유일한 장치다.**
포탑이 표적을 안 쫓으므로 플레이어가 할 일은 "타이밍을 읽고 지나가기"뿐이다. 충전이 안 보이면
포탑은 퍼즐이 아니라 무작위 피해다. `turrets.charge(i, now)` 가 그 값을 낸다.
