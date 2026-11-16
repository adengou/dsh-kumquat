/**
 * 结果行：一行一个徽章，点开才展开「期望 / 实际 / 差多少 / 下一步 / 命令」。
 * 不弹窗、不跳页，结果就挂在表单下面。
 */

import { h } from '../h.js'
import { Badge } from './Badge.js'
import { KqIcon } from './Icon.js'
import { GhostButton } from './Button.js'
import { CommandBlock } from './CommandBlock.js'

/**
 * @param {{ id: string }} row
 */
function detailId(row) {
  return `kq-detail-${String(row.id).replace(/[^A-Za-z0-9_-]/g, '')}`
}

/**
 * @param {{
 *   row: any,
 *   onToggle: Function, onCopy: Function, onCancel: Function, onRepair: Function,
 * }} props
 */
export function ResultRow({ row, onToggle, onCopy, onCancel, onRepair, onReveal }) {
  const expanded = row.expanded === true
  const detail = row.detail
  return h('li', { className: 'kq-result' },
    h('button', {
      type: 'button',
      className: 'kq-result__sum',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': detailId(row),
      onClick: onToggle,
    },
    h(Badge, { kind: row.badge.kind, label: row.badge.label, title: row.badge.note }),
    h('span', { className: 'kq-result__name' },
      h('span', { className: 'kq-result__file' }, row.title),
      h('span', { className: 'kq-result__meta' }, row.meta)),
    h('span', { className: 'kq-result__badgeNote' }, row.badge.note),
    h(KqIcon, { name: expanded ? 'chevronUp' : 'chevronDown', size: 16 })),
    row.active && row.progress
      ? h('div', { className: 'kq-rowprogress' },
        h('div', {
          className: 'kq-progress',
          role: 'progressbar',
          'aria-label': `${row.title} 进度`,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': row.progress.ariaValue,
          'aria-valuetext': row.progress.text,
        }, h('span', {
          className: cx('kq-progress__fill', row.progress.percent === null && 'kq-progress__fill--indeterminate'),
          style: { width: row.progress.percent === null ? '35%' : `${row.progress.percent}%` },
        })),
        h('span', { className: 'kq-progress__text' }, row.progress.text))
      : null,
    expanded
      ? h('div', {
        className: 'kq-result__detail',
        id: detailId(row),
        role: 'region',
        'aria-label': `${row.title} 验收细目`,
      },
      h('dl', { className: 'kq-dl' },
        detail.outputPath
          ? h('dt', null, '输出')
          : null,
        detail.outputPath
          ? h('dd', { className: 'kq-dl__path', title: detail.outputPath }, detail.outputPath)
          : null,
        h('dt', null, '期望'),
        h('dd', null, detail.expected),
        h('dt', null, '实际'),
        h('dd', null, detail.actual),
        h('dt', null, '差多少'),
        h('dd', null, detail.delta),
        h('dt', null, '下一步'),
        h('dd', null, detail.next)),
      detail.checks && detail.checks.length > 0
        ? h('ul', { className: 'kq-checks', 'aria-label': '逐项检查' }, detail.checks.map((check) => h('li', {
          key: check.id,
          className: 'kq-check-row',
        },
        h('span', { className: 'kq-check-row__id' }, `${check.id} · ${check.outcome}`),
        h('span', { className: 'kq-check-row__text' }, check.text || '—',
          check.delta ? h('span', { className: 'kq-check-row__delta' }, ` （${check.delta}）`) : null))))
        : null,
      row.command ? h(CommandBlock, { command: row.command, copied: row.copied, onCopy: () => onCopy(row.command) }) : null,
      h('div', { className: 'kq-result__actions' },
        row.active ? h(GhostButton, { label: '取消任务', onClick: onCancel, ariaLabel: `取消任务 ${row.title}` }) : null,
        row.canRepair ? h(GhostButton, { label: '按建议修复', onClick: onRepair, ariaLabel: `按验收建议修复 ${row.title}` }) : null,
        row.output ? h(GhostButton, { label: '打开文件夹', onClick: () => onReveal(row.output), ariaLabel: `打开所在文件夹 ${row.output}` }) : null,
        row.output ? h(GhostButton, { label: '复制输出路径', onClick: () => onCopy(row.output), ariaLabel: `复制输出路径 ${row.output}` }) : null))
      : null)
}

