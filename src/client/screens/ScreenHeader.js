/**
 * 顶栏：返回、标识、当前任务名、FFmpeg 状态。状态只报事实，不报进度。
 */

import { h } from '../h.js'
import { KqIcon } from '../components/Icon.js'

/**
 * @param {{ header: { title: string, sub: string, backVisible: boolean, status: string, statusTone: string }, onBack: Function }} props
 */
export function ScreenHeader({ header, onBack }) {
  return h('div', { className: 'kq-head' },
    header.backVisible
      ? h('button', {
        type: 'button',
        className: 'kq-back',
        onClick: onBack,
        'aria-label': '返回选任务',
        title: '返回',
      }, h(KqIcon, { name: 'arrowLeft', size: 18 }))
      : null,
    h('span', { className: 'kq-mark', 'aria-hidden': 'true' }, 'K'),
    h('span', { className: 'kq-title' }, header.title),
    h('span', { className: 'kq-sub' }, header.sub),
    h('span', {
      className: `kq-status kq-status--${header.statusTone}`,
      role: 'status',
      'aria-live': 'polite',
    }, header.status))
}
