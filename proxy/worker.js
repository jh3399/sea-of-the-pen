// Cloudflare Worker — 그림 판정 프록시.
// 역할: GitHub Pages(정적 사이트)에서 Gemini API 키를 숨긴 채 판정을 호출하기 위한 중계 서버.
// 배포 방법은 proxy/README.md 참고. 키는 `wrangler secret put GEMINI_API_KEY`로 등록 (코드/저장소에 절대 넣지 않음).

const GEMINI_MODELS = ['gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    const { image, situation } = body;
    if (!image || typeof image !== 'string' || image.length > 2_000_000) {
      return json({ error: 'invalid image' }, 400);
    }

    let lastErr = 'no model available';
    for (const model of GEMINI_MODELS) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: buildPrompt(String(situation || '자유 드로잉').slice(0, 200)) },
                { inline_data: { mime_type: 'image/png', data: image } },
              ],
            }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.6 },
          }),
        },
      );
      if (res.status === 404) continue;
      if (!res.ok) {
        lastErr = `gemini ${res.status}`;
        if (res.status === 429) continue; // 한도 초과 시 다음 모델로 분산
        break;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { lastErr = 'empty response'; continue; }
      return new Response(text, {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
    return json({ error: lastErr }, 502);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
