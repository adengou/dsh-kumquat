/** 输出位置：默认与源文件同目录，可点「选择」改到任意文件夹。 */

import { h } from '../h.js'
import { GhostButton } from './Button.js'

/**
 * @param {{ dir: string, onChoose: Function }} props
 */
export function OutputPicker({ dir, onChoose }) {
  const text = typeof dir === 'string' && dir !== '' ? dir : '与源文件同目录'
  return h('div', { className: 'kq-output' },
    h('span', { className: 'kq-output__label' }, '输出位置'),
    h('span', { className: 'kq-output__path', title: text }, text),
    h(GhostButton, { label: '选择', onClick: onChoose, ariaLabel: '选择输出文件夹' }))
}
