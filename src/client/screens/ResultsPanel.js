/**
 * 屏幕 3 · 结果（挂在表单下面，不是第四个屏幕）。
 * 空态一句话；有结果就一行一个徽章，点开看细目。
 */

import { h } from '../h.js'
import { ResultRow } from '../components/ResultRow.js'

/**
 * @param {{
 *   model: { rows: any[], emptyText: string },
 *   onToggle: Function, onCopy: Function, onCancel: Function, onRepair: Function,
 * }} props
 */
export function ResultsPanel({ model, onToggle, onCopy, onCancel, onRepair, onReveal }) {
  return h('section', { className: 'kq-results', 'aria-label': '结果' },
    h('div', { className: 'kq-sec__label' }, '结果'),
    model.queue && model.queue.text ? h('p', { className: 'kq-hint' }, model.queue.text) : null,
    model.rows.length === 0
      ? h('p', { className: 'kq-empty' }, model.emptyText)
      : h('ul', { className: 'kq-result-list' }, model.rows.map((row) => h(ResultRow, {
        key: row.id,
        row,
        onToggle: () => onToggle(row.id),
        onCopy,
        onCancel: () => onCancel(row.id),
        onRepair: () => onRepair(row),
        onReveal,
      }))))
}


