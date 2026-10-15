// データモデル・localStorage 読み書き・JSON入出力。DOM非依存（Nodeでもテスト可能）。
import {
  CARD_COUNT,
  MAX_CHOICES,
  SCHEMA_VERSION,
  STORAGE_KEYS,
  CARD_TYPES,
  DEFAULT_TITLE,
  START_CARD_NO,
} from './config.js';
import { DEFAULT_CONTENT_SOURCE } from './default-content.js';

const CARD_TYPE_VALUES = CARD_TYPES.map((type) => type.value);

export function createEmptyChoice() {
  return { text: '', target: null, hideTarget: false };
}

export function createEmptyCard(no) {
  return { no, label: '', body: '', speaker: '', readingNote: '', choices: [], cardType: 'normal', memo: '' };
}

export function createEmptyContent() {
  return {
    schemaVersion: SCHEMA_VERSION,
    title: DEFAULT_TITLE,
    updatedAt: new Date().toISOString(),
    cards: Array.from({ length: CARD_COUNT }, (_, index) => createEmptyCard(index + 1)),
  };
}

function toText(value) {
  return typeof value === 'string' ? value : '';
}

function toTarget(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= CARD_COUNT ? number : null;
}

function normalizeChoice(rawChoice, cardNo, choiceIndex, notes) {
  const raw = rawChoice && typeof rawChoice === 'object' ? rawChoice : {};
  const target = toTarget(raw.target);
  const hadValue = raw.target !== null && raw.target !== undefined && raw.target !== '';
  if (hadValue && target === null) {
    notes.push(`No.${cardNo} の選択肢${choiceIndex + 1}の遷移先が範囲外だったため「未設定」にしました`);
  }
  return { text: toText(raw.text), target, hideTarget: raw.hideTarget === true };
}

function normalizeCard(rawCard, no, notes) {
  const raw = rawCard && typeof rawCard === 'object' ? rawCard : {};
  const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
  if (rawChoices.length > MAX_CHOICES) {
    notes.push(`No.${no} の選択肢が${MAX_CHOICES}個を超えていたため、先頭の${MAX_CHOICES}個だけ読み込みました`);
  }
  return {
    no,
    label: toText(raw.label),
    body: toText(raw.body),
    speaker: toText(raw.speaker),
    readingNote: toText(raw.readingNote),
    choices: rawChoices
      .slice(0, MAX_CHOICES)
      .map((choice, index) => normalizeChoice(choice, no, index, notes)),
    cardType: CARD_TYPE_VALUES.includes(raw.cardType) ? raw.cardType : 'normal',
    memo: toText(raw.memo),
  };
}

// 外部から来たデータを現在のスキーマに揃える。不足項目は補完し、不正な形式なら例外を投げる。
export function normalizeContent(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) {
    throw new Error('ゲームデータの形式が正しくありません（cards が見つかりません）');
  }
  const notes = [];
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) {
    notes.push('このツールより新しい形式のデータです。一部の項目は読み込まれない可能性があります');
  }

  const rawByNo = new Map();
  raw.cards.forEach((rawCard, index) => {
    const no = rawCard && Number.isInteger(rawCard.no) ? rawCard.no : index + 1;
    if (no >= START_CARD_NO && no <= CARD_COUNT && !rawByNo.has(no)) rawByNo.set(no, rawCard);
  });

  const cards = [];
  for (let no = 1; no <= CARD_COUNT; no += 1) {
    cards.push(normalizeCard(rawByNo.get(no), no, notes));
  }

  const content = {
    schemaVersion: SCHEMA_VERSION,
    title: toText(raw.title) || DEFAULT_TITLE,
    updatedAt: toText(raw.updatedAt) || new Date().toISOString(),
    cards,
  };
  return { content, notes };
}

/** サンプルゲーム（初回起動時・「デフォルト」ボタンで使う） */
export function createDefaultContent() {
  const { content } = normalizeContent(DEFAULT_CONTENT_SOURCE);
  content.updatedAt = new Date().toISOString();
  return content;
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// 戻り値: { content, status: 'ok' | 'empty' | 'corrupt' | 'unavailable' }
// 保存データが無い・読めない場合はサンプルゲームを返す
export function loadContent(storage = getStorage()) {
  if (!storage) return { content: createDefaultContent(), status: 'unavailable' };
  let text = null;
  try {
    text = storage.getItem(STORAGE_KEYS.content);
  } catch {
    return { content: createDefaultContent(), status: 'unavailable' };
  }
  if (!text) return { content: createDefaultContent(), status: 'empty' };
  try {
    return { content: normalizeContent(JSON.parse(text)).content, status: 'ok' };
  } catch {
    // 壊れたデータは次回の自動保存で上書きされるため、先に退避しておく
    try {
      storage.setItem(STORAGE_KEYS.corruptBackup, text);
    } catch {
      // 退避に失敗してもそのまま続行
    }
    return { content: createDefaultContent(), status: 'corrupt' };
  }
}

// 戻り値: { ok: boolean, error?: string }
export function saveContent(content, storage = getStorage()) {
  if (!storage) return { ok: false, error: 'このブラウザでは保存領域を利用できません' };
  try {
    storage.setItem(STORAGE_KEYS.content, JSON.stringify(content));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

export function createDefaultUi() {
  return { selectedCardNo: START_CARD_NO, activeTab: 'edit', play: null, flowShowBack: false };
}

function normalizePlay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const currentNo = toTarget(raw.currentNo);
  if (currentNo === null) return null;
  const history = Array.isArray(raw.history)
    ? raw.history.map(toTarget).filter((no) => no !== null)
    : [];
  return { currentNo, face: raw.face === 'back' ? 'back' : 'front', history };
}

export function loadUi(storage = getStorage()) {
  const fallback = createDefaultUi();
  if (!storage) return fallback;
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEYS.ui) ?? 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    return {
      selectedCardNo: toTarget(raw.selectedCardNo) ?? fallback.selectedCardNo,
      activeTab: ['edit', 'validate', 'flow'].includes(raw.activeTab) ? raw.activeTab : 'edit',
      play: normalizePlay(raw.play),
      flowShowBack: raw.flowShowBack === true,
    };
  } catch {
    return fallback;
  }
}

export function saveUi(ui, storage = getStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEYS.ui, JSON.stringify(ui));
    return true;
  } catch {
    return false;
  }
}

// JSON書き出しはコンテンツのみ（UI・プレイ状態は含めない）
export function serializeContent(content) {
  return JSON.stringify(content, null, 2);
}

// 戻り値: { content, notes }。形式が不正なら例外
export function parseContentJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSONとして読み込めませんでした');
  }
  return normalizeContent(raw);
}
