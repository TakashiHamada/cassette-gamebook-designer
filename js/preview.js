// プレイテスト（スライドショー）: 1番カードの表面から、実際に遊んで確認する。
import { CARD_COUNT, START_CARD_NO } from './config.js';
import { buildIncomingMap } from './graph-utils.js';
import { renderCardFront, renderCardBack } from './card-render.js';

export function initPlayTest(app) {
  const overlay = document.getElementById('play-overlay');
  const positionLabel = document.getElementById('play-position');
  const messageElement = document.getElementById('play-message');
  const stage = document.getElementById('play-stage');
  const historyElement = document.getElementById('play-history');
  const backButton = document.getElementById('play-back');
  const flipButton = document.getElementById('play-flip');
  const jumpInput = document.getElementById('play-jump-input');
  const jumpButton = document.getElementById('play-jump');
  const restartButton = document.getElementById('play-restart');
  const fullscreenButton = document.getElementById('play-fullscreen');
  const exitButton = document.getElementById('play-exit');
  const answerForm = document.getElementById('play-answer');
  const answerLabel = document.getElementById('play-answer-label');
  const answerInput = document.getElementById('play-answer-input');
  const answerHint = document.getElementById('play-answer-hint');
  const answerCancel = document.getElementById('play-answer-cancel');

  jumpInput.min = String(START_CARD_NO);
  jumpInput.max = String(CARD_COUNT);
  answerInput.min = String(START_CARD_NO);
  answerInput.max = String(CARD_COUNT);

  let state = null; // { currentNo, face: 'front' | 'back', history: number[] }
  let pendingChoice = null; // 番号を伏せた選択肢の入力待ち

  const isOpen = () => !overlay.hidden;
  const currentCard = () => app.content.cards[state.currentNo - 1];

  function persist() {
    app.ui.play = { currentNo: state.currentNo, face: state.face, history: [...state.history] };
    app.saveUiSoon();
  }

  function setMessage(text) {
    messageElement.textContent = text;
  }

  function closeAnswer() {
    pendingChoice = null;
    answerForm.hidden = true;
  }

  function goTo(no) {
    closeAnswer();
    state.history.push(state.currentNo);
    state.currentNo = no;
    state.face = 'front';
    setMessage('');
    persist();
    render();
  }

  function goBack() {
    if (state.history.length === 0) return;
    closeAnswer();
    state.currentNo = state.history.pop();
    state.face = 'front';
    setMessage('');
    persist();
    render();
  }

  function flip() {
    closeAnswer();
    state.face = state.face === 'front' ? 'back' : 'front';
    setMessage('');
    persist();
    render();
  }

  function chooseChoice(choice, index) {
    if (choice.hideTarget) {
      pendingChoice = { choice, index };
      answerLabel.firstChild.textContent = `「${choice.text || `選択肢${index + 1}`}」の遷移先の番号を入力してください `;
      answerInput.value = '';
      answerHint.textContent = choice.target === null ? '（設定上の遷移先: 未設定）' : `（設定上の遷移先: ${choice.target}番）`;
      answerForm.hidden = false;
      answerInput.focus();
      return;
    }
    if (choice.target === null) {
      setMessage('この選択肢は遷移先が未設定です。編集画面で設定してください。');
      return;
    }
    goTo(choice.target);
  }

  function parseCardNo(text) {
    const number = Number(text);
    return Number.isInteger(number) && number >= START_CARD_NO && number <= CARD_COUNT ? number : null;
  }

  function render() {
    const card = currentCard();
    positionLabel.textContent = `No.${card.no}（${state.face === 'front' ? '表面' : '裏面'}）`;
    backButton.disabled = state.history.length === 0;
    flipButton.textContent = state.face === 'front' ? '裏返す (Space)' : '表に戻す (Space)';

    stage.replaceChildren();
    if (state.face === 'front') {
      const front = renderCardFront(card);
      front.title = 'クリックで裏返す';
      front.addEventListener('click', flip);
      stage.append(front);
    } else {
      const sources = buildIncomingMap(app.content.cards).get(card.no) ?? [];
      stage.append(
        renderCardBack(card, sources, {
          onChoice: chooseChoice,
          onSource: goTo,
        })
      );
    }

    const trail = [...state.history, state.currentNo].join(' → ');
    historyElement.textContent = `通過: ${trail}`;
  }

  function open(initialState) {
    state = initialState;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    closeAnswer();
    setMessage('');
    persist();
    render();
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    closeAnswer();
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.refreshPlayButtons();
  }

  // 指定したカードの表面から始める（既定は1番）
  function start(fromNo = START_CARD_NO) {
    open({ currentNo: fromNo, face: 'front', history: [] });
  }

  function resume() {
    const saved = app.ui.play;
    if (!saved) return start();
    return open({ currentNo: saved.currentNo, face: saved.face, history: [...saved.history] });
  }

  backButton.addEventListener('click', goBack);
  flipButton.addEventListener('click', flip);
  restartButton.addEventListener('click', () => start());
  exitButton.addEventListener('click', close);
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else overlay.requestFullscreen?.();
  });

  const jump = () => {
    const no = parseCardNo(jumpInput.value);
    if (no === null) {
      setMessage(`1〜${CARD_COUNT}の番号を入力してください`);
      return;
    }
    jumpInput.value = '';
    goTo(no);
  };
  jumpButton.addEventListener('click', jump);
  jumpInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jump();
    }
  });

  answerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const no = parseCardNo(answerInput.value);
    if (no === null) {
      setMessage(`1〜${CARD_COUNT}の番号を入力してください`);
      return;
    }
    goTo(no);
  });
  answerCancel.addEventListener('click', closeAnswer);

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    const isTyping = event.target instanceof HTMLInputElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (pendingChoice) closeAnswer();
      else close();
      return;
    }
    if (isTyping) return;
    if (event.key === ' ' || event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) return; // ボタン自体の操作を優先
      event.preventDefault();
      flip();
    } else if (event.key === 'Backspace' || event.key === 'ArrowLeft') {
      event.preventDefault();
      goBack();
    } else if (state.face === 'back' && /^[1-9]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const choice = currentCard().choices[index];
      if (choice) chooseChoice(choice, index);
    }
  });

  return { start, resume };
}
