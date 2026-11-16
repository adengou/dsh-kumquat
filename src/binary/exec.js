/**
 * Process helper for the binary manager.
 *
 * Why this exists: `child_process.spawn` with `stdio: 'pipe'` fails with EPERM
 * inside DSH's confined sandbox (the child cannot open the pipe handles), while
 * redirecting stdout/stderr to real files works everywhere. So every external
 * command here writes its output to a temp file and the file is read back.
 * Same behaviour on Windows, macOS and Linux, no shell involved.
 */

import { spawn } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { binaryError } from './errors.js'

/**
 * @typedef {object} RunResult
 * @property {number} code Process exit code (also set when the process failed to spawn: -1).
 * @property {string} stdout Captured stdout, truncated to `maxOutputBytes` from the end.
 * @property {string} stderr Captured stderr, truncated to `maxOutputBytes` from the end.
 */

/**
 * Run `command` with `args`, capturing stdout/stderr through temp files.
 *
 * @param {string} command Absolute or PATH-resolved executable.
 * @param {string[]} args
 * @param {object} [opts]
 * @param {string} [opts.cwd] Working directory.
 * @param {number} [opts.timeoutMs] Kill after this long. Default 30000.
 * @param {number} [opts.maxOutputBytes] Keep at most this many bytes of each stream. Default 1 MiB.
 * @param {NodeJS.ProcessEnv} [opts.env] Environment. Defaults to `process.env`.
 * @returns {Promise<RunResult>}
 */
export async function runToFile(command, args, opts = {}) {
  const { cwd, timeoutMs = 30_000, maxOutputBytes = 1024 * 1024, env } = opts
  const workDir = mkdtempSync(join(tmpdir(), 'kumquat-exec-'))
  const outPath = join(workDir, 'stdout.txt')
  const errPath = join(workDir, 'stderr.txt')
  const outFd = openSync(outPath, 'w')
  const errFd = openSync(errPath, 'w')

  return await new Promise((resolve, reject) => {
    let settled = false

    /** Read one capture file and drop it. */
    const readCapture = (path) => {
      let text = ''
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        text = ''
      }
      return text.length > maxOutputBytes ? text.slice(text.length - maxOutputBytes) : text
    }

    const finish = (fn) => {
      if (settled) return
      settled = true
      try {
        closeSync(outFd)
      } catch {}
      try {
        closeSync(errFd)
      } catch {}
      try {
        rmSync(workDir, { recursive: true, force: true })
      } catch {}
      fn()
    }

    /** @type {import('node:child_process').ChildProcess} */
    let child
    try {
      child = spawn(command, args, {
        cwd,
        env: env ?? process.env,
        stdio: ['ignore', outFd, errFd],
        windowsHide: true,
      })
    } catch (err) {
      finish(() => reject(binaryError('E_BINARY_IO', `Cannot start ${command}: ${errText(err)}`,
        'The executable could not be started. Check that the file exists and is executable.', { cause: err })))
      return
    }

    const timer = timeoutMs > 0
      ? setTimeout(() => {
        try {
          child.kill()
        } catch {}
        finish(() => reject(binaryError('E_BINARY_TIMEOUT', `${command} did not finish within ${timeoutMs}ms`,
          'The command hung. This usually means the binary is corrupt or blocked by antivirus.')))
      }, timeoutMs)
      : null
    if (timer && typeof timer.unref === 'function') timer.unref()

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      finish(() => reject(binaryError('E_BINARY_IO', `Cannot start ${command}: ${errText(err)}`,
        'The executable could not be started. Check that the file exists and is executable.', { cause: err })))
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      const stdout = readCapture(outPath)
      const stderr = readCapture(errPath)
      finish(() => resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr }))
    })
  })
}

/**
 * Extract the version token from `ffmpeg -version` / `ffprobe -version` output.
 *
 * @param {string} stdout
 * @param {string} [tool] 'ffmpeg' or 'ffprobe'; defaults to either.
 * @returns {string|null} e.g. "9.0.2", "6.1.1-essentials_build-www.gyan.dev", or null.
 */
export function parseVersion(stdout, tool) {
  const name = tool === 'ffprobe' ? 'ffprobe' : tool === 'ffmpeg' ? 'ffmpeg' : '(?:ffmpeg|ffprobe)'
  const re = new RegExp(`^${name} version (\\S+)`, 'm')
  const m = re.exec(String(stdout ?? ''))
  return m ? m[1] : null
}

/**
 * Run `<exe> -version` and return the parsed version, or null when it does not
 * behave like a working FFmpeg build.
 *
 * @param {string} exe
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.tool]
 * @returns {Promise<string|null>}
 */
export async function readVersion(exe, opts = {}) {
  try {
    const res = await runToFile(exe, ['-version'], { timeoutMs: opts.timeoutMs ?? 15_000 })
    if (res.code !== 0) return null
    return parseVersion(res.stdout, opts.tool) ?? parseVersion(res.stdout)
  } catch {
    return null
  }
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function errText(err) {
  if (!err) return 'unknown error'
  if (typeof err === 'string') return err
  const e = /** @type {any} */ (err)
  return String(e.code || e.message || err)
}
