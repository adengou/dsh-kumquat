/**
 * Reveal a produced file in the OS file manager (desktop only).
 * Returns `supported: false` where Electron is unavailable, so the caller can
 * fall back to copying the path.
 */

/**
 * @param {string} target
 * @param {{ loadElectron?: () => Promise<any> }} [options]
 * @returns {Promise<{ supported: boolean, ok?: boolean }>}
 */
export async function revealPath(target, options = {}) {
  if (typeof target !== 'string' || target === '') return { supported: false }
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
