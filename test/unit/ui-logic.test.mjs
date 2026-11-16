import test from 'node:test'
import assert from 'node:assert/strict'

import { ACT, createStore, initialState } from '../../src/client/state.js'
import {
  applyRepair,
  activeJobIds,
  buildCommand,
  buildResultRow,
  clamp,
  clockShort,
  copyAvailability,
  describeProgress,
  describeRepair,
  estimateCopySeconds,
  estimateEncodeSeconds,
  estimateGifMB,
  estimateGifSeconds,
  factsLine,
  factsSummary,
  fileExt,
  fileName,
  fileStem,
  formatBytes,
  formatClock,
  formatDuration,
  formatSpan,
  isActiveStatus,
  normalizeError,
  normalizeJob,
  normalizeJobProgress,
  normalizeStatus,
  outputName,
  parseClock,
  parsePathInput,
  planConvert,
  radioMove,
  reducer,
  round1,
  selectBalance,
  selectBinary,
  selectCaps,
  selectConvert,
  selectGif,
  selectHeader,
  selectHome,
  selectResults,
  specSummary,
  taskExpectation,
  validateConvert,
  validateGif,
} from '../../src/client/logic.js'

/* ── 夹具 ───────────────────────────────────────────── */

const MB = 1024 * 1024

const videoFacts = {
  path: 'C:\\videos\\猫猫打滚.mp4',
  bytes: 18 * MB,
  container: 'mp4',
  formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
  durationSec: 12,
  streams: [
    { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
    { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
  ],
  video: { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
  audio: { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
  ffmpegVersion: '6.1.1',
}

const audioFacts = {
  path: 'C:\\audio\\podcast.mp3',
  bytes: 3 * MB,
  container: 'mp3',
  formatName: 'mp3',
  durationSec: 142.6,
  streams: [{ index: 0, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 }],
  audio: { index: 0, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 },
  ffmpegVersion: '6.1.1',
}

const capabilities = {
  ffmpeg: 'ffmpeg',
  ffprobe: 'ffprobe',
  version: '6.1.1',
  filters: ['fps', 'scale', 'palettegen', 'paletteuse'],
  encoders: ['libx264', 'aac', 'libmp3lame', 'gif'],
  muxers: ['mp4', 'matroska', 'mov', 'webm', 'avi', 'mp3', 'ipod', 'wav', 'flac'],
}

function capsReady(state = initialState()) {
  return reducer(state, { type: ACT.CAPS_OK, data: capabilities })
}

function withVideo(state = capsReady()) {
  let next = reducer(state, { type: ACT.SCREEN, screen: 'convert' })
  next = reducer(next, { type: ACT.FILE_INFO, slot: 'convert', path: videoFacts.path, name: '猫猫打滚.mp4' })
  next = reducer(next, { type: ACT.FILE_FACTS, slot: 'convert', facts: videoFacts })
  return next
}

function withGifVideo(state = capsReady()) {
  let next = reducer(state, { type: ACT.SCREEN, screen: 'gif' })
  next = reducer(next, { type: ACT.FILE_INFO, slot: 'gif', path: videoFacts.path, name: '猫猫打滚.mp4' })
  next = reducer(next, { type: ACT.FILE_FACTS, slot: 'gif', facts: videoFacts })
  return next
}

/* ── 时间与体积 ─────────────────────────────────────── */

test('logic: 手填时间解析', () => {
  assert.equal(parseClock('3.2'), 3.2)
  assert.equal(parseClock('00:03.2'), 3.2)
  assert.equal(parseClock('0:05'), 5)
  assert.equal(parseClock('1:02:03.4'), 3723.4)
  assert.equal(parseClock(' 3.2s '), 3.2)
  assert.equal(parseClock('12'), 12)
  for (const bad of ['', 'abc', '-3', '0:75', '1:2:3:4', '3..2', null, 3.2]) {
    assert.equal(parseClock(bad), null, `应当拒绝 ${String(bad)}`)
  }
})

test('logic: 时刻/时长/区间格式化', () => {
  assert.equal(formatClock(0), '00:00.0')
  assert.equal(formatClock(3.2), '00:03.2')
  assert.equal(formatClock(84.5), '01:24.5')
  assert.equal(formatClock(3723.4), '1:02:03.4')
  assert.equal(formatClock(-5), '00:00.0')
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(12), '0:12')
  assert.equal(formatDuration(142), '2:22')
  assert.equal(formatDuration(3723), '1:02:03')
  assert.equal(formatSpan(5.2), '5.2s')
  assert.equal(formatSpan(5), '5s')
  assert.equal(formatSpan(5.25), '5.3s')
  assert.equal(clockShort(3.2), '03.2')
  assert.equal(clockShort(84.5), '01-24.5')
})

test('logic: 体积格式化', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(820), '820 B')
  assert.equal(formatBytes(1024), '1 KB')
  assert.equal(formatBytes(18 * MB), '18 MB')
  assert.equal(formatBytes(6.3 * MB), '6.3 MB')
  assert.equal(formatBytes(210 * MB), '210 MB')
  assert.equal(formatBytes(1024 * MB), '1 GB')
  assert.equal(formatBytes(-1), '—')
  assert.equal(formatBytes(Number.NaN), '—')
})

test('logic: 路径拆分与绝对路径校验', () => {
  assert.equal(fileName('C:\\videos\\cat.mp4'), 'cat.mp4')
  assert.equal(fileName('/home/a/cat.mp4'), 'cat.mp4')
  assert.equal(fileName('cat.mp4'), 'cat.mp4')
  assert.equal(fileExt('C:\\v\\cat.MP4'), 'mp4')
  assert.equal(fileExt('cat'), '')
  assert.equal(fileExt('.hidden'), '')
  assert.equal(fileStem('a.tar.gz'), 'a.tar')
  assert.equal(fileStem('cat.mp4'), 'cat')

  assert.deepEqual(parsePathInput('"C:\\v\\cat.mp4"'), { ok: true, path: 'C:\\v\\cat.mp4', name: 'cat.mp4' })
  assert.equal(parsePathInput('/home/me/cat.mp4').ok, true)
  assert.equal(parsePathInput('\\\\server\\share\\cat.mp4').ok, true)
  assert.equal(parsePathInput('file:///C:/Users/me/cat.mp4').path, 'C:/Users/me/cat.mp4')
  const relative = parsePathInput('videos/cat.mp4')
  assert.equal(relative.ok, false)
  assert.match(relative.message, /绝对路径/)
  assert.equal(parsePathInput('   ').ok, false)
  assert.equal(parsePathInput(null).ok, false)
})

test('logic: clamp 与 round1', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-1, 0, 10), 0)
  assert.equal(clamp(11, 0, 10), 10)
  assert.equal(clamp(Number.NaN, 2, 10), 2)
  assert.equal(round1(5.24), 5.2)
  assert.equal(round1(5.25), 5.3)
})

/* ── 预计耗时与体积 ─────────────────────────────────── */

test('logic: 预计耗时', () => {
  assert.equal(estimateCopySeconds(18 * MB), 1)
  assert.equal(estimateCopySeconds(210 * MB), 3)
  assert.equal(estimateCopySeconds(0), 1)
  assert.equal(estimateEncodeSeconds(videoFacts, { kind: 'convert', to: 'mp4' }), 14)
  assert.equal(estimateEncodeSeconds(videoFacts, { kind: 'convert', to: 'mp3' }), 5)
  assert.equal(estimateGifSeconds(5.2), 7)
  assert.equal(estimateGifSeconds(20), 25)
  assert.equal(estimateGifMB(5.2, 12, 480), 6.2)
  assert.equal(estimateGifMB(5.2, 12, 960), 25)
  assert.equal(estimateGifMB(5, 24, 480), 12)
})

/* ── 仅换封装 ───────────────────────────────────────── */

test('logic: 仅换封装的可行性与原因', () => {
  const mkv = copyAvailability(videoFacts, 'mkv')
  assert.equal(mkv.available, true)
  assert.equal(mkv.mode, 'copy')
  assert.equal(mkv.etaSec, 1)

  assert.equal(copyAvailability(videoFacts, 'mp4').available, true)

  const webm = copyAvailability(videoFacts, 'webm')
  assert.equal(webm.available, false)
  assert.equal(webm.mode, 'reencode')
  assert.match(webm.reason, /H\.264/)
  assert.match(webm.reason, /WEBM/)
  assert.equal(webm.etaSec, 14)
  assert.ok(webm.reason.length > 0)

  const toMp3 = copyAvailability(videoFacts, 'mp3')
  assert.equal(toMp3.available, false)
  assert.match(toMp3.reason, /AAC/)

  assert.equal(copyAvailability(audioFacts, 'mp3').available, true)
  const wav = copyAvailability(audioFacts, 'wav')
  assert.equal(wav.available, false)
  assert.match(wav.reason, /PCM/)
  assert.equal(copyAvailability(audioFacts, 'mp4').available, false)
  assert.match(copyAvailability(audioFacts, 'mp4').reason, /音频文件/)
  assert.equal(copyAvailability(null, 'mp4').available, false)
  assert.match(copyAvailability(null, 'mp4').reason, /先添加文件/)
  assert.match(copyAvailability(videoFacts, null).reason, /先选目标格式/)
})

/* ── 表单校验 ───────────────────────────────────────── */

test('logic: 转换校验覆盖空/离线/缺 FFmpeg/探测中/错误/缺目标/正常', () => {
  assert.equal(validateConvert(initialState()).code, 'NO_FILE')

  let offline = reducer(initialState(), { type: ACT.CAPS_ERR, error: { code: 'E_OFFLINE', message: '未连接', hint: '' } })
  assert.equal(validateConvert(offline).code, 'E_OFFLINE')

  let missing = reducer(initialState(), { type: ACT.BINARY_READY, data: { state: 'missing', version: null, sizeHint: 80 * MB } })
  assert.equal(validateConvert(missing).code, 'E_FFMPEG')
  assert.match(validateConvert(missing).short, /FFmpeg/)

  let probing = reducer(capsReady(), { type: ACT.FILE_INFO, slot: 'convert', path: videoFacts.path, name: 'a.mp4' })
  assert.equal(validateConvert(probing).code, 'PROBING')

  let errored = reducer(probing, { type: ACT.FILE_ERR, slot: 'convert', error: { code: 'E_INPUT', message: '文件损坏', hint: '换一个文件。' } })
  assert.equal(validateConvert(errored).code, 'E_INPUT')

  const ready = withVideo()
  assert.equal(validateConvert(ready).code, 'NO_TARGET')

  const picked = reducer(ready, { type: ACT.TARGET, to: 'mkv' })
  const ok = validateConvert(picked)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.task, { kind: 'convert', input: videoFacts.path, to: 'mkv', copy: true })
  assert.equal(ok.etaSec, 1)

  const reencode = reducer(picked, { type: ACT.COPY, copy: false })
  assert.equal(validateConvert(reencode).task.copy, false)
  assert.equal(validateConvert(reencode).etaSec, 14)

  const audioState = reducer(capsReady(), { type: ACT.FILE_INFO, slot: 'convert', path: audioFacts.path, name: 'a.mp3' })
  const withAudio = reducer(audioState, { type: ACT.FILE_FACTS, slot: 'convert', facts: audioFacts })
  const audioToVideo = reducer(withAudio, { type: ACT.TARGET, to: 'mp4' })
  assert.equal(validateConvert(audioToVideo).code, 'E_INPUT')
})

test('logic: GIF 校验覆盖空/范围/片长/帧率/宽度/目标体积/正常', () => {
  assert.equal(validateGif(initialState()).code, 'NO_FILE')

  const ready = withGifVideo()
  const ok = validateGif(ready)
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.task, { kind: 'gif', input: videoFacts.path, from: 0, to: 5, fps: 12, width: 480, maxBytes: 8 * MB })

  const tooShort = { ...ready, gif: { ...ready.gif, to: 0.1 } }
  assert.equal(validateGif(tooShort).code, 'BAD_RANGE')
  assert.match(validateGif(tooShort).short, /太短/)

  const beyond = { ...ready, gif: { ...ready.gif, to: 20 } }
  assert.equal(validateGif(beyond).code, 'BAD_RANGE')
  assert.match(validateGif(beyond).short, /终点/)

  const badFps = reducer(ready, { type: ACT.GIF_FIELD, field: 'fps', value: 40 })
  assert.equal(validateGif(badFps).code, 'BAD_FPS')

  const badWidth = reducer(ready, { type: ACT.GIF_FIELD, field: 'width', value: 50 })
  assert.equal(validateGif(badWidth).code, 'BAD_WIDTH')

  const badMax = reducer(ready, { type: ACT.GIF_FIELD, field: 'maxMB', value: 0.1 })
  assert.equal(validateGif(badMax).code, 'BAD_MAX')

  const noMax = reducer(ready, { type: ACT.GIF_FIELD, field: 'maxMB', value: null })
  const noMaxValid = validateGif(noMax)
  assert.equal(noMaxValid.ok, true)
  assert.equal(Object.prototype.hasOwnProperty.call(noMaxValid.task, 'maxBytes'), false)

  const audioState = reducer(capsReady(), { type: ACT.FILE_INFO, slot: 'gif', path: audioFacts.path, name: 'a.mp3' })
  const audioReady = reducer(audioState, { type: ACT.FILE_FACTS, slot: 'gif', facts: audioFacts })
  assert.equal(validateGif(audioReady).code, 'E_INPUT')
  assert.match(validateGif(audioReady).short, /画面/)
})

/* ── reducer ────────────────────────────────────────── */

test('logic: reducer 切屏与文件状态', () => {
  let state = initialState()
  state = reducer(state, { type: ACT.SCREEN, screen: 'convert' })
  assert.equal(state.screen, 'convert')
  state = reducer(state, { type: ACT.SCREEN, screen: 'gif' })
  assert.equal(state.screen, 'gif')
  state = reducer(state, { type: ACT.SCREEN, screen: 'nope' })
  assert.equal(state.screen, 'home')

  state = reducer(state, { type: ACT.FILE_BEGIN, slot: 'convert' })
  assert.equal(state.convert.picking, true)
  state = reducer(state, { type: ACT.FILE_PICK_ERR, slot: 'convert', error: { code: 'E_NO_PICKER', message: '没目录浏览', hint: '请粘贴路径' } })
  assert.equal(state.convert.picking, false)
  assert.equal(state.convert.pickError.code, 'E_NO_PICKER')

  state = reducer(state, { type: ACT.FILE_INFO, slot: 'convert', path: videoFacts.path, name: '猫猫打滚.mp4' })
  assert.equal(state.convert.file.factsStatus, 'probing')
  state = reducer(state, { type: ACT.FILE_FACTS, slot: 'convert', facts: videoFacts })
  assert.equal(state.convert.file.factsStatus, 'ready')
  assert.equal(state.convert.file.facts.bytes, 18 * MB)
  state = reducer(state, { type: ACT.FILE_CLEAR, slot: 'convert' })
  assert.equal(state.convert.file, null)
})

test('logic: reducer 粘贴路径状态与关闭', () => {
  let state = initialState()
  state = reducer(state, { type: ACT.PASTE_OPEN, slot: 'convert', open: true })
  assert.equal(state.convert.paste.open, true)
  state = reducer(state, { type: ACT.PASTE_DRAFT, slot: 'convert', draft: 'C:\\a.mp4' })
  assert.equal(state.convert.paste.draft, 'C:\\a.mp4')
  state = reducer(state, { type: ACT.PASTE_ERR, slot: 'convert', error: { code: 'E_INPUT', message: '需要绝对路径', hint: '' } })
  assert.equal(state.convert.paste.error.code, 'E_INPUT')
  state = reducer(state, { type: ACT.FILE_INFO, slot: 'convert', path: 'C:\\a.mp4', name: 'a.mp4' })
  assert.equal(state.convert.paste.open, false)
  assert.equal(state.convert.paste.draft, '')
})

test('logic: reducer GIF 选区双向同步与夹边界', () => {
  const state = withGifVideo()
  assert.equal(state.gif.from, 0)
  assert.equal(state.gif.to, 5)

  const sliderTo = reducer(state, { type: ACT.GIF_SLIDER, handle: 'to', value: 8.4 })
  assert.equal(sliderTo.gif.to, 8.4)
  assert.equal(sliderTo.gif.toText, '00:08.4')
  assert.equal(sliderTo.gif.fromText, '00:00.0')

  const clampFrom = reducer(sliderTo, { type: ACT.GIF_SLIDER, handle: 'from', value: 9 })
  assert.equal(clampFrom.gif.from, 8.2)

  const clampTo = reducer(state, { type: ACT.GIF_SLIDER, handle: 'to', value: 99 })
  assert.equal(clampTo.gif.to, 12)

  const textOk = reducer(state, { type: ACT.GIF_TEXT, handle: 'from', text: '00:03.2' })
  assert.equal(textOk.gif.from, 3.2)
  assert.equal(textOk.gif.fromText, '00:03.2')

  const textBad = reducer(state, { type: ACT.GIF_TEXT, handle: 'from', text: 'abc' })
  assert.equal(textBad.gif.from, 0)
  assert.equal(textBad.gif.textError, 'from')

  const normalized = reducer(textBad, { type: ACT.GIF_TEXT_DONE, handle: 'from' })
  assert.equal(normalized.gif.fromText, '00:00.0')
  assert.equal(normalized.gif.textError, null)

  const field = reducer(state, { type: ACT.GIF_FIELD, field: 'maxMB', value: null })
  assert.equal(field.gif.maxMB, null)
  const fps = reducer(state, { type: ACT.GIF_FIELD, field: 'fps', value: 24 })
  assert.equal(fps.gif.fps, 24)
})

test('logic: reducer 目标、任务增改与展开', () => {
  let state = withVideo()
  state = reducer(state, { type: ACT.TARGET, to: 'MKV' })
  assert.equal(state.convert.to, 'mkv')
  state = reducer(state, { type: ACT.TARGET, to: 'gif' })
  assert.equal(state.convert.to, null)
  state = reducer(state, { type: ACT.COPY, copy: false })
  assert.equal(state.convert.copy, false)

  state = reducer(state, { type: ACT.JOB_BEGIN, slot: 'convert' })
  assert.equal(state.convert.busy, true)
  const job = { id: 'job-1', task: { kind: 'convert', input: videoFacts.path, to: 'mkv', copy: true }, status: 'queued', startedAt: 1 }
  state = reducer(state, { type: ACT.JOB_ADD, slot: 'convert', job, task: job.task })
  assert.equal(state.convert.busy, false)
  assert.equal(state.jobs.items.length, 1)
  assert.equal(state.jobs.items[0].id, 'job-1')

  state = reducer(state, { type: ACT.JOB_UPDATE, job: { ...job, status: 'done', output: 'C:\\videos\\猫猫打滚.mkv', verdict: { ok: true, spec: {}, facts: videoFacts, checks: [], repairs: [] } } })
  assert.equal(state.jobs.items[0].status, 'done')
  assert.equal(state.jobs.items[0].verdict.ok, true)

  state = reducer(state, { type: ACT.EXPAND, id: 'job-1' })
  assert.equal(state.jobs.expanded['job-1'], true)
  state = reducer(state, { type: ACT.EXPAND, id: 'job-1' })
  assert.equal(state.jobs.expanded['job-1'], false)

  state = reducer(state, { type: ACT.COPIED, key: 'abc' })
  assert.equal(state.copied, 'abc')
  state = reducer(state, { type: ACT.NOTICE, notice: '一句话' })
  assert.equal(state.notice, '一句话')
})

test('logic: reducer FFmpeg 横幅四态', () => {
  let state = reducer(initialState(), { type: ACT.BINARY_READY, data: { state: 'missing', sizeHint: 80 * MB } })
  let binary = selectBinary(state)
  assert.equal(binary.visible, true)
  assert.match(binary.title, /未找到 FFmpeg/)
  assert.match(binary.title, /80 MB/)
  assert.equal(binary.actionLabel, '下载并安装')

  state = reducer(state, { type: ACT.BINARY_INSTALL_BEGIN })
  binary = selectBinary(state)
  assert.equal(binary.installing, true)
  assert.equal(binary.visible, true)

  state = reducer(state, { type: ACT.BINARY_PROGRESS, progress: { phase: 'downloading', percent: 41.6 } })
  binary = selectBinary(state)
  assert.equal(binary.percent, 41.6)
  assert.match(binary.phaseText, /42%/)

  state = reducer(state, { type: ACT.BINARY_FAIL, error: { code: 'E_INSTALL', message: '下载中断了', hint: '检查网络后重试。' } })
  binary = selectBinary(state)
  assert.equal(binary.installing, false)
  assert.equal(binary.error.message, '下载中断了')
  assert.equal(binary.actionLabel, '重试')

  const fixed = reducer(state, { type: ACT.BINARY_DONE, data: { state: 'cached', version: '6.1.1' } })
  assert.equal(selectBinary(fixed).visible, false)
  assert.equal(fixed.binary.version, '6.1.1')

  const cancelled = reducer(state, { type: ACT.BINARY_CANCEL })
  assert.equal(selectBinary(cancelled).cancelled, true)
})

test('logic: reducer 余额四态', () => {
  assert.deepEqual(selectBalance(initialState()), { text: '余额 读取中…', tone: 'muted' })
  assert.equal(selectBalance(reducer(initialState(), { type: ACT.BALANCE_OK, data: { ok: true, currency: 'CNY', total: '12.34' } })).text, '余额 ¥12.34')
  assert.equal(selectBalance(reducer(initialState(), { type: ACT.BALANCE_OK, data: { ok: false } })).text, '余额 未配置')
  assert.equal(selectBalance(reducer(initialState(), { type: ACT.BALANCE_ERR, error: { code: 'E_OFFLINE', message: '没响应', hint: '' } })).text, '余额 未连接')
})

/* ── 视图模型 ───────────────────────────────────────── */

test('logic: 顶栏标题与返回', () => {
  assert.equal(selectHeader(initialState()).title, 'Kumquat')
  assert.equal(selectHeader(initialState()).backVisible, false)
  const convert = reducer(initialState(), { type: ACT.SCREEN, screen: 'convert' })
  assert.equal(selectHeader(convert).title, '格式转换')
  assert.equal(selectHeader(convert).backVisible, true)
  const gif = reducer(initialState(), { type: ACT.SCREEN, screen: 'gif' })
  assert.equal(selectHeader(gif).title, '视频做 GIF')
  assert.equal(selectCaps(capsReady()).online, true)
  assert.match(selectCaps(capsReady()).label, /ffmpeg 6\.1\.1/)
  const offline = reducer(initialState(), { type: ACT.CAPS_ERR, error: { code: 'E_OFFLINE', message: '未连接', hint: '' } })
  assert.equal(selectCaps(offline).online, false)
  assert.equal(selectHeader(offline).status, '未连接')
})

test('logic: 首页两张卡与最近一行', () => {
  const home = selectHome(initialState())
  assert.equal(home.question, '要做什么？')
  assert.deepEqual(home.cards.map((card) => card.title), ['格式转换', '视频做 GIF'])
  assert.equal(home.recent.status, 'empty')
  assert.equal(home.recent.text, '还没有记录')

  let state = initialState()
  state = reducer(state, { type: ACT.JOB_ADD, slot: 'convert', job: { id: 'j1', task: { kind: 'convert', input: 'C:\\a.mp4', to: 'mkv' }, status: 'done', output: 'C:\\a.mkv' } })
  const withRecent = selectHome(state)
  assert.equal(withRecent.recent.items[0].name, 'a.mkv')
  assert.equal(withRecent.recent.items[0].badge, 'pass')
})

test('logic: 转换视图含胶囊、仅换封装与按钮理由', () => {
  let state = withVideo()
  state = reducer(state, { type: ACT.TARGET, to: 'mkv' })
  let view = selectConvert(state)
  assert.equal(view.targets.length, 9)
  assert.equal(view.targets.filter((target) => target.selected).length, 1)
  assert.equal(view.copy.checked, true)
  assert.match(view.copy.meta, /不重编码/)
  assert.equal(view.canSubmit, true)
  assert.equal(view.etaText, '预计 1 秒')

  state = reducer(state, { type: ACT.TARGET, to: 'webm' })
  view = selectConvert(state)
  assert.equal(view.copy.checked, false)
  assert.equal(view.copy.disabled, true)
  assert.match(view.copy.reason, /不能直接装进/)
  assert.match(view.copy.meta, /预计 14 秒/)
  assert.equal(view.canSubmit, true)

  const empty = selectConvert(initialState())
  assert.equal(empty.canSubmit, false)
  assert.match(empty.submitHint, /添加文件/)

  const noTarget = selectConvert(withVideo())
  assert.match(noTarget.submitHint, /选格式/)

  const missingMuxers = reducer(initialState(), { type: ACT.CAPS_OK, data: { ...capabilities, muxers: ['mp4'] } })
  const disabledTargets = selectConvert(missingMuxers)
  assert.ok(disabledTargets.disabledTargets.length > 0)
  assert.match(disabledTargets.disabledTargets[0].reason, /没有/)
})

test('logic: GIF 视图的选区、预估与超目标警告', () => {
  let state = withGifVideo()
  let view = selectGif(state)
  assert.equal(view.range.duration, 12)
  assert.equal(view.range.from, 0)
  assert.equal(view.range.to, 5)
  assert.equal(view.range.span, 5)
  assert.equal(view.fields.fps, 12)
  assert.equal(view.fields.width, 480)
  assert.equal(view.fields.maxMB, 8)
  assert.match(view.note, /不含声音/)
  assert.equal(view.warnings.length, 0)
  assert.equal(view.canSubmit, true)

  state = reducer(state, { type: ACT.GIF_FIELD, field: 'maxMB', value: 1 })
  view = selectGif(state)
  assert.equal(view.warnings.length, 1)
  assert.match(view.warnings[0], /超过目标/)

  const longFacts = { ...videoFacts, durationSec: 140 }
  let longState = reducer(capsReady(), { type: ACT.FILE_INFO, slot: 'gif', path: 'C:\\v\\long.mp4', name: 'long.mp4' })
  longState = reducer(longState, { type: ACT.FILE_FACTS, slot: 'gif', facts: longFacts })
  longState = reducer(longState, { type: ACT.GIF_TEXT, handle: 'to', text: '01:10.0' })
  const longView = selectGif(longState)
  assert.equal(longView.range.span, 70)
  assert.match(longView.warnings[0], /偏长/)

  const empty = selectGif(initialState())
  assert.equal(empty.range.hasFile, false)
  assert.equal(empty.canSubmit, false)
})

/* ── 结果行与命令 ───────────────────────────────────── */

const checksWarn = [
  { id: 'container', tier: 'L0', outcome: 'pass', expected: 'mkv', actual: 'mkv' },
  { id: 'bytes', tier: 'L1', outcome: 'warn', expected: '≤ 8.0 MB', actual: '9.8 MB', delta: '超 1.8 MB', hint: '把宽度改小。', repair: { kind: 'reencode', width: 420 } },
]

test('logic: 结果行四种徽章', () => {
  const task = { kind: 'gif', input: 'C:\\v\\猫猫.mp4', from: 3.2, to: 8.4, fps: 12, width: 480, maxBytes: 8 * MB }
  const running = normalizeJob({ id: 'r', task, status: 'running', startedAt: 1 }, task)
  assert.equal(buildResultRow(running, false, null).badge.label, '进行中')

  const cancelled = normalizeJob({ id: 'c', task, status: 'cancelled', startedAt: 1 }, task)
  assert.equal(buildResultRow(cancelled, false, null).badge.label, '已取消')

  const failed = normalizeJob({ id: 'f', task, status: 'failed', startedAt: 1, error: { code: 'E_ENCODE', message: '编码器起不来', hint: '重试。' } }, task)
  const failedRow = buildResultRow(failed, false, null)
  assert.equal(failedRow.badge.label, '不合格')
  assert.equal(failedRow.detail.actual, '编码器起不来')
  assert.equal(failedRow.detail.delta, 'E_ENCODE')

  const warned = normalizeJob({
    id: 'w',
    task,
    status: 'done',
    output: 'C:\\v\\猫猫_03.2-08.4.gif',
    verdict: { ok: true, task, spec: { container: 'gif', maxBytes: 8 * MB }, facts: { ...videoFacts, container: 'gif', bytes: 9.8 * MB }, checks: checksWarn, repairs: [] },
  }, task)
  const warnRow = buildResultRow(warned, true, null)
  assert.equal(warnRow.badge.label, '警告')
  assert.equal(warnRow.expanded, true)
  assert.equal(warnRow.detail.expected, '≤ 8.0 MB')
  assert.equal(warnRow.detail.actual, '9.8 MB')
  assert.equal(warnRow.detail.delta, '超 1.8 MB')
  assert.equal(warnRow.detail.next, '把宽度改小。')
  assert.match(warnRow.detail.checks[1].text, /9\.8 MB/)
  assert.equal(warnRow.canRepair, true)
  assert.match(warnRow.command, /palettegen/)

  const passed = normalizeJob({
    id: 'p',
    task,
    status: 'done',
    output: 'C:\\v\\猫猫.gif',
    verdict: { ok: true, task, spec: { container: 'gif' }, facts: videoFacts, checks: [{ id: 'loop', tier: 'L0', outcome: 'pass', expected: '无限循环', actual: '无限循环' }], repairs: [] },
  }, task)
  assert.equal(buildResultRow(passed, false, null).badge.label, '通过')
})

test('logic: 失败任务与修复按钮', () => {
  const task = { kind: 'convert', input: 'C:\\v\\a.mp4', to: 'webm', copy: true }
  const row = buildResultRow(normalizeJob({ id: 'x', task, status: 'done', output: 'C:\\v\\a.webm', verdict: { ok: false, task, spec: {}, facts: videoFacts, checks: [{ id: 'codec', tier: 'L0', outcome: 'fail', expected: 'vp9', actual: 'h264', delta: '不匹配', hint: '重编码。', repair: { kind: 'reencode' } }], repairs: [] } }), false, null)
  assert.equal(row.badge.label, '不合格')
  assert.equal(row.canRepair, true)
  const repaired = applyRepair(row.task, row.repairAction)
  assert.equal(repaired.copy, false)

  const gifTask = { kind: 'gif', input: 'C:\\v\\a.mp4', from: 0, to: 5, fps: 12, width: 480 }
  const gifRepaired = applyRepair(gifTask, { kind: 'reencode', width: 420 })
  assert.equal(gifRepaired.width, 420)
  assert.equal(applyRepair(gifTask, { kind: 'gain', db: 3 }), null)
  assert.equal(applyRepair(gifTask, { kind: 'manual', reason: '手工' }), null)
  assert.equal(applyRepair(gifTask, { kind: 'rerun', reason: '重跑' }).from, 0)
  assert.match(describeRepair({ kind: 'reencode', width: 420 }), /420/)
  assert.match(describeRepair({ kind: 'gain', db: 3 }), /\+3/)
})

test('logic: 命令拼装与输出名', () => {
  const convertTask = { kind: 'convert', input: 'C:\\v\\猫猫 打滚.mp4', to: 'mkv', copy: true }
  const convertCommand = buildCommand(convertTask)
  assert.match(convertCommand, /^ffmpeg -y -i "C:\\v\\猫猫 打滚\.mp4" -c copy /)
  assert.equal(outputName(convertTask), '猫猫 打滚.mkv')

  const reencode = buildCommand({ ...convertTask, copy: false })
  assert.match(reencode, /libx264/)
  const audio = buildCommand({ kind: 'convert', input: 'C:\\v\\a.mp4', to: 'mp3', copy: false })
  assert.match(audio, /-vn -c:a libmp3lame -b:a 192k/)

  const gifTask = { kind: 'gif', input: 'C:\\v\\猫猫打滚.mp4', from: 3.2, to: 8.4, fps: 12, width: 480 }
  const gifCommand = buildCommand(gifTask)
  assert.match(gifCommand, /-ss 3\.2 -to 8\.4/)
  assert.match(gifCommand, /fps=12,scale=480:-1/)
  assert.match(gifCommand, /palettegen/)
  assert.match(gifCommand, /-loop 0/)
  assert.equal(outputName(gifTask), '猫猫打滚_03.2-08.4.gif')
  assert.equal(buildCommand(null), '')
})

test('logic: 验收摘要与任务期望', () => {
  assert.match(factsLine(videoFacts), /1920×1080/)
  assert.match(factsLine(videoFacts), /0:12/)
  assert.match(factsLine(videoFacts), /18 MB/)
  assert.match(factsLine(audioFacts), /MP3/)
  assert.equal(factsLine(null), '')
  assert.match(factsSummary(videoFacts), /容器 mp4/)
  assert.match(factsSummary(videoFacts), /音频 AAC/)
  assert.equal(factsSummary(null), '—')
  assert.match(specSummary({ container: 'mkv', durationSec: { expect: 12 } }), /容器 mkv/)
  assert.match(specSummary({ gif: { from: 3.2, to: 8.4, fps: 12, width: 480, loop: true } }), /GIF 00:03\.2/)
  assert.match(taskExpectation({ kind: 'gif', from: 3.2, to: 8.4, fps: 12, width: 480, maxBytes: 8 * MB }), /不超过 8 MB/)
  assert.match(taskExpectation({ kind: 'convert', to: 'mkv', copy: true }), /流拷贝/)
})

/* ── 杂项 ───────────────────────────────────────────── */

test('logic: 状态归一与键盘移动', () => {
  assert.equal(normalizeStatus('running'), 'running')
  assert.equal(normalizeStatus('nope'), 'queued')
  assert.equal(isActiveStatus('verifying'), true)
  assert.equal(isActiveStatus('done'), false)
  assert.equal(normalizeError(null).code, 'E_UNKNOWN')
  assert.equal(normalizeError('炸了').message, '炸了')

  assert.equal(radioMove(0, 'ArrowRight', 3), 1)
  assert.equal(radioMove(2, 'ArrowRight', 3), 0)
  assert.equal(radioMove(0, 'ArrowLeft', 3), 2)
  assert.equal(radioMove(1, 'Home', 3), 0)
  assert.equal(radioMove(1, 'End', 3), 2)
  assert.equal(radioMove(1, 'Tab', 3), -1)
  assert.equal(radioMove(0, 'ArrowRight', 0), -1)
})

test('logic: 结果区空态、队列摘要与列表', () => {
  assert.match(selectResults(initialState()).emptyText, /还没有结果/)
  const state = reducer(initialState(), { type: ACT.JOB_ADD, slot: 'convert', job: { id: 'j', task: { kind: 'convert', input: 'C:\\a.mp4', to: 'mkv' }, status: 'running' } })
  const results = selectResults(state)
  assert.equal(results.rows.length, 1)
  assert.equal(results.rows[0].badge.kind, 'busy')
  assert.equal(results.queue.active, 1)
  assert.match(results.queue.text, /队列/)
  assert.match(results.queue.text, /1 个进行中/)

  let queued = reducer(state, { type: ACT.JOB_ADD, slot: 'gif', job: { id: 'q', task: { kind: 'gif', input: 'C:\\b.mp4', from: 0, to: 5, fps: 12, width: 480 }, status: 'queued' } })
  const withQueue = selectResults(queued)
  assert.equal(withQueue.queue.active, 2)
  assert.equal(withQueue.queue.queued, 1)
  assert.match(withQueue.queue.text, /1 个排队/)

  const copying = reducer(state, { type: ACT.COPIED, key: results.rows[0].command })
  assert.equal(selectResults(copying).rows[0].copied, true)
})

test('logic: 每行独立进度与剩余秒数（JobSummary.progress）', () => {
  const progress = normalizeJobProgress({ phase: 'encoding', percent: 42.4, outTimeSec: 3.2, speed: 1.5, etaSec: 8 })
  assert.deepEqual(progress, { phase: 'encoding', percent: 42.4, outTimeSec: 3.2, speed: 1.5, etaSec: 8 })
  assert.deepEqual(normalizeJobProgress({ phase: 'weird', percent: 300 }), {
    phase: '', percent: 100, outTimeSec: null, speed: null, etaSec: null,
  })
  assert.equal(normalizeJobProgress(null), null)

  const view = describeProgress(progress, 'running')
  assert.equal(view.phaseText, '转码中')
  assert.match(view.text, /42%/)
  assert.match(view.text, /已处理 0:03/)
  assert.match(view.text, /1\.5×/)
  assert.match(view.text, /剩余 8 秒/)
  assert.equal(view.ariaValue, 42)

  const noProgress = describeProgress(null, 'running')
  assert.equal(noProgress.percent, null)
  assert.equal(noProgress.text, '转码中')
  assert.equal(noProgress.ariaValue, undefined)

  const longEta = describeProgress({ phase: 'probing', percent: null, outTimeSec: null, speed: null, etaSec: 125 }, 'running')
  assert.match(longEta.text, /剩余 2:05/)

  const task = { kind: 'convert', input: 'C:\\a.mp4', to: 'mkv' }
  const running = normalizeJob({ id: 'p1', task, status: 'running', progress: { phase: 'encoding', percent: 40, etaSec: 12 } })
  const row = buildResultRow(running, false, null)
  assert.equal(row.progress.percent, 40)
  assert.match(row.progress.text, /剩余 12 秒/)

  const done = normalizeJob({
    id: 'p2',
    task,
    status: 'done',
    output: 'C:\\a.mkv',
    verdict: { ok: true, spec: {}, facts: videoFacts, checks: [], repairs: [] },
  })
  assert.equal(buildResultRow(done, false, null).progress, null)

  let state = reducer(initialState(), {
    type: ACT.JOB_ADD,
    slot: 'convert',
    job: { id: 'j', task, status: 'running', progress: { phase: 'encoding', percent: 10 } },
  })
  state = reducer(state, { type: ACT.JOB_UPDATE, job: { id: 'j', task, status: 'verifying' } })
  assert.equal(state.jobs.items[0].status, 'verifying')
  assert.equal(state.jobs.items[0].progress.percent, 10, '轮询没带 progress 时沿用上一份')
})

test('logic: 只轮询还在跑的行', () => {
  const task = { kind: 'convert', input: 'C:\\a.mp4', to: 'mkv' }
  let state = reducer(initialState(), { type: ACT.JOB_ADD, slot: 'convert', job: { id: 'a', task, status: 'running' } })
  state = reducer(state, { type: ACT.JOB_ADD, slot: 'convert', job: { id: 'b', task, status: 'queued' } })
  state = reducer(state, { type: ACT.JOB_ADD, slot: 'convert', job: { id: 'c', task, status: 'done' } })
  assert.deepEqual(activeJobIds(state), ['b', 'a'])
  assert.deepEqual(activeJobIds(initialState()), [])
})

test('logic: planConvert 与 store 通知', () => {
  const state = reducer(withVideo(), { type: ACT.TARGET, to: 'mkv' })
  const plan = planConvert(state)
  assert.equal(plan.useCopy, true)
  assert.equal(plan.etaSec, 1)
  assert.equal(plan.task.to, 'mkv')

  const store = createStore(reducer, initialState())
  let notifications = 0
  const unsubscribe = store.subscribe(() => {
    notifications += 1
  })
  store.dispatch({ type: ACT.SCREEN, screen: 'convert' })
  assert.equal(notifications, 1)
  store.dispatch({ type: ACT.SCREEN, screen: 'convert' })
  assert.equal(notifications, 1, '相同状态不应重复通知')
  unsubscribe()
  store.dispatch({ type: ACT.SCREEN, screen: 'home' })
  assert.equal(notifications, 1)
  assert.equal(store.getState().screen, 'home')
})
