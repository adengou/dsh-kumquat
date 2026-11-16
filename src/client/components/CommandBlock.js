/**
 * 可复制命令块：一行等宽命令 + 复制按钮。复制反馈来自全局 copied 状态。
 */

import { h } from '../h.js'
import { GhostButton } from './Button.js'

/**
 * @param {{ command: string, copied?: boolean, onCopy: Function }} props
 */
export function CommandBlock({ command, copied, onCopy }) {
  return h('div', { className: 'kq-cmd' },
    h('code', { className: 'kq-cmd__text', title: command }, command),
    h('span', { className: 'kq-cmd__copy' },
      h(GhostButton, {
        label: copied === true ? '已复制' : '复制命令',
        onClick: onCopy,
        ariaLabel: '复制可执行命令',
      })))
}
