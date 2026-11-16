/**
 * Platform facade. This is the only place the engine asks Node which OS it is
 * running on; everything else imports `platform` from here.
 */
import os from 'node:os'
import * as darwin from './darwin.js'
import * as linux from './linux.js'
import * as win32 from './win32.js'

const impl = process.platform === 'win32' ? win32 : process.platform === 'darwin' ? darwin : linux

/**
 * @typedef {object} Platform
 * @property {string} name         Node platform id (`win32` | `darwin` | `linux`)
 * @property {string} arch         Node arch id (`x64`, `arm64`, ...)
 * @property {boolean} detached    spawn detached (POSIX process group) or not
 * @property {() => string} tmpDir
 * @property {() => string} defaultOutputDir
 * @property {(pid: number, options?: { graceMs?: number }) => Promise<boolean>} killTree
 * @property {(p: string) => string} longPath
 */

/** @type {Platform} */
export const platform = Object.freeze({
  name: impl.name,
  arch: os.arch(),
  detached: impl.detached,
  tmpDir: impl.tmpDir,
  defaultOutputDir: impl.defaultOutputDir,
  killTree: impl.killTree,
  longPath: impl.longPath,
})

export default platform
