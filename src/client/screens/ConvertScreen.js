/**
 * 屏幕 2A · 格式转换：文件条 → 格式胶囊 → 仅换封装 → 开始转换。
 * 只有一个必答项（转成什么），其余是默认值。
 */

import { h } from '../h.js'
import { Section } from '../components/Section.js'
import { FileStrip } from '../components/FileStrip.js'
import { FormatPills } from '../components/FormatPill.js'
import { CopyToggle } from '../components/CopyToggle.js'
import { PrimaryButton } from '../components/Button.js'
import { OutputPicker } from '../components/OutputPicker.js'

/**
 * @param {{
 *   model: any,
 *   onPick: Function, onOpenPaste: Function, onClosePaste: Function, onDraft: Function,
 *   onSubmitPaste: Function, onClearFile: Function, onTarget: Function, onCopyToggle: Function,
 *   onSubmit: Function,
 * }} props
 */
export function ConvertScreen(props) {
  const model = props.model
  const blockedHint = model.etaText || model.submitHint
  return h('div', { className: 'kq-screen' },
    h(Section, { label: '文件' },
      h(FileStrip, {
        slot: 'convert',
        model,
        onPick: props.onPick,
        onOpenPaste: props.onOpenPaste,
        onClosePaste: props.onClosePaste,
        onDraft: props.onDraft,
        onSubmitPaste: props.onSubmitPaste,
        onClear: props.onClearFile,
      })),
    h(Section, { label: '转成' },
      h(FormatPills, { targets: model.targets, value: null, onChange: props.onTarget }),
      model.disabledTargets.length > 0
        ? h('p', { className: 'kq-hint' }, model.disabledTargets.map((target) => `${target.label}：${target.reason}`).join('；'))
        : null,
      model.showCopy === false ? null : h(CopyToggle, { copy: model.copy, onChange: props.onCopyToggle }),
      h('p', { className: 'kq-hint' }, '勾选「仅换封装」时直接复用原码流，画质完全不变；取消勾选才会重新编码。'),
      h('p', { className: 'kq-hint' }, model.hint)),
    h(Section, { label: '输出' },
      h(OutputPicker, { dir: props.outputPath || props.outputDir, onChoose: props.onChooseOutput })),
    model.error
      ? h('p', { className: 'kq-error', role: 'alert' }, `${model.error.message}${model.error.hint ? ` ${model.error.hint}` : ''}`)
      : null,
    h('div', { className: 'kq-go' },
      h(PrimaryButton, {
        label: '开始转换',
        onClick: props.onSubmit,
        disabled: model.canSubmit !== true,
        busy: model.busy,
        big: true,
        title: model.canSubmit ? '' : model.validation.message,
      }),
      h('span', { className: 'kq-eta' }, blockedHint)))
}




