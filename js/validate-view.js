// 整合性チェック画面（validate.js の結果を表示する）
import { CARD_COUNT } from './config.js';
import { computeStats, countProblems } from './validate.js';

const GROUPS = [
  { severity: 'error', title: 'エラー（必ず直す）' },
  { severity: 'warning', title: '警告（意図的でなければ直す）' },
  { severity: 'info', title: '情報' },
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initValidateView(app) {
  const container = document.getElementById('validate-view');

  function render() {
    container.replaceChildren();
    const stats = computeStats(app.content);

    const statsRow = element('div', 'stats');
    const addStat = (value, label) => {
      const box = element('div', 'stat');
      box.append(element('strong', null, value), element('span', null, label));
      statsRow.append(box);
    };
    addStat(`${stats.filledCount} / ${CARD_COUNT}`, '入力済みのカード');
    addStat(`${stats.reachableCount} / ${CARD_COUNT}`, '1番から到達できるカード');
    addStat(`${stats.reachableEndingCount} / ${stats.endingCount}`, '到達できるエンディング');
    container.append(statsRow);

    if (countProblems(app.issues) === 0) {
      container.append(element('p', 'all-clear', '✔ エラー・警告はありません'));
    }

    for (const group of GROUPS) {
      const issues = app.issues.filter((issue) => issue.severity === group.severity);
      if (issues.length === 0) continue;
      const section = element('section', 'issue-group');
      section.append(element('h2', null, `${group.title}　${issues.length}件`));
      const list = element('ul', 'issue-list');
      for (const issue of issues) {
        const item = element('li');
        const button = element('button', `issue is-${issue.severity}`);
        button.type = 'button';
        button.append(
          element('span', 'no', issue.cardNo === null ? '全体' : `No.${issue.cardNo}`),
          element('span', 'message', issue.message)
        );
        if (issue.cardNo !== null) {
          button.addEventListener('click', () => {
            app.selectCard(issue.cardNo);
            app.showTab('edit');
          });
        } else {
          button.disabled = true;
        }
        item.append(button);
        list.append(item);
      }
      section.append(list);
      container.append(section);
    }
  }

  const renderIfVisible = () => {
    if (app.ui.activeTab === 'validate') render();
  };
  app.on('content', renderIfVisible);
  app.on('reload', renderIfVisible);
  app.on('tab', renderIfVisible);
}
