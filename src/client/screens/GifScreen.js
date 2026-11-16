/**
 * 屏幕 2B · 视频做 GIF：文件条 → 时间轴选区 → 三个默认参数 → 开始生成 GIF。
 * 只有一个必答项（哪几秒）。
 */

import { h } from '../h.js'
import { Section } from '../components/Section.js'
import { FileStrip } from '../components/FileStrip.js'
import { TimelineRange } from '../components/TimelineRange.js'
import { GifFields } from '../components/GifFields.js'
import { OutputPicker } from '../components/OutputPicker.js'
import { PrimaryButton } from '../components/Button.js'

/**
 * @param {{
 *   model: any,
 *   onPick: Function, onOpenPaste: Function, onClosePaste: Function, onDraft: Function,
 *   onSubmitPaste: Function, onClearFile: Function,
 *   onSlider: Function, onText: Function, onTextDone: Function, onField: Function,
 *   onSubmit: Function,
 * }} props
 */
export function GifScreen(props) {
  const model = props.model
  const blockedHint = model.etaText || model.submitHint
  return h('div', { className: 'kq-screen' },
    h(Section, { label: '文件' },
      h(FileStrip, {
        slot: 'gif',
        model,
        onPick: props.onPick,
        onOpenPaste: props.onOpenPaste,
        onClosePaste: props.onClosePaste,
        onDraft: props.onDraft,
        onSubmitPaste: props.onSubmitPaste,
        onClear: props.onClearFile,
      })),
    h(Section, { label: '截取' },
      h(TimelineRange, {
        range: model.range,
        onSlider: props.onSlider,
        onText: props.onText,
        onTextDone: props.onTextDone,
      })),
    h(Section, { label: '参数' },
      h(GifFields, { fields: model.fields, onChange: props.onField })),
    h(Section, { label: '输出' },
      h(OutputPicker, { dir: props.outputDir, onChoose: props.onChooseOutput })),
    h('p', { className: 'kq-note kq-note--line' }, model.note),
    model.warnings.map((warning) => h('p', { key: warning, className: 'kq-hint' }, warning)),
    model.error
      ? h('p', { className: 'kq-error', role: 'alert' }, `${model.error.message}${model.error.hint ? ` ${model.error.hint}` : ''}`)
      : null,
    h('div', { className: 'kq-go' },
      h(PrimaryButton, {
        label: '开始生成 GIF',
        onClick: props.onSubmit,
        disabled: model.canSubmit !== true,
        busy: model.busy,
        big: true,
        title: model.canSubmit ? '' : model.validation.message,
      }),
      h('span', { className: 'kq-eta' }, blockedHint)))
}


