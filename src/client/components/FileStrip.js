/**
 * 文件条：两个入口「添加文件」（宿主目录浏览）与「粘贴路径」（手填绝对路径）。
 * 没有拖拽；文件只登记绝对路径，不上传、不复制。
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
  const pickError = model.pickError
  const isVideo = file !== null && file.factsStatus === 'ready' && file.facts && file.facts.video !== undefined
  let meta = ''
  if (file !== null) {
    if (file.factsStatus === 'probing') meta = '正在读取文件信息…'
    else if (file.factsStatus === 'error') meta = '这个文件读不了'
    else if (file.factsStatus === 'ready') meta = model.fileLine || '已读取'
    else meta = '等待读取'
  }
  return h('div', null,
    h('div', { className: 'kq-btns' },
      h(GhostButton, {
        label: '添加文件',
        onClick: onPick,
        busy: model.picking,
        title: '用宿主目录浏览选一个文件',
        ariaLabel: '添加文件（宿主目录浏览）',
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
      : h('p', { className: 'kq-hint' }, '还没有文件。文件只登记路径，不上传、不复制。'),
    paste.open
      ? h('div', { className: 'kq-paste' },
        h('label', { className: 'kq-field kq-paste__field' },
          h('span', { className: 'kq-field__label' }, '绝对路径'),
          h('input', {
            type: 'text',
            className: 'kq-input',
            value: paste.draft,
            autoFocus: true,
            placeholder: slot === 'gif' ? 'C:\\Users\\你\\Videos\\猫猫.mp4' : 'C:\\Users\\你\\Videos\\猫猫.mp4',
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
      : null)
}
