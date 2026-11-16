/**
 * Unit tests for src/binary/status.js.
 *
 * `-version` is injected, so the tests create ordinary files with the right names
 * instead of real executables. That keeps the state machine (cached / incomplete /
 * corrupt / unsupported) testable on any OS, including in CI without FFmpeg.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { binaryNames, defaultRoot, platformDir, rememberRoot, status } from '../../src/binary/status.js'

/** @type {string} */
let root
before(() => {
  root = mkdtempSync(join(tmpdir(), 'kumquat-status-'))
})
after(() => {
  rmSync(root, { recursive: true, force: true })
})

/**
 * Write stub binaries for a platform/arch pair.
 * @param {string} platform
 * @param {string} arch
 * @param {{ ffmpeg?: boolean, ffprobe?: boolean, bytes?: number }} [opts]
 */
function stubInstall(platform, arch, opts = {}) {
  return stubInstallAt(root, platform, arch, opts)
}

/**
 * Write stub binaries under an explicit root.
 * @param {string} base
 * @param {string} platform
 * @param {string} arch
 * @param {{ ffmpeg?: boolean, ffprobe?: boolean, bytes?: number }} [opts]
 */
function stubInstallAt(base, platform, arch, opts = {}) {
  const dir = platformDir(base, platform, arch)
  mkdirSync(dir, { recursive: true })
  const names = binaryNames(platform)
  const bytes = opts.bytes ?? 4096
  if (opts.ffmpeg !== false) writeFileSync(join(dir, names.ffmpeg), Buffer.alloc(bytes, 1))
  if (opts.ffprobe !== false) writeFileSync(join(dir, names.ffprobe), Buffer.alloc(bytes, 2))
  return dir
}

describe('status: layout', () => {
  test('platformDir is <root>/<platform>-<arch>', () => {
    assert.equal(platformDir('/tmp/kc', 'win32', 'x64'), join('/tmp/kc', 'win32-x64'))
    assert.equal(platformDir('/tmp/kc', 'darwin', 'arm64'), join('/tmp/kc', 'darwin-arm64'))
  })

  test('binary names carry .exe only on Windows', () => {
    assert.deepEqual(binaryNames('win32'), { ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' })
    assert.deepEqual(binaryNames('linux'), { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' })
    assert.deepEqual(binaryNames('darwin'), { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' })
  })

  test('defaultRoot is <DSH home>/kumquat', () => {
    const dsh = join(tmpdir(), 'dsh-home')
    assert.equal(defaultRoot({ DSH_HOME: dsh }, '/home/x'), join(resolve(dsh), 'kumquat'))
    assert.equal(defaultRoot({}, '/home/x'), join('/home/x', '.dsh', 'kumquat'))
  })
})

describe('status: states', () => {
  test('nothing installed → missing / not-installed, with a download size hint', async () => {
    const result = await status({ root: join(root, 'empty'), platform: 'win32', arch: 'x64' })
    assert.equal(result.state, 'missing')
    assert.equal(result.reason, 'not-installed')
    assert.equal(result.path, null)
    assert.equal(result.version, null)
    assert.ok(result.sizeHint > 50 * 1024 * 1024, 'sizeHint is the archive size to download')
    assert.equal(result.autoInstallAllowed, true)
    assert.equal(result.ffmpeg, join(join(root, 'empty'), 'win32-x64', 'ffmpeg.exe'))
  })

  test('both binaries answer -version → cached', async () => {
    const dir = stubInstall('win32', 'arm64')
    const result = await status({
      root,
      platform: 'win32',
      arch: 'arm64',
      readVersionImpl: async (exe, o) => (o?.tool === 'ffprobe' ? '9.0.2' : '9.0.2'),
    })
    assert.equal(result.state, 'cached')
    assert.equal(result.reason, 'ready')
    assert.equal(result.version, '9.0.2')
    assert.equal(result.path, join(dir, 'ffmpeg.exe'))
    assert.equal(result.sizeHint, 8192, 'on-disk size of both binaries')
  })

  test('only one binary present → incomplete', async () => {
    stubInstall('linux', 'arm64', { ffprobe: false })
    const result = await status({ root, platform: 'linux', arch: 'arm64', readVersionImpl: async () => '9.0.2' })
    assert.equal(result.state, 'missing')
    assert.equal(result.reason, 'incomplete')
    assert.match(result.hint, /ffprobe/)
  })

  test('binaries present but not runnable → corrupt', async () => {
    stubInstall('linux', 'x64')
    const result = await status({ root, platform: 'linux', arch: 'x64', readVersionImpl: async () => null })
    assert.equal(result.state, 'missing')
    assert.equal(result.reason, 'corrupt')
    assert.match(result.hint, /do not run/)
  })

  test('one binary fails -version → corrupt', async () => {
    stubInstall('linux', 'x64')
    const result = await status({
      root,
      platform: 'linux',
      arch: 'x64',
      readVersionImpl: async (exe, o) => (o?.tool === 'ffprobe' ? null : '9.0.2'),
    })
    assert.equal(result.state, 'missing')
    assert.equal(result.reason, 'corrupt')
  })

  test('macOS has no automatic source → unsupported', async () => {
    const result = await status({ root: join(root, 'mac'), platform: 'darwin', arch: 'arm64' })
    assert.equal(result.state, 'missing')
    assert.equal(result.reason, 'unsupported')
    assert.equal(result.autoInstallAllowed, false)
  })

  test('status() is callable with no arguments (Host contract)', async () => {
    const result = await status({ platform: 'linux', arch: 's390x' })
    assert.equal(result.state, 'missing')
    assert.ok(result.dir.endsWith('linux-s390x'))
  })

  test('a no-argument status() remembers the last install root', async () => {
    const custom = join(root, 'custom-root')
    stubInstallAt(custom, 'win32', 'x64')
    rememberRoot(custom)
    const result = await status({
      platform: 'win32',
      arch: 'x64',
      readVersionImpl: async () => '9.9.9',
    })
    assert.equal(result.state, 'cached')
    assert.equal(result.version, '9.9.9')
    assert.equal(result.dir, platformDir(custom, 'win32', 'x64'))
  })
})
