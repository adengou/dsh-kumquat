/**
 * Locate and run the ffmpeg/ffprobe binaries for tests and fixture generation.
 *
 * Deliberately imports nothing from `src/` so that the quality suite never
 * couples to the engine implementation (S1). Location order: environment
 * variable, then PATH. ffprobe is resolved as a sibling of ffmpeg first, so a
 * user-provided ffmpeg directory usually yields a working ffprobe too.
 */

import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { mkdtemp, open, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** @typedef {{ code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string, durationMs: number, timedOut: boolean, argv: string[] }} RunResult */
/** @typedef {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number }} RunOptions */

const IS_WINDOWS = process.platform === 'win32'

/**
 * Candidate file names for a logical tool name on this platform.
 * @param {string} base
 * @returns {string[]}
 */
function nameVariants(base) {
  if (!IS_WINDOWS) return [base]
  return base.toLowerCase().endsWith('.exe') ? [base] : [`${base}.exe`, base]
}

/**
 * @param {string} file
 * @returns {boolean}
 */
function isExecutableFile(file) {
  try {
    if (!statSync(file).isFile()) return false
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string[]} names
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
function findOnPath(names, env) {
  const raw = env.PATH ?? env.Path ?? ''
  for (const dir of raw.split(path.delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (isExecutableFile(candidate)) return candidate
    }
  }
  return null
}

/**
 * Resolve a configured value that may be a file path, a directory, or a bare
 * command name.
 * @param {string | undefined} value
 * @param {NodeJS.ProcessEnv} env
 * @param {string} base
 * @returns {string | null}
 */
function resolveConfigured(value, env, base) {
  if (!value) return null
  if (!value.includes('/') && !value.includes('\\')) {
    return findOnPath(nameVariants(value), env) ?? findOnPath(nameVariants(base), env)
  }
  if (isExecutableFile(value)) return path.resolve(value)
  try {
    if (statSync(value).isDirectory()) {
      for (const name of nameVariants(base)) {
        const candidate = path.join(value, name)
        if (isExecutableFile(candidate)) return candidate
      }
    }
  } catch {
    // fall through
  }
  return null
}

/**
 * Find ffmpeg. Order: KUMQUAT_FFMPEG / FFMPEG_PATH / FFMPEG, then PATH.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function findFfmpeg(env = process.env) {
  for (const key of ['KUMQUAT_FFMPEG', 'FFMPEG_PATH', 'FFMPEG']) {
    const hit = resolveConfigured(env[key], env, 'ffmpeg')
    if (hit) return hit
  }
  return findOnPath(nameVariants('ffmpeg'), env)
}

/**
 * Find ffprobe. Order: KUMQUAT_FFPROBE / FFPROBE_PATH / FFPROBE, the directory
 * of ffmpeg, then PATH.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function findFfprobe(env = process.env) {
  for (const key of ['KUMQUAT_FFPROBE', 'FFPROBE_PATH', 'FFPROBE']) {
    const hit = resolveConfigured(env[key], env, 'ffprobe')
    if (hit) return hit
  }
  const ffmpeg = findFfmpeg(env)
  if (ffmpeg) {
    for (const name of nameVariants('ffprobe')) {
      const sibling = path.join(path.dirname(ffmpeg), name)
      if (isExecutableFile(sibling)) return sibling
    }
  }
  return findOnPath(nameVariants('ffprobe'), env)
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function hasFfmpeg(env = process.env) {
  return findFfmpeg(env) !== null
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function hasFfprobe(env = process.env) {
  return findFfprobe(env) !== null
}

/**
 * Run a command with an argv array (never a shell). stdout/stderr are captured;
 * exit codes are returned, not thrown. Callers decide what a non-zero code means.
 *
 * Child output is redirected to temporary files instead of pipes. Some confined
 * environments deny named pipes to child processes (Node then reports EPERM);
 * file descriptors work everywhere and keep the suite runnable there.
 * @param {string[]} argv
 * @param {RunOptions} [opts]
 * @returns {Promise<RunResult>}
 */
export async function run(argv, opts = {}) {
  const started = Date.now()
  const captureDir = await mkdtemp(path.join(os.tmpdir(), 'kumquat-run-'))
  try {
    return await runCaptured(argv, opts, started, captureDir)
  } finally {
    try {
      await rm(captureDir, { recursive: true, force: true })
    } catch {
      // best effort
    }
  }
}

/**
 * @param {string[]} argv
 * @param {RunOptions} opts
 * @param {number} started
 * @param {string} captureDir
 * @returns {Promise<RunResult>}
 */
async function runCaptured(argv, opts, started, captureDir) {
  const { cwd, env = process.env, timeoutMs } = opts
  const stdoutPath = path.join(captureDir, 'stdout.log')
  const stderrPath = path.join(captureDir, 'stderr.log')
  const stdoutHandle = await open(stdoutPath, 'w')
  const stderrHandle = await open(stderrPath, 'w')

  /** @type {import('node:child_process').ChildProcess} */
  let child
  try {
    child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      windowsHide: true,
      stdio: ['ignore', stdoutHandle.fd, stderrHandle.fd],
    })
  } finally {
    await stdoutHandle.close()
    await stderrHandle.close()
  }

  return await new Promise((resolve, reject) => {
    let settled = false
    let timedOut = false
    /** @type {NodeJS.Timeout | undefined} */
    let timer

    /**
     * @param {number | null} code
     * @param {NodeJS.Signals | null} signal
     */
    const finish = async (code, signal) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      const stdout = await readText(stdoutPath)
      const stderr = await readText(stderrPath)
      resolve({
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        argv,
      })
    }

    const terminate = () => {
      if (!child || child.exitCode !== null) return
      if (IS_WINDOWS) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          }).on('error', () => {})
        } catch {
          child.kill()
        }
      } else {
        child.kill('SIGKILL')
      }
    }

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        terminate()
      }, timeoutMs)
    }

    child.on('error', (error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      void finish(code, signal)
    })
  })
}

/**
 * @param {string} file
 * @returns {Promise<string>}
 */
async function readText(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Probe a media file through ffprobe and return its parsed JSON document.
 * @param {string} input
 * @param {{ countFrames?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<any>}
 */
export async function probeJson(input, opts = {}) {
  const ffprobe = findFfprobe()
  if (!ffprobe) {
    throw new Error('ffprobe not found: install ffmpeg (essentials includes ffprobe) or set KUMQUAT_FFPROBE')
  }
  const argv = [ffprobe, '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams']
  if (opts.countFrames) argv.push('-count_frames')
  argv.push(input)

  const result = await run(argv, { timeoutMs: opts.timeoutMs ?? 60_000 })
  if (result.timedOut) {
    throw new Error(`ffprobe timed out after ${opts.timeoutMs ?? 60_000}ms on ${input}`)
  }
  if (result.code !== 0) {
    throw new Error(`ffprobe failed (exit ${result.code}) on ${input}: ${result.stderr.trim()}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`ffprobe produced non-JSON output for ${input}: ${String(error)}`)
  }
}

/**
 * Count decoded video frames. GIF containers do not carry a frame count in
 * their header, so this is the only reliable way to assert “≈60 frames”.
 * @param {string} input
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<number>}
 */
export async function countVideoFrames(input, opts = {}) {
  const json = await probeJson(input, { countFrames: true, timeoutMs: opts.timeoutMs })
  /** @type {any[]} */
  const streams = Array.isArray(json.streams) ? json.streams : []
  const video = streams.find((stream) => stream.codec_type === 'video')
  if (!video) throw new Error(`no video stream in ${input}`)
  const count = Number(video.nb_read_frames ?? video.nb_frames)
  if (!Number.isFinite(count)) throw new Error(`ffprobe reported no frame count for ${input}`)
  return count
}

/**
 * Container duration from a probe result, or null when the container does not
 * store one (GIFs written by ffmpeg are a common case).
 * @param {any} probeResult
 * @returns {number | null}
 */
export function durationOf(probeResult) {
  const seconds = Number(probeResult?.format?.duration)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/**
 * Human-readable one-line media summary, used by fixture generation output.
 * @param {any} probeResult
 * @returns {string}
 */
export function describeMedia(probeResult) {
  /** @type {any[]} */
  const streams = Array.isArray(probeResult?.streams) ? probeResult.streams : []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const parts = []
  if (video) {
    const rate = String(video.avg_frame_rate ?? '0/0')
    const [num, den] = rate.split('/').map(Number)
    const fps = den ? num / den : rate
    parts.push(`${video.width}x${video.height}@${Number.isFinite(fps) ? Number(fps.toFixed(2)) : fps}fps ${video.codec_name}`)
  }
  if (audio) parts.push(`${audio.codec_name} ${audio.sample_rate}Hz ${audio.channels}ch`)
  const duration = durationOf(probeResult)
  if (duration !== null) parts.push(`${duration.toFixed(2)}s`)
  return parts.join(' · ') || 'no streams'
}

/**
 * @param {string} file
 * @returns {boolean}
 */
export function fileExists(file) {
  try {
    return existsSync(file) && statSync(file).isFile()
  } catch {
    return false
  }
}
