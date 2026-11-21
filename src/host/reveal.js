/**
 * Reveal a produced file in the OS file manager.
 *
 * The desktop Host runs under Electron, but `shell` is not always reachable
 * from a dynamically imported plugin module. The native command is the primary
 * path (works in every Host process); Electron's shell is the fallback.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'

/**
 * @param {string} target
 * @param {(command: string, args: string[], options: object) => any} [spawnImpl]
 * @returns {boolean} true when a file manager was launched
 */
export function revealNative(target, spawnImpl = spawn) {
  try {
    if (process.platform === 'win32') {
      const child = spawnImpl('explorer.exe', ['/select,', target], { detached: true, stdio: 'ignore' })
      if (child && typeof child.unref === 'function') child.unref()
      return true
    }
    if (process.platform === 'darwin') {
      const child = spawnImpl('open', ['-R', target], { detached: true, stdio: 'ignore' })
      if (child && typeof child.unref === 'function') child.unref()
      return true
    }
    const child = spawnImpl('xdg-open', [path.dirname(target)], { detached: true, stdio: 'ignore' })
    if (child && typeof child.unref === 'function') child.unref()
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} target
 * @param {{
 *   loadElectron?: () => Promise<any>,
 *   native?: boolean,
 *   spawnImpl?: (command: string, args: string[], options: object) => any,
 * }} [options]
 * @returns {Promise<{ supported: boolean, ok?: boolean }>}
 */
export async function revealPath(target, options = {}) {
  if (typeof target !== 'string' || target === '') return { supported: false }

  if (options.native !== false && revealNative(target, options.spawnImpl)) {
    return { supported: true, ok: true }
  }

  const load = typeof options.loadElectron === 'function'
    ? options.loadElectron
    : () => import('electron')
  let loaded
  try {
    loaded = await load()
  } catch {
    return { supported: false }
  }
  const electron = loaded && loaded.shell ? loaded : (loaded && loaded.default) || loaded
  const shell = electron && electron.shell
  if (!shell || typeof shell.showItemInFolder !== 'function') return { supported: false }
  shell.showItemInFolder(target)
  return { supported: true, ok: true }
}
