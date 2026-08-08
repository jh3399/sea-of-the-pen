// 대사 엔진 — 화면 위에 뜨는 오버레이(#dialogue-layer). 어느 화면에서든 쓸 수 있다.
// runDialogue(lines) — 한 줄씩 타자기 효과, 클릭/Space/Enter로 진행. 끝나면 resolve.
// line: { speaker, sprite?, visual?, image?, imageCls?, bg?, pen?, text }
// - sprite  → 대화창 왼쪽 초상화 (스타듀밸리식)
// - image/visual → 화면 중앙 큰 비주얼 (컷씬용: 그린 배 등)
// - bg → 그 줄에서 배경 씬 크로스페이드 (bgscenes.js 키)
// - pen → 화면 중앙에 펜 맞대기 컷 (penscene.js). 이 줄에서만 뜨고 다음 줄에 사라진다

import { spriteCanvas } from './sprites.js';
import { penTouchCanvas } from './penscene.js';
import { setScene } from './pixelbg.js';

const TYPE_SPEED_MS = 22;

let els = null;
let blipFn = null;   // 타자기 효과음 (main.js가 audio.sfx를 꽂아준다)

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
    let penCanvas = null;

    // 펜 컷은 requestAnimationFrame으로 계속 도니까 반드시 멈춰준다
    const stopPen = () => {
      if (penCanvas) penCanvas.stop();
      penCanvas = null;
    };

    const showLine = (line) => {
      if (line.bg) setScene(line.bg);
      els.name.textContent = line.speaker || '';
      els.name.style.visibility = line.speaker ? 'visible' : 'hidden';

      // 초상화 (대화창 안)
      els.portrait.innerHTML = '';
      if (line.sprite) {
        const c = spriteCanvas(line.sprite, 4);
        if (c) els.portrait.appendChild(c);
        els.portrait.hidden = !c;
      } else {
        els.portrait.hidden = true;
      }

      // 중앙 비주얼 (컷씬용 이미지/이모지)
      stopPen();
      els.visual.innerHTML = '';
      if (line.pen) {
        // 펜 맞대기 — 말하는 쪽이 네일이면 400년 만에 펜을 쥐는 그 컷이다
        penCanvas = penTouchCanvas(line.sprite === 'nail' ? 'nail' : 'seren');
        els.visual.appendChild(penCanvas);
      } else if (line.image) {
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
        cleanup();
        resolve();
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
      stopPen();
      els.layer.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      els.layer.hidden = true;
    };

    els.layer.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    els.layer.hidden = false;
    advance(); // 첫 줄 표시
  });
}

export function isDialogueOpen() {
  ensureEls();
  return !els.layer.hidden;
}
