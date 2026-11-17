/** 裁剪片段：默认关闭；开启后按 起/止 时间只转中间一段。 */

import { h, cx } from './../h.js'
import { KqIcon } from './Icon.js'

/**
 * @param {{
 *   trim: { enabled: boolean, fromText: string, toText: string, maxText: string, error: string | null },
 *   onToggle: (enabled: boolean) => void,
 *   onText: (field: 'fromText' | 'toText', value: string) => void,
 * }} props
 */
export function TrimFields({ trim, onToggle, onText }) {
  const enabled = trim.enabled === true
  return h('div', { className: 'kq-trim' },
    h('button', {
      type: 'button',
      role: 'checkbox',
      'aria-checked': enabled ? 'true' : 'false',
      'aria-label': '裁剪片段',
      className: cx('kq-check', enabled && 'is-on'),
      onClick: () => onToggle(!enabled),
    },
    h('span', { className: 'kq-check__box', 'aria-hidden': 'true' },
      enabled ? h(KqIcon, { name: 'check', size: 10 }) : null),
    h('span', { className: 'kq-check__label' }, '裁剪片段')),
    enabled
      ? h('div', { className: 'kq-trim__row' },
        h('label', { className: 'kq-field kq-trim__field' },
          h('span', { className: 'kq-field__label' }, '起'),
          h('input', {
            type: 'text',
            className: 'kq-input',
            value: trim.fromText,
            spellCheck: 'false',
            autoComplete: 'off',
            onChange: (event) => onText('fromText', event.target.value),
          })),
        h('label', { className: 'kq-field kq-trim__field' },
          h('span', { className: 'kq-field__label' }, '止'),
          h('input', {
            type: 'text',
            className: 'kq-input',
            value: trim.toText,
            placeholder: trim.maxText,
            spellCheck: 'false',
            autoComplete: 'off',
            onChange: (event) => onText('toText', event.target.value),
          })),
        h('span', { className: 'kq-hint' }, '原片 ' + trim.maxText + '；留空表示到结尾。'))
      : h('p', { className: 'kq-hint' }, '不裁剪，整段转换。'),
    trim.error ? h('p', { className: 'kq-error', role: 'alert' }, trim.error) : null)
}
