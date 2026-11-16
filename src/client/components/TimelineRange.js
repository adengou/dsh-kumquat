/**
 * 时间轴选区：一条轨道 + 两个原生 range 滑块 + 两个手填框，双向同步。
 *
 * 为什么用原生 range：键盘、触屏、读屏器行为都由浏览器保证；
 * 轨道上只叠一个透明 input，滑块拇指保留指针事件。
 */

import { h } from '../h.js'
import { formatClock, formatSpan } from '../logic.js'

/**
 * @param {{
 *   range: {
 *     duration: number, from: number, to: number, span: number,
 *     fromText: string, toText: string, textError: string | null,
 *     fromPct: number, toPct: number, ticks: Array<{ key: string, text: string, pct: number }>,
 *     hasFile: boolean,
 *   },
 *   onSlider: (handle: 'from' | 'to', value: number) => void,
 *   onText: (handle: 'from' | 'to', text: string) => void,
 *   onTextDone: (handle: 'from' | 'to') => void,
 * }} props
 */
export function TimelineRange({ range, onSlider, onText, onTextDone }) {
  const disabled = range.hasFile !== true
  const max = range.duration > 0 ? range.duration : 0.2
  const readOnlyText = (handle, text, error) => h('label', { className: 'kq-field kq-field--tight' },
    h('span', { className: 'kq-field__label' }, handle === 'from' ? '起' : '止'),
    h('input', {
      type: 'text',
      className: 'kq-input',
      value: text,
      inputMode: 'decimal',
      spellCheck: 'false',
      autoComplete: 'off',
      disabled,
      'aria-label': handle === 'from' ? '选区起点（手填，例如 00:03.2）' : '选区终点（手填，例如 00:08.4）',
      'aria-invalid': error === handle ? 'true' : undefined,
      onChange: (event) => onText(handle, event.target.value),
      onBlur: () => onTextDone(handle),
      onKeyDown: (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onTextDone(handle)
        }
      },
    }))
  return h('div', { className: 'kq-range' },
    h('div', { className: 'kq-track' },
      h('span', {
        className: 'kq-sel',
        'aria-hidden': 'true',
        style: { left: `${range.fromPct}%`, width: `${Math.max(0, range.toPct - range.fromPct)}%` },
      }),
      h('input', {
        type: 'range',
        className: 'kq-slider',
        min: 0,
        max,
        step: 0.1,
        value: range.from,
        disabled,
        'aria-label': '选区起点滑块',
        'aria-valuetext': formatClock(range.from),
        onChange: (event) => onSlider('from', Number(event.target.value)),
      }),
      h('input', {
        type: 'range',
        className: 'kq-slider',
        min: 0,
        max,
        step: 0.1,
        value: range.to,
        disabled,
        'aria-label': '选区终点滑块',
        'aria-valuetext': formatClock(range.to),
        onChange: (event) => onSlider('to', Number(event.target.value)),
      })),
    h('div', { className: 'kq-ticks', 'aria-hidden': 'true' },
      range.ticks.map((tick) => h('span', {
        key: tick.key,
        className: 'kq-tick',
        style: { left: `${tick.pct}%` },
      }, tick.text))),
    h('div', { className: 'kq-fields' },
      readOnlyText('from', range.fromText, range.textError),
      readOnlyText('to', range.toText, range.textError),
      h('span', { className: 'kq-field kq-field--ro' },
        h('span', { className: 'kq-field__label' }, '时长'),
        h('output', { className: 'kq-dur', 'aria-live': 'polite' }, formatSpan(range.span)))))
}
