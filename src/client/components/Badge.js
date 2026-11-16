/**
 * 徽章：一行一个结论。颜色只出现在圆点与描边，文字沿用正文色——
 * 浅色主题下绿/琥珀/红做文字会低于 4.5:1，这里从结构上避开。
 */

import { h } from '../h.js'

/**
 * @param {{ kind?: 'pass' | 'warn' | 'fail' | 'busy' | 'muted', label: string, title?: string }} props
 */
export function Badge({ kind, label, title }) {
  const tone = kind === 'pass' || kind === 'warn' || kind === 'fail' || kind === 'busy' || kind === 'muted' ? kind : 'muted'
  return h('span', {
    className: `kq-badge kq-badge--${tone}`,
    title,
  },
  h('span', { className: 'kq-badge__dot', 'aria-hidden': 'true' }),
  h('span', { className: 'kq-badge__label' }, label))
}
