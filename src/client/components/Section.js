/**
 * 分区：一行小标签 + 内容。标签是视觉层级，不抢标题。
 */

import { h } from '../h.js'

/**
 * @param {{ label?: string, children?: any, hint?: string }} props
 */
export function Section({ label, children, hint }) {
  return h('div', { className: 'kq-sec' },
    label ? h('div', { className: 'kq-sec__label' }, label) : null,
    children,
    hint ? h('p', { className: 'kq-hint' }, hint) : null)
}
