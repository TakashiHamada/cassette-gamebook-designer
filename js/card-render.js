// カードの表面（SVG）・裏面（縦書きDOM）を生成する。編集・プレビュー・印刷で共通利用。
// ユーザー入力は必ず textContent で挿入する（innerHTML は使わない）。
import {
  CARD_SIZE_MM,
  HIDDEN_TARGET_TEXT,
  UNSET_TARGET_TEXT,
  SOURCE_TITLE,
  SPEAKER_TITLE,
  READING_NOTE_TITLE,
  EMPTY_CHOICE_TEXT,
} from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// カセット絵の形状。実物のコンパクトカセット（約100.4×63.8mm）を基準にした mm 単位の座標。
// カード内には縦横比を保ったまま中央に収める。色は css/card.css の --cassette-* で調整する。
export const CASSETTE_LAYOUT = {
  shell: { width: 100.4, height: 63.8, radius: 3.2, rimInset: 1.1, marginRatio: 0.03 },
  label: { x: 6.5, y: 4.2, w: 87.4, h: 42.6, radius: 2.2 },
  // 左上の面表示（実物の「A」「1」の位置）にカード番号を入れる
  badge: { x: 9, y: 6.6, w: 10.5, h: 13, radius: 2, fontSize: 5.8 },
  // ラベル記入欄（ユーザーのラベル文字を重ねる。罫線は行の高さに合わせて引く）
  writing: { x: 22, y: 5.6, w: 69, lines: 4, fontSize: 3.1, lineHeight: 1.3 },
  window: { x: 22.5, y: 23.6, w: 55.4, h: 14.4, radius: 3.6 },
  stripes: { leftX: 8.5, rightX: 77.9, width: 14, gap: 0, y: 26.2, height: 3.1, count: 3 },
  hub: { offsetX: 21.25, holeRadius: 5.6, ringRadius: 4.4, innerRadius: 2.7, teeth: 6, toothWidth: 1.1, toothLength: 1.25 },
  tapePack: { leftRadius: 15.5, rightRadius: 10.5 },
  windowTicks: { count: 5, spacing: 1.6, top: 25.4, length: 1.6 },
  bottom: { topY: 49.8, topInset: 22, bottomInset: 16.5 },
  holes: {
    y: 57.8,
    height: 4.6,
    capstan: { offsetX: 24.2, radius: 1.4 },
    pinch: { offsetX: 16.7, width: 5 },
    head: { width: 12 },
  },
  tapeStrip: { y: 60.7, height: 1.1 },
  guides: { inset: 12.5, y: 54.6, radius: 3.2, innerRadius: 1.5 },
  screws: { radius: 1.7, slot: 1.1, corner: 4.6, centerY: 55.4 },
};

let cassetteInstanceCount = 0; // SVG内の id（グラデーション・クリップ）をカードごとに一意にする

/** CSS変数 --card-aspect / --card-aspect-num を config のカード寸法から設定する */
export function applyCardGeometry(root = document.documentElement) {
  const { width, height } = CARD_SIZE_MM;
  root.style.setProperty('--card-aspect', `${width} / ${height}`);
  root.style.setProperty('--card-aspect-num', String(width / height));
  root.style.setProperty('--card-width-mm', `${width}mm`);
  root.style.setProperty('--card-height-mm', `${height}mm`);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createSvg(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

// カセット座標 → カード座標（mm）の変換。カードの中央に、余白を残して最大サイズで配置する。
function cassettePlacement() {
  const { width: W, height: H } = CARD_SIZE_MM;
  const { shell } = CASSETTE_LAYOUT;
  const margin = shell.marginRatio * W;
  const scale = Math.min((W - margin * 2) / shell.width, (H - margin * 2) / shell.height);
  return {
    scale,
    offsetX: (W - shell.width * scale) / 2,
    offsetY: (H - shell.height * scale) / 2,
  };
}

function bottomHoleShapes() {
  const { shell, holes } = CASSETTE_LAYOUT;
  const centerX = shell.width / 2;
  const holeCenterY = holes.y + holes.height / 2;
  const shapes = [];
  for (const direction of [-1, 1]) {
    shapes.push(['circle', { cx: centerX + direction * holes.capstan.offsetX, cy: holeCenterY, r: holes.capstan.radius }]);
    shapes.push([
      'rect',
      {
        x: centerX + direction * holes.pinch.offsetX - holes.pinch.width / 2,
        y: holes.y,
        width: holes.pinch.width,
        height: holes.height,
        rx: 0.6,
      },
    ]);
  }
  shapes.push(['rect', { x: centerX - holes.head.width / 2, y: holes.y, width: holes.head.width, height: holes.height, rx: 0.6 }]);
  return shapes;
}

function appendScrew(parent, cx, cy) {
  const { screws } = CASSETTE_LAYOUT;
  parent.append(
    createSvg('circle', { class: 'cassette-screw', cx, cy, r: screws.radius }),
    createSvg('line', { class: 'cassette-screw-slot', x1: cx - screws.slot, y1: cy, x2: cx + screws.slot, y2: cy }),
    createSvg('line', { class: 'cassette-screw-slot', x1: cx, y1: cy - screws.slot, x2: cx, y2: cy + screws.slot })
  );
}

function appendHub(parent, cx, cy) {
  const { hub } = CASSETTE_LAYOUT;
  parent.append(
    createSvg('circle', { class: 'cassette-hub-hole', cx, cy, r: hub.holeRadius }),
    createSvg('circle', { class: 'cassette-hub', cx, cy, r: hub.ringRadius }),
    createSvg('circle', { class: 'cassette-hub-inner', cx, cy, r: hub.innerRadius })
  );
  // 内側へ向かう歯（スプライン）
  for (let index = 0; index < hub.teeth; index += 1) {
    const angle = (360 / hub.teeth) * index;
    parent.append(
      createSvg('rect', {
        class: 'cassette-hub',
        x: cx - hub.toothWidth / 2,
        y: cy - hub.innerRadius - 0.05,
        width: hub.toothWidth,
        height: hub.toothLength,
        transform: `rotate(${angle} ${cx} ${cy})`,
      })
    );
  }
}

function buildCassetteSvg(cardNo) {
  const { width: W, height: H } = CARD_SIZE_MM;
  const L = CASSETTE_LAYOUT;
  const { scale, offsetX, offsetY } = cassettePlacement();
  const uid = (cassetteInstanceCount += 1);
  const ids = {
    shellGradient: `cassette-shell-${uid}`,
    windowClip: `cassette-window-${uid}`,
    holesClip: `cassette-holes-${uid}`,
  };
  const centerX = L.shell.width / 2;

  const svg = createSvg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'cassette-svg',
    'aria-hidden': 'true',
    focusable: 'false',
  });

  // ── 定義（グラデーション・クリップ） ──
  const defs = createSvg('defs');
  const gradient = createSvg('linearGradient', { id: ids.shellGradient, x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(
    createSvg('stop', { offset: 0, class: 'cassette-shell-stop-top' }),
    createSvg('stop', { offset: 1, class: 'cassette-shell-stop-bottom' })
  );
  const windowClip = createSvg('clipPath', { id: ids.windowClip });
  windowClip.append(
    createSvg('rect', { x: L.window.x, y: L.window.y, width: L.window.w, height: L.window.h, rx: L.window.radius })
  );
  const holesClip = createSvg('clipPath', { id: ids.holesClip });
  for (const [tag, attributes] of bottomHoleShapes()) holesClip.append(createSvg(tag, attributes));
  defs.append(gradient, windowClip, holesClip);
  svg.append(defs);

  const cassette = createSvg('g', { transform: `translate(${offsetX} ${offsetY}) scale(${scale})` });
  svg.append(cassette);

  // ── 本体 ──
  cassette.append(
    createSvg('rect', {
      class: 'cassette-shell',
      x: 0,
      y: 0,
      width: L.shell.width,
      height: L.shell.height,
      rx: L.shell.radius,
      fill: `url(#${ids.shellGradient})`,
    }),
    createSvg('rect', {
      class: 'cassette-rim',
      x: L.shell.rimInset,
      y: L.shell.rimInset,
      width: L.shell.width - L.shell.rimInset * 2,
      height: L.shell.height - L.shell.rimInset * 2,
      rx: L.shell.radius - L.shell.rimInset / 2,
    })
  );

  // ── ラベル ──
  cassette.append(
    createSvg('rect', { class: 'cassette-label', x: L.label.x, y: L.label.y, width: L.label.w, height: L.label.h, rx: L.label.radius })
  );

  // 窓の左右の色帯
  for (let index = 0; index < L.stripes.count; index += 1) {
    const y = L.stripes.y + index * L.stripes.height;
    for (const x of [L.stripes.leftX, L.stripes.rightX]) {
      cassette.append(
        createSvg('rect', { class: `cassette-stripe cassette-stripe-${index + 1}`, x, y, width: L.stripes.width, height: L.stripes.height })
      );
    }
  }

  // 記入欄の罫線（文字のベースライン付近に引く）
  const lineHeight = L.writing.fontSize * L.writing.lineHeight;
  for (let index = 0; index < L.writing.lines; index += 1) {
    const y = L.writing.y + index * lineHeight + L.writing.fontSize * 1.18;
    cassette.append(
      createSvg('line', { class: 'cassette-label-rule', x1: L.writing.x, y1: y, x2: L.writing.x + L.writing.w, y2: y })
    );
  }

  // 面表示の位置にカード番号
  cassette.append(
    createSvg('rect', { class: 'cassette-badge', x: L.badge.x, y: L.badge.y, width: L.badge.w, height: L.badge.h, rx: L.badge.radius })
  );
  const number = createSvg('text', {
    class: 'cassette-number',
    x: L.badge.x + L.badge.w / 2,
    y: L.badge.y + L.badge.h / 2,
    'font-size': L.badge.fontSize,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  number.textContent = String(cardNo);
  cassette.append(number);

  // ── 窓（巻かれたテープ・ハブ） ──
  const hubY = L.window.y + L.window.h / 2;
  const leftHubX = centerX - L.hub.offsetX;
  const rightHubX = centerX + L.hub.offsetX;
  cassette.append(
    createSvg('rect', { class: 'cassette-window', x: L.window.x, y: L.window.y, width: L.window.w, height: L.window.h, rx: L.window.radius })
  );
  const windowContent = createSvg('g', { 'clip-path': `url(#${ids.windowClip})` });
  windowContent.append(
    createSvg('circle', { class: 'cassette-tape', cx: leftHubX, cy: hubY, r: L.tapePack.leftRadius }),
    createSvg('circle', { class: 'cassette-tape', cx: rightHubX, cy: hubY, r: L.tapePack.rightRadius })
  );
  // 中央の目盛り
  const tickStartX = centerX - ((L.windowTicks.count - 1) * L.windowTicks.spacing) / 2;
  for (let index = 0; index < L.windowTicks.count; index += 1) {
    const x = tickStartX + index * L.windowTicks.spacing;
    windowContent.append(
      createSvg('line', { class: 'cassette-window-tick', x1: x, y1: L.windowTicks.top, x2: x, y2: L.windowTicks.top + L.windowTicks.length })
    );
  }
  cassette.append(windowContent);
  appendHub(cassette, leftHubX, hubY);
  appendHub(cassette, rightHubX, hubY);
  cassette.append(
    createSvg('rect', {
      class: 'cassette-window-frame',
      x: L.window.x,
      y: L.window.y,
      width: L.window.w,
      height: L.window.h,
      rx: L.window.radius,
    })
  );

  // ── 下部（ヘッド差し込み部の台形・穴・テープ） ──
  const { bottom } = L;
  cassette.append(
    createSvg('polygon', {
      class: 'cassette-bottom',
      points: [
        [bottom.bottomInset, L.shell.height],
        [L.shell.width - bottom.bottomInset, L.shell.height],
        [L.shell.width - bottom.topInset, bottom.topY],
        [bottom.topInset, bottom.topY],
      ]
        .map((point) => point.join(','))
        .join(' '),
    })
  );
  for (const [tag, attributes] of bottomHoleShapes()) {
    cassette.append(createSvg(tag, { ...attributes, class: 'cassette-hole' }));
  }
  cassette.append(
    createSvg('rect', {
      class: 'cassette-tape-strip',
      x: 0,
      y: L.tapeStrip.y,
      width: L.shell.width,
      height: L.tapeStrip.height,
      'clip-path': `url(#${ids.holesClip})`,
    })
  );

  // 左右下のガイドローラー
  for (const x of [L.guides.inset, L.shell.width - L.guides.inset]) {
    cassette.append(
      createSvg('circle', { class: 'cassette-guide', cx: x, cy: L.guides.y, r: L.guides.radius }),
      createSvg('circle', { class: 'cassette-guide-inner', cx: x, cy: L.guides.y, r: L.guides.innerRadius })
    );
  }

  // ネジ（四隅＋下部中央）
  const { corner } = L.screws;
  for (const [x, y] of [
    [corner, corner],
    [L.shell.width - corner, corner],
    [corner, L.shell.height - corner],
    [L.shell.width - corner, L.shell.height - corner],
    [centerX, L.screws.centerY],
  ]) {
    appendScrew(cassette, x, y);
  }

  return svg;
}

// ラベル文字のHTMLを記入欄（罫線）にぴったり重ねるための位置・文字サイズ
function labelTextStyle() {
  const { width: W, height: H } = CARD_SIZE_MM;
  const { writing } = CASSETTE_LAYOUT;
  const { scale, offsetX, offsetY } = cassettePlacement();
  const lineHeight = writing.fontSize * writing.lineHeight;
  return {
    left: `${((offsetX + writing.x * scale) / W) * 100}%`,
    top: `${((offsetY + writing.y * scale) / H) * 100}%`,
    width: `${((writing.w * scale) / W) * 100}%`,
    height: `${((writing.lines * lineHeight * scale) / H) * 100}%`,
    fontSize: `${((writing.fontSize * scale) / W) * 100}cqw`,
    lineHeight: String(writing.lineHeight),
  };
}

/** 表面: カセットのイラスト＋ラベル文字＋通し番号 */
export function renderCardFront(card) {
  const root = createElement('div', 'card card-front');
  root.dataset.cardNo = String(card.no);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `カード ${card.no} 番 表面`);

  root.append(buildCassetteSvg(card.no));

  const labelText = createElement('div', 'front-label-text', card.label);
  Object.assign(labelText.style, labelTextStyle());
  root.append(labelText);
  return root;
}

function appendInteractive(parent, tag, className, handler) {
  const element = createElement(handler ? 'button' : tag, className);
  if (handler) {
    element.type = 'button';
    element.addEventListener('click', handler);
  }
  parent.append(element);
  return element;
}

function buildReadingLine(className, title, text) {
  const line = createElement('p', className);
  line.append(createElement('span', 'back-reading-title', title), text);
  return line;
}

/**
 * 裏面: 右=遷移元番号・話者と読み方 / 中央=縦書きの本文 / 左=選択肢と遷移先
 * handlers.onSource(no) / handlers.onChoice(choice, index) を渡すと、遷移元・選択肢がクリック可能になる（プレイ用）。
 */
export function renderCardBack(card, sourceNos, handlers = {}) {
  const root = createElement('div', 'card card-back');
  root.dataset.cardNo = String(card.no);
  const inner = createElement('div', 'back-inner');

  // 右: 遷移元
  const sources = createElement('section', 'back-sources');
  if (sourceNos.length > 0) {
    sources.append(createElement('h3', 'back-sources-title', SOURCE_TITLE));
    const list = createElement('ol', 'back-sources-list');
    for (const sourceNo of sourceNos) {
      const item = createElement('li');
      const onClick = handlers.onSource ? () => handlers.onSource(sourceNo) : null;
      const control = appendInteractive(item, 'span', 'back-source', onClick);
      control.textContent = String(sourceNo);
      if (onClick) control.title = `${sourceNo}番のカードへ戻る`;
      list.append(item);
    }
    sources.append(list);
  }

  // 右: 話者と読み方のアドバイス（朗読する人向け）
  const reading = createElement('section', 'back-reading');
  if (card.speaker.trim()) reading.append(buildReadingLine('back-reading-speaker', SPEAKER_TITLE, card.speaker));
  if (card.readingNote.trim()) reading.append(buildReadingLine('back-reading-note', READING_NOTE_TITLE, card.readingNote));

  // 中央: 本文（改行ごとに1列。空行は全角スペースで列を確保）
  const body = createElement('section', 'back-body');
  for (const line of card.body.split('\n')) {
    body.append(createElement('p', 'back-body-line', line === '' ? '　' : line));
  }

  // 左: 選択肢
  const choices = createElement('section', 'back-choices');
  choices.style.setProperty('--choice-count', String(card.choices.length));
  card.choices.forEach((choice, index) => {
    const onClick = handlers.onChoice ? () => handlers.onChoice(choice, index) : null;
    const item = appendInteractive(choices, 'div', 'back-choice', onClick);
    const hasText = choice.text.trim() !== '';
    item.append(createElement('span', hasText ? 'back-choice-text' : 'back-choice-text is-placeholder', hasText ? choice.text : EMPTY_CHOICE_TEXT));
    item.append(createElement('span', 'back-choice-arrow', '→'));
    const target = createElement('span', 'back-choice-target');
    if (choice.hideTarget) {
      target.append(createElement('span', 'back-choice-hidden', HIDDEN_TARGET_TEXT));
    } else if (choice.target === null) {
      target.append(createElement('span', 'back-choice-unset', UNSET_TARGET_TEXT));
    } else {
      target.append(createElement('span', 'tcy', String(choice.target)));
    }
    target.append('番');
    item.append(target);
  });

  inner.append(sources, reading, body, choices);
  root.append(inner);
  return root;
}

/** DOMに配置済みのカード（表面・裏面）で、文字が枠に収まっていない部分の名前を返す（レイアウト実測） */
export function findOverflowingParts(cardElement) {
  const parts = [
    ['.front-label-text', '表面ラベル'],
    ['.back-sources', '遷移元'],
    ['.back-reading', '話者・読み方'],
    ['.back-body', '本文'],
    ['.back-choices', '選択肢'],
  ];
  const overflowing = [];
  for (const [selector, name] of parts) {
    const element = cardElement.querySelector(selector);
    if (!element) continue;
    const isOver =
      element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
    if (isOver) overflowing.push(name);
  }
  return overflowing;
}
