import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { findFfmpeg, resolveFfmpeg } from '../../src/engine/locate.js'
import { platform } from '../../src/engine/platform/index.js'

const FFMPEG = platform.name === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const FFPROBE = platform.name === 'win32' ? 'ffprobe.exe' : 'ffprobe'
const INSTALL_WORD = platform.name === 'win32' ? 'winget' : platform.name === 'darwin' ? 'brew' : 'apt'

/** @param {import('node:test').TestContext} t */
async function tempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kumquat-locate-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

/** @param {string} dir @param {string} name */
async function makeExe(dir, name) {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), '', 'utf8')
}

/** @param {string} dir @param {string} name */
function exePath(dir, name) {
  return path.join(dir, name)
}

function fakeRunner() {
  return async (command) => {
    const base = path.basename(command).toLowerCase()
    const isProbe = base.startsWith('ffprobe')
    return {
      code: 0,
      stdout: `${isProbe ? 'ffprobe' : 'ffmpeg'} version 6.1.1-fixture Copyright`,
      stderr: '',
    }
  }
}

/** @param {string} root @param {Record<string, unknown>} [extra] */
function options(root, extra = {}) {
  return {
    env: { PATH: '' },
    platform: platform.name,
    arch: 'testarch',
    home: path.join(root, 'home'),
    commonDirs: [],
    managedDir: path.join(root, 'managed-does-not-exist'),
    runVersion: fakeRunner(),
    ...extra,
  }
}

test('resolveFfmpeg prefers the configured path over env and PATH', async (t) => {
  const root = await tempRoot(t)
  const explicit = path.join(root, 'explicit')
  const fromEnv = path.join(root, 'env')
  const fromPath = path.join(root, 'path')
  for (const dir of [explicit, fromEnv, fromPath]) {
    await makeExe(dir, FFMPEG)
    await makeExe(dir, FFPROBE)
  }

  const found = await resolveFfmpeg(
    options(root, {
      ffmpegPath: explicit,
      env: { KUMQUAT_FFMPEG: fromEnv, PATH: fromPath },
    }),
  )

  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(explicit, FFMPEG))
  assert.equal(found.ffprobe, exePath(explicit, FFPROBE))
  assert.equal(found.version, '6.1.1')
})

test('resolveFfmpeg orders KUMQUAT_FFMPEG before DSH_FFMPEG', async (t) => {
  const root = await tempRoot(t)
  const kumquat = path.join(root, 'kumquat')
  const dsh = path.join(root, 'dsh')
  for (const dir of [kumquat, dsh]) {
    await makeExe(dir, FFMPEG)
    await makeExe(dir, FFPROBE)
  }

  const found = await resolveFfmpeg(
    options(root, { env: { KUMQUAT_FFMPEG: kumquat, DSH_FFMPEG: dsh } }),
  )

  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(kumquat, FFMPEG))
})

test('resolveFfmpeg orders PATH before common folders', async (t) => {
  const root = await tempRoot(t)
  const fromPath = path.join(root, 'path')
  const common = path.join(root, 'common')
  for (const dir of [fromPath, common]) {
    await makeExe(dir, FFMPEG)
    await makeExe(dir, FFPROBE)
  }

  const found = await resolveFfmpeg(
    options(root, { env: { PATH: fromPath }, commonDirs: [common] }),
  )

  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(fromPath, FFMPEG))
})

test('resolveFfmpeg falls back to a common folder', async (t) => {
  const root = await tempRoot(t)
  const common = path.join(root, 'common')
  await makeExe(common, FFMPEG)
  await makeExe(common, FFPROBE)

  const found = await resolveFfmpeg(options(root, { commonDirs: [common] }))

  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(common, FFMPEG))
})

test('resolveFfmpeg finds the managed ~/.dsh/kumquat/bin/<platform>-<arch> folder', async (t) => {
  const root = await tempRoot(t)
  const home = path.join(root, 'home')
  const managed = path.join(home, '.dsh', 'kumquat', 'bin', `${platform.name}-testarch`)
  await makeExe(managed, FFMPEG)
  await makeExe(managed, FFPROBE)

  const found = await resolveFfmpeg(
    options(root, { home, managedDir: undefined }),
  )

  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(managed, FFMPEG))
  assert.equal(found.ffprobe, exePath(managed, FFPROBE))
})

test('resolveFfmpeg returns null without spawning anything when nothing exists', async (t) => {
  const root = await tempRoot(t)
  let calls = 0
  const found = await resolveFfmpeg(
    options(root, {
      runVersion: async () => {
        calls += 1
        return { code: 0, stdout: 'ffmpeg version 6.1.1', stderr: '' }
      },
    }),
  )

  assert.equal(found, null)
  assert.equal(calls, 0, 'no candidate means no -version probe')
})

test('findFfmpeg explains how to install FFmpeg when nothing exists', async (t) => {
  const root = await tempRoot(t)

  await assert.rejects(findFfmpeg(options(root)), (error) => {
    assert.match(error.message, /FFmpeg was not found/)
    assert.match(error.message, /KUMQUAT_FFMPEG/)
    assert.match(error.message, new RegExp(INSTALL_WORD))
    return true
  })
})

test('resolveFfmpeg returns null when ffprobe is missing; findFfmpeg names it', async (t) => {
  const root = await tempRoot(t)
  const dir = path.join(root, 'ffmpeg-only')
  await makeExe(dir, FFMPEG)

  assert.equal(await resolveFfmpeg(options(root, { ffmpegPath: dir })), null)
  await assert.rejects(findFfmpeg(options(root, { ffmpegPath: dir })), (error) => {
    assert.match(error.message, /ffprobe was not found/)
    assert.match(error.message, /KUMQUAT_FFPROBE/)
    return true
  })
})

test('ffprobe prefers the ffmpeg sibling over PATH', async (t) => {
  const root = await tempRoot(t)
  const ffmpegDir = path.join(root, 'bin')
  const otherDir = path.join(root, 'other')
  await makeExe(ffmpegDir, FFMPEG)
  await makeExe(ffmpegDir, FFPROBE)
  await makeExe(otherDir, FFPROBE)

  const found = await resolveFfmpeg(
    options(root, { ffmpegPath: ffmpegDir, env: { PATH: otherDir } }),
  )

  assert.ok(found)
  assert.equal(found.ffprobe, exePath(ffmpegDir, FFPROBE))
})

test('ffprobe falls back to PATH when the ffmpeg folder has none', async (t) => {
  const root = await tempRoot(t)
  const ffmpegDir = path.join(root, 'bin')
  const probeDir = path.join(root, 'probe')
  await makeExe(ffmpegDir, FFMPEG)
  await makeExe(probeDir, FFPROBE)

  const found = await resolveFfmpeg(
    options(root, { ffmpegPath: ffmpegDir, env: { PATH: probeDir } }),
  )

  assert.ok(found)
  assert.equal(found.ffprobe, exePath(probeDir, FFPROBE))
})

test('a configured executable file path is accepted and validated', async (t) => {
  const root = await tempRoot(t)
  const dir = path.join(root, 'bin')
  await makeExe(dir, FFMPEG)
  await makeExe(dir, FFPROBE)

  const found = await resolveFfmpeg(options(root, { ffmpegPath: exePath(dir, FFMPEG) }))
  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(dir, FFMPEG))
})

test('a candidate that fails -version is skipped', async (t) => {
  const root = await tempRoot(t)
  const bad = path.join(root, 'bad')
  const good = path.join(root, 'good')
  await makeExe(bad, FFMPEG)
  await makeExe(bad, FFPROBE)
  await makeExe(good, FFMPEG)
  await makeExe(good, FFPROBE)

  const found = await resolveFfmpeg(
    options(root, {
      ffmpegPath: bad,
      env: { KUMQUAT_FFMPEG: good },
      runVersion: async (command) => {
        if (command.startsWith(bad)) return { code: 1, stdout: '', stderr: 'not executable' }
        return fakeRunner()(command)
      },
    }),
  )

  assert.ok(found)
  assert.equal(found.ffmpeg, exePath(good, FFMPEG))
})

test('parse handles release, n-prefixed and git version strings', async (t) => {
  const root = await tempRoot(t)
  const dir = path.join(root, 'bin')
  await makeExe(dir, FFMPEG)
  await makeExe(dir, FFPROBE)

  /** @param {string} stdout */
  const withVersion = (stdout) =>
    options(root, {
      ffmpegPath: dir,
      runVersion: async (command) => ({
        code: 0,
        stdout: command.includes(FFPROBE) ? 'ffprobe version 6.1.1' : stdout,
        stderr: '',
      }),
    })

  const release = await resolveFfmpeg(withVersion('ffmpeg version n6.1.1-essentials_build Copyright'))
  assert.equal(release?.version, '6.1.1')

  const gitBuild = await resolveFfmpeg(withVersion('ffmpeg version N-112233-gabc123 Copyright'))
  assert.equal(gitBuild?.version, 'N-112233-gabc123')
})
