/**
 * Native file picker for the desktop client.
 *
 * The web client has no filesystem dialog, so this returns `supported: false`
 * there and the caller falls back to the in-panel browser. Only absolute paths
 * leave this module; file contents never do.
 */

/**
 * @param {{
 *   loadElectron?: () => Promise<any>,
 *   filters?: Array<{ name: string, extensions: string[] }>,
 * }} [options]
 * @returns {Promise<{ supported: boolean, canceled?: boolean, path?: string, reason?: string }>}
 */
export async function pickFile(options = {}) {
  const load = typeof options.loadElectron === 'function'
    ? options.loadElectron
    : () => import('electron')

  let loaded
  try {
    loaded = await load()
  } catch {
    return { supported: false, reason: 'no-electron' }
  }
  const electron = loaded && loaded.dialog ? loaded : (loaded && loaded.default) || loaded
  const dialog = electron && electron.dialog
  if (!dialog || typeof dialog.showOpenDialog !== 'function') {
    return { supported: false, reason: 'no-dialog' }
  }

  const filters = Array.isArray(options.filters) && options.filters.length > 0
    ? options.filters
    : [
      { name: '媒体文件', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac', 'gif'] },
      { name: '所有文件', extensions: ['*'] },
    ]

  let window
  try {
    const Window = electron.BrowserWindow
    window = Window && typeof Window.getFocusedWindow === 'function' ? Window.getFocusedWindow() : undefined
  } catch {
    window = undefined
  }

  const result = window
    ? await dialog.showOpenDialog(window, { title: '选择视频或音频文件', properties: ['openFile'], filters })
    : await dialog.showOpenDialog({ title: '选择视频或音频文件', properties: ['openFile'], filters })

  if (!result || result.canceled === true) return { supported: true, canceled: true }
  const first = Array.isArray(result.filePaths) ? result.filePaths[0] : ''
  if (typeof first !== 'string' || first === '') return { supported: true, canceled: true }
  return { supported: true, canceled: false, path: first }
}
