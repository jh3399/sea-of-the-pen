// 그림 판정(피기의 감정) 모듈.
// v0: 스트로크 통계 기반 모의 판정 — AI API 없이 코어 루프를 검증하기 위한 것.
// v1에서 realJudge가 멀티모달 AI(서버리스 프록시 경유)를 호출해 아래와 같은 JSON을 받는다:
//   { label: '검', element: 'weapon'|'water'|'fire'|'light'|'none', score: 0~100, comment: '피기의 한마디' }

const MOCK_COMMENTS = [
  '오... 이건 꽤 진심이 담겼는데?',
  '음, 뭘 그린 건지는 모르겠지만 기세는 좋아!',
  '선이 살아있네! 가라!',
  '이 정도면 통할지도?',
];

export async function mockJudge(stats /*, pngDataUrl */) {
  // 판정 연출을 위한 약간의 지연 (실제 API 호출 흉내)
  await new Promise((r) => setTimeout(r, 600));

  // 성의 점수: 획 수 + 선 길이 + 캔버스 사용 면적으로 대략 추정
  const lengthScore = Math.min(1, stats.totalLength / 1500);
  const coverageScore = Math.min(1, stats.coverage / 0.25);
  const strokeScore = Math.min(1, stats.strokeCount / 6);
  const score = Math.round((lengthScore * 0.5 + coverageScore * 0.3 + strokeScore * 0.2) * 100);

  return {
    label: '수수께끼의 그림',
    element: 'none',
    score,
    comment: MOCK_COMMENTS[Math.floor(score / 26) % MOCK_COMMENTS.length],
  };
}

// 속성 상성 배율 (보스별 약점은 main.js의 보스 정의에서 지정)
export function elementMultiplier(element, bossWeakness) {
  if (element === bossWeakness) return 2.0;
  if (element === 'none') return 1.0;
  return 0.8;
}

export function calcDamage(judgeResult, bossWeakness) {
  const base = 10 + judgeResult.score * 0.9; // 10~100
  return Math.round(base * elementMultiplier(judgeResult.element, bossWeakness));
}
