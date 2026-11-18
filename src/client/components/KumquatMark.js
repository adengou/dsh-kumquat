/** 金桔标识：橙色果实 + 两片叶子，扁平、小尺寸可辨。 */

import { h } from '../h.js'

/** @param {{ size?: number, className?: string }} props */
export function KumquatMark({ size, className }) {
  const px = Number.isFinite(size) ? size : 24
  return h('svg', {
    className,
    width: px,
    height: px,
    viewBox: '0 0 32 32',
    'aria-hidden': 'true',
    focusable: 'false',
  },
  h('circle', { cx: 16, cy: 19, r: 10, fill: '#ff9a2e' }),
  h('ellipse', { cx: 12.5, cy: 15, rx: 3, ry: 2, fill: '#ffd08a', opacity: 0.75 }),
  h('path', { d: 'M16 9c1.6-4.2 5.2-6.2 9.4-5.2-1.2 4.2-4.4 6.6-9.4 5.2z', fill: '#2fbf82' }),
  h('path', { d: 'M16 9c-2.6-3-6-3.6-8.6-2.2 1.6 3 4.8 4.2 8.6 2.2z', fill: '#3ddc97' }),
  h('path', { d: 'M16 9V5.5', stroke: '#8a5a2b', strokeWidth: 2, strokeLinecap: 'round' }))
}
