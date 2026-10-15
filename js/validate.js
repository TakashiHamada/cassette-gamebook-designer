// 整合性チェック。DOM非依存の純関数。
import { START_CARD_NO, BODY_CHAR_GUIDE } from './config.js';
import { computeDepths } from './graph-utils.js';

// severity: 'error' | 'warning' | 'info'
// cardNo: 対象カード番号。全体に関する指摘は null
function isBlankCard(card) {
  return card.label.trim() === '' && card.body.trim() === '' && card.choices.length === 0;
}

export function validateContent(content) {
  const issues = [];
  const add = (cardNo, severity, code, message) => issues.push({ cardNo, severity, code, message });
  const { cards } = content;
  const depths = computeDepths(cards, START_CARD_NO);

  for (const card of cards) {
    const no = card.no;

    if (isBlankCard(card)) {
      if (depths.has(no) && no !== START_CARD_NO) {
        add(no, 'warning', 'empty-body', '他のカードから遷移できますが、まだ何も入力されていません');
      } else {
        add(no, 'info', 'blank-card', 'まだ何も入力されていません');
      }
      continue;
    }

    const bodyLength = card.body.replace(/\s/g, '').length;
    if (card.body.trim() === '') {
      add(no, 'warning', 'empty-body', '裏面の本文が未入力です');
    } else if (bodyLength > BODY_CHAR_GUIDE) {
      add(no, 'warning', 'body-too-long', `本文が長めです（${bodyLength}文字／目安${BODY_CHAR_GUIDE}文字）`);
    }
    if (card.body.trim() !== '' && card.speaker.trim() === '') {
      add(no, 'warning', 'no-speaker', '話者が未入力です（読み上げる人が誰の声か分かりません）');
    }

    card.choices.forEach((choice, index) => {
      const name = `選択肢${index + 1}`;
      const quoted = choice.text.trim() ? `「${choice.text.trim()}」` : '';
      if (choice.target === null) {
        add(no, 'error', 'choice-no-target', `${name}${quoted}の遷移先が未設定です`);
      } else if (choice.target === no) {
        add(no, 'warning', 'self-loop', `${name}${quoted}が自分自身へ遷移します`);
      }
      if (choice.text.trim() === '') {
        add(no, 'warning', 'choice-no-text', `${name}の行動テキストが未入力です`);
      }
    });

    if (card.choices.length === 0 && card.cardType === 'normal') {
      add(
        no,
        'warning',
        'dead-end',
        '選択肢がありません（意図的な行き止まり／エンディングなら「カードの種類」を変更してください）'
      );
    }
    if (card.cardType === 'ending' && card.choices.length > 0) {
      add(no, 'warning', 'ending-has-choices', 'エンディングですが選択肢が設定されています');
    }
    if (!depths.has(no)) {
      add(no, 'warning', 'unreachable', '1番から到達できません（どの選択肢からもつながっていません）');
    }
  }

  const endings = cards.filter((card) => card.cardType === 'ending');
  if (endings.length === 0) {
    add(null, 'warning', 'no-ending', 'エンディングのカードがありません');
  } else if (!endings.some((card) => depths.has(card.no))) {
    add(null, 'error', 'no-reachable-ending', '1番から到達できるエンディングがありません');
  }

  const rank = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return (a.cardNo ?? 0) - (b.cardNo ?? 0);
  });
  return issues;
}

export function computeStats(content) {
  const depths = computeDepths(content.cards, START_CARD_NO);
  const endings = content.cards.filter((card) => card.cardType === 'ending');
  return {
    filledCount: content.cards.filter((card) => !isBlankCard(card)).length,
    reachableCount: depths.size,
    endingCount: endings.length,
    reachableEndingCount: endings.filter((card) => depths.has(card.no)).length,
  };
}

// バッジなどに出す件数（info は数えない）
export function countProblems(issues) {
  return issues.filter((issue) => issue.severity !== 'info').length;
}
