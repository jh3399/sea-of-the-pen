// 판정(AI) 설정
export const CONFIG = {
  // Cloudflare Worker 프록시 배포 후 여기에 URL을 넣는다. (예: 'https://draw-the-sea-judge.xxx.workers.dev')
  // 비어 있으면: 로컬 개발 키(localStorage) → 그것도 없으면 mock 판정으로 폴백.
  JUDGE_ENDPOINT: '',

  // 무료 티어 모델 우선순위 (404 시 다음 모델로 폴백)
  GEMINI_MODELS: ['gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

// 로컬 개발 전용: 브라우저 콘솔에서 localStorage.setItem('DTS_GEMINI_KEY', '<발급받은 키>')
// ⚠️ 배포 빌드에서는 절대 사용 금지 — 키가 노출된다. 배포는 반드시 프록시(JUDGE_ENDPOINT) 경유.
export function devKey() {
  try { return localStorage.getItem('DTS_GEMINI_KEY') || ''; } catch { return ''; }
}
