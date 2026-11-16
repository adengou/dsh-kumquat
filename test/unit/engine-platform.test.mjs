import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { platform } from '../../src/engine/platform/index.js'
import * as darwin from '../../src/engine/platform/darwin.js'
import * as linux from '../../src/engine/platform/linux.js'
import * as win32 from '../../src/engine/platform/win32.js'

test('platform exposes exactly one host adapter', () => {
  assert.ok(['win32', 'darwin', 'linux'].includes(platform.name))
  assert.equal(typeof platform.arch, 'string')
  assert.equal(platform.detached, platform.name !== 'win32')
  assert.equal(typeof platform.tmpDir, 'function')
  assert.equal(typeof platform.defaultOutputDir, 'function')
  assert.equal(typeof platform.killTree, 'function')
  assert.equal(typeof platform.longPath, 'function')
})

test('tmpDir is a writable ASCII subdirectory', () => {
  const dir = platform.tmpDir()
  assert.equal(path.basename(dir), 'kumquat')
  assert.equal(statSync(dir).isDirectory(), true)
  assert.equal(platform.tmpDir(), dir)
})

test('defaultOutputDir points at a Kumquat folder', () => {
  const dir = platform.defaultOutputDir()
  assert.equal(path.isAbsolute(dir), true)
  assert.equal(path.basename(dir), 'Kumquat')
  assert.equal(dir.includes('\u0000'), false)
})

test('killTree ignores invalid pids', async () => {
  assert.equal(await platform.killTree(0), false)
  assert.equal(await platform.killTree(-123), false)
  assert.equal(await platform.killTree(1.5), false)
})

test('non-Windows longPath is the identity; win32 only prefixes when needed', () => {
  assert.equal(darwin.longPath('C:\\short\\file.mp4'), 'C:\\short\\file.mp4')
  assert.equal(linux.longPath('/tmp/short.mp4'), '/tmp/short.mp4')

  const short = 'C:\\work\\clip.mp4'
  assert.equal(win32.longPath(short), short)

  const long = `C:\\${'a'.repeat(300)}\\clip.mp4`
  assert.equal(win32.longPath(long), `\\\\?\\${long}`)

  const longUnc = `\\\\server\\share\\${'b'.repeat(300)}\\clip.mp4`
  assert.equal(win32.longPath(longUnc), `\\\\?\\UNC\\${longUnc.slice(2)}`)

  const prefixed = `\\\\?\\C:\\${'c'.repeat(300)}\\clip.mp4`
  assert.equal(win32.longPath(prefixed), prefixed)
})
