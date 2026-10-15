// 調整値はここに集約する。コード中にマジックナンバーを埋め込まない。
// 色・フォントサイズなど見た目の調整値は css/card.css と css/style.css の CSS変数を参照。

// ── ゲーム構造 ──────────────────────────────────────────────
export const CARD_COUNT = 48;
export const START_CARD_NO = 1;
export const MAX_CHOICES = 3;
export const SCHEMA_VERSION = 1;

export const CARD_TYPES = [
  { value: 'normal', label: '通常' },
  { value: 'deadEnd', label: '行き詰まり（前のカードに戻る前提）' },
  { value: 'ending', label: 'エンディング' },
];

// ── 保存 ────────────────────────────────────────────────────
// コンテンツ（JSON書き出しの対象）と UI/プレイ状態は別キーに分ける
export const STORAGE_KEYS = {
  content: 'cassette-gamebook:content:v1',
  ui: 'cassette-gamebook:ui:v1',
  corruptBackup: 'cassette-gamebook:content:corrupt-backup',
};
export const AUTOSAVE_DELAY_MS = 400;
export const DEFAULT_TITLE = '無題のゲーム';

// ── カード寸法・表示 ────────────────────────────────────────
export const CARD_SIZE_MM = { width: 100, height: 70 };
export const BODY_CHAR_GUIDE = 150; // 本文の文字数目安（超えると警告）。実際の溢れは画面上の実測でも検出する
export const HIDDEN_TARGET_TEXT = '＿＿'; // 「番号を伏せる」選択肢の遷移先表示
export const UNSET_TARGET_TEXT = '？'; // 遷移先未設定の選択肢の表示
export const SOURCE_TITLE = '遷移元';
export const SPEAKER_TITLE = '話者';
export const READING_NOTE_TITLE = '読み方';
export const EMPTY_CHOICE_TEXT = '（行動）';
// ── 印刷レイアウト（A4縦に面付け） ───────────────────────────
export const PRINT_LAYOUT = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  columns: 2,
  rows: 4,
};

// ── フローチャート ──────────────────────────────────────────
export const FLOW_LAYOUT = {
  nodeWidth: 136,
  nodeHeight: 48,
  columnGap: 76,
  rowGap: 14,
  padding: 24,
  headerHeight: 28,
  snippetChars: 9,
  orderingSweeps: 6, // 列内の並べ替え（交差を減らす処理）の反復回数
  backEdgeDrop: 36, // 「戻る」矢印をノードの下へ膨らませる量
};
