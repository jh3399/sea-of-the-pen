<div align="center">

<img src="assets/logo/title.png" alt="Sea of the Pen — 그리는 자의 바다" width="280" />

# 그리는 자의 바다
### Sea of the Pen

**그린 선체가 그대로 물리량이 되는 2D 탑뷰 물리 퍼즐 항해 게임**

NAN 2026 — NHN Game × AI 해커톤 사전 과제 (3인 팀, 바이브코딩)
**팀원** — 김정현 · 이승형 · 박진명

[![Play on GitHub Pages](https://img.shields.io/badge/▶_지금_플레이-jh3399.github.io/sea--of--the--pen-2f7a4a?style=for-the-badge)](https://jh3399.github.io/sea-of-the-pen/)
[![Watch on YouTube](https://img.shields.io/badge/▶_플레이_영상-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/0-4icTv-z3k)

</div>

---

## 이 게임은

동생이 고칠 수 없는 병에 걸렸다. 하나 남은 길은 바다 밑에 산다는 **불가사리**의 정수뿐이고, 거기까지 가려면 바다를 셋 건너야 한다. 배를 살 돈도, 빌릴 신용도 없다. **그리는 수밖에 없다.**

그리고 이 바다에서는 **그린 대로 뜨고, 그린 대로 가라앉는다.**

캔버스에 자유롭게 그린 선체 폴리곤이 그대로 면적·무게중심·저항이 되어 배의 조작감을 만든다. 재질(나무·철)과 환경 필드(바람·해류·온도·어둠)가 만나는 지점마다 규칙표 하나에서 해법이 창발한다 — **맵마다 특수 코드는 0줄.**

## 플레이

| | |
|---|---|
| ▶ **지금 바로** | **[jh3399.github.io/sea-of-the-pen](https://jh3399.github.io/sea-of-the-pen/)** |
| ▶ **플레이 영상** | **[youtu.be/0-4icTv-z3k](https://youtu.be/0-4icTv-z3k)** |

## 스크린샷

<div align="center">
<img src="assets/logo/title.preview.png" alt="타이틀 화면" width="720" />
</div>

## 조작

| 키 | 동작 |
|---|---|
| `↑` `↓` `←` `→` | 좌우 노 젓기 · 제자리/넓은 선회 |
| `Q` / `E` | 키(방향타) — 좌현 / 우현 |
| `Space` | 닻 |
| `A` `S` `D` `F` `G` `H` | 부착 장치(부스터·대포 등) 트리거 |
| `Tab` | 해도·장비 |
| `Esc` | 설정 |
| 마우스 휠 (설계 화면) | 부착 방향 조정 |

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:5210/sea-of-the-pen/
npm run bench    # 판정 벤치 (헤드리스 계측, 250건 이상)
npm run build    # dist/ — GitHub Pages 배포 산출물
```

## 기술 스택

- **물리** — [planck](https://github.com/piqnt/planck.js) 1.5 (Box2D 2.4 순수 JS 포트)
- **폴리곤 불리언** — [clipper2-js](https://github.com/Julian-Tow/clipper2-js) (자기교차 정리·파손 차감)
- **볼록 분해** — [poly-decomp](https://github.com/schteppe/poly-decomp.js) / [earcut](https://github.com/mapbox/earcut)
- **빌드** — [Vite](https://vitejs.dev)
- 배경음악·효과음은 전부 WebAudio로 그 자리에서 합성한다 (외부 음원 파일 없음)
- 컷신·엔딩 배경 일부는 생성형 AI(ChatGPT)로 만들고 프로젝트의 픽셀 규칙에 맞춰 가공했다 — 출처는 [`assets/scene/README.md`](assets/scene/README.md)

## 구조

```
index.html      메인 메뉴 + 인트로 컷신 (배포 루트)
draw.html       배 그리기 (스케치북)
sail.html       항해
harness.html    엔지니어링 하니스 (디버그용)

src/
  geom/     순수 폴리곤 기하 (면적·모멘트·주축)
  hull/     손그림 → 선체 폴리곤 변환
  items/    부착 장치(노·돛·키·부스터·대포) 카탈로그
  field/    환경 벡터·스칼라 필드 샘플러
  game/     진행·목표·보스·해적 로직
  rules/    재질 × 필드 → 효과 규칙 엔진
  physics/  planck 어댑터, 유체저항, 장치 힘
  damage/   파손 지오메트리 (충격 → 폴리곤 차감)
  render/   카메라
  draw/     그리기 화면
  sail/     항해 화면 (픽셀 렌더)
  menu/     메인 메뉴·컷신
  story/    대사 엔진 + 전문
  scene/    배경 씬(절차적 + AI 원화)·스프라이트
  audio/    칩튠 BGM·SFX (WebAudio 코드 작곡)

scripts/bench.mjs   판정 벤치 — CI에서도 실행
docs/               design_doc.md · dev_plan.md · STORY.md · SCRIPT.md
archive/            구 프로토타입 (참고용, 빌드 제외)
```

자세한 설계 원칙과 진행 기록은 [`CLAUDE.md`](CLAUDE.md) · [`docs/design_doc.md`](docs/design_doc.md) 참고.

## 제출물

1. GitHub Pages 웹 빌드 + 전체 소스 (본 저장소, 커밋 기록 유지)
2. 플레이 영상 — [youtu.be/0-4icTv-z3k](https://youtu.be/0-4icTv-z3k)
3. 게임 소개 PDF
4. AI 활용 기술 문서 PDF

## 라이선스 · 크레딧

- 폰트: NeoDunggeunmo (SIL Open Font License)
- AI 생성 배경 원화 출처: [`assets/scene/README.md`](assets/scene/README.md)
</content>
