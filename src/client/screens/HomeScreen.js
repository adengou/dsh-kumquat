/**
 * 屏幕 1 · 选任务：一个问题、两张卡、一行「最近」。
 */

import { h } from '../h.js'
import { TaskCard } from '../components/TaskCard.js'
import { RecentLine } from '../components/RecentLine.js'

/**
 * @param {{ model: any, onOpen: (screen: 'convert' | 'gif') => void }} props
 */
export function HomeScreen({ model, onOpen }) {
  return h('div', { className: 'kq-screen' },
    h('h2', { className: 'kq-question' }, model.question),
    model.cards.map((card) => h(TaskCard, {
      key: card.key,
      title: card.title,
      desc: card.desc,
      disabled: card.disabled,
      reason: card.reason,
      onSelect: () => onOpen(card.key),
    })),
    h(RecentLine, { recent: model.recent }))
}
