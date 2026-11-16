/**
 * Kumquat · 纯逻辑：时间/体积格式化、选区换算、校验话术、状态机、视图模型、命令拼装。
 *
 * 这一层不认识 DOM、不认识 fetch、不认识 ffmpeg；所有东西都能在 node:test 里直接跑。
 * 组件只负责把这里的返回值画出来，判断不要写在组件里。
 */

import {
  AUDIO_TARGET_CODEC,
  CONVERT_TARGETS,
  COPY_AUDIO_CODECS,
  COPY_VIDEO_CODECS,
  GIF_DEFAULTS,
  GIF_FPS_OPTIONS,
  GIF_WIDTH_OPTIONS,
  codecLabel,
  isAudioTarget,
  muxerSupports,
  normalizeCodec,
  normalizeTarget,
  targetLabel,
  targetOf,
} from './format.js'
import { ACT, fileEntry } from './state.js'

/* ────────────────────────────── 数字与时间 ────────────────────────────── */

/**
 * 夹在 [lo, hi] 之间。
 * @param {number} value
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(value, lo, hi) {
  if (!Number.isFinite(value)) return lo
  return value < lo ? lo : value > hi ? hi : value
}

/**
 * 保留一位小数。
 * @param {number} value
 */
export function round1(value) {
  return Math.round(value * 10) / 10
}

const clockPattern = /^\d{1,3}(:[0-5]?\d){0,2}(\.\d{1,3})?$/

/**
 * 解析手填时间：`3.2`、`00:03.2`、`1:02:03.4`、`3.2s` 都认；不合法返回 null。
 * @param {unknown} raw
 * @returns {number | null} 秒（保留一位小数）
 */
export function parseClock(raw) {
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/s$/i, '').trim()
  if (cleaned === '' || !clockPattern.test(cleaned)) return null
  const parts = cleaned.split(':')
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + Number(part)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return round1(seconds)
}

/**
 * `00:03.2` 这种带十分位的时刻（滑块与手填共用）。
 * @param {number} seconds
 */
export function formatClock(seconds) {
  const total = Math.max(0, round1(Number(seconds) || 0))
  const tenths = Math.round(total * 10)
  const hours = Math.floor(tenths / 36000)
  const minutes = Math.floor((tenths % 36000) / 600)
  const secs = Math.floor((tenths % 600) / 10)
  const rest = tenths % 10
  const tail = `${String(secs).padStart(2, '0')}.${rest}`
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}`
    : `${String(minutes).padStart(2, '0')}:${tail}`
}

/**
 * 片子长度：`0:12`、`2:22`、`1:02:03`。
 * @param {number} seconds
 */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`
}

/**
 * 选区长度：`5.2s`。
 * @param {number} seconds
 */
export function formatSpan(seconds) {
  return `${round1(Number(seconds) || 0)}s`
}

/**
 * 文件名里的时间戳：`03.2`、`01-24.5`。
 * @param {number} seconds
 */
export function clockShort(seconds) {
  return formatClock(seconds).replace(/^00:/, '').replace(/:/g, '-')
}

/**
 * 体积：`18 MB`、`6.3 MB`、`210 MB`、`820 B`。
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${Math.round(value)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  const text = unit === 0 ? String(Math.round(size)) : size.toFixed(1).replace(/\.0$/, '')
  return `${text} ${units[unit]}`
}

/* ────────────────────────────── 路径 ────────────────────────────── */

/**
 * 取文件名（兼容 `/` 与 `\`）。
 * @param {unknown} path
 */
export function fileName(path) {
  const text = String(path === null || path === undefined ? '' : path)
  const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return cut === -1 ? text : text.slice(cut + 1)
}

/**
 * 取小写扩展名（不含点）。
 * @param {unknown} path
 */
export function fileExt(path) {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * 去掉扩展名后的文件名。
 * @param {unknown} path
 */
export function fileStem(path) {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

/**
 * 校验并归一用户手填的绝对路径。
 * @param {unknown} raw
 * @returns {{ ok: true, path: string, name: string } | { ok: false, message: string, hint: string }}
 */
export function parsePathInput(raw) {
  let text = String(raw === null || raw === undefined ? '' : raw).trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) text = text.slice(1, -1).trim()
  }
  if (text === '') {
    return { ok: false, message: '路径是空的', hint: '点「添加文件」，或粘贴一个绝对路径。' }
  }
  if (/^file:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      let pathname = decodeURIComponent(url.pathname)
      if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1)
      if (pathname !== '') text = pathname
    } catch (error) {
      return { ok: false, message: '这个 file:// 地址读不出来', hint: '直接粘贴盘符路径试试，例如 C:\\Users\\你\\Videos\\猫猫.mp4。' }
    }
  }
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(text)
  const uncAbsolute = /^\\\\[^\\]/.test(text)
  const posixAbsolute = /^\//.test(text)
  if (!windowsAbsolute && !uncAbsolute && !posixAbsolute) {
    return { ok: false, message: '需要绝对路径', hint: '例如 C:\\Users\\你\\Videos\\猫猫.mp4，或 /home/你/videos/cat.mp4。' }
  }
  return { ok: true, path: text, name: fileName(text) }
}

/* ────────────────────────────── 预计耗时与体积 ────────────────────────────── */

/**
 * 流拷贝的预计耗时：按 70 MB/s 估，最少 1 秒。
 * @param {number} bytes
 */
export function estimateCopySeconds(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return 1
  return clamp(Math.round(size / (70 * 1024 * 1024)), 1, 120)
}

/**
 * 重编码的预计耗时：视频按 1.1×片长，音频按 0.35×片长。
 * @param {{ durationSec?: number } | null | undefined} facts
 * @param {{ kind: string, to?: string }} task
 */
export function estimateEncodeSeconds(facts, task) {
  const duration = Number(facts && facts.durationSec) || 0
  if (task && task.kind === 'gif') return estimateGifSeconds(Number(task.to) - Number(task.from))
  if (isAudioTarget(task && task.to)) return Math.max(1, Math.round(duration * 0.35 + 1))
  return Math.max(2, Math.round(duration * 1.1 + 1))
}

/**
 * GIF 生成耗时：实测 5.2 秒素材约 7 秒，按 1.2× + 1 估。
 * @param {number} span 选区长度（秒）
 */
export function estimateGifSeconds(span) {
  return Math.max(2, Math.round((Number(span) || 0) * 1.2 + 1))
}

/**
 * GIF 体积：480px/12fps 约 1.2 MB/秒，按面积与帧率线性缩放。
 * @param {number} span 秒
 * @param {number} fps
 * @param {number} width 像素
 */
export function estimateGifMB(span, fps, width) {
  const seconds = Number(span) || 0
  const rate = Number(fps) || GIF_DEFAULTS.fps
  const pixels = Number(width) || GIF_DEFAULTS.width
  const size = 1.2 * seconds * Math.pow(pixels / 480, 2) * (rate / 12)
  return round1(size)
}

/**
 * 文件条的一句话摘要（不含路径）。
 * @param {object | null | undefined} facts
 */
export function factsLine(facts) {
  if (!facts) return ''
  const parts = []
  if (facts.video) {
    const width = facts.video.width
    const height = facts.video.height
    if (Number.isFinite(width) && Number.isFinite(height)) parts.push(`${width}×${height}`)
    else parts.push(codecLabel(facts.video.codec))
  } else if (facts.audio) {
    const audio = facts.audio
    const channel = Number.isFinite(audio.sampleRate) ? `${round1(audio.sampleRate / 1000)}kHz` : ''
    const stream = `${codecLabel(audio.codec)}${channel === '' ? '' : ` ${channel}`}`
    parts.push(stream.trim())
  }
  if (Number.isFinite(facts.durationSec)) parts.push(formatDuration(facts.durationSec))
  if (Number.isFinite(facts.bytes)) parts.push(formatBytes(facts.bytes))
  return parts.join(' · ')
}

/**
 * 验收细目里的「实际」摘要。
 * @param {object | null | undefined} facts
 */
export function factsSummary(facts) {
  if (!facts) return '—'
  const parts = []
  if (facts.container) parts.push(`容器 ${facts.container}`)
  if (facts.video) {
    const video = facts.video
    const size = Number.isFinite(video.width) && Number.isFinite(video.height) ? `${video.width}×${video.height}` : ''
    const rate = Number.isFinite(video.fps) ? `${round1(video.fps)}fps` : ''
    parts.push(`视频 ${codecLabel(video.codec)}${size === '' ? '' : ` ${size}`}${rate === '' ? '' : ` ${rate}`}`)
  }
  if (facts.audio) {
    const audio = facts.audio
    const rate = Number.isFinite(audio.sampleRate) ? `${round1(audio.sampleRate / 1000)}kHz` : ''
    const channels = Number.isFinite(audio.channels) ? `${audio.channels}ch` : ''
    parts.push(`音频 ${codecLabel(audio.codec)}${rate === '' ? '' : ` ${rate}`}${channels === '' ? '' : ` ${channels}`}`)
  }
  if (Number.isFinite(facts.durationSec)) parts.push(formatSpan(facts.durationSec))
  if (Number.isFinite(facts.bytes)) parts.push(formatBytes(facts.bytes))
  return parts.join(' · ')
}

/**
 * 验收细目里的「期望」摘要。
 * @param {object | null | undefined} spec
 */
export function specSummary(spec) {
  if (!spec) return '—'
  const parts = []
  if (spec.container) parts.push(`容器 ${spec.container}`)
  if (spec.video) {
    const size = Number.isFinite(spec.video.width) && Number.isFinite(spec.video.height) ? `${spec.video.width}×${spec.video.height}` : ''
    const rate = Number.isFinite(spec.video.fps) ? `${round1(spec.video.fps)}fps` : ''
    parts.push(`视频 ${codecLabel(spec.video.codec)}${size === '' ? '' : ` ${size}`}${rate === '' ? '' : ` ${rate}`}`)
  }
  if (spec.audio) {
    const rate = Number.isFinite(spec.audio.sampleRate) ? `${round1(spec.audio.sampleRate / 1000)}kHz` : ''
    const channels = Number.isFinite(spec.audio.channels) ? `${spec.audio.channels}ch` : ''
    parts.push(`音频 ${codecLabel(spec.audio.codec)}${rate === '' ? '' : ` ${rate}`}${channels === '' ? '' : ` ${channels}`}`)
  }
  if (spec.durationSec && Number.isFinite(spec.durationSec.expect)) parts.push(`时长 ${formatSpan(spec.durationSec.expect)}`)
  if (Number.isFinite(spec.maxBytes)) parts.push(`不超过 ${formatBytes(spec.maxBytes)}`)
  if (spec.gif) parts.push(`GIF ${formatClock(spec.gif.from)} → ${formatClock(spec.gif.to)} · ${spec.gif.fps}fps · ${spec.gif.width}px`)
  return parts.join(' · ')
}

/* ────────────────────────────── 「仅换封装」可行性 ────────────────────────────── */

/**
 * 判断目标容器能否直接装下现有编码（不重编码）。
 * @param {object | null | undefined} facts
 * @param {unknown} target 目标扩展名
 * @returns {{ available: boolean, reason: string | null, etaSec: number | null, audioOnly: boolean, mode: 'copy' | 'reencode' | 'none' }}
 */
export function copyAvailability(facts, target) {
  const ext = normalizeTarget(target)
  const audioOnly = ext !== null && isAudioTarget(ext)
  if (ext === null) {
    return { available: false, reason: '先选目标格式', etaSec: null, audioOnly: false, mode: 'none' }
  }
  if (!facts) {
    return { available: false, reason: '先添加文件', etaSec: null, audioOnly, mode: 'none' }
  }
  const label = targetLabel(ext)
  const reencodeEta = estimateEncodeSeconds(facts, { kind: 'convert', to: ext })

  if (audioOnly) {
    if (!facts.audio) {
      return { available: false, reason: '文件里没有音轨，抽不出声音', etaSec: null, audioOnly: true, mode: 'none' }
    }
    const required = AUDIO_TARGET_CODEC[ext]
    const have = normalizeCodec(facts.audio.codec)
    const matches = required === 'pcm' ? have.indexOf('pcm_') === 0 : have === required
    if (!matches) {
      const need = required === 'pcm' ? 'PCM' : codecLabel(required)
      return {
        available: false,
        reason: `${codecLabel(have)} 要转成 ${need} 才能进 ${label}`,
        etaSec: reencodeEta,
        audioOnly: true,
        mode: 'reencode',
      }
    }
    return { available: true, reason: null, etaSec: estimateCopySeconds(facts.bytes), audioOnly: true, mode: 'copy' }
  }

  if (!facts.video) {
    return { available: false, reason: `这是音频文件，转不成 ${label}`, etaSec: null, audioOnly: false, mode: 'none' }
  }
  const videoCodec = normalizeCodec(facts.video.codec)
  const allowedVideo = COPY_VIDEO_CODECS[ext]
  const videoOk = allowedVideo === '*' || (Array.isArray(allowedVideo) && allowedVideo.indexOf(videoCodec) !== -1)
  if (!videoOk) {
    return {
      available: false,
      reason: `${codecLabel(videoCodec)} 不能直接装进 ${label}，需要重编码`,
      etaSec: reencodeEta,
      audioOnly: false,
      mode: 'reencode',
    }
  }
  if (facts.audio) {
    const audioCodec = normalizeCodec(facts.audio.codec)
    const allowedAudio = COPY_AUDIO_CODECS[ext]
    const audioOk = allowedAudio === '*' || (Array.isArray(allowedAudio) && allowedAudio.indexOf(audioCodec) !== -1)
    if (!audioOk) {
      return {
        available: false,
        reason: `音轨 ${codecLabel(audioCodec)} 不能直接装进 ${label}，需要重编码`,
        etaSec: reencodeEta,
        audioOnly: false,
        mode: 'reencode',
      }
    }
  }
  return { available: true, reason: null, etaSec: estimateCopySeconds(facts.bytes), audioOnly: false, mode: 'copy' }
}

/* ────────────────────────────── 任务规划与校验 ────────────────────────────── */

/**
 * @param {{ file: any } | null | undefined} slot
 */
function readyFacts(slot) {
  const file = slot && slot.file
  return file && file.factsStatus === 'ready' ? file.facts : null
}

/**
 * 当前转换表单会提交什么。
 * @param {any} state
 */
export function planConvert(state) {
  const file = state.convert.file
  const facts = readyFacts(state.convert)
  const to = normalizeTarget(state.convert.to)
  const availability = copyAvailability(facts, to)
  const useCopy = state.convert.copy === true && availability.available
  const task = facts !== null && to !== null && file !== null
    ? { kind: 'convert', input: file.path, to, copy: useCopy }
    : null
  const etaSec = task === null
    ? null
    : useCopy
      ? estimateCopySeconds(facts.bytes)
      : estimateEncodeSeconds(facts, task)
  return { file, facts, to, availability, useCopy, task, etaSec }
}

/**
 * @param {unknown} code
 */
function isOfflineCode(code) {
  return code === 'E_OFFLINE' || code === 'E_NO_TRANSPORT' || code === 'E_NETWORK' || code === 'E_TIMEOUT'
}

/**
 * @param {any} value
 */
export function normalizeError(value) {
  if (value === null || value === undefined) {
    return { code: 'E_UNKNOWN', message: '出了点问题', hint: '再试一次；仍不行就刷新页面。' }
  }
  if (typeof value === 'string') {
    return { code: 'E_UNKNOWN', message: value, hint: '再试一次。' }
  }
  return {
    code: typeof value.code === 'string' ? value.code : 'E_UNKNOWN',
    message: typeof value.message === 'string' && value.message !== '' ? value.message : '出了点问题',
    hint: typeof value.hint === 'string' ? value.hint : '',
  }
}

/**
 * 能力与 FFmpeg 的合并视图：在线与否、缺不缺二进制、状态文案。
 * @param {any} state
 */
export function selectCaps(state) {
  const caps = state.caps
  const binary = state.binary
  const failed = caps.status === 'error'
  const online = failed ? !isOfflineCode(caps.error && caps.error.code) : caps.status === 'ready' ? true : null
  const ffmpegMissing = binary.state === 'missing'
  const installing = binary.installing === true
  let label = '读取中…'
  if (caps.status === 'idle') label = '连接中…'
  else if (caps.status === 'loading') label = '读取中…'
  else if (failed) label = online === false ? '未连接' : '宿主已连接'
  else if (caps.status === 'ready') {
    const version = caps.data && caps.data.version
    label = version ? `ffmpeg ${version} · 就绪` : 'ffmpeg · 就绪'
  }
  if (installing) label = '正在装 FFmpeg'
  else if (ffmpegMissing) label = '缺 FFmpeg'
  return {
    status: caps.status,
    data: caps.data,
    error: caps.error,
    online,
    offline: online === false,
    ffmpegMissing,
    installing,
    label,
    failed,
  }
}

/**
 * 顶部 FFmpeg 横幅的视图模型。只有「缺、正在装、装失败」三种情况会出现。
 * @param {any} state
 */
export function selectBinary(state) {
  const binary = state.binary
  const hasError = binary.error !== null && binary.error !== undefined
  const missing = binary.state === 'missing'
  const installing = binary.installing === true
  const visible = missing || installing || hasError
  const sizeHint = Number.isFinite(binary.sizeHint) && binary.sizeHint > 0 ? binary.sizeHint : 80 * 1024 * 1024
  const progress = binary.progress
  const percent = progress && Number.isFinite(progress.percent) ? clamp(progress.percent, 0, 100) : null
  let phaseText = ''
  if (progress && typeof progress.phase === 'string') {
    const phase = progress.phase
    if (phase === 'connecting' || phase === 'connect') phaseText = '正在连接…'
    else if (phase === 'download' || phase === 'downloading') phaseText = percent === null ? '下载中…' : `下载中 ${Math.round(percent)}%`
    else if (phase === 'extract' || phase === 'extracting') phaseText = '正在解压…'
    else if (phase === 'verify' || phase === 'verifying') phaseText = '正在校验并启用…'
    else if (phase === 'done') phaseText = '安装完成'
    else if (phase === 'error' || phase === 'failed') phaseText = '下载失败'
    else phaseText = '处理中…'
  } else if (installing) {
    phaseText = '准备下载…'
  }
  const error = hasError ? normalizeError(binary.error) : null
  return {
    visible,
    missing,
    installing,
    completed: !missing && !installing && !hasError && (binary.state === 'system' || binary.state === 'cached'),
    state: binary.state,
    version: binary.version,
    sizeHint,
    title: error !== null
      ? 'FFmpeg 没装上'
      : `未找到 FFmpeg，需下载约 ${formatBytes(sizeHint)}`,
    hint: error !== null
      ? error.message
      : binary.cancelled
        ? '已取消下载，可以重试。'
        : 'Kumquat 只用本机 FFmpeg；装好会自动继续。',
    actionLabel: error !== null ? '重试' : '下载并安装',
    cancelled: binary.cancelled === true,
    canInstall: !installing,
    percent,
    indeterminate: installing && percent === null,
    phaseText,
    error,
    ariaValue: percent === null ? undefined : Math.round(percent),
  }
}

/**
 * 顶栏。
 * @param {any} state
 */
export function selectHeader(state) {
  const caps = selectCaps(state)
  const titles = { home: 'Kumquat', convert: '格式转换', gif: '视频做 GIF' }
  return {
    title: titles[state.screen] || 'Kumquat',
    sub: '金桔',
    backVisible: state.screen !== 'home',
    status: caps.label,
    statusTone: caps.offline ? 'error' : caps.ffmpegMissing ? 'warn' : caps.status === 'ready' ? 'ok' : 'muted',
  }
}

/**
 * 选任务屏。
 * @param {any} state
 */
export function selectHome(state) {
  const caps = selectCaps(state)
  const done = state.jobs.items.filter((item) => item.output)
  const recentItems = done.slice(0, 2).map((item) => ({
    id: item.id,
    name: fileName(item.output),
    badge: item.status === 'failed' ? 'fail' : item.verdict && item.verdict.ok === false ? 'warn' : 'pass',
  }))
  return {
    question: '要做什么？',
    cards: [
      {
        key: 'convert',
        title: '格式转换',
        desc: '换个格式，或把视频里的声音抽出来',
        disabled: false,
        reason: null,
      },
      {
        key: 'gif',
        title: '视频做 GIF',
        desc: '取几秒，做成循环动图',
        disabled: false,
        reason: null,
      },
    ],
    recent: {
      status: recentItems.length > 0 ? 'ready' : 'empty',
      items: recentItems,
      text: recentItems.length > 0 ? '' : '还没有记录',
    },
    binary: selectBinary(state),
    caps,
  }
}

/**
 * 转换表单视图模型。
 * @param {any} state
 */
export function selectConvert(state) {
  const caps = selectCaps(state)
  const plan = planConvert(state)
  const convert = state.convert
  const file = convert.file
  const targets = CONVERT_TARGETS.map((target) => {
    const supported = muxerSupports(caps.data, target.ext)
    return {
      ext: target.ext,
      label: target.label,
      note: target.note,
      selected: plan.to === target.ext,
      disabled: caps.status === 'ready' && !supported.available,
      reason: supported.reason,
    }
  })
  const disabledTargets = targets.filter((target) => target.disabled)
  const availability = plan.availability
  const copyChecked = availability.available ? convert.copy === true : false
  const copyEta = availability.available
    ? copyChecked
      ? plan.etaSec
      : plan.facts
        ? estimateEncodeSeconds(plan.facts, { kind: 'convert', to: plan.to })
        : null
    : availability.etaSec
  const copy = {
    checked: copyChecked,
    disabled: !availability.available,
    reason: availability.reason,
    etaSec: copyEta,
    mode: availability.mode,
    label: copyChecked ? '仅换封装' : '重编码',
    meta: !availability.available
      ? availability.etaSec === null
        ? availability.reason
        : `${availability.reason} · 预计 ${availability.etaSec} 秒`
      : copyChecked
        ? `${plan.etaSec} 秒 · 不重编码`
        : `需重编码 · 预计 ${copyEta} 秒`,
  }
  const validation = validateConvert(state)
  const etaSec = plan.etaSec
  return {
    caps,
    binary: selectBinary(state),
    file,
    fileLine: file ? factsLine(plan.facts) : '',
    picking: convert.picking === true,
    pickError: convert.pickError,
    paste: convert.paste,
    targets,
    disabledTargets,
    copy,
    hint: '想只要声音，直接选 MP3。',
    etaSec,
    etaText: etaSec === null ? '' : `预计 ${etaSec} 秒`,
    canSubmit: validation.ok === true,
    submitHint: validation.ok === true ? '' : validation.short || validation.message || '',
    validation,
    busy: convert.busy === true,
    error: convert.error,
  }
}

/**
 * GIF 表单视图模型。
 * @param {any} state
 */
export function selectGif(state) {
  const caps = selectCaps(state)
  const gif = state.gif
  const facts = readyFacts(gif)
  const duration = facts && Number.isFinite(facts.durationSec) ? Math.max(facts.durationSec, GIF_DEFAULTS.minSpanSec) : GIF_DEFAULTS.spanSec
  const from = round1(clamp(Number(gif.from) || 0, 0, Math.max(0, duration - GIF_DEFAULTS.minSpanSec)))
  const to = round1(clamp(Number(gif.to) || 0, from + GIF_DEFAULTS.minSpanSec, duration))
  const span = round1(to - from)
  const estimateMB = estimateGifMB(span, gif.fps, gif.width)
  const over = Number.isFinite(gif.maxMB) && gif.maxMB > 0 ? estimateMB > gif.maxMB : false
  const warnings = []
  if (span > GIF_DEFAULTS.maxSpanSec) warnings.push(`片段 ${formatSpan(span)} 偏长，GIF 会很大；建议 20 秒以内。`)
  if (over) warnings.push(`预计 ${estimateMB} MB，超过目标 ${gif.maxMB} MB；超了会自动降尺寸重试两轮。`)
  const validation = validateGif(state)
  const etaSec = validation.ok === true ? estimateGifSeconds(span) : null
  return {
    caps,
    binary: selectBinary(state),
    file: gif.file,
    fileLine: facts ? factsLine(facts) : '',
    picking: gif.picking === true,
    pickError: gif.pickError,
    paste: gif.paste,
    range: {
      duration,
      from,
      to,
      span,
      fromText: typeof gif.fromText === 'string' ? gif.fromText : formatClock(from),
      toText: typeof gif.toText === 'string' ? gif.toText : formatClock(to),
      textError: gif.textError,
      fromPct: duration > 0 ? (from / duration) * 100 : 0,
      toPct: duration > 0 ? (to / duration) * 100 : 100,
      ticks: [
        { key: 'zero', text: '00:00', pct: 0 },
        { key: 'from', text: formatClock(from), pct: duration > 0 ? (from / duration) * 100 : 0 },
        { key: 'to', text: formatClock(to), pct: duration > 0 ? (to / duration) * 100 : 100 },
        { key: 'end', text: formatDuration(duration), pct: 100 },
      ],
      hasFile: gif.file !== null,
    },
    fields: {
      fps: gif.fps,
      width: gif.width,
      maxMB: gif.maxMB,
      fpsOptions: GIF_FPS_OPTIONS,
      widthOptions: GIF_WIDTH_OPTIONS,
      maxMBOptions: [4, 8, 12, 16],
    },
    estimate: { mb: estimateMB, over, text: `${formatSpan(span)} 约 ${estimateMB} MB` },
    warnings,
    note: `GIF 不含声音；${formatSpan(span)} 约 ${estimateMB} MB。`,
    etaSec,
    etaText: etaSec === null ? '' : `预计 ${etaSec} 秒`,
    canSubmit: validation.ok === true,
    submitHint: validation.ok === true ? '' : validation.short || validation.message || '',
    validation,
    busy: gif.busy === true,
    error: gif.error,
  }
}

/**
 * 转换表单校验：返回可执行的任务或一句能照做的话。
 * @param {any} state
 */
export function validateConvert(state) {
  const caps = selectCaps(state)
  if (caps.ffmpegMissing) {
    return { ok: false, code: 'E_FFMPEG', short: '先装 FFmpeg', message: '需要先下载 FFmpeg', hint: '点顶部「下载并安装」，装好会自动继续。', field: 'binary' }
  }
  if (caps.online === false) {
    return { ok: false, code: 'E_OFFLINE', short: '未连接宿主', message: '未连接宿主', hint: '界面能看，但任务要等宿主连接恢复。', field: 'host' }
  }
  const convert = state.convert
  if (!convert.file) {
    return { ok: false, code: 'NO_FILE', short: '先添加文件', message: '先添加一个文件', hint: '点「添加文件」，或粘贴绝对路径。', field: 'file' }
  }
  if (convert.file.factsStatus === 'probing') {
    return { ok: false, code: 'PROBING', short: '正在读取文件…', message: '正在读取文件信息', hint: '半秒就好。', field: 'file', busy: true }
  }
  if (convert.file.factsStatus === 'error') {
    const error = normalizeError(convert.file.error)
    return { ok: false, code: 'E_INPUT', short: '文件读不了', message: `这个文件读不了：${error.message}`, hint: error.hint, field: 'file' }
  }
  const plan = planConvert(state)
  if (plan.to === null) {
    return { ok: false, code: 'NO_TARGET', short: '先选格式', message: '选一个目标格式', hint: '九个胶囊里点一个。', field: 'target' }
  }
  const support = muxerSupports(caps.data, plan.to)
  if (!support.available) {
    return { ok: false, code: 'E_CAPABILITY', short: '本机不支持', message: support.reason || `当前 ffmpeg 没有 ${targetLabel(plan.to)} 输出`, hint: '换一个格式，或更新 FFmpeg。', field: 'target' }
  }
  if (plan.availability.mode === 'none') {
    return {
      ok: false,
      code: 'E_INPUT',
      short: plan.availability.reason || '这个文件转不了',
      message: plan.availability.reason || '这个文件转不了',
      hint: '换一个目标格式试试。',
      field: 'target',
    }
  }
  return { ok: true, task: plan.task, etaSec: plan.etaSec }
}

/**
 * GIF 表单校验。
 * @param {any} state
 */
export function validateGif(state) {
  const caps = selectCaps(state)
  if (caps.ffmpegMissing) {
    return { ok: false, code: 'E_FFMPEG', short: '先装 FFmpeg', message: '需要先下载 FFmpeg', hint: '点顶部「下载并安装」，装好会自动继续。', field: 'binary' }
  }
  if (caps.online === false) {
    return { ok: false, code: 'E_OFFLINE', short: '未连接宿主', message: '未连接宿主', hint: '界面能看，但任务要等宿主连接恢复。', field: 'host' }
  }
  const gif = state.gif
  if (!gif.file) {
    return { ok: false, code: 'NO_FILE', short: '先添加文件', message: '先添加一个视频文件', hint: 'GIF 只能从视频做。', field: 'file' }
  }
  if (gif.file.factsStatus === 'probing') {
    return { ok: false, code: 'PROBING', short: '正在读取文件…', message: '正在读取文件信息', hint: '半秒就好。', field: 'file', busy: true }
  }
  if (gif.file.factsStatus === 'error') {
    const error = normalizeError(gif.file.error)
    return { ok: false, code: 'E_INPUT', short: '文件读不了', message: `这个文件读不了：${error.message}`, hint: error.hint, field: 'file' }
  }
  const facts = readyFacts(gif)
  if (facts && !facts.video) {
    return { ok: false, code: 'E_INPUT', short: '没有画面', message: '这是音频文件，做不了 GIF', hint: '换一个有画面的视频。', field: 'file' }
  }
  const duration = facts && Number.isFinite(facts.durationSec) ? facts.durationSec : Infinity
  const from = Number(gif.from)
  const to = Number(gif.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { ok: false, code: 'BAD_RANGE', short: '选区不完整', message: '起止时间没填对', hint: '用 00:03.2 这种写法，或直接拖滑块。', field: 'range' }
  }
  if (from < 0 || (Number.isFinite(duration) && from >= duration)) {
    return { ok: false, code: 'BAD_RANGE', short: '起点超出片长', message: '起点超出片长', hint: '往左拖一点。', field: 'range' }
  }
  if (to - from < GIF_DEFAULTS.minSpanSec) {
    return { ok: false, code: 'BAD_RANGE', short: '选区太短', message: `选区至少 ${GIF_DEFAULTS.minSpanSec} 秒`, hint: '把终点往右拖。', field: 'range' }
  }
  if (Number.isFinite(duration) && to > duration + 0.05) {
    return { ok: false, code: 'BAD_RANGE', short: '终点超出片长', message: '终点超出片长', hint: '把终点往左拖。', field: 'range' }
  }
  if (to - from > 600) {
    return { ok: false, code: 'BAD_RANGE', short: '选区太长', message: '选区超过 10 分钟', hint: 'GIF 不是这么用的，先剪一段。', field: 'range' }
  }
  const fps = Number(gif.fps)
  if (!Number.isInteger(fps) || fps < 5 || fps > 30) {
    return { ok: false, code: 'BAD_FPS', short: '帧率不对', message: '帧率要在 5–30 之间', hint: '默认 12 帧就够。', field: 'fps' }
  }
  const width = Number(gif.width)
  if (!Number.isInteger(width) || width < 120 || width > 1600) {
    return { ok: false, code: 'BAD_WIDTH', short: '宽度不对', message: '宽度要在 120–1600 像素之间', hint: '默认 480 就行。', field: 'width' }
  }
  const maxMB = gif.maxMB
  if (maxMB !== null && maxMB !== undefined && (!Number.isFinite(maxMB) || maxMB < 0.5 || maxMB > 100)) {
    return { ok: false, code: 'BAD_MAX', short: '目标体积不对', message: '目标体积要在 0.5–100 MB 之间', hint: '留空表示不设上限。', field: 'maxMB' }
  }
  const task = {
    kind: 'gif',
    input: gif.file.path,
    from: round1(from),
    to: round1(to),
    fps,
    width,
  }
  if (maxMB !== null && maxMB !== undefined) task.maxBytes = Math.round(maxMB * 1024 * 1024)
  return { ok: true, task, etaSec: estimateGifSeconds(to - from) }
}

/* ────────────────────────────── 命令与修复 ────────────────────────────── */

/**
 * 给路径加双引号（ffmpeg 命令行通用写法）。
 * @param {string} path
 */
function quoted(path) {
  return `"${String(path).replace(/"/g, '\\"')}"`
}

/**
 * 输出文件名：转换换扩展名，GIF 带选区时间戳。
 * @param {any} task
 */
export function outputName(task) {
  if (!task || typeof task.input !== 'string') return ''
  const stem = fileStem(task.input)
  if (task.kind === 'gif') return `${stem}_${clockShort(task.from)}-${clockShort(task.to)}.gif`
  return `${stem}.${normalizeTarget(task.to) || fileExt(task.input) || 'out'}`
}

/**
 * 可复制的 ffmpeg 命令。产物落在输入文件同目录，方便用户自己核对。
 * @param {any} task
 */
export function buildCommand(task) {
  if (!task || typeof task.input !== 'string' || task.input === '') return ''
  const target = normalizeTarget(task.to)
  const output = quoted(outputName(task))
  if (task.kind === 'gif') {
    const filter = `fps=${Number(task.fps) || GIF_DEFAULTS.fps},scale=${Number(task.width) || GIF_DEFAULTS.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
    return `ffmpeg -y -ss ${round1(task.from)} -to ${round1(task.to)} -i ${quoted(task.input)} -vf "${filter}" -loop 0 ${output}`
  }
  const input = quoted(task.input)
  if (task.copy === true) return `ffmpeg -y -i ${input} -c copy ${output}`
  if (isAudioTarget(target)) {
    const encoders = { mp3: ['libmp3lame', 192], m4a: ['aac', 192], wav: ['pcm_s16le', null], flac: ['flac', null] }
    const encoder = encoders[target] || ['aac', 192]
    const bitrate = encoder[1] === null ? '' : ` -b:a ${encoder[1]}k`
    return `ffmpeg -y -i ${input} -vn -c:a ${encoder[0]}${bitrate} ${output}`
  }
  return `ffmpeg -y -i ${input} -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k ${output}`
}

/**
 * 把验收建议翻译成一句人话。
 * @param {object | null | undefined} repair
 */
export function describeRepair(repair) {
  if (!repair || typeof repair !== 'object') return ''
  if (repair.kind === 'gain') return `增益 ${repair.db > 0 ? '+' : ''}${repair.db} dB 后重跑`
  if (repair.kind === 'reencode') {
    const bits = []
    if (Number.isFinite(repair.width)) bits.push(`${repair.width}px 宽`)
    if (Number.isFinite(repair.bitrateKbps)) bits.push(`${repair.bitrateKbps} kbps`)
    return bits.length > 0 ? `按 ${bits.join(' · ')} 重编码` : '重编码一次'
  }
  if (repair.kind === 'rerun') return repair.reason || '重跑一次'
  if (repair.kind === 'manual') return repair.reason || '需要手工处理'
  return ''
}

/**
 * 按验收建议生成修复后的任务；不能自动修时返回 null。
 * @param {any} task
 * @param {object | null | undefined} repair
 * @returns {any | null}
 */
export function applyRepair(task, repair) {
  if (!task || typeof task !== 'object' || !repair) return null
  if (repair.kind === 'rerun') return { ...task }
  if (repair.kind === 'reencode') {
    if (task.kind === 'convert') return { ...task, copy: false }
    if (task.kind === 'gif') {
      const width = Number.isFinite(repair.width) ? repair.width : Math.max(120, Math.round((Number(task.width) || GIF_DEFAULTS.width) * 0.85))
      return { ...task, width }
    }
  }
  return null
}

/* ────────────────────────────── 结果行 ────────────────────────────── */

const JOB_STATUSES = ['queued', 'running', 'verifying', 'repairing', 'done', 'failed', 'cancelled']
const JOB_PROGRESS_PHASES = ['probing', 'encoding', 'verifying', 'repairing']

/**
 * @param {unknown} status
 */
export function normalizeStatus(status) {
  return JOB_STATUSES.indexOf(String(status)) !== -1 ? String(status) : 'queued'
}

/**
 * 归一 JobSummary.progress（apiVersion 1 的可选加法字段）。
 * @param {unknown} value
 * @returns {{ phase: string, percent: number | null, outTimeSec: number | null, speed: number | null, etaSec: number | null } | null}
 */
export function normalizeJobProgress(value) {
  if (value === null || typeof value !== 'object') return null
  const record = value
  const phase = typeof record.phase === 'string' && JOB_PROGRESS_PHASES.indexOf(record.phase) !== -1 ? record.phase : ''
  return {
    phase,
    percent: Number.isFinite(record.percent) ? clamp(record.percent, 0, 100) : null,
    outTimeSec: Number.isFinite(record.outTimeSec) ? record.outTimeSec : null,
    speed: Number.isFinite(record.speed) ? record.speed : null,
    etaSec: Number.isFinite(record.etaSec) ? record.etaSec : null,
  }
}

/**
 * 一行进行中的任务怎么显示进度：进度条 + 剩余秒数，各读各的，不共享。
 * @param {{ phase: string, percent: number | null, outTimeSec: number | null, speed: number | null, etaSec: number | null } | null} progress
 * @param {string} status
 */
export function describeProgress(progress, status) {
  const phases = { probing: '探测中', encoding: '转码中', verifying: '验收中', repairing: '修复中' }
  const statusPhases = { queued: '排队中', running: '转码中', verifying: '验收中', repairing: '修复中' }
  const phaseText = progress && progress.phase !== '' ? phases[progress.phase] : statusPhases[status] || '进行中'
  const percent = progress && Number.isFinite(progress.percent) ? progress.percent : null
  const parts = [phaseText]
  if (percent !== null) parts.push(`${Math.round(percent)}%`)
  if (progress && Number.isFinite(progress.outTimeSec) && progress.outTimeSec > 0) parts.push(`已处理 ${formatDuration(progress.outTimeSec)}`)
  if (progress && Number.isFinite(progress.speed) && progress.speed > 0) parts.push(`${round1(progress.speed)}×`)
  let etaText = ''
  if (progress && Number.isFinite(progress.etaSec) && progress.etaSec >= 0) {
    etaText = progress.etaSec >= 60 ? `剩余 ${formatDuration(progress.etaSec)}` : `剩余 ${Math.max(1, Math.ceil(progress.etaSec))} 秒`
    parts.push(etaText)
  }
  return {
    phaseText,
    percent,
    etaText,
    text: parts.join(' · '),
    ariaValue: percent === null ? undefined : Math.round(percent),
  }
}

/**
 * 把宿主返回的 job 收成界面用的形状。
 * @param {any} job
 * @param {any} [task]
 */
export function normalizeJob(job, task) {
  const source = job && typeof job === 'object' ? job : {}
  const id = typeof source.id === 'string' && source.id !== '' ? source.id : 'job-unknown'
  return {
    id,
    task: source.task || task || null,
    status: normalizeStatus(source.status),
    output: typeof source.output === 'string' ? source.output : null,
    startedAt: Number.isFinite(source.startedAt) ? source.startedAt : 0,
    endedAt: Number.isFinite(source.endedAt) ? source.endedAt : null,
    verdict: source.verdict && typeof source.verdict === 'object' ? source.verdict : null,
    error: source.error ? normalizeError(source.error) : null,
    argv: Array.isArray(source.argv) ? source.argv.slice() : null,
    progress: normalizeJobProgress(source.progress),
  }
}

/**
 * @param {string} status
 */
export function isActiveStatus(status) {
  return status === 'queued' || status === 'running' || status === 'verifying' || status === 'repairing'
}

/**
 * @param {any} item
 */
function badgeOf(item) {
  if (isActiveStatus(item.status)) {
    const progressText = {
      queued: '排队中',
      running: '转码中',
      verifying: '验收中',
      repairing: '修复中',
    }
    return { kind: 'busy', label: '进行中', note: progressText[item.status] || '' }
  }
  if (item.status === 'cancelled') return { kind: 'muted', label: '已取消', note: '任务已取消' }
  if (item.status === 'failed') return { kind: 'fail', label: '不合格', note: '任务失败' }
  const verdict = item.verdict
  if (!verdict) return { kind: 'warn', label: '警告', note: '没有验收结果' }
  const checks = Array.isArray(verdict.checks) ? verdict.checks : []
  const fail = checks.some((check) => check && check.outcome === 'fail')
  const warn = checks.some((check) => check && check.outcome === 'warn')
  if (fail || verdict.ok === false) return { kind: 'fail', label: '不合格', note: '有硬指标没命中' }
  if (warn) return { kind: 'warn', label: '警告', note: '能用，但有偏差' }
  return { kind: 'pass', label: '通过', note: '规格全部命中' }
}

/**
 * 单行结果（含展开后的验收细目）。
 * @param {any} item
 * @param {boolean} expanded
 * @param {string | null} copied
 */
export function buildResultRow(item, expanded, copied) {
  const task = item.task
  const badge = badgeOf(item)
  const verdict = item.verdict
  const checks = verdict && Array.isArray(verdict.checks) ? verdict.checks : []
  const primary = checks.find((check) => check && check.outcome === 'fail')
    || checks.find((check) => check && check.outcome === 'warn')
    || checks[0]
    || null
  let expected = task === null ? '—' : taskExpectation(task)
  let actual = '—'
  let delta = '—'
  let next = ''
  if (isActiveStatus(item.status)) {
    actual = item.status === 'queued' ? '排队中' : item.status === 'verifying' ? '正在验收' : '正在跑'
    next = '跑完自动验收，结论会替换这一行。'
  } else if (item.status === 'cancelled') {
    actual = '已取消'
    next = '要的话重新点「开始」。'
  } else if (item.status === 'failed') {
    const error = item.error || { code: 'E_UNKNOWN', message: '任务失败', hint: '再试一次。' }
    expected = task === null ? '任务跑完并给出验收结果' : taskExpectation(task)
    actual = error.message
    delta = error.code
    next = error.hint || '再试一次；仍失败就复制命令自己跑一遍。'
  } else if (verdict) {
    expected = primary && primary.expected ? primary.expected : specSummary(verdict.spec) || expected
    actual = primary && primary.actual ? primary.actual : factsSummary(verdict.facts)
    delta = primary && primary.delta ? primary.delta : '规格全部命中'
    const repair = primary && primary.repair ? primary.repair : null
    next = primary && primary.hint ? primary.hint : repair ? describeRepair(repair) : '不用改，直接用。'
  } else {
    actual = '没有验收结果'
    next = '重跑一次，或复制命令自己核对。'
  }
  const command = task === null ? '' : buildCommand(task)
  const repairAction = primary && primary.repair ? primary.repair : null
  return {
    id: item.id,
    status: item.status,
    task,
    title: item.output ? fileName(item.output) : outputName(task) || '未命名任务',
    output: item.output,
    meta: item.output && verdict && verdict.facts
      ? factsLine(verdict.facts)
      : task === null
        ? '任务信息缺失'
        : task.kind === 'gif'
          ? `${formatClock(task.from)} → ${formatClock(task.to)} · ${task.fps || GIF_DEFAULTS.fps}fps · ${task.width || GIF_DEFAULTS.width}px`
          : `转成 ${targetLabel(task.to)}${task.copy === true ? ' · 仅换封装' : ' · 重编码'}`,
    badge,
    expanded: expanded === true,
    detail: {
      expected: expected || '—',
      actual: actual || '—',
      delta: delta || '—',
      next: next || '—',
      checks: checks.slice(0, 6).map((check) => ({
        id: typeof check.id === 'string' ? check.id : 'check',
        outcome: check.outcome || 'pass',
        text: [check.expected, check.actual].filter((part) => typeof part === 'string' && part !== '').join(' → '),
        delta: typeof check.delta === 'string' ? check.delta : '',
      })),
    },
    command,
    copied: copied !== null && copied !== undefined && copied === command,
    active: isActiveStatus(item.status),
    progress: isActiveStatus(item.status) ? describeProgress(item.progress, item.status) : null,
    canRepair: repairAction !== null && applyRepair(task, repairAction) !== null,
    repairAction,
    error: item.error,
  }
}

/**
 * 任务的一句话期望。
 * @param {any} task
 */
export function taskExpectation(task) {
  if (!task || typeof task !== 'object') return '—'
  if (task.kind === 'gif') {
    const span = round1(Number(task.to) - Number(task.from))
    const max = Number.isFinite(task.maxBytes) ? ` · 不超过 ${formatBytes(task.maxBytes)}` : ''
    return `GIF ${formatClock(task.from)} → ${formatClock(task.to)}（${formatSpan(span)}）· ${task.fps || GIF_DEFAULTS.fps}fps · ${task.width || GIF_DEFAULTS.width}px${max}`
  }
  return `容器 ${targetLabel(task.to)}${task.copy === true ? ' · 流拷贝' : ' · 重编码'} · 时长与输入一致`
}

/**
 * 当前还在跑的任务 id（轮询只盯这些行）。
 * @param {any} state
 * @returns {string[]}
 */
export function activeJobIds(state) {
  const items = state.jobs && Array.isArray(state.jobs.items) ? state.jobs.items : []
  return items.filter((item) => isActiveStatus(item.status)).map((item) => item.id)
}

/**
 * 结果区视图模型。
 * @param {any} state
 */
export function selectResults(state) {
  const items = Array.isArray(state.jobs.items) ? state.jobs.items : []
  const active = items.filter((item) => isActiveStatus(item.status))
  const queued = items.filter((item) => item.status === 'queued').length
  const queueText = active.length === 0
    ? ''
    : `队列：${active.length} 个进行中${queued > 0 ? ` · ${queued} 个排队` : ''}`
  return {
    rows: items.slice(0, 8).map((item) => buildResultRow(item, state.jobs.expanded[item.id] === true, state.copied)),
    emptyText: state.jobs.error
      ? `任务记录读不出来：${normalizeError(state.jobs.error).message}`
      : '还没有结果。跑一次，验收结论会挂在这里。',
    queue: {
      total: items.length,
      active: active.length,
      queued,
      text: queueText,
    },
  }
}

/**
 * 余额那行小字。无 key 显示「未配置」，不报错。
 * @param {any} state
 */
export function selectBalance(state) {
  const balance = state.balance
  if (balance.status === 'error') {
    const error = normalizeError(balance.error)
    return { text: isOfflineCode(error.code) ? '余额 未连接' : `余额 读取失败`, tone: 'error' }
  }
  if (balance.status !== 'ready') return { text: '余额 读取中…', tone: 'muted' }
  const data = balance.data
  if (!data || data.ok !== true || data.available === false) return { text: '余额 未配置', tone: 'muted' }
  const total = typeof data.total === 'string' ? data.total : ''
  if (total === '') return { text: '余额 未配置', tone: 'muted' }
  const currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : 'CNY'
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `
  return { text: `余额 ${symbol}${total}`, tone: 'ready' }
}

/**
 * 任务卡/胶囊的键盘方向键移动；不认识的键返回 -1。
 * @param {number} index
 * @param {string} key
 * @param {number} length
 */
export function radioMove(index, key, length) {
  if (length <= 0) return -1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % length
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + length) % length
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return -1
}

/* ────────────────────────────── reducer ────────────────────────────── */

/**
 * 合并两次轮询：宿主这次没给的字段沿用上一次，进度不会因为一次空响应而丢。
 * @param {any} item
 * @param {any} next
 */
function mergeJob(item, next) {
  const merged = { ...item, ...next }
  for (const key of ['task', 'output', 'verdict', 'error', 'endedAt', 'progress']) {
    if (next[key] === null || next[key] === undefined) merged[key] = item[key]
  }
  return merged
}

/**
 * @param {any} state
 * @param {any} action
 */
export function reducer(state, action) {
  if (!action || typeof action.type !== 'string') return state
  switch (action.type) {
    case ACT.SCREEN: {
      const screen = action.screen === 'convert' || action.screen === 'gif' ? action.screen : 'home'
      return state.screen === screen ? state : { ...state, screen }
    }
    case ACT.CAPS_LOAD:
      return { ...state, caps: { status: 'loading', data: state.caps.data, error: null } }
    case ACT.CAPS_OK:
      return { ...state, caps: { status: 'ready', data: action.data || null, error: null } }
    case ACT.CAPS_ERR:
      return { ...state, caps: { status: 'error', data: null, error: normalizeError(action.error) } }
    case ACT.BALANCE_LOAD:
      return { ...state, balance: { status: 'loading', data: state.balance.data, error: null } }
    case ACT.BALANCE_OK:
      return { ...state, balance: { status: 'ready', data: action.data || null, error: null } }
    case ACT.BALANCE_ERR:
      return { ...state, balance: { status: 'error', data: null, error: normalizeError(action.error) } }
    case ACT.PENDING_SUBMIT:
      return { ...state, pendingSubmit: action.slot === 'convert' || action.slot === 'gif' ? action.slot : null }
    case ACT.BINARY_LOAD:
      return { ...state, binary: { ...state.binary, status: 'loading', error: null } }
    case ACT.BINARY_READY: {
      const data = action.data && typeof action.data === 'object' ? action.data : {}
      const nextState = data.state === 'missing' || data.state === 'system' || data.state === 'cached' ? data.state : state.binary.state
      return {
        ...state,
        binary: {
          ...state.binary,
          status: 'ready',
          state: nextState,
          version: typeof data.version === 'string' ? data.version : state.binary.version,
          sizeHint: Number.isFinite(data.sizeHint) ? data.sizeHint : state.binary.sizeHint,
          error: null,
          cancelled: false,
        },
      }
    }
    case ACT.BINARY_ERR:
      return { ...state, binary: { ...state.binary, status: 'error', error: normalizeError(action.error) } }
    case ACT.BINARY_INSTALL_BEGIN:
      return { ...state, binary: { ...state.binary, installing: true, progress: { phase: 'connecting' }, error: null, cancelled: false } }
    case ACT.BINARY_PROGRESS: {
      const progress = action.progress && typeof action.progress === 'object' ? action.progress : null
      return { ...state, binary: { ...state.binary, progress } }
    }
    case ACT.BINARY_DONE: {
      const data = action.data && typeof action.data === 'object' ? action.data : {}
      return {
        ...state,
        binary: {
          ...state.binary,
          status: 'ready',
          state: data.state === 'system' ? 'system' : 'cached',
          version: typeof data.version === 'string' ? data.version : state.binary.version,
          installing: false,
          progress: { phase: 'done', percent: 100 },
          error: null,
          cancelled: false,
        },
      }
    }
    case ACT.BINARY_FAIL:
      return {
        ...state,
        binary: {
          ...state.binary,
          installing: false,
          progress: null,
          error: action.error ? normalizeError(action.error) : normalizeError(action.message),
          cancelled: action.cancelled === true,
        },
      }
    case ACT.BINARY_CANCEL:
      return { ...state, binary: { ...state.binary, installing: false, progress: null, cancelled: true, error: null } }
    case ACT.FILE_BEGIN: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], picking: true, pickError: null } }
    }
    case ACT.FILE_PICK_ERR: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], picking: false, pickError: normalizeError(action.error) } }
    }
    case ACT.FILE_INFO: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      const file = { ...fileEntry(String(action.path || ''), String(action.name || fileName(action.path))), factsStatus: 'probing' }
      const slot = { ...state[key], file, picking: false, pickError: null, error: null, paste: { open: false, draft: '', error: null } }
      if (key === 'gif') {
        slot.from = 0
        slot.to = GIF_DEFAULTS.spanSec
        slot.fromText = formatClock(0)
        slot.toText = formatClock(GIF_DEFAULTS.spanSec)
        slot.textError = null
      }
      return { ...state, [key]: slot }
    }
    case ACT.FILE_FACTS: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      const current = state[key]
      if (!current.file) return state
      const facts = action.facts && typeof action.facts === 'object' ? action.facts : null
      const file = { ...current.file, facts, factsStatus: 'ready', error: null }
      const slot = { ...current, file }
      if (key === 'gif' && facts && Number.isFinite(facts.durationSec)) {
        const duration = Math.max(facts.durationSec, GIF_DEFAULTS.minSpanSec)
        slot.to = round1(Math.min(Number(slot.to) || GIF_DEFAULTS.spanSec, duration))
        slot.from = round1(clamp(Number(slot.from) || 0, 0, Math.max(0, slot.to - GIF_DEFAULTS.minSpanSec)))
        slot.fromText = formatClock(slot.from)
        slot.toText = formatClock(slot.to)
      }
      return { ...state, [key]: slot }
    }
    case ACT.FILE_ERR: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      const current = state[key]
      if (!current.file) return state
      return { ...state, [key]: { ...current, file: { ...current.file, factsStatus: 'error', error: normalizeError(action.error) } } }
    }
    case ACT.FILE_CLEAR: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], file: null, error: null, pickError: null } }
    }
    case ACT.PASTE_OPEN: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      const open = action.open === true
      return { ...state, [key]: { ...state[key], paste: { open, draft: open ? state[key].paste.draft : '', error: null } } }
    }
    case ACT.PASTE_DRAFT: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], paste: { ...state[key].paste, draft: String(action.draft === null || action.draft === undefined ? '' : action.draft), error: null } } }
    }
    case ACT.PASTE_ERR: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], paste: { ...state[key].paste, error: normalizeError(action.error) } } }
    }
    case ACT.TARGET:
      return { ...state, convert: { ...state.convert, to: normalizeTarget(action.to) } }
    case ACT.COPY:
      return { ...state, convert: { ...state.convert, copy: action.copy === true } }
    case ACT.GIF_SLIDER:
      return applyGifSlider(state, action.handle, action.value)
    case ACT.GIF_TEXT:
      return applyGifText(state, action.handle, action.text)
    case ACT.GIF_TEXT_DONE: {
      const gif = state.gif
      const from = Number(gif.from) || 0
      const to = Number(gif.to) || 0
      return {
        ...state,
        gif: {
          ...gif,
          fromText: formatClock(from),
          toText: formatClock(to),
          textError: null,
        },
      }
    }
    case ACT.GIF_FIELD: {
      const field = action.field === 'fps' || action.field === 'width' || action.field === 'maxMB' ? action.field : null
      if (field === null) return state
      const value = action.value === null || action.value === undefined || action.value === '' ? null : Number(action.value)
      return { ...state, gif: { ...state.gif, [field]: value === null || Number.isFinite(value) ? value : state.gif[field] } }
    }
    case ACT.JOB_BEGIN: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], busy: true, error: null }, pendingSubmit: null }
    }
    case ACT.JOB_ERR: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      return { ...state, [key]: { ...state[key], busy: false, error: normalizeError(action.error) } }
    }
    case ACT.JOB_ADD: {
      const key = action.slot === 'gif' ? 'gif' : 'convert'
      const job = normalizeJob(action.job, action.task)
      const exists = state.jobs.items.some((item) => item.id === job.id)
      const items = exists
        ? state.jobs.items.map((item) => (item.id === job.id ? mergeJob(item, job) : item))
        : [job].concat(state.jobs.items)
      return {
        ...state,
        [key]: { ...state[key], busy: false, error: null },
        jobs: { ...state.jobs, status: 'ready', items, error: null, expanded: { ...state.jobs.expanded, [job.id]: false } },
      }
    }
    case ACT.JOB_UPDATE: {
      const job = normalizeJob(action.job, action.task)
      const exists = state.jobs.items.some((item) => item.id === job.id)
      const items = exists
        ? state.jobs.items.map((item) => (item.id === job.id ? mergeJob(item, job) : item))
        : [job].concat(state.jobs.items)
      return { ...state, jobs: { ...state.jobs, status: 'ready', items } }
    }
    case ACT.EXPAND: {
      const id = String(action.id)
      return { ...state, jobs: { ...state.jobs, expanded: { ...state.jobs.expanded, [id]: state.jobs.expanded[id] !== true } } }
    }
    case ACT.COPIED:
      return { ...state, copied: typeof action.key === 'string' ? action.key : null }
    case ACT.NOTICE:
      return { ...state, notice: action.notice || null }
    default:
      return state
  }
}

/**
 * 拖动滑块：夹住边界，并让起点/终点至少隔 minSpanSec。
 * @param {any} state
 * @param {unknown} handle
 * @param {unknown} value
 */
function applyGifSlider(state, handle, value) {
  const gif = state.gif
  const facts = readyFacts(gif)
  const duration = facts && Number.isFinite(facts.durationSec) ? Math.max(facts.durationSec, GIF_DEFAULTS.minSpanSec) : GIF_DEFAULTS.spanSec
  const next = Number(value)
  if (!Number.isFinite(next)) return state
  let from = Number(gif.from) || 0
  let to = Number(gif.to) || 0
  if (handle === 'from') {
    from = round1(clamp(round1(next), 0, Math.max(0, to - GIF_DEFAULTS.minSpanSec)))
  } else {
    to = round1(clamp(round1(next), from + GIF_DEFAULTS.minSpanSec, duration))
  }
  return {
    ...state,
    gif: {
      ...gif,
      from,
      to,
      fromText: formatClock(from),
      toText: formatClock(to),
      textError: null,
    },
  }
}

/**
 * 手填时间：文本立刻显示，数值只在解析成功时更新；解析失败留一句提示。
 * @param {any} state
 * @param {unknown} handle
 * @param {unknown} raw
 */
function applyGifText(state, handle, raw) {
  const gif = state.gif
  const text = String(raw === null || raw === undefined ? '' : raw)
  const facts = readyFacts(gif)
  const duration = facts && Number.isFinite(facts.durationSec) ? Math.max(facts.durationSec, GIF_DEFAULTS.minSpanSec) : GIF_DEFAULTS.spanSec
  const parsed = parseClock(text)
  const next = { ...gif }
  if (handle === 'from') next.fromText = text
  else if (handle === 'to') next.toText = text
  else return state
  if (parsed === null) {
    next.textError = handle === 'from' ? 'from' : 'to'
    return { ...state, gif: next }
  }
  let from = Number(gif.from) || 0
  let to = Number(gif.to) || 0
  if (handle === 'from') from = round1(clamp(parsed, 0, Math.max(0, to - GIF_DEFAULTS.minSpanSec)))
  else {
    to = round1(clamp(parsed, from + GIF_DEFAULTS.minSpanSec, duration))
    next.toText = text
  }
  next.from = from
  next.to = to
  next.textError = null
  return { ...state, gif: next }
}
