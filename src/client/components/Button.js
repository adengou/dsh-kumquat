/**
 * 按钮三件套：主按钮、幽灵按钮、链接按钮。
 * 忙态写进 aria-busy 且保留原文案（加省略号），禁用的原因由旁边的说明承担。
 */

import { h, cx } from '../h.js'

/**
 * @param {{ label: string, onClick?: Function, disabled?: boolean, busy?: boolean, big?: boolean, title?: string, ariaLabel?: string }} props
 */
export function PrimaryButton({ label, onClick, disabled, busy, big, title, ariaLabel }) {
  const isBusy = busy === true
  return h('button', {
    type: 'button',
    className: cx('kq-btn', 'kq-btn--primary', big && 'kq-btn--big'),
    onClick,
    disabled: disabled === true || isBusy,
    'aria-busy': isBusy ? 'true' : undefined,
    'aria-label': ariaLabel,
    title,
  }, isBusy ? `${label}…` : label)
}

/**
 * @param {{ label: string, onClick?: Function, disabled?: boolean, busy?: boolean, title?: string, ariaLabel?: string }} props
 */
export function GhostButton({ label, onClick, disabled, busy, title, ariaLabel }) {
  const isBusy = busy === true
  return h('button', {
    type: 'button',
    className: 'kq-btn kq-btn--ghost',
    onClick,
    disabled: disabled === true || isBusy,
    'aria-busy': isBusy ? 'true' : undefined,
    'aria-label': ariaLabel,
    title,
  }, isBusy ? `${label}…` : label)
}

/**
 * @param {{ label: string, onClick?: Function, disabled?: boolean, title?: string, ariaLabel?: string }} props
 */
export function LinkButton({ label, onClick, disabled, title, ariaLabel }) {
  return h('button', {
    type: 'button',
    className: 'kq-btn kq-btn--link',
    onClick,
    disabled: disabled === true,
    'aria-label': ariaLabel,
    title,
  }, label)
}
