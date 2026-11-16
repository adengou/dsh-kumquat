/**
 * Read-only directory listing for the in-panel file browser.
 * Absolute paths only; no writes, no uploads.
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const MAX_ENTRIES = 500

/**
 * @param {string} [target]
 * @returns {Promise<{ path: string, parent: string, entries: Array<{ name: string, path: string, type: 'dir' | 'file' }>, truncated: boolean }>}
 */
export async function listDirectory(target) {
  const input = typeof target === 'string' ? target.trim() : ''
  if (input.includes('\0')) throw new Error('路径包含非法字符')
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
    truncated: rows.length > MAX_ENTRIES,
  }
}
