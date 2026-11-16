/**
 * ffprobe -> MediaFacts normalization.
 *
 * ffprobe JSON is sparse: fields that are absent stay absent (no invented
 * values). `bytes` always comes from the filesystem, not from the container.
 */
import { stat } from 'node:fs/promises'
import { parseVersion } from './locate.js'
import { platform } from './platform/index.js'
import { run as defaultRun } from './runner.js'

/** @typedef {import('../public/types.d.ts').MediaFacts} MediaFacts */
/** @typedef {import('../public/types.d.ts').StreamInfo} StreamInfo */

/** ffprobe path -> version (empty results are not cached). */
const VERSION_CACHE = new Map()

/**
 * Probe a media file.
 * @param {string} input
 * @param {{ ffprobe: string, version?: string, run?: typeof defaultRun, timeoutMs?: number }} options
 * @returns {Promise<MediaFacts>}
 */
export async function probe(input, options = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('probe(path, { ffprobe }): path must be a non-empty string')
  }
  const ffprobe = options.ffprobe
  if (typeof ffprobe !== 'string' || ffprobe.length === 0) {
    throw new Error('probe(path, { ffprobe }): ffprobe path is required')
  }
  const run = options.run ?? defaultRun
  const file = platform.longPath(input)

  let fileStat
  try {
    fileStat = await stat(file)
  } catch (error) {
    const reason = error?.code === 'ENOENT' ? 'file not found' : error?.message || 'cannot read file'
    throw new Error(`Cannot probe "${input}": ${reason}`)
  }
  if (!fileStat.isFile()) {
    throw new Error(`Cannot probe "${input}": not a regular file`)
  }

  const ext = (input.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  const legacy = ext === 'vdat' || ext === 'sdv'
  const base = [ffprobe, '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams']
  const attempts = legacy
    ? [base, ...['mp4', 'mov', 'mpegts', 'mpeg', 'avi', 'matroska', 'flv'].map((name) => [...base, '-f', name])]
    : [base]

  let result
  let parsed
  for (const args of attempts) {
    result = await run([...args, file], { timeoutMs: options.timeoutMs ?? 30000 })
    if (result.code !== 0) continue
    try {
      parsed = JSON.parse(result.stdout)
      break
    } catch {
      parsed = undefined
    }
  }

  if (parsed === undefined) {
    if (legacy) {
      throw new Error(
        `这个 .${ext} 文件读不出来：监控设备常用私有封装，部分还加密，ffmpeg 无法直接解析。` +
          '请先用原厂播放器或厂商转换工具导出为 MP4/AVI，再用金桔转换。',
      )
    }
    if (result.code !== 0) {
      throw new Error(
        `ffprobe failed for "${input}" (exit ${result.code}): ${firstLine(result.stderr) || 'no error output'}`,
      )
    }
    throw new Error(
      `ffprobe returned unreadable JSON for "${input}": ` +
        `${firstLine(result.stdout) || firstLine(result.stderr) || 'empty output'}`,
    )
  }

  const format = isObject(parsed?.format) ? parsed.format : {}
  const rawStreams = Array.isArray(parsed?.streams) ? parsed.streams : []
  /** @type {StreamInfo[]} */
  const streams = rawStreams.map(normalizeStream).filter(Boolean)

  const formatName = typeof format.format_name === 'string' ? format.format_name : ''
  const formatNames = formatName.split(',').map((name) => name.trim()).filter(Boolean)
  const extension = (String(input).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  // Prefer the extension when ffprobe lists it: WebM reports as "matroska,webm",
  // and users think in terms of the container they asked for.
  const container = formatNames.includes(extension)
    ? extension
    : (extension === 'mkv' && formatNames.includes('matroska') ? 'matroska' : (formatNames[0] ?? ''))
  const durationSec = finiteNumber(format.duration) ?? 0
  const ffmpegVersion = options.version ?? (await ffprobeVersion(ffprobe, run))

  return {
    path: input,
    bytes: fileStat.size,
    container,
    formatName,
    durationSec,
    streams,
    video: streams.find((stream) => stream.type === 'video'),
    audio: streams.find((stream) => stream.type === 'audio'),
    ffmpegVersion,
  }
}

/**
 * @param {any} raw
 * @returns {StreamInfo | null}
 */
function normalizeStream(raw) {
  if (!isObject(raw)) return null
  const type = raw.codec_type
  if (type !== 'video' && type !== 'audio' && type !== 'subtitle') return null

  /** @type {StreamInfo} */
  const stream = {
    index: Number.isInteger(raw.index) ? raw.index : 0,
    type,
    codec: typeof raw.codec_name === 'string' && raw.codec_name.length > 0 ? raw.codec_name : 'unknown',
  }

  if (type === 'video') {
    const width = positiveInteger(raw.width)
    const height = positiveInteger(raw.height)
    const rRate = parseRate(raw.r_frame_rate)
    const avgRate = parseRate(raw.avg_frame_rate)
    const fps = rRate ?? avgRate
    if (width !== undefined) stream.width = width
    if (height !== undefined) stream.height = height
    if (fps !== undefined) stream.fps = fps
    // A source whose nominal and average rates disagree is variable frame rate.
    if (rRate !== undefined && avgRate !== undefined && rRate !== avgRate) stream.vfr = true
  } else if (type === 'audio') {
    const sampleRate = positiveInteger(raw.sample_rate)
    const channels = positiveInteger(raw.channels)
    if (sampleRate !== undefined) stream.sampleRate = sampleRate
    if (channels !== undefined) stream.channels = channels
  }

  return stream
}

/**
 * Convert an ffprobe rational frame rate such as `30000/1001` into fps.
 * @param {unknown} raw
 * @returns {number | undefined}
 */
function parseRate(raw) {
  if (typeof raw !== 'string') return undefined
  const match = raw.trim().match(/^(\d+)\/(\d+)$/)
  if (!match) {
    const plain = Number(raw)
    return Number.isFinite(plain) && plain > 0 ? round3(plain) : undefined
  }
  const numerator = Number(match[1])
  const denominator = Number(match[2])
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator <= 0) {
    return undefined
  }
  return round3(numerator / denominator)
}

/**
 * Probe version is a fallback only; callers normally pass the version found by locate.
 * @param {string} ffprobe
 * @param {typeof defaultRun} run
 * @returns {Promise<string>}
 */
async function ffprobeVersion(ffprobe, run) {
  if (VERSION_CACHE.has(ffprobe)) return VERSION_CACHE.get(ffprobe)
  let version = ''
  try {
    const result = await run([ffprobe, '-version'], { timeoutMs: 10000 })
    if (result.code === 0) version = parseVersion(result.stdout)
  } catch {
    version = ''
  }
  if (version) VERSION_CACHE.set(ffprobe, version)
  return version
}

/** @param {unknown} value */
function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

/** @param {unknown} value */
function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

/** @param {number} value */
function round3(value) {
  return Math.round(value * 1000) / 1000
}

/** @param {string} text */
function firstLine(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? ''
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return typeof value === 'object' && value !== null
}
