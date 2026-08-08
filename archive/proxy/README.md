# 판정 프록시 배포 가이드 (Cloudflare Workers)

GitHub Pages는 정적 호스팅이라 Gemini API 키를 코드에 넣으면 그대로 노출된다.
이 Worker가 키를 서버 쪽에 숨기고 판정 요청만 중계한다. 무료 티어(일 10만 요청)로 충분.

## 1회만 하면 되는 배포 절차

```bash
# 1) Cloudflare 계정 필요 (무료). wrangler 로그인 — 브라우저가 열림
npx wrangler login

# 2) 이 폴더(proxy/)에서 API 키를 시크릿으로 등록 (붙여넣기 프롬프트가 뜸)
npx wrangler secret put GEMINI_API_KEY

# 3) 배포
npx wrangler deploy
```

배포가 끝나면 `https://draw-the-sea-judge.<계정명>.workers.dev` 형태의 URL이 출력된다.
그 URL을 **`src/config.js`의 `JUDGE_ENDPOINT`**에 넣으면 게임이 AI 판정을 쓰기 시작한다.

## 프록시 없이 로컬에서 먼저 테스트하기

게임을 localhost로 띄운 뒤, 브라우저 개발자도구(F12) 콘솔에서:

```js
localStorage.setItem('DTS_GEMINI_KEY', '<발급받은 키>')
```

새로고침하면 프록시 없이 브라우저가 직접 Gemini를 호출한다 (개발 전용 — 배포 빌드에선 금지).
끄려면 `localStorage.removeItem('DTS_GEMINI_KEY')`.

## 동작 확인

```bash
curl -X POST https://<worker URL> -H "Content-Type: application/json" -d "{\"image\":\"<base64 PNG>\",\"situation\":\"테스트\"}"
```

응답: `{"label":"검","element":"weapon","score":72,"comment":"..."}`
