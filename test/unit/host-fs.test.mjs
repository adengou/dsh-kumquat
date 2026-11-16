import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { listDirectory } from '../../src/host/fs.js'

async function makeTree() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kq-fs-'))
  await mkdir(path.join(dir, 'sub'))
  await writeFile(path.join(dir, 'b.mp4'), 'x')
  await writeFile(path.join(dir, 'a.txt'), 'x')
  return dir
}

test('目录列表：目录在前、文件在后，返回绝对路径', async () => {
  const dir = await makeTree()
  try {
    const listing = await listDirectory(dir)
    assert.equal(listing.path, path.resolve(dir))
    assert.deepEqual(listing.entries.map((entry) => entry.name), ['sub', 'a.txt', 'b.mp4'])
    assert.equal(listing.entries[0].type, 'dir')
    assert.equal(listing.entries[1].type, 'file')
    assert.equal(listing.parent, path.dirname(path.resolve(dir)))
    assert.equal(listing.truncated, false)
    assert.ok(Array.isArray(listing.roots) && listing.roots.length > 0, '必须返回可切换的根目录')
    assert.ok(Array.isArray(listing.quick), '必须返回常用位置')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('空参数默认列出用户主目录', async () => {
  const listing = await listDirectory('')
  assert.equal(listing.path, os.homedir())
})

test('传入文件而不是目录时报错', async () => {
  const dir = await makeTree()
  try {
    await assert.rejects(() => listDirectory(path.join(dir, 'b.mp4')), /不是目录/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
