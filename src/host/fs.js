/**
 * Read-only directory listing for the in-panel file browser.
 * Absolute paths only; no writes, no uploads.
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const MAX_ENTRIES = 500

async function exists(target) {
  try {
    const info = await stat(target)
    return info.isDirectory()
  } catch {
    return false
  }
}

/** Drives on Windows, filesystem root elsewhere. */
async function listRoots() {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }]
  const roots = []
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`
    if (await exists(root)) roots.push({ name: root.slice(0, 2), path: root })
  }
  return roots
}

/** A few places users actually look for media. */
async function listQuick() {
  const home = os.homedir()
  const candidates = [
    { name: '主目录', path: home },
    { name: '桌面', path: path.join(home, 'Desktop') },
    { name: '下载', path: path.join(home, 'Downloads') },
    { name: '视频', path: path.join(home, 'Videos') },
  ]
  const quick = []
  for (const item of candidates) {
    if (await exists(item.path)) quick.push(item)
  }
  return quick
}

/**
 * @param {string} [target]
 * @returns {Promise<{ path: string, parent: string,
 *   entries: Array<{ name: string, path: string, type: 'dir' | 'file' }>,
 *   roots: Array<{ name: string, path: string }>,
 *   quick: Array<{ name: string, path: string }>,
 *   truncated: boolean }>}
 */
export async function listDirectory(target) {
  const input = typeof target === 'string' ? target.trim() : ''
  if (input.includes('\0')) throw new Error('路径包含非法字符')

  const [roots, quick] = await Promise.all([listRoots(), listQuick()])
  const dir = input === '' ? os.homedir() : path.resolve(input)
  const info = await stat(dir)
  if (!info.isDirectory()) throw new Error('不是目录')

  const dirents = await readdir(dir, { withFileTypes: true })
  const rows = dirents
    .filter((entry) => entry.name !== '.' && entry.name !== '..')
    .map((entry) => ({
      name: entry.name,
      path: path.join(dir, entry.name),
      type: entry.isDirectory() ? 'dir' : 'file',
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })

  const parent = path.dirname(dir)
  return {
    path: dir,
    parent: parent === dir ? '' : parent,
    entries: rows.slice(0, MAX_ENTRIES),
    roots,
    quick,
    truncated: rows.length > MAX_ENTRIES,
  }
}
