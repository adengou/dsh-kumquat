/**
 * 图标：只用 currentColor 描边，尺寸随文字；装饰性图标一律 aria-hidden。
 * 不引任何图标库，也不打包字体。
 */

import { h, cx } from '../h.js'

const KQ_ICON_PATHS = {
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M6 15l6-6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
  arrowLeft: ['M19 12H5', 'M12 19l-7-7 7-7'],
  check: ['M5 13l4 4L19 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  copy: ['M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  film: ['M4 4h16v16H4z', 'M4 9h16', 'M4 15h16', 'M9 4v16', 'M15 4v16'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  audio: ['M9 18V6l10-2v12', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
}

/**
 * @param {{ name: string, size?: number, className?: string }} props
 */
export function KqIcon({ name, size, className }) {
  const paths = KQ_ICON_PATHS[name] || KQ_ICON_PATHS.chevronRight
  const pixels = Number.isFinite(size) ? size : 16
  return h('svg', {
    className: cx('kq-icon', className),
    width: pixels,
    height: pixels,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }, paths.map((d, index) => h('path', { key: index, d })))
}
