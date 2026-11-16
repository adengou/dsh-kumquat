/**
 * 缺 FFmpeg 横幅（D8）：只在「本机没有且没装好」时出现。
 * 一条横幅、一个主按钮、一条进度、一个取消；失败给一句人话 + 重试，不弹模态。
 */

import { h, cx } from '../h.js'
import { GhostButton, PrimaryButton } from './Button.js'

/**
 * @param {{
 *   binary: {
 *     visible: boolean, installing: boolean, title: string, hint: string, actionLabel: string,
 *     percent: number | null, indeterminate: boolean, phaseText: string, ariaValue?: number,
 *     error: any, cancelled: boolean, canInstall: boolean, sizeHint: number,
 *   },
 *   onInstall: Function,
 *   onCancel: Function,
 * }} props
 */
export function BinaryBanner({ binary, onInstall, onCancel }) {
  if (binary.visible !== true) return null
  const percent = binary.percent
  return h('div', {
    className: 'kq-banner',
    role: 'region',
    'aria-label': 'FFmpeg 安装状态',
  },
  h('p', { className: 'kq-banner__title' }, binary.title),
  binary.installing
    ? h('div', { className: 'kq-banner__row' },
      h('div', {
        className: 'kq-progress',
        role: 'progressbar',
        'aria-label': 'FFmpeg 下载进度',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': binary.ariaValue,
        'aria-valuetext': binary.phaseText,
      }, h('span', {
        className: cx('kq-progress__fill', binary.indeterminate && 'kq-progress__fill--indeterminate'),
        style: { width: percent === null ? '35%' : `${percent}%` },
      })),
      h('span', { className: 'kq-progress__text' }, binary.phaseText),
      h(GhostButton, { label: '取消', onClick: onCancel, ariaLabel: '取消 FFmpeg 下载' }))
    : h('div', { className: 'kq-banner__actions' },
      h(PrimaryButton, { label: binary.actionLabel, onClick: onInstall, disabled: binary.canInstall !== true }),
      h('span', { className: 'kq-banner__hint' }, binary.hint)),
  binary.error
    ? h('p', { className: 'kq-banner__error', role: 'alert' }, `${binary.error.message}${binary.error.hint ? ` ${binary.error.hint}` : ''}`)
    : binary.cancelled && !binary.installing
      ? h('p', { className: 'kq-banner__hint' }, '已取消，可以重试。')
      : null)
}
