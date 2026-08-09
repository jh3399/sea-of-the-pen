# 컷신 배경 그림 — 출처와 재생성 방법

제출 요건의 "AI 활용 기술 문서"가 **에셋 출처**를 요구하므로 여기 적어 둔다.
타이틀 배경은 `assets/menu/README.md` 에 따로 있다.

## 출처

| 파일 | 무엇 | 출처 |
|---|---|---|
| `source/sickroom-1672.png` | 원본 1672×941 | **ChatGPT 생성**, 2026-08-09 |
| `sickroom.png` | 배포용 418×235 | 원본을 `scripts/bg-snap.mjs` 로 가공 |

> ⚠ 생성형 AI 산출물이다. 게임 **안**에는 AI 가 없고(설계 원칙) AI 는 개발 과정에만
> 쓴다는 것과 별개로, 이 그림은 AI 가 만들었으므로 기술 문서에 그렇게 적어야 한다.

## 재생성

```bash
node scripts/bg-snap.mjs assets/scene/source/sickroom-1672.png --grid 418 --out assets/scene/sickroom.png
```

`--grid 418` 은 임의값이 아니라 **원본이 그려진 격자**다 (1672 ÷ 418 = 도트 4.00px).
타이틀 배경과 같은 격자라 두 그림의 도트 크기가 저절로 맞는다.
모르는 원본이 들어오면 `--probe` 로 후보를 훑는다.

## 화면에서

`src/scene/bgphotos.js` 가 씬 키 → 그림을 잇고, `src/scene/pixelbg.js` 의 `setScene()` 이
`#bg-photo` 레이어의 src 와 페이드를 관리한다.

**절차적 배경(`bgscenes.js` 의 같은 이름 씬)을 지우지 않는다.** 두 가지 이유다:

1. 그림이 못 뜨면(파일 누락·네트워크 실패) 아래 캔버스가 그대로 배경 노릇을 한다.
2. 씬 전환 크로스페이드는 캔버스 쪽이 계속 담당하므로, 그림 씬 ↔ 절차 씬 사이가 끊기지 않는다.

⚠ `#bg-photo` 의 CSS 페이드 시간은 `pixelbg.js` 의 `FADE_MS` 와 **같아야 한다.**
다르면 전환 중간에 두 배경이 겹쳐 보인다.

⚠ 경로를 문자열로 적지 말고 `import` 로 가져올 것. Vite 가 해시를 붙여 번들에 넣어 준다 —
문자열은 dev 에서만 되고 배포에서 404 난다 (`base` 가 `/sea-of-the-pen/`).
