/**
 * Linux platform adapter.
 */
import { mkdirSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const name = 'linux'

/** POSIX spawns are detached into their own process group so the whole tree can be signalled. */
export const detached = true

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
 * `~/Downloads/Kumquat`, falling back to `~/Kumquat` when Downloads is absent.
 * @returns {string}
 */
export function defaultOutputDir() {
  const home = os.homedir()
  const downloads = path.join(home, 'Downloads')
  return path.join(isDirectory(downloads) ? downloads : home, 'Kumquat')
}

/**
 * Kill a detached process group: SIGTERM, brief grace period, then SIGKILL.
 * @param {number} pid group leader pid (the process we spawned)
 * @param {{ graceMs?: number }} [options]
 * @returns {Promise<boolean>} whether a signal was delivered
 */
export async function killTree(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  const graceMs = Number.isFinite(options.graceMs) ? options.graceMs : 250
  const sent = signalTree(pid, 'SIGTERM')
  await delay(graceMs)
  signalTree(pid, 'SIGKILL')
  return sent
}

/** @param {number} p @param {NodeJS.Signals} signal */
function signalTree(p, signal) {
  try {
    process.kill(-p, signal)
    return true
  } catch {
    // Fall back to the single pid (e.g. the child was not a group leader).
    try {
      process.kill(p, signal)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Linux has no long-path prefix. Kept for a uniform platform interface.
 * @param {string} p
 * @returns {string}
 */
export function longPath(p) {
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
