// 起動・状態管理・ヘッダー操作（保存、JSON入出力、タブ切替）
import { AUTOSAVE_DELAY_MS, DEFAULT_TITLE, START_CARD_NO, CARD_COUNT } from './config.js';
import {
  loadContent,
  saveContent,
  loadUi,
  saveUi,
  createEmptyContent,
  createDefaultContent,
  serializeContent,
  parseContentJson,
} from './store.js';
import { validateContent, countProblems } from './validate.js';
import { applyCardGeometry } from './card-render.js';
import { initEditor } from './editor.js';
import { initValidateView } from './validate-view.js';
import { initFlowView } from './flow.js';
import { initPlayTest } from './preview.js';

const TABS = ['edit', 'validate', 'flow'];

const $ = (id) => document.getElementById(id);

function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timestampForFileName(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function main() {
  applyCardGeometry();

  const loaded = loadContent();
  const listeners = new Map();
  let saveTimer = null;
  let uiSaveTimer = null;

  const saveStatus = $('save-status');
  const appMessage = $('app-message');
  const badge = $('issue-badge');
  const titleInput = $('game-title');

  function setSaveStatus(text, isError = false) {
    saveStatus.textContent = text;
    saveStatus.classList.toggle('is-error', isError);
  }

  function showMessage(text) {
    appMessage.textContent = text;
    appMessage.hidden = text === '';
  }

  const app = {
    content: loaded.content,
    ui: loadUi(),
    issues: [],

    on(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, []);
      listeners.get(eventName).push(handler);
    },
    emit(eventName) {
      for (const handler of listeners.get(eventName) ?? []) handler();
    },

    refreshIssues() {
      app.issues = validateContent(app.content);
      const problemCount = countProblems(app.issues);
      badge.hidden = problemCount === 0;
      badge.textContent = String(problemCount);
    },

    // コンテンツの値を変更するときは必ずここを通す（自動保存・再検証・再描画が走る）
    edit(mutator) {
      mutator(app.content);
      app.content.updatedAt = new Date().toISOString();
      app.refreshIssues();
      scheduleSave();
      app.emit('content');
    },

    replaceContent(newContent) {
      app.content = newContent;
      titleInput.value = newContent.title;
      app.refreshIssues();
      saveNow();
      app.emit('reload');
    },

    selectCard(no) {
      if (no < START_CARD_NO || no > CARD_COUNT) return;
      app.ui.selectedCardNo = no;
      app.saveUiSoon();
      app.emit('selection');
    },

    showTab(name) {
      if (!TABS.includes(name)) return;
      app.ui.activeTab = name;
      for (const tab of document.querySelectorAll('.tab')) {
        tab.classList.toggle('is-active', tab.dataset.tab === name);
      }
      for (const panel of document.querySelectorAll('.panel')) {
        panel.hidden = panel.dataset.panel !== name;
      }
      app.saveUiSoon();
      app.emit('tab');
    },

    saveUiSoon() {
      clearTimeout(uiSaveTimer);
      uiSaveTimer = setTimeout(() => saveUi(app.ui), AUTOSAVE_DELAY_MS);
    },

    refreshPlayButtons() {
      $('btn-play-here').textContent = `▶ No.${app.ui.selectedCardNo}からプレイ`;
      const saved = app.ui.play;
      const resume = $('btn-resume');
      resume.hidden = !saved;
      if (saved) resume.textContent = `続きからプレイ（No.${saved.currentNo}）`;
    },
  };

  // ── 保存 ──────────────────────────────────
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const result = saveContent(app.content);
    if (result.ok) setSaveStatus(`保存済み ${formatTime(new Date())}`);
    else setSaveStatus(`保存できません: ${result.error}（JSON書き出しでバックアップしてください）`, true);
  }

  function scheduleSave() {
    setSaveStatus('保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, AUTOSAVE_DELAY_MS);
  }

  window.addEventListener('pagehide', () => {
    if (saveTimer !== null) saveNow();
    saveUi(app.ui);
  });

  // ── 画面の初期化 ──────────────────────────
  titleInput.value = app.content.title;
  titleInput.addEventListener('input', () => {
    app.edit((content) => {
      content.title = titleInput.value.trim() === '' ? DEFAULT_TITLE : titleInput.value;
    });
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => app.showTab(tab.dataset.tab));
  }

  app.refreshIssues();
  initEditor(app);
  initValidateView(app);
  initFlowView(app);
  const play = initPlayTest(app);
  app.showTab(app.ui.activeTab);
  app.refreshPlayButtons();

  $('btn-play').addEventListener('click', () => play.start());
  $('btn-play-here').addEventListener('click', () => play.start(app.ui.selectedCardNo));
  app.on('selection', () => app.refreshPlayButtons());
  $('btn-resume').addEventListener('click', () => play.resume());

  // ── JSON書き出し / 読み込み ────────────────
  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([serializeContent(app.content)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cassette-gamebook-${timestampForFileName(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage('JSONを書き出しました（ダウンロードフォルダを確認してください）');
  });

  const importFile = $('import-file');
  $('btn-import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      const { content, notes } = parseContentJson(await file.text());
      const ok = window.confirm(
        `「${content.title}」を読み込みます。\n現在の編集内容はすべて置き換えられます（元に戻せません）。よろしいですか？\n\n事前に「JSON書き出し」でバックアップを取ることをおすすめします。`
      );
      if (!ok) return;
      app.replaceContent(content);
      showMessage(notes.length > 0 ? `読み込みました。\n${notes.join('\n')}` : '読み込みました');
    } catch (error) {
      showMessage(`読み込みに失敗しました: ${error.message}`);
    }
  });

  const backupAdvice = '\n\n事前に「JSON書き出し」でバックアップを取ることをおすすめします。';
  $('btn-clear').addEventListener('click', () => {
    const ok = window.confirm(`全${CARD_COUNT}枚の内容をすべて消去します（元に戻せません）。よろしいですか？${backupAdvice}`);
    if (!ok) return;
    app.replaceContent(createEmptyContent());
    showMessage('全カードを消去しました');
  });

  $('btn-default').addEventListener('click', () => {
    const ok = window.confirm(`サンプルゲームを読み込みます。現在の編集内容はすべて置き換えられます（元に戻せません）。よろしいですか？${backupAdvice}`);
    if (!ok) return;
    app.replaceContent(createDefaultContent());
    showMessage('サンプルゲームを読み込みました');
  });

  // ── 起動時のメッセージ ─────────────────────
  if (loaded.status === 'corrupt') {
    showMessage('保存されていたデータを読み込めなかったため、サンプルゲームで開始しました。壊れたデータはブラウザ内に退避してあります。');
  } else if (loaded.status === 'unavailable') {
    setSaveStatus('このブラウザでは保存できません（JSON書き出しをご利用ください）', true);
  } else if (loaded.status === 'ok') {
    setSaveStatus('保存済みのデータを読み込みました');
  }
}

main();
