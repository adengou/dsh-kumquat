/**
 * Measurement port for verification. This module never imports the engine and
 * never spawns a process itself: callers inject `run`, `probe` and the ffmpeg
 * binary location. Everything here is "measure the produced file", never
 * "trust what the encoder said".
 *
 * Ports:
 *   run(argv: string[]) => Promise<{ code: number, stdout?: string, stderr?: string }>
 *       argv[0] is the executable; the runner must not use a shell.
 *   probe(path: string) => Promise<MediaFacts>
 *       The caller binds engine-specific options, e.g.
 *       `p => probe(p, { ffprobe })`; this module never imports src/engine.
 *   ffmpeg: string | { path?: string, ffmpeg?: string, ffprobe?: string }
 *
 * Unit-testable pieces (`parseEbur128`, `scanGifLoop`, `parseFrameProbe`) are
 * exported on purpose: their parsing rules are part of the contract.
 */

import { open } from 'node:fs/promises'
import path from 'node:path'

/** @typedef {{ code: number, stdout: string, stderr: string, spawnError?: boolean }} ExecResult */
/** @typedef {(argv: string[]) => Promise<ExecResult | number | { code?: number, exitCode?: number, status?: number, ok?: boolean, stdout?: unknown, stderr?: unknown }>)} Runner */
/** @typedef {(filePath: string) => Promise<import('../public/types.d.ts').MediaFacts>} Probe */

const NETSCAPE = Buffer.from('NETSCAPE2.0', 'latin1')
const MAX_LOOP_SCAN_BYTES = 64 * 1024 * 1024
const LOOP_SCAN_HEAD_BYTES = 8 * 1024 * 1024
const MAX_ERROR_LINES = 40

/**
 * Build the measurement API.
 * @param {{ run: Runner, probe: Probe, ffmpeg?: string | { path?: string, ffmpeg?: string, ffprobe?: string } }} ports
 */
export function measure({ run, probe, ffmpeg } = {}) {
  if (typeof run !== 'function') throw new TypeError('measure({ run }): run must be a function')
  if (typeof probe !== 'function') throw new TypeError('measure({ probe }): probe must be a function')

  const { ffmpegPath, ffprobePath } = resolveBinaries(ffmpeg)

  /**
   * Decode a sample of the file (head 5s, tail 5s, middle 2s) or the whole file.
   * A clean decode means: exit code 0 and no line on stderr (`-v error`).
   * @param {string} filePath
   * @param {{ sample?: 'sample' | 'full', facts?: import('../public/types.d.ts').MediaFacts, durationSec?: number }} [options]
   */
  async function decode(filePath, options = {}) {
    const mode = options.sample === 'full' ? 'full' : 'sample'
    const assertPath = requirePath(filePath)

    let durationSec = numberOrNull(options.durationSec)
    let probeError = null
    if (durationSec === null) {
      try {
        const facts = options.facts ?? await probe(assertPath)
        durationSec = numberOrNull(facts?.durationSec)
      } catch (error) {
        probeError = errorMessage(error)
      }
    }

    if (probeError) {
      return {
        ok: false,
        mode,
        path: assertPath,
        durationSec,
        windows: [],
        stderr: probeError,
        errors: [`[probe] ${probeError}`],
        probeError
      }
    }

    const windows = mode === 'full'
      ? [{ id: 'full', startSec: 0, durationSec: durationSec && durationSec > 0 ? durationSec : null }]
      : planSampleWindows(durationSec)

    /** @type {Array<Record<string, unknown>>} */
    const measured = []
    for (const window of windows) {
      if (window.skipped) {
        measured.push({ ...window, ok: true, stderr: '', clean: true })
        continue
      }
      measured.push(await runDecodeWindow(assertPath, window))
    }

    const executed = measured.filter(window => !window.skipped)
    const stderr = executed
      .map(window => String(window.stderr ?? '').trim())
      .filter(Boolean)
      .join('\n')
    const errors = executed.flatMap(window => {
      const lines = String(window.stderr ?? '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, MAX_ERROR_LINES)
      return lines.map(line => `[${window.id}] ${line}`)
    })

    return {
      ok: executed.every(window => window.ok === true),
      clean: executed.every(window => window.ok === true && window.clean === true),
      mode,
      path: assertPath,
      durationSec,
      windows: measured,
      stderr,
      errors,
      probeError: null
    }
  }

  /**
   * EBU R128 integrated loudness, LRA and true peak of the produced file.
   * @param {string} filePath
   */
  async function loudness(filePath) {
    const assertPath = requirePath(filePath)
    const argv = [
      ffmpegPath,
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-v', 'info',
      '-i', assertPath,
      '-map', '0:a:0',
      '-af', 'ebur128=peak=true',
      '-f', 'null',
      '-'
    ]
    const result = await runTool(argv)
    const parsed = parseEbur128(`${result.stdout}\n${result.stderr}`)
    const stderr = result.stderr || result.stdout
    return {
      ok: result.code === 0 && parsed.integratedLufs !== null,
      code: result.code,
      path: assertPath,
      integratedLufs: parsed.integratedLufs,
      lra: parsed.lra,
      truePeakDb: parsed.truePeakDb,
      summary: parsed.summary,
      raw: parsed.raw,
      stderr,
      errors: splitErrorLines(stderr)
    }
  }

  /**
   * GIF facts: frame count from ffprobe -count_frames, loop from a binary scan
   * of the NETSCAPE2.0 application extension, dimensions/duration from probe.
   * @param {string} filePath
   * @param {{ facts?: import('../public/types.d.ts').MediaFacts }} [options]
   */
  async function gifInfo(filePath, options = {}) {
    const assertPath = requirePath(filePath)
    let facts = options.facts ?? null
    let probeError = null
    if (!facts) {
      try {
        facts = await probe(assertPath)
      } catch (error) {
        probeError = errorMessage(error)
      }
    }

    const probeArgv = [
      ffprobePath,
      '-hide_banner',
      '-v', 'error',
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=nb_read_frames,nb_frames,width,height,avg_frame_rate,codec_name',
      '-of', 'json',
      assertPath
    ]
    const [probeResult, scan] = await Promise.all([
      runTool(probeArgv),
      scanLoopBlock(assertPath)
    ])
    const framesInfo = parseFrameProbe(probeResult.stdout)
    const frames = framesInfo.frames
    const width = numberOrNull(framesInfo.width) ?? numberOrNull(facts?.video?.width)
    const height = numberOrNull(framesInfo.height) ?? numberOrNull(facts?.video?.height)
    const fps = numberOrNull(framesInfo.fps) ?? numberOrNull(facts?.video?.fps)
    const probeDuration = numberOrNull(facts?.durationSec)
    const timingDuration = scan.timing && scan.timing.durationSec > 0 ? scan.timing.durationSec : null
    const frameDuration = frames !== null && fps !== null && fps > 0 ? frames / fps : null
    const durationSec = probeDuration !== null && probeDuration > 0
      ? probeDuration
      : (timingDuration ?? frameDuration)
    const durationSource = probeDuration !== null && probeDuration > 0
      ? 'probe'
      : (timingDuration !== null ? 'gif-delays' : (frameDuration !== null ? 'frames/fps' : null))

    return {
      ok: !probeError && probeResult.code === 0 && frames !== null && !scan.readError,
      path: assertPath,
      frames,
      frameSource: frames === null ? null : 'ffprobe -count_frames',
      width,
      height,
      fps,
      durationSec,
      durationSource,
      timing: scan.timing ?? null,
      loop: scan.loop,
      loopCount: scan.loopCount,
      netscape: scan.netscape,
      malformed: scan.malformed,
      loopScanTruncated: scan.truncated,
      bytes: scan.bytes ?? numberOrNull(facts?.bytes),
      stderr: [probeResult.stderr, scan.readError ? `loop scan: ${scan.readError}` : '']
        .filter(Boolean)
        .join('\n'),
      errors: splitErrorLines(probeResult.stderr),
      probeError
    }
  }

  /** @param {string} filePath */
  async function scanLoopBlock(filePath) {
    try {
      const handle = await open(filePath, 'r')
      try {
        const stat = await handle.stat()
        const truncated = stat.size > MAX_LOOP_SCAN_BYTES
        const bytesToRead = Math.min(stat.size, truncated ? LOOP_SCAN_HEAD_BYTES : MAX_LOOP_SCAN_BYTES)
        const buffer = Buffer.alloc(bytesToRead)
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0)
        const slice = buffer.subarray(0, bytesRead)
        const scan = scanGifLoop(slice)
        return {
          ...scan,
          timing: scanGifTiming(slice),
          truncated,
          bytes: stat.size
        }
      } finally {
        await handle.close()
      }
    } catch (error) {
      return {
        netscape: false,
        loop: false,
        loopCount: null,
        malformed: false,
        truncated: false,
        bytes: null,
        readError: errorMessage(error)
      }
    }
  }

  /**
   * @param {string} filePath
   * @param {{ id: string, startSec?: number, durationSec?: number | null }} window
   */
  async function runDecodeWindow(filePath, window) {
    const argv = [ffmpegPath, '-hide_banner', '-nostdin', '-v', 'error']
    if (window.id !== 'full') {
      argv.push('-ss', formatSeconds(window.startSec ?? 0))
      if (window.durationSec !== null && window.durationSec !== undefined) {
        argv.push('-t', formatSeconds(window.durationSec))
      }
    }
    argv.push('-i', filePath, '-map', '0:v:0?', '-map', '0:a:0?', '-f', 'null', '-')

    const result = await runTool(argv)
    const stderr = result.stderr.trim()
    return {
      id: window.id,
      startSec: window.startSec ?? 0,
      durationSec: window.durationSec ?? null,
      skipped: false,
      code: result.code,
      ok: result.code === 0,
      clean: result.code === 0 && stderr === '',
      stderr
    }
  }

  /** @param {string[]} argv */
  async function runTool(argv) {
    try {
      return normalizeResult(await run(argv))
    } catch (error) {
      return {
        code: -1,
        stdout: '',
        stderr: errorMessage(error),
        spawnError: true
      }
    }
  }

  return Object.freeze({
    decode,
    loudness,
    gifInfo,
    ffmpegPath,
    ffprobePath
  })
}

/**
 * Parse the ffmpeg ebur128 Summary block. `-inf` is preserved as -Infinity
 * (a silent file really has no finite integrated loudness).
 * @param {string} text
 * @returns {{
 *   integratedLufs: number | null,
 *   lra: number | null,
 *   truePeakDb: number | null,
 *   summary: { I: string | null, LRA: string | null, Peak: string | null },
 *   raw: { I: string | null, LRA: string | null, Peak: string | null }
 * }}
 */
export function parseEbur128(text) {
  const source = String(text ?? '')
  const integrated = matchNumber(source, /^\s*I:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*LUFS\b/im)
  const lra = matchNumber(source, /^\s*LRA:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*LU\b/im)
  const peak = matchNumber(source, /^\s*Peak:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dBFS\b/im)

  return {
    integratedLufs: integrated ? integrated.value : null,
    lra: lra ? lra.value : null,
    truePeakDb: peak ? peak.value : null,
    summary: {
      I: integrated ? integrated.text : null,
      LRA: lra ? lra.text : null,
      Peak: peak ? peak.text : null
    },
    raw: {
      I: integrated ? integrated.raw : null,
      LRA: lra ? lra.raw : null,
      Peak: peak ? peak.raw : null
    }
  }
}

/**
 * Scan a GIF byte buffer for a NETSCAPE2.0 application extension.
 * Layout: 21 FF 0B "NETSCAPE2.0" 03 01 <loop lo> <loop hi> 00.
 * loopCount 0 means infinite.
 * @param {Buffer} buffer
 */
export function scanGifLoop(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('scanGifLoop(buffer): buffer must be a Buffer')
  const at = buffer.indexOf(NETSCAPE)
  if (at < 0) {
    return { netscape: false, loop: false, loopCount: null, malformed: false, offset: null }
  }

  const prefixOk = at >= 3 &&
    buffer[at - 3] === 0x21 &&
    buffer[at - 2] === 0xff &&
    buffer[at - 1] === 0x0b
  const sizeAt = at + NETSCAPE.length
  const subBlockOk = buffer.length >= sizeAt + 5 &&
    buffer[sizeAt] === 0x03 &&
    buffer[sizeAt + 1] === 0x01
  if (!prefixOk || !subBlockOk) {
    return { netscape: true, loop: false, loopCount: null, malformed: true, offset: at }
  }

  const loopCount = buffer[sizeAt + 2] | (buffer[sizeAt + 3] << 8)
  return { netscape: true, loop: true, loopCount, malformed: false, offset: at }
}

/**
 * Sum GIF frame delays from the Graphic Control Extensions. Used as a fallback
 * because ffprobe 4.x reports no duration and no frame count for many GIFs.
 * Delay units are 1/100 s. If an image has no GCE its delay is unknown; callers
 * should treat `allFramesHaveDelay === false` as a hint to prefer frames/fps.
 * @param {Buffer} buffer
 */
export function scanGifTiming(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('scanGifTiming(buffer): buffer must be a Buffer')
  const empty = {
    frameCount: 0,
    delayCount: 0,
    totalDelayMs: 0,
    durationSec: 0,
    minDelayMs: null,
    maxDelayMs: null,
    allFramesHaveDelay: false,
    malformed: false
  }
  if (buffer.length < 13) return { ...empty, malformed: true }
  const header = buffer.subarray(0, 6).toString('latin1')
  if (header !== 'GIF89a' && header !== 'GIF87a') return { ...empty, malformed: true }

  const packed = buffer[10]
  let offset = 13
  if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1))

  let frameCount = 0
  let delayCount = 0
  let totalDelayMs = 0
  let minDelayMs = null
  let maxDelayMs = null
  let pendingDelayMs = null

  while (offset < buffer.length) {
    const introducer = buffer[offset++]
    if (introducer === 0x3b) break

    if (introducer === 0x21) {
      if (offset >= buffer.length) break
      const label = buffer[offset++]
      if (label === 0xf9) {
        const size = buffer[offset]
        if (size === 4 && offset + 5 < buffer.length) {
          const delay = buffer[offset + 2] | (buffer[offset + 3] << 8)
          pendingDelayMs = delay * 10
          delayCount += 1
        }
      }
      offset = skipGifSubBlocks(buffer, offset)
      continue
    }

    if (introducer === 0x2c) {
      if (offset + 9 > buffer.length) break
      const imagePacked = buffer[offset + 8]
      offset += 9
      if (imagePacked & 0x80) offset += 3 * (1 << ((imagePacked & 0x07) + 1))
      offset += 1 // LZW minimum code size
      offset = skipGifSubBlocks(buffer, offset)
      frameCount += 1
      if (pendingDelayMs !== null) {
        totalDelayMs += pendingDelayMs
        minDelayMs = minDelayMs === null ? pendingDelayMs : Math.min(minDelayMs, pendingDelayMs)
        maxDelayMs = maxDelayMs === null ? pendingDelayMs : Math.max(maxDelayMs, pendingDelayMs)
        pendingDelayMs = null
      }
      continue
    }

    // Unknown block: stop instead of losing alignment with the byte stream.
    break
  }

  return {
    frameCount,
    delayCount,
    totalDelayMs,
    durationSec: totalDelayMs / 1000,
    minDelayMs,
    maxDelayMs,
    allFramesHaveDelay: frameCount > 0 && delayCount >= frameCount,
    malformed: frameCount === 0 && buffer.length > 13
  }
}

/**
 * Skip a chain of GIF data sub-blocks. `offset` points at the first length byte.
 * @param {Buffer} buffer
 * @param {number} offset
 */
function skipGifSubBlocks(buffer, offset) {
  while (offset < buffer.length) {
    const size = buffer[offset++]
    if (size === 0) return offset
    offset += size
  }
  return buffer.length
}

/**
 * Parse the JSON emitted by `ffprobe -count_frames -of json`.
 * @param {string} stdout
 */
export function parseFrameProbe(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return { frames: null, width: null, height: null, fps: null, codec: null }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) {
      return { frames: null, width: null, height: null, fps: null, codec: null }
    }
    try {
      data = JSON.parse(text.slice(start, end + 1))
    } catch {
      return { frames: null, width: null, height: null, fps: null, codec: null }
    }
  }
  const stream = Array.isArray(data?.streams) ? data.streams[0] : null
  return {
    frames: parseIntOrNull(stream?.nb_read_frames ?? stream?.nb_frames),
    width: parseIntOrNull(stream?.width),
    height: parseIntOrNull(stream?.height),
    fps: parseRational(stream?.avg_frame_rate),
    codec: typeof stream?.codec_name === 'string' ? stream.codec_name : null
  }
}

/**
 * The three sample windows from the design. Windows that would duplicate an
 * already covered range are returned as skipped entries so evidence shows why.
 * @param {number | null} durationSec
 * @returns {Array<{ id: string, startSec: number, durationSec: number, skipped?: boolean, reason?: string }>}
 */
function planSampleWindows(durationSec) {
  const duration = numberOrNull(durationSec)
  const windows = []

  if (!duration || duration <= 0) {
    windows.push({ id: 'head', startSec: 0, durationSec: 5 })
    windows.push({ id: 'tail', startSec: 0, durationSec: 0, skipped: true, reason: '时长未知，无法定位末 5s' })
    windows.push({ id: 'middle', startSec: 0, durationSec: 0, skipped: true, reason: '时长未知，无法定位中段 2s' })
    return windows
  }

  const headDur = Math.min(5, duration)
  windows.push({ id: 'head', startSec: 0, durationSec: headDur })

  if (duration > headDur + 0.05) {
    windows.push({ id: 'tail', startSec: Math.max(0, duration - 5), durationSec: Math.min(5, duration) })
  } else {
    windows.push({ id: 'tail', startSec: 0, durationSec: 0, skipped: true, reason: '素材短于首窗口，已由首 5s 覆盖' })
  }

  const middleStart = Math.max(0, duration / 2 - 1)
  const middleEnd = middleStart + 2
  const tailStart = Math.max(0, duration - 5)
  const coveredByHead = middleEnd <= headDur + 1e-6
  const coveredByTail = middleStart >= tailStart - 1e-6
  if (duration > headDur + 0.05 && !coveredByHead && !coveredByTail) {
    windows.push({ id: 'middle', startSec: middleStart, durationSec: Math.min(2, duration) })
  } else {
    windows.push({ id: 'middle', startSec: 0, durationSec: 0, skipped: true, reason: '与首/末窗口重叠，已覆盖' })
  }

  return windows
}

/**
 * @param {string} ffmpeg
 */
function resolveBinaries(ffmpeg) {
  if (typeof ffmpeg === 'string' && ffmpeg.trim() !== '') {
    return { ffmpegPath: ffmpeg, ffprobePath: deriveFfprobe(ffmpeg) }
  }
  if (ffmpeg && typeof ffmpeg === 'object') {
    const ffmpegPath = stringOrNull(ffmpeg.path) ?? stringOrNull(ffmpeg.ffmpeg) ?? 'ffmpeg'
    const ffprobePath = stringOrNull(ffmpeg.ffprobe) ?? deriveFfprobe(ffmpegPath)
    return { ffmpegPath, ffprobePath }
  }
  return { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' }
}

/**
 * Sibling ffprobe for a given ffmpeg path: ...\ffmpeg.exe -> ...\ffprobe.exe.
 * @param {string} ffmpegPath
 */
function deriveFfprobe(ffmpegPath) {
  const dir = path.dirname(ffmpegPath)
  const base = path.basename(ffmpegPath)
  const probeBase = base.replace(/^ffmpeg(\.exe)?$/i, (_match, exe) => `ffprobe${exe ?? ''}`)
  if (probeBase === base) return 'ffprobe'
  return dir === '.' ? probeBase : path.join(dir, probeBase)
}

/**
 * Normalize whatever the injected runner returned. Accepted shapes:
 * number, { code|exitCode|status }, { ok }, with string/Buffer stdout/stderr.
 * @param {unknown} result
 * @returns {ExecResult}
 */
function normalizeResult(result) {
  if (typeof result === 'number') return { code: result, stdout: '', stderr: '' }
  if (typeof result === 'string') return { code: 0, stdout: result, stderr: '' }
  if (result && typeof result === 'object') {
    const record = /** @type {Record<string, unknown>} */ (result)
    let code = null
    for (const key of ['code', 'exitCode', 'status']) {
      if (typeof record[key] === 'number' && Number.isFinite(record[key])) {
        code = /** @type {number} */ (record[key])
        break
      }
    }
    if (code === null && typeof record.ok === 'boolean') code = record.ok ? 0 : 1
    if (code === null && record.error) code = -1
    const stderr = toText(record.stderr) || (record.error ? errorMessage(record.error) : '')
    return { code: code ?? 0, stdout: toText(record.stdout), stderr }
  }
  return { code: 0, stdout: '', stderr: '' }
}

/** @param {unknown} value */
function toText(value) {
  if (value === null || value === undefined) return ''
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  return String(value)
}

/** @param {string} filePath */
function requirePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('path must be a non-empty string')
  }
  return filePath
}

/** @param {unknown} error */
function errorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error ?? 'unknown error')
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {{ value: number, raw: string, text: string } | null}
 */
function matchNumber(text, pattern) {
  const match = pattern.exec(text)
  if (!match) return null
  const raw = match[1]
  const lower = raw.toLowerCase()
  const value = lower.endsWith('inf') ? (lower.startsWith('-') ? -Infinity : Infinity) : Number(raw)
  if (Number.isNaN(value)) return null
  return { value, raw, text: match[0].trim() }
}

/** @param {unknown} value */
function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** @param {unknown} value */
function stringOrNull(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** @param {unknown} value */
function parseIntOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  return Number.parseInt(value, 10)
}

/** @param {unknown} value */
function parseRational(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(value.trim())
  if (!match) return null
  const numerator = Number(match[1])
  const denominator = Number(match[2])
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  return numerator / denominator
}

/** @param {number} value */
function formatSeconds(value) {
  const rounded = Math.max(0, Math.round(value * 1000) / 1000)
  return String(rounded)
}

/** @param {string} stderr */
function splitErrorLines(stderr) {
  return String(stderr ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, MAX_ERROR_LINES)
}
