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
export const CONVERT_TARGETS = Object.freeze([
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
export const TARGET_BY_EXT = Object.freeze(
  Object.fromEntries(CONVERT_TARGETS.map((target) => [target.ext, target])),
)

/** 视频目标扩展名，按界面顺序。 @type {ReadonlyArray<string>} */
export const VIDEO_EXTS = Object.freeze(CONVERT_TARGETS.filter((target) => target.kind === 'video').map((target) => target.ext))

/** 音频目标扩展名，按界面顺序。 @type {ReadonlyArray<string>} */
export const AUDIO_EXTS = Object.freeze(CONVERT_TARGETS.filter((target) => target.kind === 'audio').map((target) => target.ext))

/** GIF 面板的默认参数（设计稿 v0.6：12fps / 480px / 8MB / 默认 5 秒）。 */
export const GIF_DEFAULTS = Object.freeze({
  fps: 12,
  width: 480,
  maxMB: 8,
  spanSec: 5,
  minSpanSec: 0.2,
  maxSpanSec: 60,
})

/** 帧率可选项。 */
export const GIF_FPS_OPTIONS = Object.freeze([8, 10, 12, 15, 20, 24])

/** 宽度可选项（像素）。 */
export const GIF_WIDTH_OPTIONS = Object.freeze([320, 480, 640, 720, 820])

/** 每个音频目标要求的编码：'pcm' 表示任意 PCM 均可。 */
export const AUDIO_TARGET_CODEC = Object.freeze({ mp3: 'mp3', m4a: 'aac', wav: 'pcm', flac: 'flac', aac: 'aac', ogg: 'vorbis', opus: 'opus', wma: 'wmav2' })

/** 允许流拷贝进各视频容器的视频编码；'*' 表示容器不挑。 */
export const COPY_VIDEO_CODECS = Object.freeze({
  mp4: Object.freeze(['h264', 'hevc', 'mpeg4', 'av1']),
  mkv: '*',
  mov: Object.freeze(['h264', 'hevc', 'prores', 'dnxhd', 'mjpeg']),
  webm: Object.freeze(['vp8', 'vp9', 'av1']),
  avi: Object.freeze(['h264', 'mpeg4', 'mjpeg', 'msmpeg4v3']),
})

/** 允许流拷贝进各视频容器的音频编码；'*' 表示容器不挑。 */
export const COPY_AUDIO_CODECS = Object.freeze({
  mp4: Object.freeze(['aac', 'mp3', 'alac', 'ac3', 'eac3']),
  mkv: '*',
  mov: Object.freeze(['aac', 'mp3', 'alac', 'ac3', 'pcm_s16le', 'pcm_s24le']),
  webm: Object.freeze(['opus', 'vorbis']),
  avi: Object.freeze(['mp3', 'ac3', 'pcm_s16le', 'pcm_s24le']),
})

/** ffmpeg 报告的 muxer 名与界面扩展名的对应（一个格式可能对应多个 muxer）。 */
export const MUXER_ALIASES = Object.freeze({
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
export const CODEC_LABELS = Object.freeze({
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
export function normalizeTarget(target) {
  const ext = String(target === null || target === undefined ? '' : target).trim().toLowerCase().replace(/^\./, '')
  return Object.prototype.hasOwnProperty.call(TARGET_BY_EXT, ext) ? ext : null
}

/**
 * @param {unknown} ext
 * @returns {ConvertTarget | null}
 */
export function targetOf(ext) {
  const normalized = normalizeTarget(ext)
  return normalized === null ? null : TARGET_BY_EXT[normalized]
}

/**
 * @param {unknown} ext
 * @returns {boolean}
 */
export function isAudioTarget(ext) {
  return AUDIO_EXTS.indexOf(normalizeTarget(ext) || '') !== -1
}

/**
 * @param {unknown} ext
 * @returns {boolean}
 */
export function isVideoTarget(ext) {
  return VIDEO_EXTS.indexOf(normalizeTarget(ext) || '') !== -1
}

/**
 * @param {unknown} ext
 * @returns {string}
 */
export function targetLabel(ext) {
  const target = targetOf(ext)
  return target === null ? String(ext === null || ext === undefined ? '' : ext) : target.label
}

/**
 * 归一编码名：小写、去 `.` 后的 profile 段（`h264.high` → `h264`）。
 * @param {unknown} codec
 * @returns {string}
 */
export function normalizeCodec(codec) {
  return String(codec === null || codec === undefined ? '' : codec).trim().toLowerCase().split('.')[0]
}

/**
 * @param {unknown} codec
 * @returns {string}
 */
export function codecLabel(codec) {
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
export function muxerSupports(capabilities, ext) {
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
