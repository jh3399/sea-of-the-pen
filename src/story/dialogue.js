// 대사 엔진 — 화면 위에 뜨는 오버레이(#dialogue-layer). 어느 화면에서든 쓸 수 있다.
//
// archive/src/dialogue.js 에서 파생했다. 바뀐 것 셋:
//   ① 폐기된 "펜 맞대기"(penscene.js) 분기를 들어냈다 — 구 기획 전용 개념이다.
//   ② 초상화 배율을 line.spriteScale 로 열었다 (아카이브는 4 하드코딩).
//   ③ skipDialogue() — 컷신 통째로 건너뛰기. 진행 중인 run 을 정리하고 resolve 시킨다.
//
// runDialogue(lines) — 한 줄씩 타자기 효과, 클릭/Space/Enter로 진행. 끝나면 resolve.
// line: { speaker, sprite?, spriteScale?, visual?, image?, imageCls?, bg?, text }
// - sprite → 대화창 왼쪽 초상화 (스타듀밸리식). 없으면 이름표만 나온다
// - image/visual → 화면 중앙 큰 비주얼 (컷씬용)
// - bg → 그 줄에서 배경 씬 크로스페이드 (scene/bgscenes.js 키)

import { spriteCanvas } from '../scene/sprites.js';
import { setScene } from '../scene/pixelbg.js';

const TYPE_SPEED_MS = 22;
const PORTRAIT_SCALE = 4;

let els = null;
let blipFn = null; // 타자기 효과음 (호출부가 audio.sfx 를 꽂아준다)
let activeSkip = null; // 진행 중인 runDialogue 를 끝내는 함수. 없으면 null

export function setDialogueBlip(fn) {
  blipFn = fn;
}

function ensureEls() {
  if (els) return;
  els = {
    layer: document.querySelector('#dialogue-layer'),
    visual: document.querySelector('#dlg-visual'),
    portrait: document.querySelector('#dlg-portrait'),
    name: document.querySelector('#dlg-name'),
    text: document.querySelector('#dlg-text'),
  };
}

export function runDialogue(lines) {
  ensureEls();
  return new Promise((resolve) => {
    let idx = -1;
    let typingId = null;
    let fullText = '';

    const showLine = (line) => {
      if (line.bg) setScene(line.bg);
      els.name.textContent = line.speaker || '';
      els.name.style.visibility = line.speaker ? 'visible' : 'hidden';

      // 초상화 (대화창 안). 스프라이트를 안 준 화자는 이름표만 나온다 —
      // 인트로의 동생이 그렇다. 얼굴이 없는 것이 연출이다.
      els.portrait.innerHTML = '';
      if (line.sprite) {
        const c = spriteCanvas(line.sprite, line.spriteScale ?? PORTRAIT_SCALE);
        if (c) els.portrait.appendChild(c);
        els.portrait.hidden = !c;
      } else {
        els.portrait.hidden = true;
      }

      // 중앙 비주얼 (컷씬용 이미지/이모지)
      els.visual.innerHTML = '';
      if (line.image) {
        const img = document.createElement('img');
        img.src = line.image;
        img.className = `story-img pixel ${line.imageCls || ''}`;
        els.visual.appendChild(img);
      } else if (line.visual) {
        els.visual.textContent = line.visual;
      }

      fullText = line.text;
      els.text.textContent = '';
      let i = 0;
      clearInterval(typingId);
      typingId = setInterval(() => {
        i += 1;
        els.text.textContent = fullText.slice(0, i);
        if (i % 3 === 1 && blipFn) blipFn();
        if (i >= fullText.length) clearInterval(typingId);
      }, TYPE_SPEED_MS);
    };

    const advance = () => {
      // 타이핑 중이면 먼저 전체 문장 표시
      if (els.text.textContent.length < fullText.length) {
        clearInterval(typingId);
        els.text.textContent = fullText;
        return;
      }
      idx += 1;
      if (idx >= lines.length) {
        finish();
        return;
      }
      showLine(lines[idx]);
    };

    const onClick = () => advance();
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        advance();
      }
    };

    const cleanup = () => {
      clearInterval(typingId);
      els.layer.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      els.layer.hidden = true;
      activeSkip = null;
    };

    const finish = () => {
      cleanup();
      resolve();
    };

    activeSkip = finish;
    els.layer.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    els.layer.hidden = false;
    advance(); // 첫 줄 표시
  });
}

/**
 * 진행 중인 대사를 즉시 끝낸다 (건너뛰기). 남은 줄은 재생하지 않고 그대로 resolve 하므로,
 * 호출부의 `await runDialogue(...)` 다음 줄이 바로 이어진다 — 비트를 여러 개 이어 붙였다면
 * 각 비트마다 한 번씩 불러야 전부 건너뛴다.
 * @returns {boolean} 실제로 끝낸 게 있으면 true
 */
export function skipDialogue() {
  if (!activeSkip) return false;
  activeSkip();
  return true;
}

export function isDialogueOpen() {
  ensureEls();
  return !els.layer.hidden;
}
