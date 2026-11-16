/**
 * 文件条：默认显示「添加文件」与「粘贴路径」；点击任一个都把按钮行替换成
 * 路径输入框，反应必须一眼可见。没有拖拽；文件只登记绝对路径，不上传、不复制。
 */

import { h } from '../h.js'
import { GhostButton, PrimaryButton } from './Button.js'
import { KqIcon } from './Icon.js'

/**
 * @param {{
 *   slot: 'convert' | 'gif',
 *   model: { file: any, fileLine: string, picking: boolean, pickError: any, paste: any },
 *   onPick: Function, onOpenPaste: Function, onClosePaste: Function,
 *   onDraft: Function, onSubmitPaste: Function, onClear: Function,
 * }} props
 */
export function FileStrip({ slot, model, onPick, onOpenPaste, onClosePaste, onDraft, onSubmitPaste, onClear }) {
  const file = model.file
  const paste = model.paste || { open: false, draft: '', error: null }
  const pasteOpen = paste.open === true
  const pickError = model.pickError
  const isVideo = file !== null && file.factsStatus === 'ready' && file.facts && file.facts.video !== undefined
  let meta = ''
  if (file !== null) {
    if (file.factsStatus === 'probing') meta = '正在读取文件信息…'
    else if (file.factsStatus === 'error') meta = '这个文件读不了'
    else if (file.factsStatus === 'ready') meta = model.fileLine || '已读取'
    else meta = '等待读取'
  }

  // Both entry points open the same editor; it replaces the button row so the
  // click has an unmistakable result even when the panel is scrolled.
  const editor = h('div', { className: 'kq-paste kq-paste--prompt' },
    h('label', { className: 'kq-field kq-paste__field' },
      h('span', { className: 'kq-field__label' }, '填写文件绝对路径'),
      h('input', {
        type: 'text',
        className: 'kq-input',
        value: paste.draft,
        autoFocus: true,
        placeholder: 'D:\\示例\\video.mp4',
        spellCheck: 'false',
        autoComplete: 'off',
        'aria-invalid': paste.error ? 'true' : undefined,
        onChange: (event) => onDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSubmitPaste()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onClosePaste()
          }
        },
      })),
    h('span', { className: 'kq-paste__actions' },
      h(PrimaryButton, { label: '读取', onClick: onSubmitPaste }),
      h(GhostButton, { label: '取消', onClick: onClosePaste })),
    paste.error
      ? h('p', { className: 'kq-error', role: 'alert' }, `${paste.error.message}${paste.error.hint ? ` ${paste.error.hint}` : ''}`)
      : null)

  return h('div', null,
    pasteOpen
      ? editor
      : h('div', { className: 'kq-btns' },
        h(GhostButton, {
          label: '添加文件',
          onClick: onPick,
          busy: model.picking,
          title: '填写文件绝对路径',
          ariaLabel: '添加文件（填写绝对路径）',
        }),
        h(GhostButton, {
          label: '粘贴路径',
          onClick: onOpenPaste,
          title: '手填绝对路径',
          ariaLabel: '粘贴文件绝对路径',
        })),
    pickError && pickError.code !== 'E_CANCELLED'
      ? h('p', { className: 'kq-error', role: 'alert' }, `${pickError.message}${pickError.hint ? ` ${pickError.hint}` : ''}`)
      : null,
    file !== null
      ? h('div', { className: 'kq-file' },
        h('span', { className: 'kq-file__icon', 'aria-hidden': 'true' },
          h(KqIcon, { name: isVideo ? 'film' : 'audio', size: 16 })),
        h('span', { className: 'kq-file__body' },
          h('span', { className: 'kq-file__name', title: file.path }, file.name),
          h('span', { className: 'kq-file__meta', title: file.path }, meta)),
        h('button', {
          type: 'button',
          className: 'kq-file__x',
          onClick: onClear,
          'aria-label': `移除文件 ${file.name}`,
          title: '移除',
        }, h(KqIcon, { name: 'close', size: 14 })))
      : h('p', { className: 'kq-hint' }, '还没有文件。文件只登记路径，不上传、不复制。'))
}
