// 印刷ページ: 保存済みのコンテンツを、実寸で用紙に面付けして表示する。
import { CARD_SIZE_MM, PRINT_LAYOUT } from './config.js';
import { loadContent } from './store.js';
import { buildIncomingMap } from './graph-utils.js';
import { applyCardGeometry, renderCardFront, renderCardBack } from './card-render.js';

const modeSelect = document.getElementById('opt-mode');
const mirrorCheckbox = document.getElementById('opt-mirror');
const printButton = document.getElementById('btn-print');
const note = document.getElementById('print-note');
const sheetsElement = document.getElementById('sheets');

const { columns, rows, pageWidthMm, pageHeightMm } = PRINT_LAYOUT;
const cardsPerPage = columns * rows;

applyCardGeometry();
const root = document.documentElement;
root.style.setProperty('--print-columns', String(columns));
root.style.setProperty('--page-width-mm', `${pageWidthMm}mm`);
root.style.setProperty('--page-height-mm', `${pageHeightMm}mm`);

const pageStyle = document.createElement('style');
pageStyle.textContent = `@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }`;
document.head.append(pageStyle);

const { content } = loadContent();
const incoming = buildIncomingMap(content.cards);

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

// 両面印刷用: 各行を左右反転する。行末が欠けている場合は空きを入れてから反転する。
function mirrorRows(pageCards) {
  const result = [];
  for (let start = 0; start < cardsPerPage; start += columns) {
    const row = pageCards.slice(start, start + columns);
    while (row.length < columns) row.push(null);
    result.push(...row.reverse());
  }
  return result;
}

function buildSheet(pageCards, face, caption) {
  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  const label = document.createElement('div');
  label.className = 'sheet-caption';
  label.textContent = caption;
  sheet.append(label);

  // null は反転配置で生じる空き。grid の配置が崩れないよう空のスロットで埋める
  for (const card of pageCards) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (card !== null) {
      slot.append(face === 'front' ? renderCardFront(card) : renderCardBack(card, incoming.get(card.no) ?? []));
    } else {
      slot.style.boxShadow = 'none';
    }
    sheet.append(slot);
  }
  return sheet;
}

function render() {
  const mode = modeSelect.value;
  const mirror = mirrorCheckbox.checked;
  const pages = chunk(content.cards, cardsPerPage);
  const sheets = [];

  pages.forEach((pageCards, pageIndex) => {
    const pageLabel = `${pageIndex + 1}/${pages.length}`;
    const first = pageCards[0].no;
    const last = pageCards[pageCards.length - 1].no;
    if (mode !== 'back') sheets.push(buildSheet(pageCards, 'front', `表面 ${pageLabel}（No.${first}〜${last}）`));
    if (mode !== 'front') {
      const backCards = mirror ? mirrorRows(pageCards) : pageCards;
      sheets.push(buildSheet(backCards, 'back', `裏面 ${pageLabel}（No.${first}〜${last}）${mirror ? '・左右反転' : ''}`));
    }
  });
  sheetsElement.replaceChildren(...sheets);

  const fits = columns * CARD_SIZE_MM.width <= pageWidthMm && rows * CARD_SIZE_MM.height <= pageHeightMm;
  note.classList.toggle('is-error', !fits);
  note.textContent = fits
    ? `「${content.title}」 ${CARD_SIZE_MM.width}×${CARD_SIZE_MM.height}mm のカードを ${columns}列×${rows}行 で面付けしています。印刷時は「倍率100%（実際のサイズ）」「背景のグラフィックを印刷」を有効にしてください。`
    : '設定のカード寸法×面付け数が用紙に収まりません（js/config.js の CARD_SIZE_MM / PRINT_LAYOUT を確認してください）。';
}

modeSelect.addEventListener('change', render);
mirrorCheckbox.addEventListener('change', render);
printButton.addEventListener('click', () => window.print());
render();
