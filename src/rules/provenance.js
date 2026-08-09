// "이 파괴는 **어느 필드** 때문인가" — 규칙표에게 되묻는다.
//
// `engine.js` 는 규칙을 하나도 모르는 해석기이고, 이 파일도 규칙을 모른다. 아는 것은
// 규칙표의 **모양**뿐이다: 조건은 필드를 직접 가리키거나(`{field:'temperature', gte:250}`),
// 상태를 가리킨다(`{state:'burning', elapsed:4}`). 후자면 그 상태를 켠 규칙으로 한 단계
// 거슬러 올라가면 필드가 나온다.
//
// 이 한 단계가 필요한 이유는 §7 이 "어느 쪽이 탔는가"를 알아야 하기 때문이다. 파괴를 낸
// 규칙(`wood-burns-down`)에는 필드가 없고, 불을 붙인 규칙(`wood-ignites`)에만 있다.
// 코드가 'temperature' 를 알면 안 되므로 이름은 반드시 데이터에서 와야 한다.

/**
 * 이 규칙이 (직접 또는 상태를 통해) 딛고 선 필드 이름.
 *
 * @param {Array<object>} rules loadRules 결과
 * @param {string} ruleId 파괴를 낸 규칙의 id
 * @returns {string|null} 필드 이름. 상태를 켠 규칙도 필드가 없으면 null (호출자가 폴백한다)
 */
export function fieldBehind(rules, ruleId) {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return null;
  if (rule.when.field) return rule.when.field;
  if (!rule.when.state) return null;

  // 그 상태를 켜는 규칙들 중 필드를 가진 첫 번째. 같은 상태를 여러 필드가 켤 수 있지만
  // (젖음은 물웅덩이만, 불은 온도만) 하나로 좁히지 않고 **먼저 선언된 것**을 쓴다 —
  // 우선순위를 코드가 정하면 그 순간 규칙표 밖에 규칙이 하나 생긴다.
  const source = rules.find((r) => r.effect?.set === rule.when.state && r.when.field);
  return source?.when.field ?? null;
}
