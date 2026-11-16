/**
 * 文件浏览对话框：列出目录、进入子目录、选中媒体文件后回填绝对路径。
 * 只读；不复制、不上传。桌面与 web 共用同一套实现，不依赖宿主原生对话框。
 */

import { h } from '../h.js'
import { GhostButton, PrimaryButton } from './Button.js'
import { KqIcon } from './Icon.js'

const MEDIA_EXT = new Set(['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac', 'gif'])

/** @param {string} name */
function extOf(name) {
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index + 1).toLowerCase()
}

/**
 * @param {{
 *   React: any,
 *   api: any,
 *   slot: 'convert' | 'gif',
 *   onClose: Function,
 *   onChoose: (path: string, name: string) => void,
 * }} props
 */
export function FileDialog({ React, api, slot, onClose, onChoose }) {
  const [listing, setListing] = React.useState(null)
  const [pathText, setPathText] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [error, setError] = React.useState(null)
  const [loading, setLoading] = React.useState(false)

  const load = async (target) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    const result = await api.fsList(target)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setListing(result.data)
    setPathText(result.data.path)
  }

  React.useEffect(() => {
    void load('')
  }, [])

  const entries = listing && Array.isArray(listing.entries) ? listing.entries : []
  const parent = listing && typeof listing.parent === 'string' ? listing.parent : ''

  return h('div', {
    className: 'kq-veil',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '添加文件',
    onClick: (event) => { if (event.target === event.currentTarget) onClose() },
    onKeyDown: (event) => { if (event.key === 'Escape') onClose() },
  },
  h('div', { className: 'kq-fs' },
    h('div', { className: 'kq-fs__head' },
      h(KqIcon, { name: 'film', size: 16 }),
      h('span', { className: 'kq-fs__title' }, '添加文件'),
      h('span', { className: 'kq-fs__tag' }, slot === 'gif' ? '选一段视频' : '选视频或音频'),
      h('span', { style: { flex: 1 } }),
      h(GhostButton, { label: '取消', onClick: onClose })),
    h('div', { className: 'kq-fs__path' },
      h(GhostButton, {
        label: '上一级',
        onClick: () => { if (parent !== '') void load(parent) },
      }),
      h('input', {
        type: 'text',
        className: 'kq-input',
        style: { flex: 1 },
        value: pathText,
        spellCheck: 'false',
        autoComplete: 'off',
        'aria-label': '目录路径',
        onChange: (event) => setPathText(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void load(pathText)
          }
        },
      })),
    h('div', { className: 'kq-fs__list' },
      loading ? h('p', { className: 'kq-hint' }, '正在读取目录…') : null,
      error ? h('p', { className: 'kq-error', role: 'alert' }, `${error.message}${error.hint ? ` ${error.hint}` : ''}`) : null,
      !loading && !error && entries.length === 0 ? h('p', { className: 'kq-hint' }, '这个目录是空的。') : null,
      entries.map((entry) => {
        const isDir = entry.type === 'dir'
        const isMedia = !isDir && MEDIA_EXT.has(extOf(entry.name))
        const isSelected = selected !== null && selected.path === entry.path
        return h('button', {
          key: entry.path,
          type: 'button',
          className: [
            'kq-fs__row',
            isSelected ? 'kq-fs__row--sel' : '',
            isMedia ? 'kq-fs__row--media' : '',
          ].filter(Boolean).join(' '),
          title: entry.path,
          onClick: () => {
            if (isDir) void load(entry.path)
            else setSelected(entry)
          },
          onDoubleClick: () => {
            if (isDir) void load(entry.path)
            else onChoose(entry.path, entry.name)
          },
        },
        h(KqIcon, { name: isDir ? 'folder' : isMedia ? (slot === 'gif' ? 'film' : 'film') : 'file', size: 16 }),
        h('span', { className: 'kq-fs__name' }, entry.name),
        h('span', { className: 'kq-fs__tag' }, isDir ? '目录' : extOf(entry.name).toUpperCase() || '文件'))
      })),
    h('div', { className: 'kq-fs__foot' },
      h('span', { className: 'kq-fs__hint', title: selected ? selected.path : '' },
        selected ? selected.path : '单击选中，双击直接打开；只支持本地绝对路径。'),
      h(PrimaryButton, {
        label: '选择',
        onClick: () => { if (selected !== null) onChoose(selected.path, selected.name) },
      }))))
}
