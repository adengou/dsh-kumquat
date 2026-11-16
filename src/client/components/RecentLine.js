/**
 * 「最近」一行：只放产物，最多两条；没有就写「还没有记录」。
 */

import { h } from '../h.js'
import { Badge } from './Badge.js'

/**
 * @param {{ recent: { status: string, items: Array<{ id: string, name: string, badge: string }>, text: string } }} props
 */
export function RecentLine({ recent }) {
  return h('p', { className: 'kq-recent' },
    h('span', { className: 'kq-recent__label' }, '最近'),
    recent.items.length > 0
      ? recent.items.map((item) => h(Badge, {
        key: item.id,
        kind: item.badge === 'fail' ? 'fail' : item.badge === 'warn' ? 'warn' : 'pass',
        label: item.name,
      }))
      : h('span', { className: 'kq-recent__empty' }, recent.text))
}
