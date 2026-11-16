/**
 * 未连接 / 缺能力提示：一条即可，带重试；不遮界面，不弹窗。
 */

import { h } from '../h.js'
import { GhostButton } from './Button.js'

/**
 * @param {{ title: string, message: string, hint?: string, onRetry?: Function, busy?: boolean }} props
 */
export function OfflineNote({ title, message, hint, onRetry, busy }) {
  return h('div', { className: 'kq-offline', role: 'status' },
    h('p', { className: 'kq-offline__title' }, title),
    h('p', { className: 'kq-offline__hint' }, `${message}${hint ? ` ${hint}` : ''}`),
    typeof onRetry === 'function'
      ? h('div', { className: 'kq-banner__actions' },
        h(GhostButton, { label: '重试连接', onClick: onRetry, busy, ariaLabel: '重试连接宿主' }))
      : null)
}
