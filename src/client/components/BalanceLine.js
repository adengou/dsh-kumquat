/**
 * 底部余额小字：`余额 ¥12.34` / `余额 未配置` / `余额 未连接`。
 * 无 key 不报错，读取中也不占位置。
 */

import { h, cx } from '../h.js'

/**
 * @param {{ text: string, tone?: 'ready' | 'muted' | 'error' }} props
 */
export function BalanceLine({ text, tone }) {
  return h('p', {
    className: cx('kq-balance', tone === 'ready' && 'kq-balance--ready', tone === 'error' && 'kq-balance--error'),
    'aria-live': 'polite',
  }, text)
}
