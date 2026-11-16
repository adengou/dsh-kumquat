/**
 * GIF 三个默认参数：帧率、宽度、目标体积。默认 12 / 480 / 8MB，都改得动。
 */

import { h } from '../h.js'

/**
 * @param {{
 *   fields: { fps: number, width: number, maxMB: number | null, fpsOptions: number[], widthOptions: number[] },
 *   onChange: (field: 'fps' | 'width' | 'maxMB', value: any) => void,
 * }} props
 */
export function GifFields({ fields, onChange }) {
  return h('div', { className: 'kq-params' },
    h('label', { className: 'kq-field' },
      h('span', { className: 'kq-field__label' }, '帧率'),
      h('select', {
        className: 'kq-input kq-select',
        value: String(fields.fps),
        'aria-label': 'GIF 帧率',
        onChange: (event) => onChange('fps', Number(event.target.value)),
      }, fields.fpsOptions.map((option) => h('option', { key: option, value: String(option) }, `${option} fps`)))),
    h('label', { className: 'kq-field' },
      h('span', { className: 'kq-field__label' }, '宽度'),
      h('select', {
        className: 'kq-input kq-select',
        value: String(fields.width),
        'aria-label': 'GIF 宽度（像素）',
        onChange: (event) => onChange('width', Number(event.target.value)),
      }, fields.widthOptions.map((option) => h('option', { key: option, value: String(option) }, `${option}px`)))),
    h('label', { className: 'kq-field' },
      h('span', { className: 'kq-field__label' }, '目标体积'),
      h('input', {
        type: 'number',
        className: 'kq-input',
        min: 0.5,
        max: 100,
        step: 0.5,
        value: fields.maxMB === null || fields.maxMB === undefined ? '' : String(fields.maxMB),
        placeholder: '不限',
        'aria-label': 'GIF 目标体积（MB，留空表示不设上限）',
        onChange: (event) => onChange('maxMB', event.target.value === '' ? null : Number(event.target.value)),
      })))
}
