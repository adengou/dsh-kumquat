/**
 * FFmpeg capability discovery.
 *
 * Runs `-filters`, `-encoders` and `-muxers` once per FFmpeg build and caches
 * the parsed lists in memory. The cache key includes both the version and the
 * executable path: swapping binaries must never serve stale capabilities.
 */
import path from 'node:path'
import { parseVersion } from './locate.js'
import { run as defaultRun } from './runner.js'

/** @typedef {import('../public/types.d.ts').Capabilities} Capabilities */

/** ffmpeg "version\0path" -> parsed lists @type {Map<string, {filters: readonly string[], encoders: readonly string[], muxers: readonly string[]}>} */
const LIST_CACHE = new Map()

/** ffmpeg path -> version @type {Map<string, string>} */
const VERSION_CACHE = new Map()

/**
 * Read the capabilities of one FFmpeg build.
 * @param {{ ffmpeg: string, ffprobe?: string, version?: string, run?: typeof defaultRun }} options
 * @returns {Promise<Capabilities>}
 */
export async function capabilities(options = {}) {
  const ffmpeg = options.ffmpeg
  if (typeof ffmpeg !== 'string' || ffmpeg.length === 0) {
    throw new Error('capabilities({ ffmpeg }): ffmpeg path is required')
  }
  const run = options.run ?? defaultRun
  const version = options.version ?? (await ffmpegVersion(ffmpeg, run))
  const cacheKey = `${version}\0${ffmpeg}`

  let lists = LIST_CACHE.get(cacheKey)
  if (!lists) {
    const [filtersResult, encodersResult, muxersResult] = await Promise.all([
      run([ffmpeg, '-hide_banner', '-filters'], { timeoutMs: 30000 }),
      run([ffmpeg, '-hide_banner', '-encoders'], { timeoutMs: 30000 }),
      run([ffmpeg, '-hide_banner', '-muxers'], { timeoutMs: 30000 }),
    ])

    assertOk('-filters', filtersResult)
    assertOk('-encoders', encodersResult)
    assertOk('-muxers', muxersResult)

    lists = Object.freeze({
      filters: Object.freeze(parseFilters(filtersResult.stdout)),
      encoders: Object.freeze(parseEncoders(encodersResult.stdout)),
      muxers: Object.freeze(parseMuxers(muxersResult.stdout)),
    })
    LIST_CACHE.set(cacheKey, lists)
  }

  return Object.freeze({
    ffmpeg,
    ffprobe: options.ffprobe ?? siblingFfprobe(ffmpeg),
    version,
    filters: lists.filters,
    encoders: lists.encoders,
    muxers: lists.muxers,
  })
}

/**
 * @param {Capabilities} caps
 * @param {string} name
 * @returns {boolean}
 */
export function hasFilter(caps, name) {
  return includesName(caps?.filters, name)
}

/**
 * @param {Capabilities} caps
 * @param {string} name
 * @returns {boolean}
 */
export function hasEncoder(caps, name) {
  return includesName(caps?.encoders, name)
}

/**
 * @param {Capabilities} caps
 * @param {string} name
 * @returns {boolean}
 */
export function hasMuxer(caps, name) {
  return includesName(caps?.muxers, name)
}

/**
 * Parse `ffmpeg -filters`.
 * Example row: ` TSC adrc              A->A       Audio Spectral ...`
 * @param {string} text
 * @returns {string[]}
 */
function parseFilters(text) {
  /** @type {string[]} */
  const names = []
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.includes('->')) continue
    const left = line.slice(0, line.indexOf('->')).trim()
    const tokens = left.split(/\s+/)
    // tokens: [flags, name, input-pad]; legend lines have no '->' and are skipped.
    const name = tokens[1]
    if (name && /^[A-Za-z0-9_]+$/.test(name)) names.push(name)
  }
  return names
}

/**
 * Parse `ffmpeg -encoders`.
 * Example row: ` V....D libx264             libx264 H.264 ...`
 * @param {string} text
 * @returns {string[]}
 */
function parseEncoders(text) {
  /** @type {string[]} */
  const names = []
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const tokens = rawLine.trim().split(/\s+/)
    if (tokens.length < 2) continue
    if (!/^[VAS][FSXBD.]{2,7}$/.test(tokens[0])) continue
    const name = tokens[1]
    if (/^[A-Za-z0-9_-]+$/.test(name)) names.push(name)
  }
  return names
}

/**
 * Parse `ffmpeg -muxers` (labelled "File formats:" by modern builds).
 * Example row: `  E matroska          Matroska`
 * @param {string} text
 * @returns {string[]}
 */
function parseMuxers(text) {
  /** @type {string[]} */
  const names = []
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const tokens = rawLine.trim().split(/\s+/)
    if (tokens.length < 2) continue
    const flags = tokens[0]
    if (!/^[ED.]+$/.test(flags) || !flags.includes('E')) continue
    const name = tokens[1]
    if (/^[A-Za-z0-9_.-]+$/.test(name)) names.push(name)
  }
  return names
}

/** @param {readonly string[] | undefined} list @param {string} name */
function includesName(list, name) {
  return Array.isArray(list) && typeof name === 'string' && list.includes(name)
}

/**
 * @param {string} ffmpeg
 * @returns {string}
 */
function siblingFfprobe(ffmpeg) {
  const probeName = /\.exe$/i.test(ffmpeg) ? 'ffprobe.exe' : 'ffprobe'
  return path.join(path.dirname(ffmpeg), probeName)
}

/**
 * @param {string} ffmpeg
 * @param {typeof defaultRun} run
 * @returns {Promise<string>}
 */
async function ffmpegVersion(ffmpeg, run) {
  const cached = VERSION_CACHE.get(ffmpeg)
  if (cached !== undefined) return cached
  let version = ''
  try {
    const result = await run([ffmpeg, '-version'], { timeoutMs: 10000 })
    if (result.code === 0) version = parseVersion(result.stdout)
  } catch {
    version = ''
  }
  if (version) VERSION_CACHE.set(ffmpeg, version)
  return version
}

/**
 * @param {string} flag
 * @param {{ code: number, stderr?: string }} result
 */
function assertOk(flag, result) {
  if (result.code === 0) return
  const firstLine =
    String(result.stderr ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? 'no error output'
  throw new Error(`ffmpeg ${flag} failed (exit ${result.code}): ${firstLine}`)
}
