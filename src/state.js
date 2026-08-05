// 게임 상태 + 저장/불러오기 (localStorage).
// 진행도(조각·클리어·아이템), 배(그림), 바다 위치, 설정(음량)을 한 객체로 관리한다.

const KEY = 'sotp_save_v1';

const defaults = () => ({
  v: 1,
  settings: { bgm: 0.6, sfx: 0.8 },
  flags: {},              // introDone 등
  pieces: [],             // 모은 도안 조각 id 목록 (world.js PIECES 참고)
  items: [],              // [{ id, icon, name, desc }]
  cleared: [],            // 클리어한 섬 key 목록
  ship: null,             // { png, pixel, maxHp, quality }
  pen: 'none',            // 'none'(실체 안 됨) | 'wood' | 'iron' | 'gold'
  emblem: null,           // 나만의 마크 (돛에 새긴다)
  wish: null,             // 성수에 넣은 소원 종이 — 게임은 내용을 읽지 않는다
  sea: null,              // { x, y } — 바다 위 마지막 위치
});

export const state = defaults();

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.v !== 1) return false;
    Object.assign(state, defaults(), data);
    return true;
  } catch {
    return false;
  }
}

export function saveGame() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* 저장 공간 부족 등 — 게임은 계속 */ }
}

export function resetGame() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  Object.assign(state, defaults());
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function addPiece(id) {
  if (!state.pieces.includes(id)) state.pieces.push(id);
  saveGame();
}

export function addItem(item) {
  if (!state.items.some((i) => i.id === item.id)) state.items.push(item);
  saveGame();
}

export function markCleared(islandKey) {
  if (!state.cleared.includes(islandKey)) state.cleared.push(islandKey);
  saveGame();
}
