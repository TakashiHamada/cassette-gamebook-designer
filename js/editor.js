// 編集画面: カード一覧・編集フォーム・ライブプレビュー
import { CARD_COUNT, MAX_CHOICES, CARD_TYPES, BODY_CHAR_GUIDE } from './config.js';
import { createEmptyChoice } from './store.js';
import { buildIncomingMap } from './graph-utils.js';
import { renderCardFront, renderCardBack, findOverflowingParts, CASSETTE_LAYOUT } from './card-render.js';

const SNIPPET_LENGTH = 14;
const TARGET_OPTION_SNIPPET_LENGTH = 10;

function snippetOf(card, length) {
  const text = (card.body || card.label || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bodyLength(card) {
  return card.body.replace(/\s/g, '').length;
}

export function initEditor(app) {
  const listElement = document.getElementById('card-list');
  const formElement = document.getElementById('editor-form');
  const previewElement = document.getElementById('live-preview');
  let formRefs = null;

  const currentCard = () => app.content.cards[app.ui.selectedCardNo - 1];

  // ── 一覧 ──────────────────────────────────
  function renderList() {
    const issueCounts = new Map();
    for (const issue of app.issues) {
      if (issue.cardNo === null || issue.severity === 'info') continue;
      const entry = issueCounts.get(issue.cardNo) ?? { count: 0, hasError: false };
      entry.count += 1;
      entry.hasError ||= issue.severity === 'error';
      issueCounts.set(issue.cardNo, entry);
    }

    const fragment = document.createDocumentFragment();
    for (const card of app.content.cards) {
      const isBlank = !card.label && !card.body && card.choices.length === 0;
      const item = element('button', 'card-list-item');
      item.type = 'button';
      if (card.no === app.ui.selectedCardNo) item.classList.add('is-selected');
      if (isBlank) item.classList.add('is-empty');
      item.append(element('span', 'no', String(card.no)));
      item.append(element('span', 'snippet', snippetOf(card, SNIPPET_LENGTH) || '（未入力）'));

      const tags = element('span', 'tags');
      if (card.cardType === 'deadEnd') tags.append(element('span', 'tag', '↩'));
      if (card.cardType === 'ending') tags.append(element('span', 'tag', '★'));
      const problem = issueCounts.get(card.no);
      if (problem) {
        const tag = element('span', problem.hasError ? 'tag tag-error' : 'tag tag-warning', `⚠${problem.count}`);
        tags.append(tag);
      }
      item.append(tags);
      item.addEventListener('click', () => app.selectCard(card.no));
      fragment.append(item);
    }
    const { scrollTop } = listElement;
    listElement.replaceChildren(fragment);
    listElement.scrollTop = scrollTop;
  }

  function scrollSelectedIntoView() {
    listElement.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }

  // ── フォーム ──────────────────────────────
  function createField(labelText, control, hint, wrapperTag = 'label') {
    const wrapper = element(wrapperTag, 'field');
    wrapper.append(element('span', 'field__label', labelText), control);
    if (hint) wrapper.append(element('p', 'field__hint', hint));
    return wrapper;
  }

  function buildTargetSelect(choice) {
    const select = document.createElement('select');
    const unset = new Option('未設定', '');
    select.append(unset);
    for (const card of app.content.cards) {
      const snippet = snippetOf(card, TARGET_OPTION_SNIPPET_LENGTH);
      select.append(new Option(`${card.no}番${snippet ? `　${snippet}` : ''}`, String(card.no)));
    }
    select.value = choice.target === null ? '' : String(choice.target);
    return select;
  }

  function renderChoices(container, card) {
    container.replaceChildren();
    card.choices.forEach((choice, index) => {
      const row = element('div', 'choice-row');

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = choice.text;
      textInput.placeholder = `選択肢${index + 1}の行動（例: 近くの物を取る）`;
      textInput.addEventListener('input', () => app.edit(() => { choice.text = textInput.value; }));

      const targetSelect = buildTargetSelect(choice);
      targetSelect.addEventListener('change', () => {
        app.edit(() => { choice.target = targetSelect.value === '' ? null : Number(targetSelect.value); });
      });

      const tools = element('div', 'choice-row__tools');
      const hideLabel = element('label');
      const hideCheckbox = document.createElement('input');
      hideCheckbox.type = 'checkbox';
      hideCheckbox.checked = choice.hideTarget;
      hideCheckbox.addEventListener('change', () => app.edit(() => { choice.hideTarget = hideCheckbox.checked; }));
      hideLabel.append(hideCheckbox, ' カードに遷移先番号を表示しない（謎の答え用）');
      tools.append(hideLabel, element('span', 'spacer'));

      const makeToolButton = (text, title, disabled, onClick) => {
        const button = element('button', 'btn btn-small', text);
        button.type = 'button';
        button.title = title;
        button.disabled = disabled;
        button.addEventListener('click', onClick);
        return button;
      };
      const move = (from, to) => {
        app.edit(() => {
          const [moved] = card.choices.splice(from, 1);
          card.choices.splice(to, 0, moved);
        });
        renderChoices(container, card);
      };
      tools.append(
        makeToolButton('↑', '上へ', index === 0, () => move(index, index - 1)),
        makeToolButton('↓', '下へ', index === card.choices.length - 1, () => move(index, index + 1)),
        makeToolButton('削除', 'この選択肢を削除', false, () => {
          app.edit(() => { card.choices.splice(index, 1); });
          renderChoices(container, card);
        })
      );

      row.append(textInput, targetSelect, tools);
      container.append(row);
    });

    const addButton = element('button', 'btn', `＋ 選択肢を追加（${card.choices.length}/${MAX_CHOICES}）`);
    addButton.type = 'button';
    addButton.disabled = card.choices.length >= MAX_CHOICES;
    addButton.addEventListener('click', () => {
      app.edit(() => { card.choices.push(createEmptyChoice()); });
      renderChoices(container, card);
    });
    container.append(addButton);
  }

  function renderSources() {
    if (!formRefs) return;
    const card = currentCard();
    const sources = buildIncomingMap(app.content.cards).get(card.no) ?? [];
    formRefs.sources.replaceChildren();
    if (sources.length === 0) {
      formRefs.sources.append(
        element('span', 'field__hint', card.no === 1 ? '（スタートのカードです）' : '（どのカードの選択肢からもつながっていません）')
      );
      return;
    }
    for (const sourceNo of sources) {
      const chip = element('button', 'source-chip', `${sourceNo}番`);
      chip.type = 'button';
      chip.addEventListener('click', () => app.selectCard(sourceNo));
      formRefs.sources.append(chip);
    }
  }

  function updateCounter() {
    if (!formRefs) return;
    const length = bodyLength(currentCard());
    formRefs.counter.textContent = `${length} / 目安 ${BODY_CHAR_GUIDE} 文字`;
    formRefs.counter.classList.toggle('is-over', length > BODY_CHAR_GUIDE);
  }

  function renderForm() {
    const card = currentCard();
    formElement.replaceChildren();

    const head = element('div', 'form-head');
    head.append(element('h2', null, `カード No.${card.no}`));
    const prev = element('button', 'btn btn-small', '← 前');
    prev.type = 'button';
    prev.disabled = card.no <= 1;
    prev.addEventListener('click', () => app.selectCard(card.no - 1));
    const next = element('button', 'btn btn-small', '次 →');
    next.type = 'button';
    next.disabled = card.no >= CARD_COUNT;
    next.addEventListener('click', () => app.selectCard(card.no + 1));
    head.append(prev, next);

    const typeSelect = document.createElement('select');
    for (const type of CARD_TYPES) typeSelect.append(new Option(type.label, type.value));
    typeSelect.value = card.cardType;
    typeSelect.addEventListener('change', () => app.edit(() => { card.cardType = typeSelect.value; }));

    const labelArea = document.createElement('textarea');
    labelArea.rows = 3;
    labelArea.value = card.label;
    labelArea.placeholder = '例: 1987.08.14 23:10';
    labelArea.addEventListener('input', () => app.edit(() => { card.label = labelArea.value; }));

    const bodyArea = document.createElement('textarea');
    bodyArea.className = 'is-body';
    bodyArea.rows = 10;
    bodyArea.value = card.body;
    bodyArea.placeholder = '朗読される文章を入力します。改行すると縦書きの次の列になります。';
    bodyArea.addEventListener('input', () => app.edit(() => { card.body = bodyArea.value; }));
    const counter = element('div', 'counter');

    const createTextInput = (value, placeholder, onInput) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = placeholder;
      input.addEventListener('input', () => onInput(input.value));
      return input;
    };
    const speakerInput = createTextInput(card.speaker, '例: 吾輩（猫）・泥棒', (value) => app.edit(() => { card.speaker = value; }));
    const readingNoteInput = createTextInput(card.readingNote, '例: 泥棒の台詞は低いだみ声で', (value) => app.edit(() => { card.readingNote = value; }));

    const choicesFieldset = element('fieldset', 'choices');
    choicesFieldset.append(element('legend', null, `選択肢（最大${MAX_CHOICES}つ・0個ならエンディングや行き止まり）`));
    const choicesContainer = element('div');
    choicesFieldset.append(choicesContainer);
    renderChoices(choicesContainer, card);

    const sources = element('div', 'sources');

    const memoArea = document.createElement('textarea');
    memoArea.rows = 3;
    memoArea.value = card.memo;
    memoArea.placeholder = '制作用のメモ（カードには印刷されません）';
    memoArea.addEventListener('input', () => app.edit(() => { card.memo = memoArea.value; }));

    formElement.append(
      head,
      createField('カードの種類', typeSelect, '「行き詰まり」は、選択肢がなく前のカードへ戻ることを想定したカードです'),
      createField('表面ラベル（カセットのラベル部分の文字）', labelArea, `録音日時など。謎解きの手がかりにもなります。ラベルの罫線${CASSETTE_LAYOUT.writing.lines}行ぶんに収まります`),
      createField('裏面の本文（縦書きで表示）', bodyArea),
      counter,
      createField('話者（裏面の右側に表示）', speakerInput, '本文を読み上げる人のための表示です'),
      createField('読み方のアドバイス（裏面の右側に表示）', readingNoteInput, '短く1行で。長いと裏面に収まりません'),
      choicesFieldset,
      createField('遷移元（自動算出）', sources, '他のカードの選択肢から自動で逆引きされ、裏面の右側に表示されます', 'div'),
      createField('制作メモ', memoArea)
    );
    formRefs = { counter, sources };
    updateCounter();
    renderSources();
  }

  // ── プレビュー ────────────────────────────
  function renderPreview() {
    const card = currentCard();
    const sourceNos = buildIncomingMap(app.content.cards).get(card.no) ?? [];

    const frontBlock = element('div', 'preview-block');
    const front = renderCardFront(card);
    frontBlock.append(element('h3', null, '表面'), front);

    const backBlock = element('div', 'preview-block');
    const back = renderCardBack(card, sourceNos);
    backBlock.append(element('h3', null, '裏面'), back);

    previewElement.replaceChildren(frontBlock, backBlock);

    // DOMに載せたあとで溢れを実測する
    for (const [cardElement, block] of [[front, frontBlock], [back, backBlock]]) {
      const overflowing = findOverflowingParts(cardElement);
      if (overflowing.length === 0) continue;
      cardElement.classList.add('is-overflow');
      block.append(
        element('p', 'preview-warning', `⚠ ${overflowing.join('・')}がカードに収まっていません。文字数を減らしてください。`)
      );
    }
  }

  function renderAll() {
    renderList();
    renderForm();
    renderPreview();
    scrollSelectedIntoView();
  }

  app.on('content', () => {
    renderList();
    renderPreview();
    renderSources();
    updateCounter();
  });
  app.on('selection', renderAll);
  app.on('reload', renderAll);

  renderAll();
}
