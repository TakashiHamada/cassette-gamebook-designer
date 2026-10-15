// フローチャート: 1番からの手数ごとに列を分け、遷移をSVGの矢印で描く。
// 見やすさのため、
//  - 前の列・同じ列へ戻る遷移（「戻る」系）は既定では矢印を描かず、ノード右上に「↩番号」で示す
//  - 列内の並び順は、つながっている相手の位置の平均（バリセンター法）で並べ替えて交差を減らす
import { START_CARD_NO, FLOW_LAYOUT } from './config.js';
import { computeDepths } from './graph-utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(tag, attributes = {}, className) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (className) node.setAttribute('class', className);
  return node;
}

function shorten(text, length) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// 列内の並び順を、前方向の遷移でつながる相手の位置の平均で並べ替える（交差を減らす）
function orderColumns(columns, forwardEdges, sweeps) {
  const predecessors = new Map();
  const successors = new Map();
  for (const { from, to } of forwardEdges) {
    if (!predecessors.has(to)) predecessors.set(to, []);
    if (!successors.has(from)) successors.set(from, []);
    predecessors.get(to).push(from);
    successors.get(from).push(to);
  }

  const position = new Map();
  const refreshPositions = () => {
    for (const column of columns) column.forEach((no, index) => position.set(no, index));
  };
  const sortColumn = (column, neighborsOf) =>
    column
      .map((no, index) => {
        const neighbors = neighborsOf.get(no) ?? [];
        const center = neighbors.length > 0 ? average(neighbors.map((neighbor) => position.get(neighbor))) : index;
        return { no, center, index };
      })
      .sort((a, b) => a.center - b.center || a.index - b.index)
      .map((entry) => entry.no);

  // 隣り合う列の間で交差している矢印の組の数
  const countCrossings = () => {
    let crossings = 0;
    for (let i = 0; i < forwardEdges.length; i += 1) {
      for (let j = i + 1; j < forwardEdges.length; j += 1) {
        const a = forwardEdges[i];
        const b = forwardEdges[j];
        if (a.fromColumn !== b.fromColumn || a.toColumn !== b.toColumn) continue;
        const order = (position.get(a.from) - position.get(b.from)) * (position.get(a.to) - position.get(b.to));
        if (order < 0) crossings += 1;
      }
    }
    return crossings;
  };

  refreshPositions();
  let best = { crossings: countCrossings(), columns: columns.map((column) => [...column]) };
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    for (let index = 1; index < columns.length; index += 1) {
      columns[index] = sortColumn(columns[index], predecessors);
      refreshPositions();
    }
    for (let index = columns.length - 2; index >= 0; index -= 1) {
      columns[index] = sortColumn(columns[index], successors);
      refreshPositions();
    }
    const crossings = countCrossings();
    if (crossings < best.crossings) best = { crossings, columns: columns.map((column) => [...column]) };
  }
  best.columns.forEach((column, index) => { columns[index] = column; });
}

/** 列（カード番号の配列の配列）と遷移の一覧を計算する。DOM非依存 */
export function computeFlowLayout(cards, sweeps = FLOW_LAYOUT.orderingSweeps) {
  const byNo = new Map(cards.map((card) => [card.no, card]));
  const depths = computeDepths(cards, START_CARD_NO);

  // 列ごとにカードを振り分ける（到達不能は最後の列）
  const maxDepth = Math.max(0, ...depths.values());
  const columns = Array.from({ length: maxDepth + 1 }, () => []);
  const unreachable = [];
  for (const card of cards) {
    if (depths.has(card.no)) columns[depths.get(card.no)].push(card.no);
    else unreachable.push(card.no);
  }
  const columnTitles = columns.map((_, depth) => (depth === 0 ? 'スタート' : `${depth}手目`));
  if (unreachable.length > 0) {
    columns.push(unreachable);
    columnTitles.push('到達不能');
  }
  const columnOf = new Map();
  columns.forEach((column, index) => column.forEach((no) => columnOf.set(no, index)));

  // 遷移を「前へ進む」と「戻る（前の列・同じ列へ）」に分ける
  const edges = [];
  for (const card of cards) {
    const seen = new Set();
    for (const choice of card.choices) {
      const target = choice.target;
      if (target === null || target === card.no || !byNo.has(target) || seen.has(target)) continue;
      seen.add(target);
      const fromColumn = columnOf.get(card.no);
      const toColumn = columnOf.get(target);
      const span = toColumn - fromColumn;
      edges.push({
        from: card.no,
        to: target,
        fromColumn,
        toColumn,
        hidden: choice.hideTarget,
        isBack: span <= 0,
        isLong: span > 1,
      });
    }
  }
  orderColumns(columns, edges.filter((edge) => !edge.isBack), sweeps);
  return { columns, columnTitles, edges, depths };
}

export function renderFlow(container, content, issues, onSelect, options = {}) {
  const L = FLOW_LAYOUT;
  const { cards } = content;
  const { columns, columnTitles, edges, depths } = computeFlowLayout(cards);
  const problemNos = new Set(
    issues.filter((issue) => issue.cardNo !== null && issue.severity !== 'info').map((issue) => issue.cardNo)
  );

  const positions = new Map();
  columns.forEach((column, columnIndex) => {
    column.forEach((no, rowIndex) => {
      positions.set(no, {
        x: L.padding + columnIndex * (L.nodeWidth + L.columnGap),
        y: L.padding + L.headerHeight + rowIndex * (L.nodeHeight + L.rowGap),
      });
    });
  });

  const maxRows = Math.max(...columns.map((column) => column.length));
  const width = L.padding * 2 + columns.length * L.nodeWidth + (columns.length - 1) * L.columnGap;
  const height = L.padding * 2 + L.headerHeight + maxRows * (L.nodeHeight + L.rowGap) + L.backEdgeDrop;

  const svg = svgElement('svg', { width, height, viewBox: `0 0 ${width} ${height}` }, 'flow-svg');
  svg.classList.toggle('show-back', options.showBackEdges === true);

  const defs = svgElement('defs');
  const marker = svgElement('marker', {
    id: 'flow-arrow',
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: 'auto-start-reverse',
  });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z' }, 'arrow-head'));
  defs.append(marker);
  svg.append(defs);

  columnTitles.forEach((title, index) => {
    const label = svgElement('text', {
      x: L.padding + index * (L.nodeWidth + L.columnGap),
      y: L.padding + L.headerHeight - 10,
    }, 'flow-column-title');
    label.textContent = title;
    svg.append(label);
  });

  // 矢印（ノードより下に描く）
  const edgeElements = [];
  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    let d;
    if (edge.isBack) {
      // 戻る遷移: ノードの下側から出て、戻り先の下側へ弧を描く
      const x1 = from.x + L.nodeWidth / 2;
      const y1 = from.y + L.nodeHeight;
      const x2 = to.x + L.nodeWidth / 2 + 10;
      const y2 = to.y + L.nodeHeight;
      const drop = Math.max(y1, y2) + L.backEdgeDrop;
      d = `M ${x1} ${y1} C ${x1} ${drop}, ${x2} ${drop}, ${x2} ${y2}`;
    } else {
      const x1 = from.x + L.nodeWidth;
      const y1 = from.y + L.nodeHeight / 2;
      const x2 = to.x;
      const y2 = to.y + L.nodeHeight / 2;
      const bend = Math.max(40, (x2 - x1) / 2);
      d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
    }
    const classes = ['flow-edge'];
    if (edge.hidden) classes.push('is-hidden-target');
    if (edge.isBack) classes.push('is-back');
    if (edge.isLong) classes.push('is-long');
    const path = svgElement('path', { d, 'marker-end': 'url(#flow-arrow)' }, classes.join(' '));
    path.dataset.from = String(edge.from);
    path.dataset.to = String(edge.to);
    svg.append(path);
    edgeElements.push(path);
  }

  for (const card of cards) {
    const { x, y } = positions.get(card.no);
    const classes = ['flow-node', `type-${card.cardType}`];
    if (!depths.has(card.no)) classes.push('is-unreachable');
    if (problemNos.has(card.no)) classes.push('has-issue');
    const group = svgElement('g', { transform: `translate(${x} ${y})`, tabindex: 0, role: 'button' }, classes.join(' '));
    group.append(svgElement('rect', { width: L.nodeWidth, height: L.nodeHeight, rx: 6 }));

    const number = svgElement('text', { x: 8, y: 19 }, 'node-no');
    const typeMark = card.cardType === 'ending' ? ' ★' : card.cardType === 'deadEnd' ? ' ↩' : '';
    number.textContent = `No.${card.no}${typeMark}`;
    const snippet = svgElement('text', { x: 8, y: 37 }, 'node-text');
    snippet.textContent = shorten(card.body || card.label, L.snippetChars) || '（未入力）';
    group.append(number, snippet);

    // 戻る遷移の行き先は、矢印の代わりに番号で示す
    const backTargets = edges.filter((edge) => edge.from === card.no && edge.isBack).map((edge) => edge.to);
    if (backTargets.length > 0) {
      const back = svgElement('text', { x: L.nodeWidth - 8, y: 18, 'text-anchor': 'end' }, 'node-back');
      back.textContent = `↩${backTargets.sort((a, b) => a - b).join('・')}`;
      group.append(back);
    }

    const title = svgElement('title');
    title.textContent = `No.${card.no}\n${shorten(card.body || card.label, 60)}`;
    group.append(title);

    group.addEventListener('click', () => onSelect(card.no));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(card.no);
      }
    });
    const setHover = (isOn) => {
      svg.classList.toggle('is-hovering', isOn);
      for (const edge of edgeElements) {
        const related = edge.dataset.from === String(card.no) || edge.dataset.to === String(card.no);
        edge.classList.toggle('is-active', isOn && related);
      }
      group.classList.toggle('is-active', isOn);
    };
    group.addEventListener('mouseenter', () => setHover(true));
    group.addEventListener('mouseleave', () => setHover(false));
    group.addEventListener('focus', () => setHover(true));
    group.addEventListener('blur', () => setHover(false));

    svg.append(group);
  }

  container.replaceChildren(svg);
}

export function initFlowView(app) {
  const container = document.getElementById('flow-view');
  const showBackCheckbox = document.getElementById('flow-show-back');
  showBackCheckbox.checked = app.ui.flowShowBack;

  const render = () => {
    renderFlow(
      container,
      app.content,
      app.issues,
      (no) => {
        app.selectCard(no);
        app.showTab('edit');
      },
      { showBackEdges: app.ui.flowShowBack }
    );
  };
  const renderIfVisible = () => {
    if (app.ui.activeTab === 'flow') render();
  };

  showBackCheckbox.addEventListener('change', () => {
    app.ui.flowShowBack = showBackCheckbox.checked;
    app.saveUiSoon();
    container.querySelector('.flow-svg')?.classList.toggle('show-back', app.ui.flowShowBack);
  });

  app.on('content', renderIfVisible);
  app.on('reload', renderIfVisible);
  app.on('tab', renderIfVisible);
}
