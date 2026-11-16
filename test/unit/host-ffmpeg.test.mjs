/**
 * FFmpeg install jobs: progress normalization, one job at a time, wiring
 * failure when the binary manager is absent, and cancellation on disposal.
 */

import assert from 'node:assert/strict'
import { resolve as resolvePath } from 'node:path'
import test from 'node:test'

import { createInstaller, normalizeStatus, PHASES, STATUS_STATES } from '../../src/host/ffmpeg.js'

/**
 * Wait until a predicate holds.
 * @param {() => boolean} predicate - Condition to poll.
 * @param {number} [timeoutMs] - Give-up delay.
 * @returns {Promise<void>} Resolves once true.
 */
async function until(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(done => setTimeout(done, 5))
  }
  throw new Error('condition not met in time')
}

/** A manager whose install settles only when the test releases it. */
function gatedManager() {
  /** @type {() => void} */
  let release = () => {}
  const gate = new Promise((resolve) => {
    release = resolve
  })
  return {
    release,
    module: {
      installBinary: async ({ onProgress, signal }) => {
        onProgress({ phase: 'download', received: 25, total: 100 })
        await gate
        if (signal.aborted) throw new Error('aborted')
        onProgress({ phase: 'extract', received: 100, total: 100 })
        onProgress({ phase: 'verify' })
        return { state: 'cached', path: resolvePath('tmp', 'ffmpeg.exe'), version: '6.1.1' }
      },
      status: async () => ({ state: 'missing' }),
    },
  }
}

test('normalizeStatus 接受管理器的三种状态，并保留可选字段', () => {
  assert.deepEqual(normalizeStatus({ state: 'system', path: '/usr/bin/ffmpeg', version: '6.1.1' }), {
    state: 'system',
    path: '/usr/bin/ffmpeg',
    version: '6.1.1',
  })
  assert.deepEqual(normalizeStatus({ path: 'C:/kumquat/ffmpeg.exe' }), {
    state: 'cached',
    path: 'C:/kumquat/ffmpeg.exe',
  })
  assert.deepEqual(normalizeStatus({ state: 'missing', sizeHint: 80_000_000 }), {
    state: 'missing',
    sizeHint: 80_000_000,
  })
  assert.deepEqual(normalizeStatus(null), { state: 'missing' })
  assert.deepEqual(normalizeStatus({ state: 'weird' }), { state: 'missing' })
  assert.ok(STATUS_STATES.every(state => ['system', 'cached', 'missing'].includes(state)))
})

test('二进制管理器缺失时，状态查询给出 E_WIRING 而不是崩溃', async () => {
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    loadManager: async () => undefined,
  })

  await assert.rejects(installer.status(), (error) => {
    assert.equal(error.code, 'E_WIRING')
    assert.match(error.message, /尚未接线/)
    assert.match(error.hint, /ffmpegPath/)
    return true
  })
  installer.dispose()
})

test('安装过程把回调归一化为 download/extract/verify/done 并算出百分比', async () => {
  const manager = gatedManager()
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    loadManager: async () => manager.module,
  })

  const outcome = installer.start()
  assert.equal('jobId' in outcome, true)
  const jobId = /** @type {{ jobId: string }} */ (outcome).jobId

  await until(() => installer.progress(jobId)?.received === 25)
  assert.deepEqual(installer.progress(jobId), { phase: 'download', received: 25, total: 100, percent: 25 })

  manager.release()
  await until(() => installer.progress(jobId)?.phase === 'done')
  assert.deepEqual(installer.progress(jobId), {
    phase: 'done',
    state: 'cached',
    version: '6.1.1',
    received: 100,
    total: 100,
    percent: 100,
  })
  assert.equal(installer.runningJobId(), undefined)
  assert.ok(PHASES.includes('done'))
  installer.dispose()
})

test('同一时间只允许一个安装任务', async () => {
  const manager = gatedManager()
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    loadManager: async () => manager.module,
  })

  const first = /** @type {{ jobId: string }} */ (installer.start())
  const second = installer.start()

  assert.deepEqual(second, { busy: true, jobId: first.jobId })
  assert.equal(installer.runningJobId(), first.jobId)

  manager.release()
  await until(() => installer.progress(first.jobId)?.phase === 'done')
  assert.equal('jobId' in installer.start(), true, '前一个任务结束后可以再装')
  installer.dispose()
})

test('autoDownload=false 时 start 直接拒绝，不触碰管理器', async () => {
  let loads = 0
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    autoDownload: false,
    loadManager: async () => {
      loads += 1
      return undefined
    },
  })

  assert.deepEqual(installer.start(), { disabled: true })
  assert.equal(loads, 0)
  installer.dispose()
})

test('管理器抛错时任务进入 error 阶段并保留原因', async () => {
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    loadManager: async () => ({
      installBinary: async () => {
        throw new Error('sha256 校验不通过')
      },
      status: async () => ({ state: 'missing' }),
    }),
  })

  const jobId = /** @type {{ jobId: string }} */ (installer.start()).jobId
  await until(() => installer.progress(jobId)?.phase === 'error')
  assert.equal(installer.progress(jobId)?.error, 'sha256 校验不通过')
  installer.dispose()
})

test('未知进度阶段不会让面板倒退，字节数仍然更新', async () => {
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    loadManager: async () => ({
      installBinary: async ({ onProgress }) => {
        onProgress({ phase: 'download', received: 10, total: 40 })
        onProgress({ phase: 'sha256', received: 20, total: 40 })
        return { state: 'cached', version: '6.1.1' }
      },
      status: async () => ({ state: 'missing' }),
    }),
  })

  const jobId = /** @type {{ jobId: string }} */ (installer.start()).jobId
  await until(() => installer.progress(jobId)?.phase === 'done')
  // The synthetic phase was ignored, so the byte counters still moved forward
  // and completion pins the percentage.
  assert.deepEqual(installer.progress(jobId), {
    phase: 'done',
    state: 'cached',
    version: '6.1.1',
    received: 20,
    total: 40,
    percent: 100,
  })
  installer.dispose()
})

test('dispose 会中止正在进行的安装任务', async () => {
  let seenSignal
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    loadManager: async () => ({
      installBinary: async ({ signal }) => {
        seenSignal = signal
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
        return { state: 'cached' }
      },
      status: async () => ({ state: 'missing' }),
    }),
  })

  const jobId = /** @type {{ jobId: string }} */ (installer.start()).jobId
  await until(() => seenSignal !== undefined)
  installer.dispose()

  assert.equal(seenSignal.aborted, true)
  await until(() => installer.progress(jobId) === undefined)
  assert.equal(installer.progress(jobId), undefined, '释放后任务表清空')
})

test('未知的任务编号返回 undefined', () => {
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null, root: resolvePath('tmp', 'kumquat'), loadManager: async () => undefined })
  assert.equal(installer.progress('ffmpeg-does-not-exist'), undefined)
  installer.dispose()
})

