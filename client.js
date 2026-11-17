/*
 * Kumquat · client bundle（自动生成，勿手改）
 * 源文件：src/client/**（ESM，可单测）；装配脚本：src/client/build.js
 * 重新生成：node src/client/build.js
 */
window.__ModuleLoader__.load({
  id: 'dsh-kumquat',
  factory(require) {
    'use strict'
    const React = require('react')

/* ── h.js ── */
/**
 * Kumquat · 取宿主的 React.createElement，绑一次，全局用 `h`。
 *
 * 组件不直接向宿主取 react：宿主只允许 client.js 的工厂拿取模块，
 * 拆出来的模块共用这里绑定的 `h`。没绑之前 `h` 是 null，组件不会被调用。
 */

/** @type {((type: any, props?: any, ...children: any[]) => any) | null} */
let h = null

/**
 * 绑定宿主的 React（只取 createElement）。
 * @param {{ createElement: Function }} React
 */
function bindHost(React) {
  h = React.createElement
  return h
}

/**
 * 拼 className，过滤假值。
 * @param {...any} parts
 */
function cx(...parts) {
  return parts.filter((part) => typeof part === 'string' && part !== '').join(' ')
}


/* ── format.js ── */
/**
 * Kumquat · 目标格式表与 GIF 默认值。
 *
 * 纯数据与纯查表：不碰 DOM、不碰宿主、无副作用。UI 与逻辑层都从这里取
 * 「有哪些格式、装得下什么编码、默认参数是多少」，避免把同一张表抄两遍。
 *
 * @typedef {'video' | 'audio'} TargetKind
 * @typedef {{ ext: string, label: string, kind: TargetKind, container: string, note: string }} ConvertTarget
 */

/** 九种目标格式，顺序即界面顺序。 @type {ReadonlyArray<ConvertTarget>} */
const CONVERT_TARGETS = Object.freeze([
  Object.freeze({ ext: 'mp4', label: 'MP4', kind: 'video', container: 'mp4', note: '通用；H.264/AAC' }),
  Object.freeze({ ext: 'mkv', label: 'MKV', kind: 'video', container: 'matroska', note: '几乎什么都能装' }),
  Object.freeze({ ext: 'mov', label: 'MOV', kind: 'video', container: 'mov', note: '剪辑软件友好' }),
  Object.freeze({ ext: 'webm', label: 'WEBM', kind: 'video', container: 'webm', note: '网页用；VP9/Opus' }),
  Object.freeze({ ext: 'avi', label: 'AVI', kind: 'video', container: 'avi', note: '老设备兼容' }),
  Object.freeze({ ext: 'mp3', label: 'MP3', kind: 'audio', container: 'mp3', note: '只留声音' }),
  Object.freeze({ ext: 'm4a', label: 'M4A', kind: 'audio', container: 'ipod', note: 'AAC 音频' }),
  Object.freeze({ ext: 'wav', label: 'WAV', kind: 'audio', container: 'wav', note: '无损；体积大' }),
  Object.freeze({ ext: 'flac', label: 'FLAC', kind: 'audio', container: 'flac', note: '无损；有压缩' }),
  Object.freeze({ ext: 'aac', label: 'AAC', kind: 'audio', container: 'adts', note: '苹果/安卓通用' }),
  Object.freeze({ ext: 'ogg', label: 'OGG', kind: 'audio', container: 'ogg', note: '开源；Vorbis' }),
  Object.freeze({ ext: 'opus', label: 'OPUS', kind: 'audio', container: 'opus', note: '语音/音乐都省体积' }),
  Object.freeze({ ext: 'wma', label: 'WMA', kind: 'audio', container: 'asf', note: '旧播放器兼容' }),
])

/** 目标格式按扩展名查表。 @type {Readonly<Record<string, ConvertTarget>>} */
const TARGET_BY_EXT = Object.freeze(
  Object.fromEntries(CONVERT_TARGETS.map((target) => [target.ext, target])),
)

/** 视频目标扩展名，按界面顺序。 @type {ReadonlyArray<string>} */
const VIDEO_EXTS = Object.freeze(CONVERT_TARGETS.filter((target) => target.kind === 'video').map((target) => target.ext))

/** 音频目标扩展名，按界面顺序。 @type {ReadonlyArray<string>} */
const AUDIO_EXTS = Object.freeze(CONVERT_TARGETS.filter((target) => target.kind === 'audio').map((target) => target.ext))

/** GIF 面板的默认参数（设计稿 v0.6：12fps / 480px / 8MB / 默认 5 秒）。 */
const GIF_DEFAULTS = Object.freeze({
  fps: 12,
  width: 480,
  maxMB: 8,
  spanSec: 5,
  minSpanSec: 0.2,
  maxSpanSec: 60,
})

/** 帧率可选项。 */
const GIF_FPS_OPTIONS = Object.freeze([8, 10, 12, 15, 20, 24])

/** 宽度可选项（像素）。 */
const GIF_WIDTH_OPTIONS = Object.freeze([320, 480, 640, 720, 820])

/** 每个音频目标要求的编码：'pcm' 表示任意 PCM 均可。 */
const AUDIO_TARGET_CODEC = Object.freeze({ mp3: 'mp3', m4a: 'aac', wav: 'pcm', flac: 'flac', aac: 'aac', ogg: 'vorbis', opus: 'opus', wma: 'wmav2' })

/** 允许流拷贝进各视频容器的视频编码；'*' 表示容器不挑。 */
const COPY_VIDEO_CODECS = Object.freeze({
  mp4: Object.freeze(['h264', 'hevc', 'mpeg4', 'av1']),
  mkv: '*',
  mov: Object.freeze(['h264', 'hevc', 'prores', 'dnxhd', 'mjpeg']),
  webm: Object.freeze(['vp8', 'vp9', 'av1']),
  avi: Object.freeze(['h264', 'mpeg4', 'mjpeg', 'msmpeg4v3']),
})

/** 允许流拷贝进各视频容器的音频编码；'*' 表示容器不挑。 */
const COPY_AUDIO_CODECS = Object.freeze({
  mp4: Object.freeze(['aac', 'mp3', 'alac', 'ac3', 'eac3']),
  mkv: '*',
  mov: Object.freeze(['aac', 'mp3', 'alac', 'ac3', 'pcm_s16le', 'pcm_s24le']),
  webm: Object.freeze(['opus', 'vorbis']),
  avi: Object.freeze(['mp3', 'ac3', 'pcm_s16le', 'pcm_s24le']),
})

/** ffmpeg 报告的 muxer 名与界面扩展名的对应（一个格式可能对应多个 muxer）。 */
const MUXER_ALIASES = Object.freeze({
  mp4: Object.freeze(['mp4', 'mov']),
  mkv: Object.freeze(['matroska', 'mkv']),
  mov: Object.freeze(['mov', 'mp4']),
  webm: Object.freeze(['webm']),
  avi: Object.freeze(['avi']),
  mp3: Object.freeze(['mp3']),
  m4a: Object.freeze(['ipod', 'mp4', 'm4a']),
  wav: Object.freeze(['wav']),
  flac: Object.freeze(['flac']),
  aac: Object.freeze(['adts', 'aac']),
  ogg: Object.freeze(['ogg']),
  opus: Object.freeze(['opus']),
  wma: Object.freeze(['asf', 'wma']),
})

/** 编码的人类可读名。 */
const CODEC_LABELS = Object.freeze({
  h264: 'H.264',
  hevc: 'H.265',
  av1: 'AV1',
  vp8: 'VP8',
  vp9: 'VP9',
  mpeg4: 'MPEG-4',
  prores: 'ProRes',
  dnxhd: 'DNxHD',
  mjpeg: 'MJPEG',
  msmpeg4v3: 'MS MPEG-4',
  aac: 'AAC',
  mp3: 'MP3',
  alac: 'ALAC',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  opus: 'Opus',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  wmav2: 'WMA',
})

/**
 * 把用户/任务里的目标写法归一成扩展名。
 * @param {unknown} target 例如 'MP4'、'.mkv'、'mp3'
 * @returns {string | null} 归一后的小写扩展名；不认识返回 null
 */
function normalizeTarget(target) {
  const ext = String(target === null || target === undefined ? '' : target).trim().toLowerCase().replace(/^\./, '')
  return Object.prototype.hasOwnProperty.call(TARGET_BY_EXT, ext) ? ext : null
}

/**
 * @param {unknown} ext
 * @returns {ConvertTarget | null}
 */
function targetOf(ext) {
  const normalized = normalizeTarget(ext)
  return normalized === null ? null : TARGET_BY_EXT[normalized]
}

/**
 * @param {unknown} ext
 * @returns {boolean}
 */
function isAudioTarget(ext) {
  return AUDIO_EXTS.indexOf(normalizeTarget(ext) || '') !== -1
}

/**
 * @param {unknown} ext
 * @returns {boolean}
 */
function isVideoTarget(ext) {
  return VIDEO_EXTS.indexOf(normalizeTarget(ext) || '') !== -1
}

/**
 * @param {unknown} ext
 * @returns {string}
 */
function targetLabel(ext) {
  const target = targetOf(ext)
  return target === null ? String(ext === null || ext === undefined ? '' : ext) : target.label
}

/**
 * 归一编码名：小写、去 `.` 后的 profile 段（`h264.high` → `h264`）。
 * @param {unknown} codec
 * @returns {string}
 */
function normalizeCodec(codec) {
  return String(codec === null || codec === undefined ? '' : codec).trim().toLowerCase().split('.')[0]
}

/**
 * @param {unknown} codec
 * @returns {string}
 */
function codecLabel(codec) {
  const normalized = normalizeCodec(codec)
  if (CODEC_LABELS[normalized] !== undefined) return CODEC_LABELS[normalized]
  if (normalized.indexOf('pcm_') === 0) {
    const bits = normalized.slice(4).replace('s', '').replace('le', '').replace('be', '')
    return /^\d+$/.test(bits) ? `PCM ${bits}-bit` : 'PCM'
  }
  return normalized === '' ? '未知编码' : normalized.toUpperCase()
}

/**
 * ffmpeg 的能力表里有没有这种输出容器。能力未知（还没读到、或宿主没给 muxers）时按「可用」处理，
 * 宁可选了再报错，也不要先把用户想选的格式灰掉。
 * @param {{ muxers?: string[] } | null | undefined} capabilities
 * @param {unknown} ext
 * @returns {{ available: boolean, reason: string | null }}
 */
function muxerSupports(capabilities, ext) {
  const target = targetOf(ext)
  if (target === null) return { available: false, reason: `不支持的格式：${String(ext)}` }
  const muxers = capabilities && Array.isArray(capabilities.muxers) ? capabilities.muxers : []
  if (muxers.length === 0) return { available: true, reason: null }
  const aliases = MUXER_ALIASES[target.ext] || [target.ext]
  const found = aliases.some((alias) => muxers.indexOf(alias) !== -1)
  return found
    ? { available: true, reason: null }
    : { available: false, reason: `当前 ffmpeg 没有 ${target.label} 输出（缺 ${aliases[0]} muxer）` }
}


/* ── state.js ── */
/**
 * Kumquat · 界面状态形状、动作名、极简 store。
 *
 * 这里只放「状态长什么样」和「怎么通知订阅者」；状态怎么变（reducer）
 * 与怎么读（selector）在 logic.js。没有 DOM，可直接在 node:test 里跑。
 */


/** 所有动作类型。界面只发这些字符串，reducer 只认这些字符串。 */
const ACT = Object.freeze({
  SCREEN: 'screen',
  CAPS_LOAD: 'caps/load',
  CAPS_OK: 'caps/ok',
  CAPS_ERR: 'caps/err',
  BALANCE_LOAD: 'balance/load',
  BALANCE_OK: 'balance/ok',
  BALANCE_ERR: 'balance/err',
  FILE_BEGIN: 'file/begin',
  FILE_INFO: 'file/info',
  FILE_FACTS: 'file/facts',
  FILE_ERR: 'file/err',
  FILE_PICK_ERR: 'file/pick-error',
  FILE_CLEAR: 'file/clear',
  PASTE_OPEN: 'file/paste-open',
  PASTE_DRAFT: 'file/paste-draft',
  PASTE_ERR: 'file/paste-error',
  TARGET: 'convert/target',
  COPY: 'convert/copy',
  TRIM_TOGGLE: 'convert/trim-toggle',
  TRIM_TEXT: 'convert/trim-text',
  BATCH_SET: 'convert/batch',
  GIF_SLIDER: 'gif/slider',
  GIF_TEXT: 'gif/text',
  GIF_TEXT_DONE: 'gif/text-done',
  GIF_FIELD: 'gif/field',
  JOB_BEGIN: 'job/begin',
  JOB_ERR: 'job/error',
  JOB_ADD: 'job/add',
  JOB_UPDATE: 'job/update',
  EXPAND: 'job/expand',
  COPIED: 'ui/copied',
  NOTICE: 'ui/notice',
  BINARY_LOAD: 'binary/load',
  BINARY_READY: 'binary/ready',
  BINARY_ERR: 'binary/error',
  BINARY_INSTALL_BEGIN: 'binary/install-begin',
  BINARY_PROGRESS: 'binary/progress',
  BINARY_DONE: 'binary/done',
  BINARY_FAIL: 'binary/fail',
  BINARY_CANCEL: 'binary/cancel',
  PENDING_SUBMIT: 'job/pending-submit',
})

/**
 * 新建一个文件条目（还没有 facts，也没开始探测）。
 * @param {string} path 绝对路径
 * @param {string} name 展示名
 */
function fileEntry(path, name) {
  return Object.freeze({
    path,
    name,
    facts: null,
    factsStatus: 'idle',
    error: null,
  })
}

/**
 * 一份新的界面状态。所有屏幕共享同一份，切屏不丢表单。
 */
function initialState() {
  return {
    screen: 'home',
    caps: { status: 'idle', data: null, error: null },
    balance: { status: 'idle', data: null, error: null },
    binary: {
      status: 'idle',
      state: null,
      version: null,
      sizeHint: null,
      installing: false,
      progress: null,
      error: null,
      cancelled: false,
    },
    convert: {
      file: null,
      picking: false,
      pickError: null,
      paste: { open: false, draft: '', error: null },
      to: null,
      copy: true,
      trim: { enabled: false, fromText: '00:00.0', toText: '' },
      batch: [],
      busy: false,
      error: null,
    },
    gif: {
      file: null,
      picking: false,
      pickError: null,
      paste: { open: false, draft: '', error: null },
      from: 0,
      to: GIF_DEFAULTS.spanSec,
      fromText: '00:00.0',
      toText: '00:05.0',
      fps: GIF_DEFAULTS.fps,
      width: GIF_DEFAULTS.width,
      maxMB: GIF_DEFAULTS.maxMB,
      busy: false,
      error: null,
      textError: null,
    },
    jobs: { status: 'idle', items: [], error: null, expanded: {} },
    pendingSubmit: null,
    copied: null,
    notice: null,
  }
}

/**
 * 一个同步 store：dispatch 归约、引用不变就不通知。
 * @template S
 * @param {(state: S, action: any) => S} reducer
 * @param {S} initial
 */
function createStore(reducer, initial) {
  let state = initial
  /** @type {Set<(state: S) => void>} */
  const listeners = new Set()
  return {
    getState() {
      return state
    },
    dispatch(action) {
      const next = reducer(state, action)
      if (next === state) return state
      state = next
      for (const listener of Array.from(listeners)) listener(state)
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}


/* ── logic.js ── */
/**
 * Kumquat · 纯逻辑：时间/体积格式化、选区换算、校验话术、状态机、视图模型、命令拼装。
 *
 * 这一层不认识 DOM、不认识 fetch、不认识 ffmpeg；所有东西都能在 node:test 里直接跑。
 * 组件只负责把这里的返回值画出来，判断不要写在组件里。
 */


/* ────────────────────────────── 数字与时间 ────────────────────────────── */

/**
 * 夹在 [lo, hi] 之间。
 * @param {number} value
 * @param {number} lo
 * @param {number} hi
 */
function clamp(value, lo, hi) {
  if (!Number.isFinite(value)) return lo
  return value < lo ? lo : value > hi ? hi : value
}

/**
 * 保留一位小数。
 * @param {number} value
 */
function round1(value) {
  return Math.round(value * 10) / 10
}

const clockPattern = /^\d{1,3}(:[0-5]?\d){0,2}(\.\d{1,3})?$/

/**
 * 解析手填时间：`3.2`、`00:03.2`、`1:02:03.4`、`3.2s` 都认；不合法返回 null。
 * @param {unknown} raw
 * @returns {number | null} 秒（保留一位小数）
 */
function parseClock(raw) {
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
function formatClock(seconds) {
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
function formatDuration(seconds) {
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
function formatSpan(seconds) {
  return `${round1(Number(seconds) || 0)}s`
}

/**
 * 文件名里的时间戳：`03.2`、`01-24.5`。
 * @param {number} seconds
 */
function clockShort(seconds) {
  return formatClock(seconds).replace(/^00:/, '').replace(/:/g, '-')
}

/**
 * 体积：`18 MB`、`6.3 MB`、`210 MB`、`820 B`。
 * @param {number} bytes
 */
function formatBytes(bytes) {
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
function fileName(path) {
  const text = String(path === null || path === undefined ? '' : path)
  const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
  return cut === -1 ? text : text.slice(cut + 1)
}

/**
 * 取小写扩展名（不含点）。
 * @param {unknown} path
 */
function fileExt(path) {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * 去掉扩展名后的文件名。
 * @param {unknown} path
 */
function fileStem(path) {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

/**
 * 校验并归一用户手填的绝对路径。
 * @param {unknown} raw
 * @returns {{ ok: true, path: string, name: string } | { ok: false, message: string, hint: string }}
 */
function parsePathInput(raw) {
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
function estimateCopySeconds(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return 1
  return clamp(Math.round(size / (70 * 1024 * 1024)), 1, 120)
}

/**
 * 重编码的预计耗时：视频按 1.1×片长，音频按 0.35×片长。
 * @param {{ durationSec?: number } | null | undefined} facts
 * @param {{ kind: string, to?: string }} task
 */
function estimateEncodeSeconds(facts, task) {
  const duration = Number(facts && facts.durationSec) || 0
  if (task && task.kind === 'gif') return estimateGifSeconds(Number(task.to) - Number(task.from))
  if (isAudioTarget(task && task.to)) return Math.max(1, Math.round(duration * 0.35 + 1))
  return Math.max(2, Math.round(duration * 1.1 + 1))
}

/**
 * GIF 生成耗时：实测 5.2 秒素材约 7 秒，按 1.2× + 1 估。
 * @param {number} span 选区长度（秒）
 */
function estimateGifSeconds(span) {
  return Math.max(2, Math.round((Number(span) || 0) * 1.2 + 1))
}

/**
 * GIF 体积：480px/12fps 约 1.2 MB/秒，按面积与帧率线性缩放。
 * @param {number} span 秒
 * @param {number} fps
 * @param {number} width 像素
 */
function estimateGifMB(span, fps, width) {
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
function factsLine(facts) {
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
function factsSummary(facts) {
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
function specSummary(spec) {
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
function copyAvailability(facts, target) {
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
function planConvert(state) {
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
function normalizeError(value) {
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
function selectCaps(state) {
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
function selectBinary(state) {
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
function selectHeader(state) {
  const caps = selectCaps(state)
  const titles = { home: 'Kumquat', convert: '视频格式转换', audio: '音频格式转换', gif: '视频做 GIF' }
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
function selectHome(state) {
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
        title: '视频格式转换',
        desc: '换格式、抽音频；可裁剪片段，也可一次多选批量转',
        disabled: false,
        reason: null,
      },
      {
        key: 'audio',
        title: '音频格式转换',
        desc: 'MP3 / WAV / FLAC / M4A / AAC / OGG / OPUS / WMA 互转',
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
function selectConvert(state) {
  const caps = selectCaps(state)
  const plan = planConvert(state)
  const convert = state.convert
  const file = convert.file
  const audioMode = state.screen === 'audio'
  const trimState = convert.trim || { enabled: false, fromText: '00:00.0', toText: '' }
  const trimDuration = plan.facts && Number.isFinite(plan.facts.durationSec) ? plan.facts.durationSec : 0
  const trimFrom = parseClock(trimState.fromText) ?? 0
  const trimTo = trimState.toText === '' ? trimDuration : (parseClock(trimState.toText) ?? 0)
  let trimError = null
  if (trimState.enabled === true) {
    if (parseClock(trimState.fromText) === null) trimError = '起点格式不对，用 00:05.0'
    else if (trimState.toText !== '' && parseClock(trimState.toText) === null) trimError = '终点格式不对，用 00:10.0'
    else if (trimTo <= trimFrom) trimError = '终点要大于起点'
    else if (trimDuration > 0 && trimTo > trimDuration + 0.5) trimError = '终点超出原片时长'
  }
  const trim = {
    enabled: trimState.enabled === true,
    fromText: trimState.fromText,
    toText: trimState.toText,
    from: trimFrom,
    to: trimTo,
    duration: trimDuration,
    maxText: trimDuration > 0 ? formatClock(trimDuration) : '原片时长未知',
    error: trimError,
  }
  const batch = Array.isArray(convert.batch) ? convert.batch : []
  const targets = CONVERT_TARGETS.filter((target) => !audioMode || target.kind === 'audio').map((target) => {
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
    hint: audioMode ? '只处理声音，不保留画面。' : '想只要声音，直接选 MP3。',
    showCopy: !audioMode,
    showTrim: !audioMode,
    trim,
    batch,
    batchCount: batch.length,
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
function selectGif(state) {
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
function validateConvert(state) {
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
  if (state.screen === 'audio' && plan.to !== null && !AUDIO_EXTS.includes(plan.to)) {
    return { ok: false, code: 'NO_TARGET', short: '先选音频格式', message: '音频转换只能选音频格式', hint: '在音频格式里挑一个。', field: 'target' }
  }
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
  const trimState = state.convert.trim
  if (state.screen !== 'audio' && trimState && trimState.enabled === true) {
    const from = parseClock(trimState.fromText)
    const facts = plan.facts
    const known = facts && Number.isFinite(facts.durationSec) ? facts.durationSec : 0
    const to = trimState.toText === '' ? known : parseClock(trimState.toText)
    if (from === null) return { ok: false, code: 'E_TRIM', short: '起点格式不对', message: '起点格式不对', hint: '用 00:05.0 这样的时间。', field: 'trim' }
    if (to === null || to <= from) return { ok: false, code: 'E_TRIM', short: '终点要大于起点', message: '裁剪终点必须大于起点', hint: '改一下起止时间。', field: 'trim' }
    if (known > 0 && to > known + 0.5) return { ok: false, code: 'E_TRIM', short: '终点超出原片', message: '裁剪终点超出原片时长', hint: '原片 ' + formatClock(known) + '。', field: 'trim' }
    return { ok: true, task: { ...plan.task, copy: false, trim: { from, to } }, etaSec: plan.etaSec }
  }
  return { ok: true, task: plan.task, etaSec: plan.etaSec }
}

/**
 * GIF 表单校验。
 * @param {any} state
 */
function validateGif(state) {
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
function outputName(task) {
  if (!task || typeof task.input !== 'string') return ''
  const stem = fileStem(task.input)
  if (task.kind === 'gif') return `${stem}_${clockShort(task.from)}-${clockShort(task.to)}.gif`
  return `${stem}.${normalizeTarget(task.to) || fileExt(task.input) || 'out'}`
}

/**
 * 可复制的 ffmpeg 命令。产物落在输入文件同目录，方便用户自己核对。
 * @param {any} task
 */
function buildCommand(task) {
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
function describeRepair(repair) {
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
function applyRepair(task, repair) {
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
function normalizeStatus(status) {
  return JOB_STATUSES.indexOf(String(status)) !== -1 ? String(status) : 'queued'
}

/**
 * 归一 JobSummary.progress（apiVersion 1 的可选加法字段）。
 * @param {unknown} value
 * @returns {{ phase: string, percent: number | null, outTimeSec: number | null, speed: number | null, etaSec: number | null } | null}
 */
function normalizeJobProgress(value) {
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
function describeProgress(progress, status) {
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
function normalizeJob(job, task) {
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
function isActiveStatus(status) {
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
function buildResultRow(item, expanded, copied) {
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
  const note = typeof item.note === 'string' ? item.note : ''
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
      outputPath: typeof item.output === 'string' ? item.output : '',
      expected: expected || '—',
      actual: actual || '—',
      delta: delta || '—',
      next: note !== '' ? `${note} ${next || ''}`.trim() : (next || '—'),
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
function taskExpectation(task) {
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
function activeJobIds(state) {
  const items = state.jobs && Array.isArray(state.jobs.items) ? state.jobs.items : []
  return items.filter((item) => isActiveStatus(item.status)).map((item) => item.id)
}

/**
 * 结果区视图模型。
 * @param {any} state
 */
function selectResults(state) {
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
function selectBalance(state) {
  const balance = state.balance
  if (balance.status === 'error') {
    const error = normalizeError(balance.error)
    return { text: isOfflineCode(error.code) ? '余额 未连接' : '余额 读取失败', tone: 'error', visible: true }
  }
  // No key configured: the widget does not exist at all. A public install
  // should not advertise a feature the user never asked for.
  if (balance.status !== 'ready') return { text: '', tone: 'muted', visible: false }
  const data = balance.data
  if (!data || data.ok !== true || data.available === false) return { text: '', tone: 'muted', visible: false }
  const total = typeof data.total === 'string' ? data.total : ''
  if (total === '') return { text: '', tone: 'muted', visible: false }
  const currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : 'CNY'
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `
  return { text: `余额 ${symbol}${total}`, tone: 'ready', visible: true }
}

/**
 * 任务卡/胶囊的键盘方向键移动；不认识的键返回 -1。
 * @param {number} index
 * @param {string} key
 * @param {number} length
 */
function radioMove(index, key, length) {
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
function reducer(state, action) {
  if (!action || typeof action.type !== 'string') return state
  switch (action.type) {
    case ACT.SCREEN: {
      const screen = action.screen === 'convert' || action.screen === 'audio' || action.screen === 'gif' ? action.screen : 'home'
      if (screen !== state.screen && (screen === 'convert' || screen === 'audio')) {
        return { ...state, screen, convert: { ...state.convert, to: null } }
      }
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
    case ACT.TRIM_TOGGLE:
      return { ...state, convert: { ...state.convert, trim: { ...state.convert.trim, enabled: action.enabled === true } } }
    case ACT.TRIM_TEXT:
      return { ...state, convert: { ...state.convert, trim: { ...state.convert.trim, [action.field]: typeof action.value === 'string' ? action.value : '' } } }
    case ACT.BATCH_SET:
      return { ...state, convert: { ...state.convert, batch: Array.isArray(action.files) ? action.files : [] } }
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


/* ── api.js ── */
/**
 * Kumquat · 宿主接口（浏览器半身）。
 *
 * 真实路由由 S5 提供；这里只定义契约、容错与可注入的 fake：
 *   GET  /api/kumquat/capabilities
 *   POST /api/kumquat/probe            { input }
 *   POST /api/kumquat/run              { task, overwrite? }
 *   GET  /api/kumquat/jobs/:id
 *   POST /api/kumquat/jobs/:id/cancel
 *   GET  /api/kumquat/balance
 *   GET  /api/kumquat/ffmpeg/status
 *   POST /api/kumquat/ffmpeg/install
 *   GET  /api/kumquat/ffmpeg/progress
 *
 * 所有方法都 resolve，不 reject：界面永远拿得到 { ok, data?, error? }，
 * 接口失败只会变成一句「未连接」或一句可执行提示，不会白屏。
 */

/** 默认路由表。ctx.endpoints 按方法名整体覆盖，S5 改路径不用动界面。 */
const DEFAULT_ENDPOINTS = Object.freeze({
  capabilities: Object.freeze({ method: 'GET', path: '/api/kumquat/capabilities' }),
  fs: Object.freeze({ method: 'GET', path: '/api/kumquat/fs' }),
  pick: Object.freeze({ method: 'POST', path: '/api/kumquat/pick' }),
  reveal: Object.freeze({ method: 'POST', path: '/api/kumquat/reveal' }),
  probe: Object.freeze({ method: 'POST', path: '/api/kumquat/probe' }),
  run: Object.freeze({ method: 'POST', path: '/api/kumquat/run' }),
  job: Object.freeze({ method: 'GET', path: '/api/kumquat/jobs/{id}' }),
  jobs: Object.freeze({ method: 'GET', path: '/api/kumquat/jobs' }),
  cancel: Object.freeze({ method: 'POST', path: '/api/kumquat/jobs/{id}/cancel' }),
  balance: Object.freeze({ method: 'GET', path: '/api/kumquat/balance' }),
  binaryStatus: Object.freeze({ method: 'GET', path: '/api/kumquat/ffmpeg/status' }),
  binaryInstall: Object.freeze({ method: 'POST', path: '/api/kumquat/ffmpeg/install' }),
  binaryProgress: Object.freeze({ method: 'GET', path: '/api/kumquat/ffmpeg/progress' }),
})

/** 一句「未连接」的标准错误。 */
const UNCONNECTED_ERROR = Object.freeze({
  code: 'E_OFFLINE',
  message: '未连接宿主',
  hint: '界面能看，但任务要等／api/kumquat 路由就绪；也可以注入 transport 或 fake。',
})

/** 宿主不在时的占位 api：方法齐全，全部返回未连接。 */
function createUnavailableApi() {
  const fail = () => Promise.resolve({ ok: false, error: UNCONNECTED_ERROR, source: 'none' })
  return Object.freeze({
    capabilities: fail,
    probe: fail,
    run: fail,
    job: fail,
    jobs: fail,
    cancel: fail,
    balance: fail,
    binaryStatus: fail,
    binaryInstall: fail,
  })
}

/**
 * 把宿主错误收成 { code, message, hint }。
 * @param {unknown} value
 */
function apiErrorShape(value) {
  if (value && typeof value === 'object') {
    const shape = {
      code: typeof value.code === 'string' ? value.code : 'E_UNKNOWN',
      message: typeof value.message === 'string' && value.message !== '' ? value.message : '宿主返回了一个错误',
      hint: typeof value.hint === 'string' ? value.hint : '',
    }
    return shape
  }
  if (typeof value === 'string' && value !== '') {
    return { code: 'E_UNKNOWN', message: value, hint: '再试一次。' }
  }
  return { code: 'E_UNKNOWN', message: '宿主返回了一个错误', hint: '再试一次。' }
}

/**
 * 兼容三种响应体：裸数据、`{ ok, data }`、`{ ok:false, error }`。
 * @param {unknown} payload
 * @param {'host' | 'fake'} source
 */
function unwrap(payload, source) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.ok === false) return { ok: false, error: apiErrorShape(payload.error), source }
    if (payload.ok === true) {
      const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
      return { ok: true, data, source }
    }
  }
  return { ok: true, data: payload, source }
}

/**
 * 默认 HTTP transport：同源相对路径 + JSON。
 * @param {(input: string, init?: object) => Promise<any>} fetchImpl
 * @param {string} baseUrl
 */
function httpTransport(fetchImpl, baseUrl) {
  return async (spec) => {
    const init = { method: spec.method, headers: { accept: 'application/json' } }
    if (spec.body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(spec.body)
    }
    if (spec.signal !== undefined) init.signal = spec.signal
    const response = await fetchImpl(`${baseUrl}${spec.path}`, init)
    const text = typeof response.text === 'function' ? await response.text() : ''
    let data = null
    if (text !== '') {
      try {
        data = JSON.parse(text)
      } catch (error) {
        data = text
      }
    }
    return { status: typeof response.status === 'number' ? response.status : 200, data }
  }
}

/**
 * Cordis contexts throw when a service is read without declaring it in inject.
 * Reading optional host hooks must never take the whole panel down.
 * @param {any} ctx
 * @param {string} key
 */
function safeGet(ctx, key) {
  if (ctx === null || ctx === undefined) return undefined
  try {
    return ctx[key]
  } catch {
    return undefined
  }
}

/**
 * @param {any} ctx
 */
function resolveTransport(ctx) {
  const provided = safeGet(ctx, 'transport')
  if (typeof provided === 'function') return provided
  if (provided && typeof provided.request === 'function') {
    return (spec) => provided.request(spec)
  }
  const fetchImpl = (typeof safeGet(ctx, 'fetch') === 'function' ? safeGet(ctx, 'fetch') : null)
    || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) return null
  const baseUrl = safeGet(ctx, 'baseUrl')
  return httpTransport(fetchImpl, typeof baseUrl === 'string' ? baseUrl : '')
}

/**
 * @param {unknown} status
 * @param {unknown} payload
 */
function httpError(status, payload) {
  const shaped = apiErrorShape(payload && typeof payload === 'object' ? payload.error || payload : payload)
  if (Number(status) === 404) {
    return { code: 'E_NOT_FOUND', message: shaped.message || '宿主没有这条路由', hint: '确认／api/kumquat 路由已由宿主注册（S5）。' }
  }
  if (Number(status) === 401 || Number(status) === 403) {
    return { code: 'E_FORBIDDEN', message: shaped.message || '宿主拒绝了请求', hint: '检查插件是否在 profile 里启用。' }
  }
  return shaped
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @param {unknown} value
 */
function normalizeBinaryStatus(value) {
  const data = value && typeof value === 'object' ? value : {}
  const state = data.state === 'system' || data.state === 'cached' || data.state === 'missing'
    ? data.state
    : data.installed === true
      ? 'system'
      : data.present === true
        ? 'system'
        : 'missing'
  return {
    state,
    version: typeof data.version === 'string' ? data.version : null,
    sizeHint: Number.isFinite(data.sizeHint) ? data.sizeHint : Number.isFinite(data.size) ? data.size : null,
  }
}

/**
 * @param {unknown} value
 */
function normalizeProgress(value) {
  const data = value && typeof value === 'object' ? value : {}
  const received = Number.isFinite(data.receivedBytes)
    ? data.receivedBytes
    : Number.isFinite(data.received)
      ? data.received
      : null
  const total = Number.isFinite(data.totalBytes)
    ? data.totalBytes
    : Number.isFinite(data.total)
      ? data.total
      : null
  let percent = Number.isFinite(data.percent) ? data.percent : null
  if (percent === null && received !== null && total !== null && total > 0) percent = (received / total) * 100
  return {
    phase: typeof data.phase === 'string' ? data.phase : 'download',
    percent,
    receivedBytes: received,
    totalBytes: total,
  }
}

/**
 * 建一个宿主 api。
 * @param {{ transport?: any, endpoints?: any, baseUrl?: string, fetch?: any, pollMs?: number, maxPolls?: number }} [ctx]
 */
function createApi(ctx = {}) {
  const transport = resolveTransport(ctx)
  const endpoints = { ...DEFAULT_ENDPOINTS, ...(safeGet(ctx, 'endpoints') || {}) }
  const pollMs = Number.isFinite(safeGet(ctx, 'pollMs')) ? Math.max(0, safeGet(ctx, 'pollMs')) : 400
  const maxPolls = Number.isFinite(safeGet(ctx, 'maxPolls')) ? Math.max(1, safeGet(ctx, 'maxPolls')) : 900

  /**
   * @param {string} name
   * @param {{ params?: Record<string, string>, query?: Record<string, string>, body?: any, signal?: any }} [options]
   */
  async function call(name, options = {}) {
    if (transport === null) return { ok: false, error: UNCONNECTED_ERROR, source: 'none' }
    const endpoint = endpoints[name]
    if (!endpoint) return { ok: false, error: { code: 'E_ROUTE', message: `未定义路由 ${name}`, hint: '检查 endpoints。' }, source: 'none' }
    let path = endpoint.path
    for (const key of Object.keys(options.params || {})) {
      path = path.split(`{${key}}`).join(encodeURIComponent(options.params[key]))
    }
    const query = Object.keys(options.query || {})
      .filter((key) => typeof options.query[key] === 'string' && options.query[key] !== '')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(options.query[key])}`)
    if (query.length > 0) path += `${path.indexOf('?') === -1 ? '?' : '&'}${query.join('&')}`
    try {
      const response = await transport({ method: endpoint.method, path, body: options.body, signal: options.signal })
      const status = response && Number.isFinite(response.status) ? response.status : 200
      const payload = response ? response.data : null
      if (status >= 400) return { ok: false, error: httpError(status, payload), source: 'host' }
      return unwrap(payload, 'host')
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消', hint: '' }, source: 'host' }
      }
      return {
        ok: false,
        error: {
          code: 'E_OFFLINE',
          message: '宿主没有响应',
          hint: '确认窗口还在、／api/kumquat 路由已注册；然后点重试。',
        },
        source: 'host',
      }
    }
  }

  return Object.freeze({
    async capabilities() {
      return call('capabilities')
    },
    async pick(mode, defaultName) {
      const body = {}
      if (mode === 'dir' || mode === 'save') body.mode = mode
      if (typeof defaultName === 'string' && defaultName !== '') body.defaultName = defaultName
      return call('pick', { body })
    },
    async reveal(path) {
      if (typeof path !== 'string' || path === '') return { ok: false, error: { code: 'E_INPUT', message: '没有输出路径', hint: '' }, source: 'none' }
      return call('reveal', { body: { path } })
    },
    async fsList(dir) {
      return call('fs', { query: typeof dir === 'string' && dir !== '' ? { path: dir } : {} })
    },
    async probe(input) {
      if (typeof input !== 'string' || input.trim() === '') {
        return { ok: false, error: { code: 'E_INPUT', message: '没有文件路径', hint: '先选文件，或粘贴绝对路径。' }, source: 'none' }
      }
      return call('probe', { body: { input } })
    },
    async run(task, opts) {
      if (!task || typeof task !== 'object') {
        return { ok: false, error: { code: 'E_INPUT', message: '任务不完整', hint: '检查文件与参数。' }, source: 'none' }
      }
      const body = { task, overwrite: Boolean(opts && opts.overwrite) }
      if (opts && typeof opts.outputDir === 'string' && opts.outputDir !== '') body.outputDir = opts.outputDir
      if (opts && typeof opts.outputPath === 'string' && opts.outputPath !== '') body.outputPath = opts.outputPath
      return call('run', { body })
    },
    async job(id) {
      if (typeof id !== 'string' || id === '') {
        return { ok: false, error: { code: 'E_INPUT', message: '任务 id 是空的', hint: '结果行会自己重试。' }, source: 'none' }
      }
      return call('job', { params: { id } })
    },
    /**
     * 一圈轮询：列表带每行的 progress（宿主在 list 上合并进度，detail 上不一定有）。
     * @returns {Promise<{ ok: boolean, data?: any[], error?: any, source: string }>}
     */
    async jobs() {
      const result = await call('jobs')
      if (!result.ok) return result
      const data = result.data
      const list = Array.isArray(data)
        ? data
        : data && Array.isArray(data.jobs)
          ? data.jobs
          : []
      return { ok: true, data: list, source: result.source }
    },
    async cancel(id) {
      if (typeof id !== 'string' || id === '') {
        return { ok: false, error: { code: 'E_INPUT', message: '任务 id 是空的', hint: '' }, source: 'none' }
      }
      return call('cancel', { params: { id }, body: {} })
    },
    async balance() {
      const result = await call('balance')
      if (result.ok) {
        const data = result.data && typeof result.data === 'object' ? result.data : {}
        return { ok: true, data, source: result.source }
      }
      if (result.error && (result.error.code === 'E_OFFLINE' || result.error.code === 'E_NO_TRANSPORT')) return result
      return { ok: true, data: { ok: false, error: result.error }, source: result.source }
    },
    async binaryStatus() {
      const result = await call('binaryStatus')
      if (!result.ok) return result
      return { ok: true, data: normalizeBinaryStatus(result.data), source: result.source }
    },
    /**
     * 装 FFmpeg：POST install 后轮询 progress，直到成功 / 失败 / 取消。
     * @param {(progress: { phase: string, percent: number | null, receivedBytes: number | null, totalBytes: number | null }) => void} [onProgress]
     * @param {{ signal?: any }} [options]
     */
    async binaryInstall(onProgress, options = {}) {
      const signal = options.signal
      const report = (progress) => {
        if (typeof onProgress === 'function') {
          try {
            onProgress(progress)
          } catch (error) {
            /* 进度回调的问题不能把下载带崩 */
          }
        }
      }
      if (signal && signal.aborted) {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '随时可以重试。' }, source: 'none' }
      }
      const started = await call('binaryInstall', { body: {}, signal })
      if (!started.ok) return started
      const startData = started.data && typeof started.data === 'object' ? started.data : {}
      const installJobId = typeof startData.jobId === 'string' && startData.jobId !== ''
        ? startData.jobId
        : typeof startData.id === 'string' && startData.id !== ''
          ? startData.id
          : undefined
      if (startData.state === 'system' || startData.state === 'cached') {
        return { ok: true, data: { state: startData.state, version: startData.version || null }, source: started.source }
      }
      for (let attempt = 0; attempt < maxPolls; attempt += 1) {
        if (signal && signal.aborted) {
          return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '随时可以重试。' }, source: 'none' }
        }
        const progress = await call('binaryProgress', {
          signal,
          query: installJobId === undefined ? undefined : { jobId: installJobId },
        })
        if (progress.ok) {
          const data = progress.data && typeof progress.data === 'object' ? progress.data : {}
          const shaped = normalizeProgress(data)
          report(shaped)
          if (data.state === 'system' || data.state === 'cached' || data.phase === 'done') {
            return {
              ok: true,
              data: { state: data.state === 'system' ? 'system' : 'cached', version: data.version || startData.version || null },
              source: progress.source,
            }
          }
          if (data.phase === 'failed' || data.phase === 'error' || data.state === 'failed') {
            const failure = apiErrorShape(data.error || { code: 'E_INSTALL', message: data.message || 'FFmpeg 下载失败', hint: '检查网络后重试。' })
            return { ok: false, error: failure, source: progress.source }
          }
        }
        if (attempt < maxPolls - 1) await delay(pollMs)
      }
      return {
        ok: false,
        error: {
          code: 'E_TIMEOUT',
          message: '下载一直没有完成',
          hint: '重试一次；反复失败就检查网络或代理。',
        },
        source: 'host',
      }
    },
  })
}

/* ────────────────────────────── 可注入的 fake ────────────────────────────── */

const FAKE_CAPABILITIES = Object.freeze({
  ffmpeg: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
  ffprobe: 'C:\\ffmpeg\\bin\\ffprobe.exe',
  version: '6.1.1',
  filters: ['fps', 'scale', 'palettegen', 'paletteuse', 'split', 'loudnorm'],
  encoders: ['libx264', 'libx265', 'libvpx-vp9', 'libopus', 'aac', 'libmp3lame', 'flac', 'pcm_s16le', 'gif'],
  muxers: ['mp4', 'matroska', 'mov', 'webm', 'avi', 'mp3', 'ipod', 'wav', 'flac', 'gif'],
})

/**
 * @param {string} path
 */
function fakeExt(path) {
  const name = String(path)
  const cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const base = cut === -1 ? name : name.slice(cut + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

const FAKE_VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'webm', 'avi']
const FAKE_AUDIO_EXTS = ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg']

/**
 * 一份可复现的 MediaFacts（不读盘，纯演示/测试）。
 * @param {string} path
 */
function fakeFacts(path) {
  const ext = fakeExt(path)
  const isVideo = FAKE_VIDEO_EXTS.indexOf(ext) !== -1
  const isAudio = FAKE_AUDIO_EXTS.indexOf(ext) !== -1
  if (!isVideo && !isAudio) return null
  if (isAudio) {
    return {
      path,
      bytes: 3.2 * 1024 * 1024,
      container: ext,
      formatName: `${ext} (fake)`,
      durationSec: 142.6,
      streams: [{ index: 0, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 }],
      audio: { index: 0, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 },
      ffmpegVersion: '6.1.1',
    }
  }
  return {
    path,
    bytes: 18.2 * 1024 * 1024,
    container: ext,
    formatName: `${ext} (fake)`,
    durationSec: 12,
    streams: [
      { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
      { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
    ],
    video: { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
    audio: { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
    ffmpegVersion: '6.1.1',
  }
}

/**
 * @param {any} task
 */
function fakeVerdict(task) {
  const facts = fakeFacts(task.input) || fakeFacts('C:\\fake\\input.mp4')
  if (task.kind === 'gif') {
    const span = Math.round((Number(task.to) - Number(task.from)) * 10) / 10
    const bytes = Math.round(1.2 * span * Math.pow((Number(task.width) || 480) / 480, 2) * ((Number(task.fps) || 12) / 12) * 1024 * 1024)
    const over = Number.isFinite(task.maxBytes) && bytes > task.maxBytes
    const checks = [
      { id: 'gif.duration', tier: 'L0', outcome: 'pass', expected: `${span.toFixed(1)}s ±0.2s`, actual: `${span.toFixed(1)}s` },
      { id: 'gif.frames', tier: 'L0', outcome: 'pass', expected: `≈ ${Math.round(span * (Number(task.fps) || 12))} 帧`, actual: `${Math.round(span * (Number(task.fps) || 12))} 帧` },
      { id: 'gif.loop', tier: 'L0', outcome: 'pass', expected: '无限循环', actual: '无限循环' },
      {
        id: 'gif.bytes',
        tier: 'L1',
        outcome: over ? 'warn' : 'pass',
        expected: Number.isFinite(task.maxBytes) ? `≤ ${(task.maxBytes / 1024 / 1024).toFixed(1)} MB` : '不设上限',
        actual: `${(bytes / 1024 / 1024).toFixed(1)} MB`,
        delta: over && Number.isFinite(task.maxBytes) ? `超 ${((bytes - task.maxBytes) / 1024 / 1024).toFixed(1)} MB` : '0',
        hint: over ? '已按建议降到 420px 重跑一次，或把宽度改小。' : '体积在目标以内。',
        repair: over ? { kind: 'reencode', width: 420 } : undefined,
      },
    ]
    return {
      ok: true,
      task,
      spec: { container: 'gif', gif: { from: task.from, to: task.to, fps: Number(task.fps) || 12, width: Number(task.width) || 480, loop: true }, maxBytes: task.maxBytes, decodable: 'sample' },
      facts: { ...facts, container: 'gif', bytes, formatName: 'gif (fake)', durationSec: span, video: undefined, audio: undefined, streams: [] },
      checks,
      repairs: [],
      evidencePath: `C:\\Users\\你\\Downloads\\Kumquat\\${'evidence'}\\verify.json`,
    }
  }
  return {
    ok: true,
    task,
    spec: { container: task.to, durationSec: { expect: facts.durationSec, toleranceSec: 0.2 }, decodable: 'sample' },
    facts,
    checks: [
      { id: 'container', tier: 'L0', outcome: 'pass', expected: task.to, actual: task.to },
      { id: 'duration', tier: 'L0', outcome: 'pass', expected: `${facts.durationSec.toFixed(1)}s ±0.2s`, actual: `${facts.durationSec.toFixed(1)}s` },
      { id: 'decodable', tier: 'L0', outcome: 'pass', expected: '可解码', actual: '前 1 秒可解码' },
    ],
    repairs: [],
    evidencePath: 'C:\\Users\\你\\Downloads\\Kumquat\\evidence\\verify.json',
  }
}

/**
 * 可注入的 fake api：不联网、不读盘、结果可复现。用于离线演示与单测。
 * @param {{ balance?: 'configured' | 'unconfigured' | 'offline', binary?: 'system' | 'cached' | 'missing', installFails?: boolean, failRun?: boolean }} [options]
 */
function createFakeApi(options = {}) {
  const jobs = new Map()
  let sequence = 0
  const balanceMode = options.balance || 'unconfigured'
  let binaryState = options.binary || 'system'
  let installCalls = 0
  let progressCalls = 0

  const ok = (data) => ({ ok: true, data, source: 'fake' })
  const fail = (code, message, hint) => ({ ok: false, error: { code, message, hint: hint || '' }, source: 'fake' })

  /**
   * @param {string} id
   */
  function finishJob(id) {
    const entry = jobs.get(id)
    if (!entry) return null
    entry.job.status = 'done'
    entry.job.endedAt = entry.job.startedAt + 7000
    entry.job.output = entry.job.output || entry.output
    entry.job.verdict = fakeVerdict(entry.job.task)
    return entry.job
  }

  /**
   * Advance one job one poll step (shared by detail and list polling).
   * @param {string} id
   */
  function advanceJob(id) {
    const entry = jobs.get(id)
    if (!entry) return null
    if (entry.job.status === 'cancelled' || entry.job.status === 'done') return entry.job
    entry.polls += 1
    if (entry.polls === 1) {
      entry.job.status = 'running'
      entry.job.progress = { phase: 'encoding', percent: 30, outTimeSec: 3, speed: 1.3, etaSec: 6 }
    } else if (entry.polls === 2) {
      entry.job.status = 'verifying'
      entry.job.progress = { phase: 'verifying', percent: 85, outTimeSec: 10, speed: 1.1, etaSec: 2 }
    } else if (entry.polls >= 3) {
      finishJob(id)
    }
    return entry.job
  }

  return Object.freeze({
    async capabilities() {
      if (binaryState === 'missing') {
        return fail('E_CAPABILITY', '本机没有 FFmpeg', '先点「下载并安装」。')
      }
      return ok({ ...FAKE_CAPABILITIES })
    },
    async pick() {
      return fail('E_OFFLINE', '演示模式没有系统文件对话框', '改用「粘贴路径」。')
    },
    async reveal() {
      return fail('E_OFFLINE', '演示模式不能打开文件夹', '复制路径后手动打开。')
    },
    async fsList(dir) {
      return fail('E_OFFLINE', '演示模式没有目录列表', '改用「粘贴路径」。')
    },
    async probe(input) {
      if (typeof input !== 'string' || !/^([A-Za-z]:[\\/]|\\\\|\/)/.test(input)) {
        return fail('E_INPUT', '需要绝对路径', '例如 D:\\示例\\video.mp4。')
      }
      const facts = fakeFacts(input)
      if (facts === null) return fail('E_INPUT', '不认识的媒体文件', '支持 mp4/mkv/mov/webm/avi/mp3/m4a/wav/flac。')
      return ok(facts)
    },
    async run(task) {
      if (options.failRun) return fail('E_ENCODE', '编码器起不来', '确认 FFmpeg 可用后重试。')
      sequence += 1
      const id = `fake-${sequence}`
      const output = task.kind === 'gif'
        ? task.input.replace(/\.[^\\/.]*$/, '') + `_${String(task.from).replace('.', '-')}-${String(task.to).replace('.', '-')}.gif`
        : task.input.replace(/\.[^\\/.]*$/, '') + `.${task.to}`
      const job = {
        id,
        task,
        status: 'queued',
        startedAt: 1700000000000 + sequence,
        output,
      }
      jobs.set(id, { job, polls: 0, output })
      return ok({ id, task, status: 'queued', startedAt: job.startedAt })
    },
    async job(id) {
      const job = advanceJob(id)
      if (!job) return fail('E_INPUT', '没有这个任务', '结果行会自己重试。')
      return ok({ ...job })
    },
    async jobs() {
      const list = [...jobs.keys()].map((id) => advanceJob(id)).filter(Boolean)
      return ok(list.map((job) => ({ ...job })))
    },
    async cancel(id) {
      const entry = jobs.get(id)
      if (!entry) return fail('E_INPUT', '没有这个任务', '')
      if (entry.job.status !== 'done') entry.job.status = 'cancelled'
      return ok({ id })
    },
    async balance() {
      if (balanceMode === 'offline') return fail('E_OFFLINE', '宿主没有响应', '确认窗口还在。')
      if (balanceMode === 'configured') return ok({ ok: true, currency: 'CNY', total: '12.34', available: true })
      return ok({ ok: false, error: { code: 'E_NO_KEY', message: '没有配置 DeepSeek key' } })
    },
    async binaryStatus() {
      return ok({ state: binaryState, version: binaryState === 'missing' ? null : '6.1.1', sizeHint: 80 * 1024 * 1024 })
    },
    async binaryInstall(onProgress, installOptions = {}) {
      installCalls += 1
      const report = (progress) => {
        if (typeof onProgress === 'function') {
          try {
            onProgress(progress)
          } catch (error) {
            /* ignore */
          }
        }
      }
      if (installOptions.signal && installOptions.signal.aborted) {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '' }, source: 'fake' }
      }
      if (options.installFails) {
        report({ phase: 'download', percent: 42, receivedBytes: 32 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
        return { ok: false, error: { code: 'E_INSTALL', message: '下载中断了', hint: '检查网络后重试。' }, source: 'fake' }
      }
      report({ phase: 'download', percent: 0, receivedBytes: 0, totalBytes: 80 * 1024 * 1024 })
      if (installOptions.signal && installOptions.signal.aborted) {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '' }, source: 'fake' }
      }
      report({ phase: 'download', percent: 55, receivedBytes: 44 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      report({ phase: 'extract', percent: 100, receivedBytes: 80 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      report({ phase: 'verify', percent: 100, receivedBytes: 80 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      binaryState = 'cached'
      report({ phase: 'done', percent: 100, receivedBytes: 80 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      progressCalls += 1
      return { ok: true, data: { state: 'cached', version: '6.1.1' }, source: 'fake' }
    },
  })
}











/* ── clipboard.js ── */
/**
 * Kumquat · 复制文本。
 *
 * 优先 navigator.clipboard；不可用（非安全上下文、老宿主）时退回 textarea +
 * execCommand。两条路都失败就老实返回 false，界面显示「复制失败，请手动选中」。
 */

/**
 * @param {unknown} text
 * @returns {Promise<boolean>}
 */
async function copyText(text) {
  const value = String(text === null || text === undefined ? '' : text)
  if (value === '') return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch (error) {
    /* 落到 textarea 方案 */
  }
  try {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.setAttribute('aria-hidden', 'true')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied === true
  } catch (error) {
    return false
  }
}


/* ── picker.js ── */
/**
 * Kumquat · 「添加文件」的宿主目录浏览入口。
 *
 * 约定（写入 README，S5 对接）：
 *   - 宿主若提供 ctx.pickFile({ filters }) → Promise<string | { path } | null>，
 *     就用宿主目录浏览；否则给出明确的一句「改用粘贴路径」，绝不假装能选文件。
 *   - 无论哪条路，最终只登记绝对路径，不上传、不复制。
 */


/**
 * 选一个媒体文件的绝对路径。
 * @param {((options: { filters: string[] }) => Promise<any>) | undefined | null} pickFile
 * @returns {Promise<{ ok: true, path: string, name: string } | { ok: false, error: { code: string, message: string, hint: string } }>}
 */
async function requestPath(pickFile) {
  if (typeof pickFile !== 'function') {
    return {
      ok: false,
      error: {
        code: 'E_NO_PICKER',
        message: '宿主没有提供目录浏览',
        hint: '改用「粘贴路径」填绝对路径，界面一样能跑。',
      },
    }
  }
  let picked
  try {
    picked = await pickFile({ filters: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac'] })
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'E_PICKER',
        message: '目录浏览没有返回结果',
        hint: '也可以直接用「粘贴路径」。',
      },
    }
  }
  if (picked === null || picked === undefined || picked === '') {
    return { ok: false, error: { code: 'E_CANCELLED', message: '没有选择文件', hint: '' } }
  }
  const candidate = typeof picked === 'string' ? picked : typeof picked.path === 'string' ? picked.path : ''
  const parsed = parsePathInput(candidate)
  if (parsed.ok !== true) {
    return { ok: false, error: { code: 'E_INPUT', message: parsed.message, hint: parsed.hint } }
  }
  return { ok: true, path: parsed.path, name: parsed.name }
}


/* ── pickfile.js ── */
/**
 * 系统文件选择：隐藏的 <input type="file"> 打开原生对话框。
 * 桌面端尽量取回真实绝对路径；网页端拿不到路径，就把文件交给宿主写入临时目录。
 * `multiple` 只给批量转换用。
 */

/** @param {File} file */
function electronPath(file) {
  if (file && typeof file.path === 'string' && file.path !== '') return file.path
  try {
    const req = typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null
    if (req !== null) {
      const electron = req('electron')
      const webUtils = electron && electron.webUtils
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const resolved = webUtils.getPathForFile(file)
        if (typeof resolved === 'string' && resolved !== '') return resolved
      }
    }
  } catch {
    /* fall through to upload */
  }
  return ''
}

/**
 * @param {boolean} [multiple]
 * @returns {Promise<{ ok: true, files: Array<{ file: File, name: string, path: string }> } | { ok: false, reason: 'cancel' }>}
 */
function chooseLocalFile(multiple) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ ok: false, reason: 'cancel' })
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*,audio/*,.mkv,.flac,.m4a,.wav,.webm,.vdat,.sdv'
    if (multiple === true) input.multiple = true
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    const done = (value) => {
      input.remove()
      resolve(value)
    }
    input.addEventListener('change', () => {
      const picked = input.files ? Array.from(input.files) : []
      if (picked.length === 0) {
        done({ ok: false, reason: 'cancel' })
        return
      }
      done({
        ok: true,
        files: picked.map((file) => ({ file, name: file.name, path: electronPath(file) })),
      })
    })
    input.addEventListener('cancel', () => done({ ok: false, reason: 'cancel' }))
    input.click()
  })
}

/**
 * @param {File} file
 * @returns {Promise<{ ok: true, path: string, name: string } | { ok: false, error: { code: string, message: string, hint: string } }>}
 */
async function uploadFile(file) {
  try {
    const response = await fetch(`/api/kumquat/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    })
    /** @type {any} */
    let payload = null
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok || !payload || typeof payload.path !== 'string') {
      return {
        ok: false,
        error: (payload && payload.error) || {
          code: 'E_UPLOAD',
          message: '文件复制到临时目录失败',
          hint: '改用桌面客户端，或点「粘贴路径」填绝对路径。',
        },
      }
    }
    return { ok: true, path: payload.path, name: typeof payload.name === 'string' ? payload.name : file.name }
  } catch {
    return {
      ok: false,
      error: { code: 'E_OFFLINE', message: '无法连接宿主', hint: '确认窗口还在，然后重试。' },
    }
  }
}


/* ── styles.js ── */
/**
 * Kumquat · 全部样式，一个字符串。
 *
 * 规则（design/tokens.css 落地）：
 *   - 深色默认，浅色走 prefers-color-scheme；颜色只在 .kq-panel 的变量里出现一次。
 *   - 唯一强调色（金桔橙），只用于主按钮、选中态、焦点环、链接下划线。
 *   - 绿/琥珀/红只出现在徽章（点与描边），文字沿用正文色，保证浅色主题下也 ≥ 4.5:1。
 *   - 字号只有 11 / 12.5 / 14.5 / 18；圆角 8 / 12 / 16；动效 150ms，respects reduced motion。
 *   - 字体只用系统字体名（D9）：不加自定义字体声明，不引任何字体文件。
 */

const CSS_TEXT = `
.kq-panel{
  --kq-bg:#131519;--kq-card:#191c22;--kq-raise:#1f242c;--kq-line:#272c35;
  --kq-text:#e8eaf0;--kq-muted:#9aa3b3;--kq-dim:#697183;
  --kq-accent:#ff8a2b;--kq-accent-weak:rgba(255,138,43,.14);--kq-accent-line:rgba(255,138,43,.55);
  --kq-ok:#3ddc97;--kq-warn:#f5a524;--kq-fail:#ff5f6d;
  --kq-r-sm:8px;--kq-r-md:12px;--kq-r-lg:16px;
  --kq-fs-1:11px;--kq-fs-2:12.5px;--kq-fs-3:14.5px;--kq-fs-4:18px;--kq-lh:1.65;
  --kq-motion:150ms ease-out;--kq-shadow:0 24px 60px rgba(0,0,0,.45);
  --kq-font:system-ui,-apple-system,"Segoe UI","Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif;
  box-sizing:border-box;width:100%;max-width:640px;margin:0 auto;
  background:var(--kq-card);color:var(--kq-text);
  border:1px solid var(--kq-line);border-radius:var(--kq-r-lg);
  font-family:var(--kq-font);font-size:var(--kq-fs-2);line-height:var(--kq-lh);
  box-shadow:var(--kq-shadow);overflow:hidden;text-align:left;
}
.kq-panel *,.kq-panel *::before,.kq-panel *::after{box-sizing:border-box}
@media (prefers-color-scheme: light){
  .kq-panel{
    --kq-bg:#f6f7f9;--kq-card:#ffffff;--kq-raise:#f1f3f6;--kq-line:#e2e5ea;
    --kq-text:#1b1f26;--kq-muted:#5c6472;--kq-dim:#8b93a1;
    --kq-accent-weak:rgba(255,138,43,.16);--kq-accent-line:rgba(214,102,10,.55);
    --kq-shadow:0 18px 44px rgba(20,24,32,.12);
  }
}
@media (prefers-reduced-motion: reduce){
  .kq-panel{--kq-motion:0ms linear}
  .kq-panel *{transition:none !important;animation:none !important}
}
.kq-panel :focus-visible{
  outline:2px solid var(--kq-accent);outline-offset:2px;border-radius:var(--kq-r-sm);
}
.kq-panel button{font-family:inherit}

/* ── 顶栏 ───────────────────────────────────────────── */
.kq-head{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--kq-line);min-height:56px}
.kq-back{background:none;border:0;color:var(--kq-muted);font-size:var(--kq-fs-3);line-height:1;padding:4px 6px;cursor:pointer;border-radius:var(--kq-r-sm);transition:color var(--kq-motion)}
.kq-back:hover{color:var(--kq-text)}
.kq-mark{width:25px;height:25px;border-radius:var(--kq-r-sm);display:grid;place-items:center;flex:none;
  background:linear-gradient(135deg,#ffc46b,var(--kq-accent));color:#2a1400;font-weight:700;font-size:var(--kq-fs-1)}
.kq-title{font-size:var(--kq-fs-3);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kq-sub{font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap}
.kq-status{margin-left:auto;font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kq-status--ok{color:var(--kq-text)}
.kq-status--warn{color:var(--kq-text)}
.kq-status--error{color:var(--kq-text)}
.kq-body{padding:20px;display:block}

/* ── 屏幕 1 ─────────────────────────────────────────── */
.kq-question{font-size:var(--kq-fs-4);line-height:1.4;font-weight:600;margin:0 0 16px}
.kq-task{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:16px 18px;margin:0 0 10px;
  background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:var(--kq-r-md);color:inherit;cursor:pointer;
  transition:border-color var(--kq-motion),transform var(--kq-motion),background var(--kq-motion)}
.kq-task:hover{border-color:var(--kq-accent-line);transform:translateY(-1px)}
.kq-task:active{transform:translateY(0)}
.kq-task__body{display:block;min-width:0}
.kq-task__title{display:block;font-size:var(--kq-fs-3);font-weight:600;margin-bottom:2px}
.kq-task__desc{display:block;font-size:var(--kq-fs-2);color:var(--kq-muted)}
.kq-task__reason{display:block;font-size:var(--kq-fs-1);color:var(--kq-muted);margin-top:4px}
.kq-task__arrow{margin-left:auto;color:var(--kq-muted);flex:none}
.kq-recent{margin:14px 0 0;font-size:var(--kq-fs-1);color:var(--kq-muted);display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
.kq-recent__label{letter-spacing:.06em}
.kq-recent__item{display:inline-flex;align-items:center;gap:5px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-recent .kq-badge{max-width:220px}
.kq-recent .kq-badge__label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-recent__empty{color:var(--kq-muted)}

/* ── 分区 ───────────────────────────────────────────── */
.kq-sec{margin:0 0 20px}
.kq-sec__label{font-size:var(--kq-fs-1);letter-spacing:.06em;color:var(--kq-muted);margin:0 0 8px}
.kq-hint{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:8px 0 0}
.kq-empty{font-size:var(--kq-fs-2);color:var(--kq-muted);margin:8px 0 0}
.kq-note{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:6px 0 0}

/* ── 按钮 ───────────────────────────────────────────── */
.kq-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--kq-r-sm);
  font-size:var(--kq-fs-2);line-height:1.2;padding:7px 13px;cursor:pointer;border:1px solid transparent;
  transition:background var(--kq-motion),border-color var(--kq-motion),color var(--kq-motion),transform var(--kq-motion)}
.kq-btn[disabled]{cursor:not-allowed}
.kq-btn--primary{background:var(--kq-accent);border-color:var(--kq-accent);color:#21150b;font-weight:600}
.kq-btn--primary:hover:not([disabled]){background:#ffa055;border-color:#ffa055}
.kq-btn--primary:active:not([disabled]){transform:translateY(1px)}
.kq-btn--primary[disabled]{background:var(--kq-raise);border-color:var(--kq-line);color:var(--kq-muted);font-weight:500}
.kq-btn--ghost{background:transparent;border-color:var(--kq-line);color:var(--kq-text)}
.kq-btn--ghost:hover:not([disabled]){border-color:var(--kq-accent-line);color:var(--kq-text)}
.kq-btn--ghost[disabled]{color:var(--kq-muted);border-color:var(--kq-line)}
.kq-btn--link{background:none;border:0;padding:2px 0;color:var(--kq-text);font-size:var(--kq-fs-1);
  text-decoration:underline;text-decoration-color:var(--kq-accent);text-underline-offset:3px}
.kq-btn--link:hover:not([disabled]){color:var(--kq-text);text-decoration-thickness:2px}
.kq-btn--link[disabled]{color:var(--kq-muted);text-decoration-color:var(--kq-line)}
.kq-btn--big{padding:10px 26px;font-size:var(--kq-fs-3)}

/* ── 文件条 ─────────────────────────────────────────── */
.kq-btns{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.kq-file{display:flex;align-items:center;gap:12px;padding:11px 13px;background:var(--kq-raise);
  border:1px solid var(--kq-line);border-radius:var(--kq-r-md)}
.kq-file__icon{width:32px;height:32px;flex:none;border-radius:var(--kq-r-sm);background:var(--kq-card);
  border:1px solid var(--kq-line);display:grid;place-items:center;color:var(--kq-muted)}
.kq-file__body{min-width:0;flex:1}
.kq-file__name{font-size:var(--kq-fs-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-file__meta{font-size:var(--kq-fs-1);color:var(--kq-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-file__x{margin-left:auto;flex:none;background:none;border:0;color:var(--kq-muted);font-size:var(--kq-fs-2);
  padding:4px 6px;cursor:pointer;border-radius:var(--kq-r-sm)}
.kq-file__x:hover{color:var(--kq-text)}
.kq-paste{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin:10px 0 0}
.kq-paste--prompt{border:1px solid var(--kq-accent-line);background:var(--kq-accent-weak);
  border-radius:var(--kq-r-md);padding:12px;margin-top:2px}

/* ── 文件浏览对话框 ─────────────────────────────────── */
.kq-trim{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:6px}
.kq-trim__row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.kq-trim__field{width:120px}
.kq-output{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:var(--kq-fs-2);color:var(--kq-muted)}
.kq-output__label{flex:none;color:var(--kq-dim)}
.kq-output__path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--kq-text)}
.kq-dl__path{font-family:ui-monospace,Consolas,monospace;font-size:var(--kq-fs-1);word-break:break-all;color:var(--kq-muted)}
/* ── 浮动窗口 ───────────────────────────────────────── */
.kq-veil--float{background:transparent;backdrop-filter:none;padding:0;display:block;pointer-events:none}
.kq-float{position:fixed;z-index:2147482000;pointer-events:auto;display:flex;flex-direction:column;background:var(--kq-card);
  color:var(--kq-text);border:1px solid var(--kq-line);border-radius:var(--kq-r-lg);
  box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden;resize:both;
  min-width:420px;min-height:360px;font-family:var(--kq-font);font-size:var(--kq-fs-2);line-height:var(--kq-lh)}
.kq-float__bar{display:flex;align-items:center;gap:8px;padding:7px 10px;
  border-bottom:1px solid var(--kq-line);background:var(--kq-raise);
  color:var(--kq-muted);cursor:move;user-select:none;font-size:var(--kq-fs-1);touch-action:none}
.kq-float__grip{letter-spacing:2px}
.kq-float__title{flex:1;color:var(--kq-text);font-weight:600;font-size:var(--kq-fs-2)}
.kq-float-mini{position:fixed;right:18px;bottom:18px;z-index:2147482000;padding:8px 16px;
  border-radius:999px;border:1px solid var(--kq-accent-line);background:var(--kq-accent);
  color:#fff;font:inherit;font-size:var(--kq-fs-2);cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.kq-float__balance{color:var(--kq-muted);font-size:var(--kq-fs-1);white-space:nowrap}
.kq-float__hint{color:var(--kq-dim);font-size:var(--kq-fs-1)}
.kq-float__x{background:none;border:0;color:var(--kq-muted);font-size:16px;line-height:1;padding:0 4px;cursor:pointer}
.kq-float__body{flex:1;overflow:auto}
.kq-float__body .kq-panel{max-width:none;border:0;border-radius:0;box-shadow:none;min-height:100%}
.kq-fs{width:min(720px,100%);max-height:min(88vh,860px);display:flex;flex-direction:column;
  background:var(--kq-card);color:var(--kq-text);border:1px solid var(--kq-line);
  border-radius:var(--kq-r-lg);box-shadow:var(--kq-shadow);overflow:hidden;
  font-family:var(--kq-font);font-size:var(--kq-fs-2);line-height:var(--kq-lh);text-align:left}
.kq-fs__head{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--kq-line)}
.kq-fs__title{font-size:var(--kq-fs-3);font-weight:600}
.kq-fs__tag{color:var(--kq-dim);font-size:var(--kq-fs-1)}
.kq-fs__path{display:flex;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--kq-line)}
.kq-fs__places{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 16px;
  border-bottom:1px solid var(--kq-line)}
.kq-fs__chip{background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:999px;
  padding:3px 10px;color:var(--kq-text);font:inherit;font-size:var(--kq-fs-1);cursor:pointer}
.kq-fs__chip:hover{border-color:var(--kq-accent-line)}
.kq-fs__list{flex:1;min-height:280px;overflow:auto;padding:6px}
.kq-fs__row{display:flex;align-items:center;gap:10px;width:100%;padding:7px 10px;
  background:none;border:0;border-radius:var(--kq-r-sm);color:var(--kq-text);
  font:inherit;text-align:left;cursor:pointer}
.kq-fs__row:hover{background:var(--kq-raise)}
.kq-fs__row--sel{background:var(--kq-accent-weak);outline:1px solid var(--kq-accent-line)}
.kq-fs__row--media .kq-fs__name{font-weight:600}
.kq-fs__name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-fs__tag{color:var(--kq-dim);font-size:var(--kq-fs-1)}
.kq-fs__foot{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--kq-line)}
.kq-fs__hint{flex:1;min-width:0;color:var(--kq-dim);font-size:var(--kq-fs-1);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-paste__field{flex:1;min-width:220px}
.kq-paste__actions{display:flex;gap:8px;padding-top:20px}
.kq-field__label{display:block;font-size:var(--kq-fs-1);color:var(--kq-muted);margin-bottom:5px}
.kq-input{width:100%;background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:var(--kq-r-sm);
  color:var(--kq-text);font-family:inherit;font-size:var(--kq-fs-2);padding:6px 9px;min-height:32px}
.kq-input:focus-visible{outline:2px solid var(--kq-accent);outline-offset:1px}
.kq-input[aria-invalid="true"]{border-color:var(--kq-fail)}
.kq-error{font-size:var(--kq-fs-1);color:var(--kq-text);margin:6px 0 0}
.kq-error::before{content:"！";color:var(--kq-fail);margin-right:4px;font-weight:700}
.kq-banner__error{font-size:var(--kq-fs-1);color:var(--kq-text);margin:6px 0 0}
.kq-banner__error::before{content:"！";color:var(--kq-fail);margin-right:4px;font-weight:700}

/* ── 格式胶囊 ───────────────────────────────────────── */
.kq-pills{display:flex;gap:7px;flex-wrap:wrap}
.kq-pill{background:var(--kq-raise);border:1px solid var(--kq-line);border-radius:var(--kq-r-sm);
  color:var(--kq-muted);font-size:var(--kq-fs-2);padding:5px 13px;cursor:pointer;min-height:30px;
  transition:background var(--kq-motion),border-color var(--kq-motion),color var(--kq-motion)}
.kq-pill:hover:not([disabled]){border-color:var(--kq-accent-line);color:var(--kq-text)}
.kq-pill.is-on{background:var(--kq-accent-weak);border-color:var(--kq-accent);color:var(--kq-text);font-weight:600}
.kq-pill[disabled]{opacity:.55;cursor:not-allowed;text-decoration:line-through}

/* ── 仅换封装 ───────────────────────────────────────── */
.kq-copy{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0 0;font-size:var(--kq-fs-2)}
.kq-check{display:inline-flex;align-items:center;gap:8px;background:none;border:0;padding:2px 0;
  color:var(--kq-text);font-size:var(--kq-fs-2);cursor:pointer;border-radius:var(--kq-r-sm)}
.kq-check[disabled]{color:var(--kq-muted);cursor:not-allowed}
.kq-check__box{width:14px;height:14px;flex:none;border-radius:4px;border:1px solid var(--kq-dim);
  display:grid;place-items:center;color:var(--kq-card);transition:background var(--kq-motion),border-color var(--kq-motion)}
.kq-check.is-on .kq-check__box{background:var(--kq-accent);border-color:var(--kq-accent)}
.kq-check__meta{color:var(--kq-muted);font-size:var(--kq-fs-1)}
.kq-check__meta--warn{color:var(--kq-text)}

/* ── 时间轴选区 ─────────────────────────────────────── */
.kq-range{margin:0}
.kq-track{position:relative;height:32px;border-radius:var(--kq-r-sm);background:var(--kq-bg);
  border:1px solid var(--kq-line);overflow:hidden}
.kq-track::before{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,var(--kq-line) 0 1px,transparent 1px 42px);opacity:.55}
.kq-sel{position:absolute;top:0;bottom:0;background:var(--kq-accent-weak);
  border-left:2px solid var(--kq-accent);border-right:2px solid var(--kq-accent);transition:left var(--kq-motion),width var(--kq-motion)}
.kq-slider{position:absolute;left:0;right:0;top:0;bottom:0;width:100%;height:32px;margin:0;
  -webkit-appearance:none;appearance:none;background:transparent;pointer-events:none}
.kq-slider:focus-visible{outline:none}
.kq-slider:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 2px var(--kq-bg),0 0 0 4px var(--kq-accent)}
.kq-slider:focus-visible::-moz-range-thumb{box-shadow:0 0 0 2px var(--kq-bg),0 0 0 4px var(--kq-accent)}
.kq-slider::-webkit-slider-runnable-track{background:transparent;border:0;height:32px}
.kq-slider::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;width:12px;height:28px;margin-top:2px;
  border-radius:5px;background:var(--kq-accent);border:2px solid var(--kq-bg);cursor:grab}
.kq-slider::-moz-range-track{background:transparent;border:0;height:32px}
.kq-slider::-moz-range-thumb{pointer-events:auto;width:10px;height:26px;border-radius:5px;
  background:var(--kq-accent);border:2px solid var(--kq-bg);cursor:grab}
.kq-slider:active::-webkit-slider-thumb{cursor:grabbing}
.kq-ticks{position:relative;height:16px;margin-top:4px;font-size:var(--kq-fs-1);color:var(--kq-muted)}
.kq-tick{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
.kq-tick:first-child{transform:none}
.kq-tick:last-child{transform:translateX(-100%)}
.kq-fields{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;font-size:var(--kq-fs-2)}
.kq-field{display:block}
.kq-field--tight{width:96px}
.kq-field--ro{display:flex;align-items:baseline;gap:6px}
.kq-dur{font-size:var(--kq-fs-2);font-weight:600}

/* ── GIF 参数 ───────────────────────────────────────── */
.kq-params{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end}
.kq-params .kq-field{width:112px}
.kq-select{appearance:auto;min-height:32px}
.kq-note--line{margin-top:10px}

/* ── 主操作 ─────────────────────────────────────────── */
.kq-go{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0 0}
.kq-eta{font-size:var(--kq-fs-1);color:var(--kq-muted)}
.kq-eta--blocked{color:var(--kq-muted)}

/* ── 结果 ───────────────────────────────────────────── */
.kq-results{margin-top:18px;padding-top:16px;border-top:1px solid var(--kq-line)}
.kq-result-list{list-style:none;margin:0;padding:0}
.kq-result{border-bottom:1px dashed var(--kq-line)}
.kq-result:last-child{border-bottom:0}
.kq-result__sum{display:grid;grid-template-columns:auto minmax(0,1fr) auto 16px;align-items:center;gap:8px;
  width:100%;text-align:left;background:none;border:0;color:inherit;padding:9px 0;cursor:pointer;
  border-radius:var(--kq-r-sm);transition:background var(--kq-motion)}
.kq-result__sum:hover{background:var(--kq-raise)}
.kq-result__name{min-width:0;display:block}
.kq-result__file{display:block;font-size:var(--kq-fs-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-result__meta{display:block;font-size:var(--kq-fs-1);color:var(--kq-muted);margin-top:1px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-result__badgeNote{font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap}
.kq-result__detail{padding:4px 0 14px 0;transition:opacity var(--kq-motion)}
.kq-rowprogress{display:flex;align-items:center;gap:10px;padding:0 0 10px}
.kq-rowprogress .kq-progress{flex:1;max-width:280px}
.kq-rowprogress .kq-progress__text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-dl{display:grid;grid-template-columns:64px minmax(0,1fr);gap:4px 10px;margin:4px 0 10px;font-size:var(--kq-fs-2)}
.kq-dl dt{color:var(--kq-muted);font-size:var(--kq-fs-1);line-height:1.8}
.kq-dl dd{margin:0;min-width:0;overflow-wrap:anywhere}
.kq-checks{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:3px}
.kq-check-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;font-size:var(--kq-fs-1);color:var(--kq-muted)}
.kq-check-row__id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kq-check-row__text{overflow-wrap:anywhere}
.kq-check-row__delta{color:var(--kq-text)}
.kq-result__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}

/* ── 徽章 ───────────────────────────────────────────── */
.kq-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px 2px 6px;border-radius:999px;
  border:1px solid var(--kq-line);background:var(--kq-raise);font-size:var(--kq-fs-1);color:var(--kq-text);white-space:nowrap}
.kq-badge__dot{width:6px;height:6px;border-radius:50%;background:var(--kq-muted);flex:none}
.kq-badge--pass{border-color:var(--kq-ok)}
.kq-badge--pass .kq-badge__dot{background:var(--kq-ok)}
.kq-badge--warn{border-color:var(--kq-warn)}
.kq-badge--warn .kq-badge__dot{background:var(--kq-warn)}
.kq-badge--fail{border-color:var(--kq-fail)}
.kq-badge--fail .kq-badge__dot{background:var(--kq-fail)}
.kq-badge--busy{border-color:var(--kq-accent-line)}
.kq-badge--busy .kq-badge__dot{background:var(--kq-accent)}
.kq-badge--muted{opacity:.85}

/* ── 命令块 ─────────────────────────────────────────── */
.kq-cmd{display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;background:var(--kq-bg);
  border:1px solid var(--kq-line);border-radius:var(--kq-r-sm);padding:8px 10px}
.kq-cmd__text{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
  font-size:var(--kq-fs-1);line-height:1.55;color:var(--kq-text);white-space:pre-wrap;overflow-wrap:anywhere}
.kq-cmd__copy{flex:none}

/* ── 缺 FFmpeg 横幅 ─────────────────────────────────── */
.kq-banner{margin:0 0 16px;padding:12px 14px;border:1px solid var(--kq-accent-line);border-radius:var(--kq-r-md);
  background:var(--kq-accent-weak);display:grid;gap:8px}
.kq-banner__title{font-size:var(--kq-fs-2);font-weight:600;color:var(--kq-text)}
.kq-banner__hint{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}
.kq-banner__row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.kq-progress{flex:1;min-width:160px;height:6px;border-radius:999px;background:var(--kq-raise);overflow:hidden;border:1px solid var(--kq-line)}
.kq-progress__fill{display:block;height:100%;background:var(--kq-accent);transition:width var(--kq-motion)}
.kq-progress__fill--indeterminate{width:35%;background:linear-gradient(90deg,transparent,var(--kq-accent),transparent)}
.kq-progress__text{font-size:var(--kq-fs-1);color:var(--kq-muted);white-space:nowrap}
.kq-banner__actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

/* ── 离线提示 ───────────────────────────────────────── */
.kq-offline{margin:0 0 16px;padding:10px 12px;border:1px solid var(--kq-line);border-radius:var(--kq-r-md);
  background:var(--kq-raise);display:grid;gap:4px}
.kq-offline__title{font-size:var(--kq-fs-2);color:var(--kq-text);font-weight:600}
.kq-offline__hint{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}

/* ── 页脚 ───────────────────────────────────────────── */
.kq-foot{padding:0 20px 14px;display:grid;gap:2px}
.kq-balance{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}
.kq-balance--ready{color:var(--kq-text)}
.kq-balance--error{color:var(--kq-muted)}
.kq-foot__note{font-size:var(--kq-fs-1);color:var(--kq-muted);margin:0}
.kq-icon{display:inline-block;flex:none;vertical-align:middle}

/* ── 覆盖层：不依赖宿主皮肤的主区域布局 ─────────────── */
.kq-launch{display:inline-flex;align-items:center;gap:6px;background:none;border:0;padding:2px;color:inherit;cursor:pointer}
.kq-veil{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;
  background:rgba(8,10,14,.55);backdrop-filter:blur(2px);padding:24px}
.kq-veil__box{position:relative;width:min(680px,100%);max-height:min(86vh,820px);overflow:auto;
  border-radius:var(--kq-r-lg);box-shadow:0 30px 80px rgba(0,0,0,.5)}
.kq-veil__close{position:absolute;top:10px;right:12px;z-index:2;background:none;border:0;
  color:var(--kq-muted);font-size:18px;line-height:1;padding:6px;cursor:pointer}
@media (prefers-reduced-motion: no-preference){
  .kq-veil{animation:kq-fade var(--kq-motion)}
  .kq-veil__box{animation:kq-rise var(--kq-motion)}
}
@keyframes kq-fade{from{opacity:0}to{opacity:1}}
/* Only movement: an opacity ramp made screenshots and slow GPUs look washed out. */
@keyframes kq-rise{from{transform:translateY(6px)}to{transform:none}}
`




/* ── components/Icon.js ── */
/**
 * 图标：只用 currentColor 描边，尺寸随文字；装饰性图标一律 aria-hidden。
 * 不引任何图标库，也不打包字体。
 */


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
function KqIcon({ name, size, className }) {
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


/* ── components/Badge.js ── */
/**
 * 徽章：一行一个结论。颜色只出现在圆点与描边，文字沿用正文色——
 * 浅色主题下绿/琥珀/红做文字会低于 4.5:1，这里从结构上避开。
 */


/**
 * @param {{ kind?: 'pass' | 'warn' | 'fail' | 'busy' | 'muted', label: string, title?: string }} props
 */
function Badge({ kind, label, title }) {
  const tone = kind === 'pass' || kind === 'warn' || kind === 'fail' || kind === 'busy' || kind === 'muted' ? kind : 'muted'
  return h('span', {
    className: `kq-badge kq-badge--${tone}`,
    title,
  },
  h('span', { className: 'kq-badge__dot', 'aria-hidden': 'true' }),
  h('span', { className: 'kq-badge__label' }, label))
}


/* ── components/Button.js ── */
/**
 * 按钮三件套：主按钮、幽灵按钮、链接按钮。
 * 忙态写进 aria-busy 且保留原文案（加省略号），禁用的原因由旁边的说明承担。
 */


/**
 * @param {{ label: string, onClick?: Function, disabled?: boolean, busy?: boolean, big?: boolean, title?: string, ariaLabel?: string }} props
 */
function PrimaryButton({ label, onClick, disabled, busy, big, title, ariaLabel }) {
  const isBusy = busy === true
  return h('button', {
    type: 'button',
    className: cx('kq-btn', 'kq-btn--primary', big && 'kq-btn--big'),
    onClick,
    disabled: disabled === true || isBusy,
    'aria-busy': isBusy ? 'true' : undefined,
    'aria-label': ariaLabel,
    title,
  }, isBusy ? `${label}…` : label)
}

/**
 * @param {{ label: string, onClick?: Function, disabled?: boolean, busy?: boolean, title?: string, ariaLabel?: string }} props
 */
function GhostButton({ label, onClick, disabled, busy, title, ariaLabel }) {
  const isBusy = busy === true
  return h('button', {
    type: 'button',
    className: 'kq-btn kq-btn--ghost',
    onClick,
    disabled: disabled === true || isBusy,
    'aria-busy': isBusy ? 'true' : undefined,
    'aria-label': ariaLabel,
    title,
  }, isBusy ? `${label}…` : label)
}

/**
 * @param {{ label: string, onClick?: Function, disabled?: boolean, title?: string, ariaLabel?: string }} props
 */
function LinkButton({ label, onClick, disabled, title, ariaLabel }) {
  return h('button', {
    type: 'button',
    className: 'kq-btn kq-btn--link',
    onClick,
    disabled: disabled === true,
    'aria-label': ariaLabel,
    title,
  }, label)
}


/* ── components/Section.js ── */
/**
 * 分区：一行小标签 + 内容。标签是视觉层级，不抢标题。
 */


/**
 * @param {{ label?: string, children?: any, hint?: string }} props
 */
function Section({ label, children, hint }) {
  return h('div', { className: 'kq-sec' },
    label ? h('div', { className: 'kq-sec__label' }, label) : null,
    children,
    hint ? h('p', { className: 'kq-hint' }, hint) : null)
}


/* ── components/TaskCard.js ── */
/**
 * 任务卡：屏幕 1 的两张入口。整卡可点、可键盘触发；缺能力时给出原因。
 */


/**
 * @param {{ title: string, desc: string, disabled?: boolean, reason?: string | null, onSelect?: Function }} props
 */
function TaskCard({ title, desc, disabled, reason, onSelect }) {
  const isDisabled = disabled === true
  const label = isDisabled && reason ? `${title}：${desc}（不可用：${reason}）` : `${title}：${desc}`
  return h('button', {
    type: 'button',
    className: cx('kq-task', isDisabled && 'is-disabled'),
    onClick: isDisabled ? undefined : onSelect,
    disabled: isDisabled,
    'aria-label': label,
    title: isDisabled && reason ? reason : desc,
  },
  h('span', { className: 'kq-task__body' },
    h('span', { className: 'kq-task__title' }, title),
    h('span', { className: 'kq-task__desc' }, desc),
    isDisabled && reason ? h('span', { className: 'kq-task__reason' }, reason) : null),
  h('span', { className: 'kq-task__arrow' }, h(KqIcon, { name: 'chevronRight', size: 16 })))
}


/* ── components/FileStrip.js ── */
/**
 * 文件条：默认显示「添加文件」与「粘贴路径」；点击任一个都把按钮行替换成
 * 路径输入框，反应必须一眼可见。没有拖拽；文件只登记绝对路径，不上传、不复制。
 */


/**
 * @param {{
 *   slot: 'convert' | 'gif',
 *   model: { file: any, fileLine: string, picking: boolean, pickError: any, paste: any },
 *   onPick: Function, onOpenPaste: Function, onClosePaste: Function,
 *   onDraft: Function, onSubmitPaste: Function, onClear: Function,
 * }} props
 */
function FileStrip({ slot, model, onPick, onOpenPaste, onClosePaste, onDraft, onSubmitPaste, onClear }) {
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
      : h('p', { className: 'kq-hint' }, '还没有文件。点「添加文件」可一次多选（Ctrl/Shift）做批量转换。'),
    model.batchCount > 1
      ? h('p', { className: 'kq-hint' }, '批量：共 ' + model.batchCount + ' 个文件，按同一格式依次转换。')
      : null)
}


/* ── components/FileDialog.js ── */
/**
 * 文件浏览对话框：列出目录、进入子目录、选中媒体文件后回填绝对路径。
 * 只读；不复制、不上传。桌面与 web 共用同一套实现，不依赖宿主原生对话框。
 */


const MEDIA_EXT = new Set(['mp4', 'mkv', 'mov', 'webm', 'avi', 'vdat', 'sdv', 'mp3', 'm4a', 'wav', 'flac', 'gif'])

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
function FileDialog({ React, api, slot, mode, onClose, onChoose }) {
  const pickingDir = mode === 'dir'
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

  const entries = (listing && Array.isArray(listing.entries) ? listing.entries : []).filter((entry) => !pickingDir || entry.type === 'dir')
  const roots = listing && Array.isArray(listing.roots) ? listing.roots : []
  const quick = listing && Array.isArray(listing.quick) ? listing.quick : []
  const parent = listing && typeof listing.parent === 'string' ? listing.parent : ''

  const chip = (item) => h('button', {
    key: item.path,
    type: 'button',
    className: 'kq-fs__chip',
    title: item.path,
    onClick: () => { void load(item.path) },
  }, item.name)

  return h('div', {
    className: 'kq-veil',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': pickingDir ? '选择输出文件夹' : '添加文件',
    onClick: (event) => { if (event.target === event.currentTarget) onClose() },
    onKeyDown: (event) => { if (event.key === 'Escape') onClose() },
  },
  h('div', { className: 'kq-fs' },
    h('div', { className: 'kq-fs__head' },
      h(KqIcon, { name: 'film', size: 16 }),
      h('span', { className: 'kq-fs__title' }, pickingDir ? '选择输出文件夹' : '添加文件'),
      h('span', { className: 'kq-fs__tag' }, pickingDir ? '成品写到这个目录' : slot === 'gif' ? '选一段视频' : '选视频或音频'),
      h('span', { style: { flex: 1 } }),
      h(GhostButton, { label: '取消', onClick: onClose })),
    h('div', { className: 'kq-fs__places' },
      h('span', { className: 'kq-fs__tag' }, '位置'),
      quick.map(chip),
      roots.length > 0 ? h('span', { className: 'kq-fs__tag' }, '磁盘') : null,
      roots.map(chip)),
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
        label: pickingDir ? '选择此目录' : '选择',
        onClick: () => {
          if (pickingDir) { if (listing) onChoose(listing.path, listing.path) }
          else if (selected !== null) onChoose(selected.path, selected.name)
        },
      }))))
}








/* ── components/OutputPicker.js ── */
/** 输出位置：默认与源文件同目录，可点「选择」改到任意文件夹。 */


/**
 * @param {{ dir: string, onChoose: Function }} props
 */
function OutputPicker({ dir, onChoose }) {
  const text = typeof dir === 'string' && dir !== '' ? dir : '与源文件同目录'
  return h('div', { className: 'kq-output' },
    h('span', { className: 'kq-output__label' }, '输出位置'),
    h('span', { className: 'kq-output__path', title: text }, text),
    h(GhostButton, { label: '选择', onClick: onChoose, ariaLabel: '选择输出文件夹' }))
}


/* ── components/TrimFields.js ── */
/** 裁剪片段：默认关闭；开启后按 起/止 时间只转中间一段。 */


/**
 * @param {{
 *   trim: { enabled: boolean, fromText: string, toText: string, maxText: string, error: string | null },
 *   onToggle: (enabled: boolean) => void,
 *   onText: (field: 'fromText' | 'toText', value: string) => void,
 * }} props
 */
function TrimFields({ trim, onToggle, onText }) {
  const enabled = trim.enabled === true
  return h('div', { className: 'kq-trim' },
    h('button', {
      type: 'button',
      role: 'checkbox',
      'aria-checked': enabled ? 'true' : 'false',
      'aria-label': '裁剪片段',
      className: cx('kq-check', enabled && 'is-on'),
      onClick: () => onToggle(!enabled),
    },
    h('span', { className: 'kq-check__box', 'aria-hidden': 'true' },
      enabled ? h(KqIcon, { name: 'check', size: 10 }) : null),
    h('span', { className: 'kq-check__label' }, '裁剪片段')),
    enabled
      ? h('div', { className: 'kq-trim__row' },
        h('label', { className: 'kq-field kq-trim__field' },
          h('span', { className: 'kq-field__label' }, '起'),
          h('input', {
            type: 'text',
            className: 'kq-input',
            value: trim.fromText,
            spellCheck: 'false',
            autoComplete: 'off',
            onChange: (event) => onText('fromText', event.target.value),
          })),
        h('label', { className: 'kq-field kq-trim__field' },
          h('span', { className: 'kq-field__label' }, '止'),
          h('input', {
            type: 'text',
            className: 'kq-input',
            value: trim.toText,
            placeholder: trim.maxText,
            spellCheck: 'false',
            autoComplete: 'off',
            onChange: (event) => onText('toText', event.target.value),
          })),
        h('span', { className: 'kq-hint' }, '原片 ' + trim.maxText + '；留空表示到结尾。'))
      : h('p', { className: 'kq-hint' }, '不裁剪，整段转换。'),
    trim.error ? h('p', { className: 'kq-error', role: 'alert' }, trim.error) : null)
}


/* ── components/FormatPill.js ── */
/**
 * 格式胶囊：九个目标，一个必答项。
 * 键盘：Tab 进组，方向键在可用项之间移动并选中，Home/End 跳首尾。
 */


/**
 * @param {{
 *   targets: Array<{ ext: string, label: string, note?: string, selected: boolean, disabled: boolean, reason?: string | null }>,
 *   value: string | null,
 *   onChange: Function,
 *   label?: string,
 * }} props
 */
function FormatPills({ targets, value, onChange, label }) {
  const hasSelection = targets.some((target) => target.selected)
  const firstEnabled = targets.reduce((found, target, index) => (found === -1 && !target.disabled ? index : found), -1)
  const onKeyDown = (event) => {
    const currentIndex = targets.findIndex((target) => target.selected)
    const start = currentIndex === -1 ? firstEnabled : currentIndex
    const enabled = targets.map((target, index) => (target.disabled ? -1 : index)).filter((index) => index !== -1)
    if (enabled.length === 0) return
    const keyed = radioMove(enabled.indexOf(start), event.key, enabled.length)
    if (keyed === -1) return
    event.preventDefault()
    const nextTarget = targets[enabled[keyed]]
    if (!nextTarget) return
    onChange(nextTarget.ext)
    const group = event.currentTarget
    const buttons = group && typeof group.querySelectorAll === 'function'
      ? Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'))
      : []
    const button = buttons[enabled[keyed]]
    if (button && typeof button.focus === 'function' && button.disabled !== true) button.focus()
  }
  return h('div', {
    className: 'kq-pills',
    role: 'radiogroup',
    'aria-label': label || '转成什么格式',
    onKeyDown,
  }, targets.map((target, index) => h('button', {
    key: target.ext,
    type: 'button',
    role: 'radio',
    'aria-checked': target.selected ? 'true' : 'false',
    'aria-disabled': target.disabled ? 'true' : undefined,
    'aria-label': target.disabled && target.reason ? `${target.label}（不可用：${target.reason}）` : target.label,
    className: cx('kq-pill', target.selected && 'is-on'),
    disabled: target.disabled,
    title: target.disabled ? target.reason : target.note,
    tabIndex: target.selected ? 0 : !hasSelection && index === firstEnabled ? 0 : -1,
    onClick: () => onChange(target.ext),
  }, target.label)))
}


/* ── components/CopyToggle.js ── */
/**
 * 「仅换封装」勾选：能拷贝就点亮；不能就置灰，并把原因与预计耗时写在旁边。
 */


/**
 * @param {{
 *   copy: { checked: boolean, disabled: boolean, reason: string | null, etaSec: number | null, mode: string, label: string, meta: string },
 *   onChange: Function,
 * }} props
 */
function CopyToggle({ copy, onChange }) {
  const disabled = copy.disabled === true
  const checked = copy.checked === true && !disabled
  return h('div', { className: 'kq-copy' },
    h('button', {
      type: 'button',
      role: 'checkbox',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': '仅换封装（不重编码）',
      className: cx('kq-check', checked && 'is-on'),
      disabled,
      title: disabled ? copy.reason || '当前组合需要重编码' : '能拷贝时不重编码',
      onClick: () => onChange(!checked),
    },
    h('span', { className: 'kq-check__box', 'aria-hidden': 'true' },
      checked ? h(KqIcon, { name: 'check', size: 10 }) : null),
    h('span', { className: 'kq-check__label' }, '仅换封装')),
    h('span', { className: cx('kq-check__meta', disabled && 'kq-check__meta--warn') }, copy.meta))
}


/* ── components/TimelineRange.js ── */
/**
 * 时间轴选区：一条轨道 + 两个原生 range 滑块 + 两个手填框，双向同步。
 *
 * 为什么用原生 range：键盘、触屏、读屏器行为都由浏览器保证；
 * 轨道上只叠一个透明 input，滑块拇指保留指针事件。
 */


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
function TimelineRange({ range, onSlider, onText, onTextDone }) {
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


/* ── components/GifFields.js ── */
/**
 * GIF 三个默认参数：帧率、宽度、目标体积。默认 12 / 480 / 8MB，都改得动。
 */


/**
 * @param {{
 *   fields: { fps: number, width: number, maxMB: number | null, fpsOptions: number[], widthOptions: number[] },
 *   onChange: (field: 'fps' | 'width' | 'maxMB', value: any) => void,
 * }} props
 */
function GifFields({ fields, onChange }) {
  return h('div', { className: 'kq-params' },
    h('label', { className: 'kq-field' },
      h('span', { className: 'kq-field__label' }, '帧率'),
      h('select', {
        className: 'kq-input kq-select',
        value: String(fields.fps),
        'aria-label': 'GIF 帧率',
        onChange: (event) => onChange('fps', Number(event.target.value)),
      }, fields.fpsOptions.map((option) => h('option', { key: option, value: String(option) }, `${option} fps`)))),
    h('label', { className: 'kq-field' },
      h('span', { className: 'kq-field__label' }, '宽度'),
      h('select', {
        className: 'kq-input kq-select',
        value: String(fields.width),
        'aria-label': 'GIF 宽度（像素）',
        onChange: (event) => onChange('width', Number(event.target.value)),
      }, fields.widthOptions.map((option) => h('option', { key: option, value: String(option) }, `${option}px`)))),
    h('label', { className: 'kq-field' },
      h('span', { className: 'kq-field__label' }, '目标体积'),
      h('input', {
        type: 'number',
        className: 'kq-input',
        min: 0.5,
        max: 100,
        step: 0.5,
        value: fields.maxMB === null || fields.maxMB === undefined ? '' : String(fields.maxMB),
        placeholder: '不限',
        'aria-label': 'GIF 目标体积（MB，留空表示不设上限）',
        onChange: (event) => onChange('maxMB', event.target.value === '' ? null : Number(event.target.value)),
      })))
}


/* ── components/CommandBlock.js ── */
/**
 * 可复制命令块：一行等宽命令 + 复制按钮。复制反馈来自全局 copied 状态。
 */


/**
 * @param {{ command: string, copied?: boolean, onCopy: Function }} props
 */
function CommandBlock({ command, copied, onCopy }) {
  return h('div', { className: 'kq-cmd' },
    h('code', { className: 'kq-cmd__text', title: command }, command),
    h('span', { className: 'kq-cmd__copy' },
      h(GhostButton, {
        label: copied === true ? '已复制' : '复制命令',
        onClick: onCopy,
        ariaLabel: '复制可执行命令',
      })))
}


/* ── components/ResultRow.js ── */
/**
 * 结果行：一行一个徽章，点开才展开「期望 / 实际 / 差多少 / 下一步 / 命令」。
 * 不弹窗、不跳页，结果就挂在表单下面。
 */


/**
 * @param {{ id: string }} row
 */
function detailId(row) {
  return `kq-detail-${String(row.id).replace(/[^A-Za-z0-9_-]/g, '')}`
}

/**
 * @param {{
 *   row: any,
 *   onToggle: Function, onCopy: Function, onCancel: Function, onRepair: Function,
 * }} props
 */
function ResultRow({ row, onToggle, onCopy, onCancel, onRepair, onReveal }) {
  const expanded = row.expanded === true
  const detail = row.detail
  return h('li', { className: 'kq-result' },
    h('button', {
      type: 'button',
      className: 'kq-result__sum',
      'aria-expanded': expanded ? 'true' : 'false',
      'aria-controls': detailId(row),
      onClick: onToggle,
    },
    h(Badge, { kind: row.badge.kind, label: row.badge.label, title: row.badge.note }),
    h('span', { className: 'kq-result__name' },
      h('span', { className: 'kq-result__file' }, row.title),
      h('span', { className: 'kq-result__meta' }, row.meta)),
    h('span', { className: 'kq-result__badgeNote' }, row.badge.note),
    h(KqIcon, { name: expanded ? 'chevronUp' : 'chevronDown', size: 16 })),
    row.active && row.progress
      ? h('div', { className: 'kq-rowprogress' },
        h('div', {
          className: 'kq-progress',
          role: 'progressbar',
          'aria-label': `${row.title} 进度`,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': row.progress.ariaValue,
          'aria-valuetext': row.progress.text,
        }, h('span', {
          className: cx('kq-progress__fill', row.progress.percent === null && 'kq-progress__fill--indeterminate'),
          style: { width: row.progress.percent === null ? '35%' : `${row.progress.percent}%` },
        })),
        h('span', { className: 'kq-progress__text' }, row.progress.text))
      : null,
    expanded
      ? h('div', {
        className: 'kq-result__detail',
        id: detailId(row),
        role: 'region',
        'aria-label': `${row.title} 验收细目`,
      },
      h('dl', { className: 'kq-dl' },
        detail.outputPath
          ? h('dt', null, '输出')
          : null,
        detail.outputPath
          ? h('dd', { className: 'kq-dl__path', title: detail.outputPath }, detail.outputPath)
          : null,
        h('dt', null, '期望'),
        h('dd', null, detail.expected),
        h('dt', null, '实际'),
        h('dd', null, detail.actual),
        h('dt', null, '差多少'),
        h('dd', null, detail.delta),
        h('dt', null, '下一步'),
        h('dd', null, detail.next)),
      detail.checks && detail.checks.length > 0
        ? h('ul', { className: 'kq-checks', 'aria-label': '逐项检查' }, detail.checks.map((check) => h('li', {
          key: check.id,
          className: 'kq-check-row',
        },
        h('span', { className: 'kq-check-row__id' }, `${check.id} · ${check.outcome}`),
        h('span', { className: 'kq-check-row__text' }, check.text || '—',
          check.delta ? h('span', { className: 'kq-check-row__delta' }, ` （${check.delta}）`) : null))))
        : null,
      row.command ? h(CommandBlock, { command: row.command, copied: row.copied, onCopy: () => onCopy(row.command) }) : null,
      h('div', { className: 'kq-result__actions' },
        row.active ? h(GhostButton, { label: '取消任务', onClick: onCancel, ariaLabel: `取消任务 ${row.title}` }) : null,
        row.canRepair ? h(GhostButton, { label: '按建议修复', onClick: onRepair, ariaLabel: `按验收建议修复 ${row.title}` }) : null,
        row.output ? h(GhostButton, { label: '打开文件夹', onClick: () => onReveal(row.output), ariaLabel: `打开所在文件夹 ${row.output}` }) : null,
        row.output ? h(GhostButton, { label: '复制输出路径', onClick: () => onCopy(row.output), ariaLabel: `复制输出路径 ${row.output}` }) : null))
      : null)
}



/* ── components/BalanceLine.js ── */
/**
 * 底部余额小字：`余额 ¥12.34` / `余额 未配置` / `余额 未连接`。
 * 无 key 不报错，读取中也不占位置。
 */


/**
 * @param {{ text: string, tone?: 'ready' | 'muted' | 'error' }} props
 */
function BalanceLine({ text, tone }) {
  return h('p', {
    className: cx('kq-balance', tone === 'ready' && 'kq-balance--ready', tone === 'error' && 'kq-balance--error'),
    'aria-live': 'polite',
  }, text)
}


/* ── components/RecentLine.js ── */
/**
 * 「最近」一行：只放产物，最多两条；没有就写「还没有记录」。
 */


/**
 * @param {{ recent: { status: string, items: Array<{ id: string, name: string, badge: string }>, text: string } }} props
 */
function RecentLine({ recent }) {
  return h('p', { className: 'kq-recent' },
    h('span', { className: 'kq-recent__label' }, '最近'),
    recent.items.length > 0
      ? recent.items.map((item) => h(Badge, {
        key: item.id,
        kind: item.badge === 'fail' ? 'fail' : item.badge === 'warn' ? 'warn' : 'pass',
        label: item.name,
      }))
      : h('span', { className: 'kq-recent__empty' }, recent.text))
}


/* ── components/BinaryBanner.js ── */
/**
 * 缺 FFmpeg 横幅（D8）：只在「本机没有且没装好」时出现。
 * 一条横幅、一个主按钮、一条进度、一个取消；失败给一句人话 + 重试，不弹模态。
 */


/**
 * @param {{
 *   binary: {
 *     visible: boolean, installing: boolean, title: string, hint: string, actionLabel: string,
 *     percent: number | null, indeterminate: boolean, phaseText: string, ariaValue?: number,
 *     error: any, cancelled: boolean, canInstall: boolean, sizeHint: number,
 *   },
 *   onInstall: Function,
 *   onCancel: Function,
 * }} props
 */
function BinaryBanner({ binary, onInstall, onCancel }) {
  if (binary.visible !== true) return null
  const percent = binary.percent
  return h('div', {
    className: 'kq-banner',
    role: 'region',
    'aria-label': 'FFmpeg 安装状态',
  },
  h('p', { className: 'kq-banner__title' }, binary.title),
  binary.installing
    ? h('div', { className: 'kq-banner__row' },
      h('div', {
        className: 'kq-progress',
        role: 'progressbar',
        'aria-label': 'FFmpeg 下载进度',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': binary.ariaValue,
        'aria-valuetext': binary.phaseText,
      }, h('span', {
        className: cx('kq-progress__fill', binary.indeterminate && 'kq-progress__fill--indeterminate'),
        style: { width: percent === null ? '35%' : `${percent}%` },
      })),
      h('span', { className: 'kq-progress__text' }, binary.phaseText),
      h(GhostButton, { label: '取消', onClick: onCancel, ariaLabel: '取消 FFmpeg 下载' }))
    : h('div', { className: 'kq-banner__actions' },
      h(PrimaryButton, { label: binary.actionLabel, onClick: onInstall, disabled: binary.canInstall !== true }),
      h('span', { className: 'kq-banner__hint' }, binary.hint)),
  binary.error
    ? h('p', { className: 'kq-banner__error', role: 'alert' }, `${binary.error.message}${binary.error.hint ? ` ${binary.error.hint}` : ''}`)
    : binary.cancelled && !binary.installing
      ? h('p', { className: 'kq-banner__hint' }, '已取消，可以重试。')
      : null)
}


/* ── components/OfflineNote.js ── */
/**
 * 未连接 / 缺能力提示：一条即可，带重试；不遮界面，不弹窗。
 */


/**
 * @param {{ title: string, message: string, hint?: string, onRetry?: Function, busy?: boolean }} props
 */
function OfflineNote({ title, message, hint, onRetry, busy }) {
  return h('div', { className: 'kq-offline', role: 'status' },
    h('p', { className: 'kq-offline__title' }, title),
    h('p', { className: 'kq-offline__hint' }, `${message}${hint ? ` ${hint}` : ''}`),
    typeof onRetry === 'function'
      ? h('div', { className: 'kq-banner__actions' },
        h(GhostButton, { label: '重试连接', onClick: onRetry, busy, ariaLabel: '重试连接宿主' }))
      : null)
}


/* ── screens/ScreenHeader.js ── */
/**
 * 顶栏：返回、标识、当前任务名、FFmpeg 状态。状态只报事实，不报进度。
 */


/**
 * @param {{ header: { title: string, sub: string, backVisible: boolean, status: string, statusTone: string }, onBack: Function }} props
 */
function ScreenHeader({ header, onBack }) {
  return h('div', { className: 'kq-head' },
    header.backVisible
      ? h('button', {
        type: 'button',
        className: 'kq-back',
        onClick: onBack,
        'aria-label': '返回选任务',
        title: '返回',
      }, h(KqIcon, { name: 'arrowLeft', size: 18 }))
      : null,
    h('span', { className: 'kq-mark', 'aria-hidden': 'true' }, 'K'),
    h('span', { className: 'kq-title' }, header.title),
    h('span', { className: 'kq-sub' }, header.sub),
    h('span', {
      className: `kq-status kq-status--${header.statusTone}`,
      role: 'status',
      'aria-live': 'polite',
    }, header.status))
}


/* ── screens/HomeScreen.js ── */
/**
 * 屏幕 1 · 选任务：一个问题、两张卡、一行「最近」。
 */


/**
 * @param {{ model: any, onOpen: (screen: 'convert' | 'gif') => void }} props
 */
function HomeScreen({ model, onOpen }) {
  return h('div', { className: 'kq-screen' },
    h('h2', { className: 'kq-question' }, model.question),
    model.cards.map((card) => h(TaskCard, {
      key: card.key,
      title: card.title,
      desc: card.desc,
      disabled: card.disabled,
      reason: card.reason,
      onSelect: () => onOpen(card.key),
    })),
    h(RecentLine, { recent: model.recent }))
}


/* ── screens/ConvertScreen.js ── */
/**
 * 屏幕 2A · 格式转换：文件条 → 格式胶囊 → 仅换封装 → 开始转换。
 * 只有一个必答项（转成什么），其余是默认值。
 */


/**
 * @param {{
 *   model: any,
 *   onPick: Function, onOpenPaste: Function, onClosePaste: Function, onDraft: Function,
 *   onSubmitPaste: Function, onClearFile: Function, onTarget: Function, onCopyToggle: Function,
 *   onSubmit: Function,
 * }} props
 */
function ConvertScreen(props) {
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
    model.showTrim === false || model.trim === undefined
      ? null
      : h(Section, { label: '裁剪' }, h(TrimFields, {
        trim: model.trim,
        onToggle: props.onTrimToggle,
        onText: props.onTrimText,
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








/* ── screens/GifScreen.js ── */
/**
 * 屏幕 2B · 视频做 GIF：文件条 → 时间轴选区 → 三个默认参数 → 开始生成 GIF。
 * 只有一个必答项（哪几秒）。
 */


/**
 * @param {{
 *   model: any,
 *   onPick: Function, onOpenPaste: Function, onClosePaste: Function, onDraft: Function,
 *   onSubmitPaste: Function, onClearFile: Function,
 *   onSlider: Function, onText: Function, onTextDone: Function, onField: Function,
 *   onSubmit: Function,
 * }} props
 */
function GifScreen(props) {
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
      h(OutputPicker, { dir: props.outputPath || props.outputDir, onChoose: props.onChooseOutput })),
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





/* ── screens/ResultsPanel.js ── */
/**
 * 屏幕 3 · 结果（挂在表单下面，不是第四个屏幕）。
 * 空态一句话；有结果就一行一个徽章，点开看细目。
 */


/**
 * @param {{
 *   model: { rows: any[], emptyText: string },
 *   onToggle: Function, onCopy: Function, onCancel: Function, onRepair: Function,
 * }} props
 */
function ResultsPanel({ model, onToggle, onCopy, onCancel, onRepair, onReveal }) {
  return h('section', { className: 'kq-results', 'aria-label': '结果' },
    h('div', { className: 'kq-sec__label' }, '结果'),
    model.queue && model.queue.text ? h('p', { className: 'kq-hint' }, model.queue.text) : null,
    model.rows.length === 0
      ? h('p', { className: 'kq-empty' }, model.emptyText)
      : h('ul', { className: 'kq-result-list' }, model.rows.map((row) => h(ResultRow, {
        key: row.id,
        row,
        onToggle: () => onToggle(row.id),
        onCopy,
        onCancel: () => onCancel(row.id),
        onRepair: () => onRepair(row),
        onReveal,
      }))))
}




/* ── app.js ── */
/**
 * Kumquat · 面板根组件与副作用编排。
 *
 * 组件只画逻辑层给的视图模型；选文件、探测、提交、轮询、取消、修复、复制、
 * 装 FFmpeg 这些副作用都收在这里。没有弹窗，没有第四个屏幕。
 *
 * @param {{ useState: Function, useEffect: Function, useRef: Function }} React
 */

const KQ_VERSION = '0.0.40'
const FLOAT_KEY = 'kumquat.float.v1'

function readFloatLayout() {
  try {
    const raw = window.localStorage.getItem(FLOAT_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data && Number.isFinite(data.x) && Number.isFinite(data.y) && Number.isFinite(data.w) && Number.isFinite(data.h)) return data
    }
  } catch {
    /* ignore */
  }
  return { x: 0, y: 0, w: 720, h: 0 }
}

function clampFloatLayout(input) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const w = Math.min(Math.max(420, Number(input.w) || 720), Math.max(420, vw - 24))
  const h = Math.min(Math.max(360, Number(input.h) || Math.round(vh * 0.82)), Math.max(360, vh - 24))
  const x = Math.min(Math.max(8, Number(input.x) || Math.round((vw - w) / 2)), Math.max(8, vw - w - 8))
  const y = Math.min(Math.max(8, Number(input.y) || 56), Math.max(8, vh - 120))
  return { x, y, w, h }
}

function persistFloatLayout(next) {
  try {
    window.localStorage.setItem(FLOAT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** @param {any} React */
function createPanel(React) {
  /**
   * @param {{ api?: any, pickFile?: Function, hostCtx?: any }} props
   */
  function KumquatPanel(props) {
    const api = props.api || createUnavailableApi()
    const pickFile = props.pickFile
    const [, force] = React.useState(0)
    const [refreshKey, setRefreshKey] = React.useState(0)
    const [dialogSlot, setDialogSlot] = React.useState(null)
    const [dirDialog, setDirDialog] = React.useState(false)
    const [minimized, setMinimized] = React.useState(false)
    React.useEffect(() => {
      const reopen = () => setMinimized(false)
      window.addEventListener('kumquat:open', reopen)
      return () => window.removeEventListener('kumquat:open', reopen)
    }, [])
    const [outputDir, setOutputDirState] = React.useState(() => {
      try { return window.localStorage.getItem('kumquat.outputDir') || '' } catch { return '' }
    })
    const [outputPath, setOutputPathState] = React.useState(() => {
      try { return window.localStorage.getItem('kumquat.outputPath') || '' } catch { return '' }
    })
    const [floatLayout, setFloatLayout] = React.useState(() => clampFloatLayout(readFloatLayout()))
    const floatLayoutRef = React.useRef(floatLayout)
    const floatRef = React.useRef(null)
    const dragRef = React.useRef(null)
    React.useEffect(() => { floatLayoutRef.current = floatLayout }, [floatLayout])
    React.useEffect(() => {
      const el = floatRef.current
      if (!el || typeof ResizeObserver !== 'function') return undefined
      const observer = new ResizeObserver(() => {
        const rect = el.getBoundingClientRect()
        const next = clampFloatLayout({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
        floatLayoutRef.current = next
        persistFloatLayout(next)
        setFloatLayout(next)
      })
      observer.observe(el)
      return () => observer.disconnect()
    }, [])
    const startDrag = (event) => {
      if (event.button !== 0) return
      const el = floatRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
      if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
    }
    const moveDrag = (event) => {
      const drag = dragRef.current
      const el = floatRef.current
      if (!drag || !el) return
      const rect = el.getBoundingClientRect()
      const next = clampFloatLayout({ x: event.clientX - drag.dx, y: event.clientY - drag.dy, w: rect.width, h: rect.height })
      floatLayoutRef.current = next
      setFloatLayout(next)
    }
    const endDrag = (event) => {
      if (!dragRef.current) return
      dragRef.current = null
      if (event && event.currentTarget && event.currentTarget.releasePointerCapture) {
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
      }
      persistFloatLayout(floatLayoutRef.current)
    }
    const storeRef = React.useRef(null)
    const abortRef = React.useRef(null)
    if (storeRef.current === null) storeRef.current = createStore(reducer, initialState())
    const store = storeRef.current
    const state = store.getState()

    React.useEffect(() => store.subscribe(() => force((value) => value + 1)), [store])

    React.useEffect(() => {
      let alive = true
      store.dispatch({ type: ACT.CAPS_LOAD })
      store.dispatch({ type: ACT.BALANCE_LOAD })
      store.dispatch({ type: ACT.BINARY_LOAD })
      api.capabilities().then((result) => {
        if (!alive) return
        store.dispatch(result.ok ? { type: ACT.CAPS_OK, data: result.data } : { type: ACT.CAPS_ERR, error: result.error })
      })
      api.balance().then((result) => {
        if (!alive) return
        store.dispatch(result.ok ? { type: ACT.BALANCE_OK, data: result.data } : { type: ACT.BALANCE_ERR, error: result.error })
      })
      api.binaryStatus().then((result) => {
        if (!alive) return
        store.dispatch(result.ok ? { type: ACT.BINARY_READY, data: result.data } : { type: ACT.BINARY_ERR, error: result.error })
      })
      return () => {
        alive = false
      }
    }, [api, store, refreshKey])

    const activeKey = activeJobIds(state).join(',')
    React.useEffect(() => {
      if (activeKey === '') return undefined
      const ids = new Set(activeKey.split(','))
      let stopped = false
      const tick = async () => {
        // 列表路由带每行的 progress；宿主没提供时退回逐个查 detail。
        if (typeof api.jobs === 'function') {
          const list = await api.jobs()
          if (stopped) return
          if (list.ok === true) {
            for (const job of list.data) {
              if (job && ids.has(job.id)) store.dispatch({ type: ACT.JOB_UPDATE, job })
            }
            return
          }
        }
        for (const id of ids) {
          const result = await api.job(id)
          if (stopped || !result.ok) continue
          store.dispatch({ type: ACT.JOB_UPDATE, job: result.data })
        }
      }
      void tick()
      const interval = setInterval(tick, 800)
      return () => {
        stopped = true
        clearInterval(interval)
      }
    }, [activeKey, api, store])

    const dispatch = store.dispatch
    const chooseOutputDir = async () => {
      const st = store.getState()
      const slot = st.screen === 'gif' ? 'gif' : 'convert'
      const file = st[slot] && st[slot].file ? st[slot].file : null
      const stem = file && typeof file.name === 'string' ? file.name.replace(/\.[^.]+$/, '') : 'Kumquat'
      const ext = st.screen === 'gif' ? '.gif' : '.' + ((st.convert && st.convert.to) || 'mp4')
      if (typeof api.pick === 'function') {
        const result = await api.pick('save', stem + ext)
        if (result.ok && result.data && typeof result.data.path === 'string') {
          setOutputPathState(result.data.path)
          try { window.localStorage.setItem('kumquat.outputPath', result.data.path) } catch { /* ignore */ }
          return
        }
        if (result.ok && result.data && result.data.canceled === true) return
      }
      setDirDialog(true)
    }

    const setOutputDir = (dir) => {
      setOutputDirState(dir)
      setOutputPathState('')
      try { window.localStorage.removeItem('kumquat.outputPath') } catch { /* ignore */ }
      try { window.localStorage.setItem('kumquat.outputDir', dir) } catch { /* ignore */ }
      setDirDialog(false)
    }

    const goHome = () => dispatch({ type: ACT.SCREEN, screen: 'home' })
    const openScreen = (screen) => dispatch({ type: ACT.SCREEN, screen })
    const retry = () => setRefreshKey((value) => value + 1)

    const reveal = async (path) => {
      if (typeof api.reveal !== 'function') {
        await copy(path)
        dispatch({ type: ACT.NOTICE, notice: '已复制输出路径，粘贴到资源管理器地址栏即可打开。' })
        return
      }
      const result = await api.reveal(path)
      if (result.ok) return
      await copy(path)
      dispatch({ type: ACT.NOTICE, notice: '已复制输出路径，粘贴到资源管理器地址栏即可打开。' })
    }

    const copy = async (text) => {
      const copied = await copyText(text)
      dispatch({ type: ACT.COPIED, key: copied ? text : null })
      if (!copied) dispatch({ type: ACT.NOTICE, notice: '复制失败：请手动选中命令或路径。' })
    }

    const loadFile = (slot, path, name) => {
      dispatch({ type: ACT.FILE_INFO, slot, path, name })
      api.probe(path).then((result) => {
        if (result.ok) dispatch({ type: ACT.FILE_FACTS, slot, facts: result.data })
        else dispatch({ type: ACT.FILE_ERR, slot, error: result.error })
      })
    }

    const pick = async (slot) => {
      // The hidden file input opens the OS dialog in both clients. Desktop can
      // return a real path; the web client uploads the chosen bytes to the Host.
      const chosen = await chooseLocalFile(slot === 'convert')
      if (!chosen.ok) return
      const loaded = []
      for (const item of chosen.files) {
        if (item.path !== '') {
          loaded.push({ path: item.path, name: item.name })
          continue
        }
        dispatch({ type: ACT.NOTICE, notice: '正在把所选文件复制到本机临时目录…' })
        const uploaded = await uploadFile(item.file)
        if (uploaded.ok) loaded.push({ path: uploaded.path, name: uploaded.name })
      }
      if (loaded.length === 0) return
      if (slot === 'convert') dispatch({ type: ACT.BATCH_SET, files: loaded })
      loadFile(slot, loaded[0].path, loaded[0].name)
      if (loaded.length > 1) {
        dispatch({ type: ACT.NOTICE, notice: `已选 ${loaded.length} 个文件，按同一格式依次转换。` })
      }
    }

    const submitPaste = (slot) => {
      const slotState = store.getState()[slot]
      const parsed = parsePathInput(slotState.paste.draft)
      if (parsed.ok !== true) {
        dispatch({ type: ACT.PASTE_ERR, slot, error: { code: 'E_INPUT', message: parsed.message, hint: parsed.hint } })
        return
      }
      loadFile(slot, parsed.path, parsed.name)
    }

    const installBinary = async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      abortRef.current = controller
      dispatch({ type: ACT.BINARY_INSTALL_BEGIN })
      const result = await api.binaryInstall(
        (progress) => dispatch({ type: ACT.BINARY_PROGRESS, progress }),
        controller === null ? {} : { signal: controller.signal },
      )
      abortRef.current = null
      if (result.ok) {
        dispatch({ type: ACT.BINARY_DONE, data: result.data })
        const caps = await api.capabilities()
        dispatch(caps.ok ? { type: ACT.CAPS_OK, data: caps.data } : { type: ACT.CAPS_ERR, error: caps.error })
        const pending = store.getState().pendingSubmit
        if (pending !== null) {
          dispatch({ type: ACT.PENDING_SUBMIT, slot: null })
          submit(pending)
        }
        return
      }
      if (result.error && result.error.code === 'E_CANCELLED') dispatch({ type: ACT.BINARY_CANCEL })
      else dispatch({ type: ACT.BINARY_FAIL, error: result.error })
    }

    const cancelInstall = () => {
      const controller = abortRef.current
      if (controller !== null && typeof controller.abort === 'function') controller.abort()
      abortRef.current = null
      dispatch({ type: ACT.BINARY_CANCEL })
      dispatch({ type: ACT.PENDING_SUBMIT, slot: null })
    }

    const submit = async (slot) => {
      const current = store.getState()
      const validation = slot === 'gif' ? validateGif(current) : validateConvert(current)
      if (validation.ok !== true) {
        if (validation.code === 'E_FFMPEG') {
          dispatch({ type: ACT.PENDING_SUBMIT, slot })
          if (store.getState().binary.installing !== true) installBinary()
          return
        }
        dispatch({ type: ACT.NOTICE, notice: validation.message })
        return
      }
      dispatch({ type: ACT.JOB_BEGIN, slot })
      const batch = current.convert.batch
      const tasks = slot === 'convert' && batch.length > 1
        ? batch.map((item) => ({ ...validation.task, input: item.path }))
        : [validation.task]
      for (const task of tasks) {
        const result = await api.run(task, { outputDir, outputPath: tasks.length === 1 ? outputPath : '' })
        if (result.ok) dispatch({ type: ACT.JOB_ADD, slot, job: result.data, task })
        else {
          dispatch({ type: ACT.JOB_ERR, slot, error: result.error })
          break
        }
      }
    }

    const cancelJob = async (id) => {
      const item = store.getState().jobs.items.filter((entry) => entry.id === id)[0]
      const result = await api.cancel(id)
      if (result.ok && item) dispatch({ type: ACT.JOB_UPDATE, job: { ...item, status: 'cancelled' } })
      else if (!result.ok) dispatch({ type: ACT.NOTICE, notice: result.error.message })
    }

    const repair = async (row) => {
      const nextTask = applyRepair(row.task, row.repairAction)
      if (nextTask === null) {
        dispatch({ type: ACT.NOTICE, notice: '这条建议需要手工处理，可以复制命令自己跑。' })
        return
      }
      const slot = nextTask.kind === 'gif' ? 'gif' : 'convert'
      dispatch({ type: ACT.JOB_BEGIN, slot })
      const result = await api.run(nextTask, { outputDir, outputPath })
      if (result.ok) dispatch({ type: ACT.JOB_ADD, slot, job: result.data, task: nextTask })
      else dispatch({ type: ACT.JOB_ERR, slot, error: result.error })
    }

    const header = selectHeader(state)
    const caps = selectCaps(state)
    const binary = selectBinary(state)
    const balance = selectBalance(state)
    const home = selectHome(state)
    const convert = selectConvert(state)
    const gif = selectGif(state)
    const results = selectResults(state)

    if (minimized) {
      return h('button', {
        className: 'kq-float-mini',
        type: 'button',
        title: '打开金桔',
        onClick: () => setMinimized(false),
      }, '金桔')
    }

    return h('div', {
      className: 'kq-float',
      ref: floatRef,
      tabIndex: -1,
      style: {
        left: floatLayout.x + 'px',
        top: floatLayout.y + 'px',
        width: floatLayout.w + 'px',
        height: floatLayout.h + 'px',
      },
    },
    h('div', {
      className: 'kq-float__bar',
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    h('span', { className: 'kq-float__grip' }, '\u2807'),
    h('span', { className: 'kq-float__title' }, 'Kumquat 金桔 · v' + KQ_VERSION),
    h('span', { className: 'kq-float__balance' }, balance.visible === false ? null : h(BalanceLine, { text: balance.text, tone: balance.tone })),
    h('span', { className: 'kq-float__hint' }, '按住这里拖动'),
    h('button', { className: 'kq-float__x', type: 'button', 'aria-label': '关闭金桔面板', title: '关闭', onPointerDown: (event) => event.stopPropagation(), onClick: (event) => { event.stopPropagation(); setMinimized(true) } }, '×')),
    h('div', { className: 'kq-float__body' },
    h('section', {
      className: 'kq-panel',
      'aria-label': 'Kumquat 金桔',
      'data-kumquat-root': 'true',
    },
    h(ScreenHeader, { header, onBack: goHome }),
    h('div', { className: 'kq-body' },
      h(BinaryBanner, { binary, onInstall: installBinary, onCancel: cancelInstall }),
      caps.online === false && binary.visible !== true
        ? h(OfflineNote, {
          title: '未连接宿主',
          message: caps.error ? caps.error.message : '宿主没有响应',
          hint: caps.error ? caps.error.hint : '',
          onRetry: retry,
          busy: caps.status === 'loading',
        })
        : null,
      state.screen === 'home' ? h(HomeScreen, { model: home, onOpen: openScreen }) : null,
      (state.screen === 'convert' || state.screen === 'audio')
        ? h(ConvertScreen, {
          model: convert,
          onPick: () => pick('convert'),
          onOpenPaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'convert', open: true }),
          onClosePaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'convert', open: false }),
          onDraft: (value) => dispatch({ type: ACT.PASTE_DRAFT, slot: 'convert', draft: value }),
          onSubmitPaste: () => submitPaste('convert'),
          onClearFile: () => { dispatch({ type: ACT.FILE_CLEAR, slot: 'convert' }); dispatch({ type: ACT.BATCH_SET, files: [] }) },
          onTarget: (to) => dispatch({ type: ACT.TARGET, to }),
          onCopyToggle: (checked) => dispatch({ type: ACT.COPY, copy: checked }),
          onSubmit: () => submit('convert'),
          outputDir,
          outputPath,
          onChooseOutput: chooseOutputDir,
          onTrimToggle: (enabled) => dispatch({ type: ACT.TRIM_TOGGLE, enabled }),
          onTrimText: (field, value) => dispatch({ type: ACT.TRIM_TEXT, field, value }),
        })
        : null,
      state.screen === 'gif'
        ? h(GifScreen, {
          model: gif,
          onPick: () => pick('gif'),
          onOpenPaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'gif', open: true }),
          onClosePaste: () => dispatch({ type: ACT.PASTE_OPEN, slot: 'gif', open: false }),
          onDraft: (value) => dispatch({ type: ACT.PASTE_DRAFT, slot: 'gif', draft: value }),
          onSubmitPaste: () => submitPaste('gif'),
          onClearFile: () => dispatch({ type: ACT.FILE_CLEAR, slot: 'gif' }),
          onSlider: (handle, value) => dispatch({ type: ACT.GIF_SLIDER, handle, value }),
          onText: (handle, text) => dispatch({ type: ACT.GIF_TEXT, handle, text }),
          onTextDone: (handle) => dispatch({ type: ACT.GIF_TEXT_DONE, handle }),
          onField: (field, value) => dispatch({ type: ACT.GIF_FIELD, field, value }),
          onSubmit: () => submit('gif'),
          outputDir,
          outputPath,
          onChooseOutput: chooseOutputDir,
          onTrimToggle: (enabled) => dispatch({ type: ACT.TRIM_TOGGLE, enabled }),
          onTrimText: (field, value) => dispatch({ type: ACT.TRIM_TEXT, field, value }),
        })
        : null,
      state.screen !== 'home'
        ? h(ResultsPanel, { model: results, onToggle: (id) => dispatch({ type: ACT.EXPAND, id }), onCopy: copy, onCancel: cancelJob, onRepair: repair, onReveal: reveal })
        : null,
      state.notice ? h('p', { className: 'kq-hint', role: 'status' }, state.notice) : null),
    dialogSlot !== null
      ? h(FileDialog, {
        React,
        api,
        slot: dialogSlot,
        onClose: () => setDialogSlot(null),
        onChoose: (path, name) => {
          loadFile(dialogSlot, path, name)
          setDialogSlot(null)
        },
      })
      : null,
    dirDialog
      ? h(FileDialog, {
        React,
        api,
        mode: 'dir',
        slot: 'convert',
        onClose: () => setDirDialog(false),
        onChoose: (path) => setOutputDir(path),
      })
      : null,
    h('div', { className: 'kq-foot' },
      h('p', { className: 'kq-foot__note' }, '文件在本机处理；网页端选择文件会复制到临时目录。每次任务自动验收并留证据。')))))
  }

  return KumquatPanel
}























    bindHost(React)
    const Panel = createPanel(React)

    return {
      inject: ['slots'],
      // Exposed for tests and for hosts that want to mount the panel directly.
      panel: Panel,
      apply(ctx) {
        const installStyle = () => {
          if (typeof document === 'undefined') return () => {}
          const style = document.createElement('style')
          style.setAttribute('data-plugin', 'dsh-kumquat')
          style.textContent = CSS_TEXT
          document.head.append(style)
          return () => { style.remove() }
        }
        let hasEffect = false
        try {
          hasEffect = typeof ctx.effect === 'function'
        } catch (error) {
          hasEffect = false
        }
        if (hasEffect) ctx.effect(installStyle)
        else installStyle()
        if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
          if (typeof console !== 'undefined') console.warn('kumquat: 客户端的 slots 服务不可用，面板未挂载')
          return
        }
        const api = createApi(ctx)
        let pickFile
        try {
          if (typeof ctx.pickFile === 'function') pickFile = ctx.pickFile.bind(ctx)
        } catch (error) {
          pickFile = undefined
        }
        const Launcher = () => {
          const open = () => {
            try {
              const layout = typeof ctx.get === 'function' ? ctx.get('layout') : undefined
              if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('kumquat')
              window.dispatchEvent(new CustomEvent('kumquat:open'))
            } catch (error) { /* ignore */ }
          }
          return h('span', { className: 'kq-launchwrap' },
            h('button', {
              className: 'kq-launch',
              type: 'button',
              title: '金桔',
              'aria-haspopup': 'dialog',
              onClick: open,
            },
            h('svg', {
              width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false',
              style: { color: 'var(--kq-accent)' },
            },
            h('circle', { cx: 8, cy: 9.5, r: 5.5, fill: 'currentColor' }),
            h('path', { d: 'M8 4c0-2 1.4-3 3-3-.4 2-1.4 3-3 3z', fill: '#3ddc97' })),
            h('span', { style: { fontSize: 12.5 } }, '金桔')))
        }        // The layout switches panels by id: a same-key 'main' registration is
        // required, even though the overlay is what users actually see.
        const Bound = (slotProps) => h(Panel, Object.assign({}, slotProps, { api, pickFile }))
        const register = (name, options, component) => {
          try {
            ctx.slots.inject(name, () => ctx.slots.register(Object.assign({ name }, options), component))
          } catch (error) {
            if (typeof console !== 'undefined') console.warn('kumquat: 无法注册 ' + name, error)
          }
        }
        register('main', { key: 'kumquat' }, Bound)
        // The overlay opens from the sidebar row and from the composer dock, so
        // the panel does not depend on a skin's main-area layout.
        register('sidebar.panellist', { id: 'kumquat', order: 40, label: () => '金桔' }, Launcher)
        register('conversation.composer.dock', { id: 'kumquat', order: 5 }, Launcher)
      },
    }
  },
})
