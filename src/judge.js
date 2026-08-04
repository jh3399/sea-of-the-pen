// 그림 판정(피기의 감정) 모듈.
// 우선순위: 프록시(JUDGE_ENDPOINT) → 로컬 개발 키(직접 Gemini 호출) → mock(스트로크 통계).
// 판정 결과 형식:
//   { label: '검', element: 'weapon'|'fire'|'water'|'ice'|'light'|'shield'|'wind'|'none',
//     score: 0~100, comment: '피기의 한마디', source: 'ai'|'mock' }

import { CONFIG, devKey } from './config.js';

// situation: 지금 뭘 그리라고 했는지 (판정 문맥). 예: '보스전 — 무기를 그리라고 요청함'
function buildPrompt(situation) {
  return `너는 게임 '그리는 자의 바다'의 그림 감정 정령 '피기'다.
플레이어(대부분 그림 초보)가 캔버스에 그린 낙서 이미지를 보고, 반드시 아래 JSON 형식으로만 답하라.
{"label":"<그린 것의 이름, 한국어 명사 1~6글자>","element":"<weapon|fire|water|ice|light|shield|wind|none>","score":<0~100 정수>,"comment":"<피기의 반응 한 문장, 반말, 유쾌하게>"}

규칙:
- 낙서 수준이어도 최대한 관대하게 무엇인지 추측하라. 도저히 모르겠으면 label은 "낙서", element는 "none".
- element 분류 기준: 칼·창·활·도끼·망치 등 무기→weapon / 불꽃·폭발·용암→fire / 물·파도·비·물방울→water / 얼음·눈·고드름→ice / 태양·빛·등대·번개·별→light / 방패·벽·갑옷→shield / 바람·회오리·구름→wind / 그 외(배·동물·사람·음식 등)→none
- score 기준: 무엇인지 알아볼 수 있는 정도 50% + 정성·디테일 30% + 창의성 20%. 관대하게 주되 빈 낙서 수준이면 20점 이하.
- 지금 상황: ${situation}
- JSON 외의 텍스트, 마크다운 코드펜스는 절대 출력하지 마라.`;
}

const VALID_ELEMENTS = ['weapon', 'fire', 'water', 'ice', 'light', 'shield', 'wind', 'none'];

function parseAiJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const obj = JSON.parse(cleaned);
  return {
    label: String(obj.label || '낙서').slice(0, 12),
    element: VALID_ELEMENTS.includes(obj.element) ? obj.element : 'none',
    score: Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0))),
    comment: String(obj.comment || '오... 이건 뭐지?').slice(0, 80),
    source: 'ai',
  };
}

function pngToBase64(pngDataUrl) {
  return pngDataUrl.split(',')[1];
}

// --- 경로 1: 프록시 (배포용) ---
async function proxyJudge(pngDataUrl, situation) {
  const res = await fetch(CONFIG.JUDGE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: pngToBase64(pngDataUrl), situation }),
  });
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  const data = await res.json();
  return parseAiJson(typeof data === 'string' ? data : JSON.stringify(data));
}

// --- 경로 2: 로컬 개발 — Gemini 직접 호출 ---
async function directGeminiJudge(pngDataUrl, situation, key) {
  let lastErr = null;
  for (const model of CONFIG.GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: buildPrompt(situation) },
                { inline_data: { mime_type: 'image/png', data: pngToBase64(pngDataUrl) } },
              ],
            }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.6 },
          }),
        },
      );
      if (res.status === 404) continue; // 없는 모델이면 다음 후보로
      if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('gemini: empty response');
      return parseAiJson(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('gemini: no model available');
}

// --- 경로 3: mock (API 없이 코어 루프 검증용) ---
const MOCK_COMMENTS = [
  '음... 뭘 그린 건지 모르겠지만 기세는 좋아!',
  '오, 선이 살아있는데?',
  '이 정도면 통할지도!',
  '진심이 느껴져! 가라!',
];

export async function mockJudge(stats) {
  await new Promise((r) => setTimeout(r, 600));
  const lengthScore = Math.min(1, stats.totalLength / 1500);
  const coverageScore = Math.min(1, stats.coverage / 0.25);
  const strokeScore = Math.min(1, stats.strokeCount / 6);
  const score = Math.round((lengthScore * 0.5 + coverageScore * 0.3 + strokeScore * 0.2) * 100);
  return {
    label: '수수께끼의 그림',
    element: 'none',
    score,
    comment: MOCK_COMMENTS[Math.floor(score / 26) % MOCK_COMMENTS.length],
    source: 'mock',
  };
}

// --- 공개 API: 경로 자동 선택 ---
export async function judge(stats, pngDataUrl, situation) {
  try {
    if (CONFIG.JUDGE_ENDPOINT) return await proxyJudge(pngDataUrl, situation);
    const key = devKey();
    if (key) return await directGeminiJudge(pngDataUrl, situation, key);
  } catch (e) {
    console.warn('[judge] AI 판정 실패, mock으로 폴백:', e);
  }
  return mockJudge(stats);
}

// --- 데미지 계산 ---
export function elementMultiplier(element, weaknesses, resists = []) {
  if (weaknesses.includes(element)) return 2.0;
  if (resists.includes(element)) return 0; // 저항 속성: 데미지 0 (예: 불뱀에게 불)
  if (element === 'none') return 1.0;
  return 0.8;
}

export function calcDamage(judgeResult, boss) {
  const base = 10 + judgeResult.score * 0.9; // 10~100
  return Math.round(base * elementMultiplier(judgeResult.element, boss.weaknesses, boss.resists));
}
