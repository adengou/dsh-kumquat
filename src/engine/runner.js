/**
 * Process runner for FFmpeg-style child processes.
 *
 * Hard rules:
 * - argv is always an array of strings and never goes through a shell;
 * - stdout/stderr are truncated to the last 256 KiB each;
 * - `-progress pipe:1` key/value output is parsed into callback updates;
 * - timeout and cancellation kill the whole process tree, not just the child.
 *
 * In pipe-restricted sandboxes (Windows job objects that deny named pipes),
 * spawning with piped stdio fails with EPERM. The runner then retries with
 * file-backed stdio and reads the tails after exit: output still arrives, but
 * progress updates are delivered at the end instead of streaming. Outside
 * such sandboxes the normal streaming path is used.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, openSync } from 'node:fs'
import { open, rm } from 'node:fs/promises'
import path from 'node:path'
import { platform } from './platform/index.js'

/** @typedef {{ outTimeUs: number, seconds: number, speed: number, done: boolean }} ProgressInfo */

/**
 * @typedef {object} RunResult
 * @property {number} code       Exit code; -1 when killed or signalled
 * @property {string} stdout     Last 256 KiB of stdout
 * @property {string} stderr     Last 256 KiB of stderr
 * @property {number} ms         Wall-clock duration
 * @property {boolean} cancelled True when cancelled or timed out by us
 * @property {boolean} timedOut  True when the timeout fired
 * @property {boolean} [stalled]  True when progress stopped for longer than stallMs
 */

const MAX_OUTPUT_BYTES = 256 * 1024

/**
 * Run a command.
 * @param {string[]} argv full argv, argv[0] is the executable
 * @param {{ signal?: AbortSignal, timeoutMs?: number, onProgress?: (info: ProgressInfo) => void }} [options]
 * @returns {Promise<RunResult>}
 */
export async function run(argv, options = {}) {
  assertArgv(argv)

  const signal = options.signal
  const timeoutMs = options.timeoutMs
  const onProgress = options.onProgress
  const stallMs = Number(options.stallMs) > 0 ? Number(options.stallMs) : 0

  if (signal?.aborted) {
    return { code: -1, stdout: '', stderr: '', ms: 0, cancelled: true, timedOut: false }
  }

  const startedAt = performance.now()
  let processInfo
  try {
    processInfo = startProcess(argv)
  } catch (error) {
    throw startError(argv[0], error)
  }

  const { child } = processInfo
  const stdout = new TailBuffer(MAX_OUTPUT_BYTES)
  const stderr = new TailBuffer(MAX_OUTPUT_BYTES)

  let timedOut = false
  let stalled = false
  let aborted = false
  let killRequested = false
  let settled = false
  let timer = null
  let stallTimer = null

  const requestKill = () => {
    if (killRequested || settled) return
    killRequested = true
    void Promise.resolve(platform.killTree(child.pid)).catch(() => {})
  }

  const touchStall = () => {
    if (stallMs === 0) return
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => { stalled = true; requestKill() }, stallMs)
  }
  const progress = createProgressReader(argv, (info) => {
    touchStall()
    if (onProgress) onProgress(info)
  })
  touchStall()

  return await new Promise((resolve, reject) => {
    const cleanup = () => {
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (stallTimer) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
      if (signal) signal.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      aborted = true
      requestKill()
    }

    if (processInfo.mode === 'pipe') {
      child.stdout.on('data', (chunk) => {
        stdout.push(chunk)
        progress.feed(chunk)
      })
      child.stderr.on('data', (chunk) => stderr.push(chunk))
    }

    child.once('error', (error) => {
      cleanup()
      reject(startError(argv[0], error))
    })

    child.once('close', (code) => {
      cleanup()
      if (processInfo.mode === 'file') {
        void collectFileOutput(processInfo, stdout, stderr, progress).then(() => {
          const out = result(code, stdout, stderr, startedAt, timedOut || aborted, timedOut)
          out.stalled = stalled
          resolve(out)
        })
        return
      }
      progress.flush()
      const out = result(code, stdout, stderr, startedAt, timedOut || aborted, timedOut)
      out.stalled = stalled
      resolve(out)
    })

    if (signal) {
      if (signal.aborted) {
        aborted = true
        requestKill()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        requestKill()
      }, timeoutMs)
    }
  })
}

/**
 * @param {number | null} code
 * @param {TailBuffer} stdout
 * @param {TailBuffer} stderr
 * @param {number} startedAt
 * @param {boolean} cancelled
 * @param {boolean} timedOut
 * @returns {RunResult}
 */
function result(code, stdout, stderr, startedAt, cancelled, timedOut) {
  return {
    code: Number.isInteger(code) ? code : -1,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    ms: Math.round(performance.now() - startedAt),
    cancelled,
    timedOut,
  }
}

/**
 * Start with pipes; fall back to files only when the sandbox denies pipes.
 * @param {string[]} argv
 * @returns {{ child: import('node:child_process').ChildProcess, mode: 'pipe' | 'file', stdoutPath?: string, stderrPath?: string }}
 */
function startProcess(argv) {
  try {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: platform.detached,
    })
    return { child, mode: 'pipe' }
  } catch (error) {
    if (error?.code !== 'EPERM') throw error
    return startFileProcess(argv)
  }
}

/**
 * @param {string[]} argv
 */
function startFileProcess(argv) {
  const dir = platform.tmpDir()
  const id = `${process.pid}-${randomUUID()}`
  const stdoutPath = path.join(dir, `run-${id}.out`)
  const stderrPath = path.join(dir, `run-${id}.err`)

  let stdoutFd
  let stderrFd
  try {
    stdoutFd = openSync(stdoutPath, 'w')
    stderrFd = openSync(stderrPath, 'w')
  } catch (error) {
    if (stdoutFd !== undefined) closeSync(stdoutFd)
    if (stderrFd !== undefined) closeSync(stderrFd)
    void rm(stdoutPath, { force: true }).catch(() => {})
    void rm(stderrPath, { force: true }).catch(() => {})
    throw error
  }

  let child
  try {
    child = spawn(argv[0], argv.slice(1), {
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
      detached: platform.detached,
    })
  } catch (error) {
    closeSync(stdoutFd)
    closeSync(stderrFd)
    void rm(stdoutPath, { force: true }).catch(() => {})
    void rm(stderrPath, { force: true }).catch(() => {})
    throw error
  }
  closeSync(stdoutFd)
  closeSync(stderrFd)
  return { child, mode: 'file', stdoutPath, stderrPath }
}

/**
 * @param {{ stdoutPath?: string, stderrPath?: string }} processInfo
 * @param {TailBuffer} stdout
 * @param {TailBuffer} stderr
 * @param {{ feed: (chunk: Buffer) => void, flush: () => void }} progress
 * @returns {Promise<void>}
 */
async function collectFileOutput(processInfo, stdout, stderr, progress) {
  const [stdoutTail, stderrTail] = await Promise.all([
    readTail(processInfo.stdoutPath, MAX_OUTPUT_BYTES),
    readTail(processInfo.stderrPath, MAX_OUTPUT_BYTES),
  ])
  stdout.push(stdoutTail)
  stderr.push(stderrTail)
  progress.feed(stdoutTail)
  progress.flush()
}

/**
 * Read the last `limit` bytes of a file and remove it.
 * @param {string | undefined} file
 * @param {number} limit
 * @returns {Promise<Buffer>}
 */
async function readTail(file, limit) {
  if (!file) return Buffer.alloc(0)
  let handle
  try {
    handle = await open(file, 'r')
    const info = await handle.stat()
    const length = Math.min(info.size, limit)
    const buffer = Buffer.alloc(length)
    if (length > 0) await handle.read(buffer, 0, length, info.size - length)
    return buffer
  } catch {
    return Buffer.alloc(0)
  } finally {
    if (handle) await handle.close().catch(() => {})
    await rm(file, { force: true }).catch(() => {})
  }
}

/**
 * Parse `-progress pipe:1` key/value blocks.
 * ffmpeg's legacy `out_time_ms` also carries microseconds, hence the same divisor.
 * @param {string[]} argv
 * @param {((info: ProgressInfo) => void) | undefined} onProgress
 */
function createProgressReader(argv, onProgress) {
  if (typeof onProgress !== 'function' || !progressRequested(argv)) {
    return { feed() {}, flush() {} }
  }

  let pending = ''
  let outTimeUs = 0
  let speed = 0
  let done = false

  const emit = () => {
    try {
      onProgress({ outTimeUs, seconds: outTimeUs / 1e6, speed, done })
    } catch {
      // A UI callback must never break the process run.
    }
  }

  const handleLine = (line) => {
    const eq = line.indexOf('=')
    if (eq <= 0) return
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()

    if (key === 'out_time_us' || key === 'out_time_ms') {
      const micros = Number(value)
      if (Number.isFinite(micros) && micros >= 0) outTimeUs = micros
    } else if (key === 'speed') {
      const parsed = Number.parseFloat(value)
      speed = Number.isFinite(parsed) ? parsed : 0
    } else if (key === 'progress') {
      done = value === 'end'
      emit()
    }
  }

  return {
    feed(chunk) {
      pending += chunk.toString('utf8')
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, '').trim()
        pending = pending.slice(newline + 1)
        if (line) handleLine(line)
        newline = pending.indexOf('\n')
      }
    },
    flush() {
      const line = pending.replace(/\r$/, '').trim()
      pending = ''
      if (line) handleLine(line)
    },
  }
}

/** @param {string[]} argv */
function progressRequested(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-progress') return argv[i + 1] === 'pipe:1'
    if (argv[i].startsWith('-progress=')) return argv[i].slice('-progress='.length) === 'pipe:1'
  }
  return false
}

/** @param {string[]} argv */
function assertArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new TypeError('run(argv): argv must be a non-empty array of strings')
  }
  for (const arg of argv) {
    if (typeof arg !== 'string') {
      throw new TypeError('run(argv): every argv entry must be a string; shell strings are not accepted')
    }
  }
}

/**
 * @param {string} command
 * @param {NodeJS.ErrnoException | undefined} cause
 */
function startError(command, cause) {
  const reason =
    cause?.code === 'ENOENT'
      ? 'executable not found'
      : cause?.code === 'EACCES' || cause?.code === 'EPERM'
        ? 'permission denied while starting the process'
        : cause?.message || 'unknown startup error'
  const error = new Error(
    `Failed to start "${command}": ${reason}. ` +
      'Check that FFmpeg is installed and that the executable path is correct.',
  )
  if (cause?.code) error.code = cause.code
  error.cause = cause
  return error
}

/** Keeps only the trailing `limit` bytes without unbounded memory growth. */
class TailBuffer {
  /** @param {number} limit */
  constructor(limit) {
    this.limit = limit
    /** @type {Buffer[]} */
    this.chunks = []
    this.size = 0
  }

  /** @param {Buffer} chunk */
  push(chunk) {
    if (chunk.length === 0) return
    this.chunks.push(chunk)
    this.size += chunk.length
    while (this.size > this.limit) {
      const excess = this.size - this.limit
      const first = this.chunks[0]
      if (first.length <= excess) {
        this.chunks.shift()
        this.size -= first.length
      } else {
        this.chunks[0] = first.subarray(excess)
        this.size -= excess
      }
    }
  }

  /** @returns {string} */
  toString() {
    return Buffer.concat(this.chunks, this.size).toString('utf8')
  }
}





