// 대사(스토리 씬) 엔진.
// runDialogue(lines) — 한 줄씩 타자기 효과로 출력, 클릭하면 다음으로. 끝나면 resolve.
// line: { speaker: '피기', visual: '🐷', text: '...', image?: dataUrl, imageCls?: 'broken' }

const TYPE_SPEED_MS = 22;

let els = null;
let clickHandler = null;

function ensureEls() {
  if (els) return;
  els = {
    screen: document.querySelector('#screen-story'),
    visual: document.querySelector('#story-visual'),
    name: document.querySelector('#story-name'),
    text: document.querySelector('#story-text'),
  };
}

export function runDialogue(lines) {
  ensureEls();
  return new Promise((resolve) => {
    let idx = -1;
    let typingId = null;
    let fullText = '';

    const showLine = (line) => {
      els.name.textContent = line.speaker || '';
      els.name.style.visibility = line.speaker ? 'visible' : 'hidden';

      if (line.image) {
        els.visual.innerHTML = '';
        const img = document.createElement('img');
        img.src = line.image;
        img.className = `story-img ${line.imageCls || ''}`;
        els.visual.appendChild(img);
      } else {
        els.visual.textContent = line.visual || '🌊';
      }

      fullText = line.text;
      els.text.textContent = '';
      let i = 0;
      clearInterval(typingId);
      typingId = setInterval(() => {
        i += 1;
        els.text.textContent = fullText.slice(0, i);
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
        els.screen.removeEventListener('click', clickHandler);
        resolve();
        return;
      }
      showLine(lines[idx]);
    };

    clickHandler = advance;
    els.screen.addEventListener('click', clickHandler);

    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    els.screen.classList.add('active');
    advance(); // 첫 줄 표시
  });
}
