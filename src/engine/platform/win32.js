/**
 * Windows platform adapter.
 *
 * Every OS-specific quirk lives here. The rest of the engine only talks to
 * `platform/index.js`, so it never has to read `process.platform` itself.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'win32'

/** Windows has no POSIX process groups; process-tree kills go through taskkill. */
export const detached = false

/**
 * A writable scratch directory with an ASCII leaf name.
 * @returns {string}
 */
export function tmpDir() {
  const dir = path.join(os.tmpdir(), 'kumquat')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * `Downloads\Kumquat` next to the user profile, falling back to the home dir.
 * @returns {string}
 */
export function defaultOutputDir() {
  const home = os.homedir()
  const env = process.env
  const candidates = [
    env.USERPROFILE ? path.join(env.USERPROFILE, 'Downloads') : '',
    path.join(home, 'Downloads'),
    env.OneDrive ? path.join(env.OneDrive, 'Downloads') : '',
    env.OneDriveConsumer ? path.join(env.OneDriveConsumer, 'Downloads') : '',
    home,
  ].filter(Boolean)
  const base = candidates.find(isDirectory) ?? home
  return path.join(base, 'Kumquat')
}

/**
 * Force-kill a process and all of its children.
 * `taskkill /T /F` is the only way to reach grandchildren on Windows. When it
 * is denied (some restricted job objects), fall back to terminating the root
 * process so the caller is not left waiting forever.
 * @param {number} pid
 * @returns {Promise<boolean>} whether taskkill or the root kill succeeded
 */
export async function killTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(false)
  const taskkillOk = await new Promise((resolve) => {
    let child
    try {
      child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } catch {
      resolve(false)
      return
    }
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
  if (taskkillOk) return true
  try {
    process.kill(pid)
    return true
  } catch {
    return false
  }
}

/**
 * Prefix an over-long absolute path with `\\?\` (or `\\?\UNC\`).
 * Short paths are returned untouched so display strings stay readable.
 * @param {string} p
 * @returns {string}
 */
export function longPath(p) {
  if (typeof p !== 'string' || p.length === 0) return p
  if (p.startsWith('\\\\?\\')) return p
  if (p.length < 248) return p
  if (p.startsWith('\\\\')) return `\\\\?\\UNC\\${p.slice(2)}`
  if (/^[a-zA-Z]:[\\/]/.test(p)) return `\\\\?\\${p}`
  return p
}

/** @param {string} p */
function isDirectory(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
