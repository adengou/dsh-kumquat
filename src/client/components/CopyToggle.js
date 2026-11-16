/**
 * 「仅换封装」勾选：能拷贝就点亮；不能就置灰，并把原因与预计耗时写在旁边。
 */

import { h, cx } from '../h.js'
import { KqIcon } from './Icon.js'

/**
 * @param {{
 *   copy: { checked: boolean, disabled: boolean, reason: string | null, etaSec: number | null, mode: string, label: string, meta: string },
 *   onChange: Function,
 * }} props
 */
export function CopyToggle({ copy, onChange }) {
  const disabled = copy.disabled === true
  const checked = copy.checked === true && !disabled
  return h('div', { className: 'kq-copy' },
    h('button', {
      type: 'button',
      role: 'checkbox',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': '仅换封装（不重编码）',
      className: cx('kq-check', checked && 'is-on'),
      disabled,
      title: disabled ? copy.reason || '当前组合需要重编码' : '能拷贝时不重编码',
      onClick: () => onChange(!checked),
    },
    h('span', { className: 'kq-check__box', 'aria-hidden': 'true' },
      checked ? h(KqIcon, { name: 'check', size: 10 }) : null),
    h('span', { className: 'kq-check__label' }, '仅换封装')),
    h('span', { className: cx('kq-check__meta', disabled && 'kq-check__meta--warn') }, copy.meta))
}
