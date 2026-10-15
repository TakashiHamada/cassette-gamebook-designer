// カード間の遷移グラフに関する純関数。DOM非依存。
import { START_CARD_NO } from './config.js';

// 1枚のカードから出る遷移先番号（未設定を除き、重複なし）
export function getOutgoingTargets(card) {
  const targets = new Set();
  for (const choice of card.choices) {
    if (Number.isInteger(choice.target)) targets.add(choice.target);
  }
  return [...targets];
}

// 遷移元の逆引き: Map<カード番号, 遷移元番号の昇順配列>（自己ループは除く）
export function buildIncomingMap(cards) {
  const incoming = new Map();
  for (const card of cards) {
    for (const target of getOutgoingTargets(card)) {
      if (target === card.no) continue;
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push(card.no);
    }
  }
  for (const sources of incoming.values()) sources.sort((a, b) => a - b);
  return incoming;
}

// 開始カードからの最短手数（BFS）。到達できないカードは含まれない。
export function computeDepths(cards, startNo = START_CARD_NO) {
  const byNo = new Map(cards.map((card) => [card.no, card]));
  const depths = new Map();
  if (!byNo.has(startNo)) return depths;
  depths.set(startNo, 0);
  const queue = [startNo];
  for (let head = 0; head < queue.length; head += 1) {
    const no = queue[head];
    for (const target of getOutgoingTargets(byNo.get(no))) {
      if (byNo.has(target) && !depths.has(target)) {
        depths.set(target, depths.get(no) + 1);
        queue.push(target);
      }
    }
  }
  return depths;
}
