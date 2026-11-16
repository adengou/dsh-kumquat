/**
 * 格式胶囊：九个目标，一个必答项。
 * 键盘：Tab 进组，方向键在可用项之间移动并选中，Home/End 跳首尾。
 */

import { h, cx } from '../h.js'
import { radioMove } from '../logic.js'

/**
 * @param {{
 *   targets: Array<{ ext: string, label: string, note?: string, selected: boolean, disabled: boolean, reason?: string | null }>,
 *   value: string | null,
 *   onChange: Function,
 *   label?: string,
 * }} props
 */
export function FormatPills({ targets, value, onChange, label }) {
  const hasSelection = targets.some((target) => target.selected)
  const firstEnabled = targets.reduce((found, target, index) => (found === -1 && !target.disabled ? index : found), -1)
  const onKeyDown = (event) => {
    const currentIndex = targets.findIndex((target) => target.selected)
    const start = currentIndex === -1 ? firstEnabled : currentIndex
    const enabled = targets.map((target, index) => (target.disabled ? -1 : index)).filter((index) => index !== -1)
    if (enabled.length === 0) return
    const keyed = radioMove(enabled.indexOf(start), event.key, enabled.length)
    if (keyed === -1) return
    event.preventDefault()
    const nextTarget = targets[enabled[keyed]]
    if (!nextTarget) return
    onChange(nextTarget.ext)
    const group = event.currentTarget
    const buttons = group && typeof group.querySelectorAll === 'function'
      ? Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'))
      : []
    const button = buttons[enabled[keyed]]
    if (button && typeof button.focus === 'function' && button.disabled !== true) button.focus()
  }
  return h('div', {
    className: 'kq-pills',
    role: 'radiogroup',
    'aria-label': label || '转成什么格式',
    onKeyDown,
  }, targets.map((target, index) => h('button', {
    key: target.ext,
    type: 'button',
    role: 'radio',
    'aria-checked': target.selected ? 'true' : 'false',
    'aria-disabled': target.disabled ? 'true' : undefined,
    'aria-label': target.disabled && target.reason ? `${target.label}（不可用：${target.reason}）` : target.label,
    className: cx('kq-pill', target.selected && 'is-on'),
    disabled: target.disabled,
    title: target.disabled ? target.reason : target.note,
    tabIndex: target.selected ? 0 : !hasSelection && index === firstEnabled ? 0 : -1,
    onClick: () => onChange(target.ext),
  }, target.label)))
}
