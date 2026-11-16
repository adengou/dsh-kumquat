/**
 * 任务卡：屏幕 1 的两张入口。整卡可点、可键盘触发；缺能力时给出原因。
 */

import { h, cx } from '../h.js'
import { KqIcon } from './Icon.js'

/**
 * @param {{ title: string, desc: string, disabled?: boolean, reason?: string | null, onSelect?: Function }} props
 */
export function TaskCard({ title, desc, disabled, reason, onSelect }) {
  const isDisabled = disabled === true
  const label = isDisabled && reason ? `${title}：${desc}（不可用：${reason}）` : `${title}：${desc}`
  return h('button', {
    type: 'button',
    className: cx('kq-task', isDisabled && 'is-disabled'),
    onClick: isDisabled ? undefined : onSelect,
    disabled: isDisabled,
    'aria-label': label,
    title: isDisabled && reason ? reason : desc,
  },
  h('span', { className: 'kq-task__body' },
    h('span', { className: 'kq-task__title' }, title),
    h('span', { className: 'kq-task__desc' }, desc),
    isDisabled && reason ? h('span', { className: 'kq-task__reason' }, reason) : null),
  h('span', { className: 'kq-task__arrow' }, h(KqIcon, { name: 'chevronRight', size: 16 })))
}
