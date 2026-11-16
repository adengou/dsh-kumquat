/**
 * Native dialogs for the desktop client: open file, open folder, save file.
 *
 * The web client has no filesystem dialogs, so this returns `supported: false`
 * there and the caller falls back to the in-panel browser.
 */
import path from 'node:path'
import os from 'node:os'

const MEDIA_FILTERS = [
  { name: '媒体文件', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'vdat', 'sdv', 'mp3', 'm4a', 'wav', 'flac', 'gif'] },
  { name: '所有文件', extensions: ['*'] },
]

function safeName(raw) {
  const text = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'Kumquat.mp4'
  return text.replace(/[\\/:*?"<>|]/g, '_')
}

/**
 * @param {{
 *   loadElectron?: () => Promise<any>,
 *   filters?: Array<{ name: string, extensions: string[] }>,
 *   directory?: boolean,
 *   save?: boolean,
 *   defaultName?: string,
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
    : MEDIA_FILTERS

  let window
  try {
    const Window = electron.BrowserWindow
    window = Window && typeof Window.getFocusedWindow === 'function' ? Window.getFocusedWindow() : undefined
  } catch {
    window = undefined
  }

  if (options.save === true) {
    if (typeof dialog.showSaveDialog !== 'function') {
      return { supported: false, reason: 'no-save-dialog' }
    }
    const defaultPath = path.join(os.homedir(), safeName(options.defaultName))
    const saveOptions = {
      title: '选择保存位置',
      defaultPath,
      filters,
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    }
    const saved = window
      ? await dialog.showSaveDialog(window, saveOptions)
      : await dialog.showSaveDialog(saveOptions)
    if (!saved || saved.canceled === true) return { supported: true, canceled: true }
    const filePath = typeof saved.filePath === 'string' ? saved.filePath : ''
    if (filePath === '') return { supported: true, canceled: true }
    return { supported: true, canceled: false, path: filePath }
  }

  const directory = options.directory === true
  const title = directory ? '选择输出文件夹' : '选择视频或音频文件'
  const properties = directory ? ['openDirectory', 'createDirectory'] : ['openFile']
  const dialogOptions = directory ? { title, properties } : { title, properties, filters }

  const result = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)

  if (!result || result.canceled === true) return { supported: true, canceled: true }
  const first = Array.isArray(result.filePaths) ? result.filePaths[0] : ''
  if (typeof first !== 'string' || first === '') return { supported: true, canceled: true }
  return { supported: true, canceled: false, path: first }
}
