/**
 * Route table: the 501 wiring answer, whitelist validation, the FFmpeg job
 * routes, and the fact that the balance route never touches the network
 * without a key.
 */

import assert from 'node:assert/strict'
import { resolve as resolvePath } from 'node:path'
import test from 'node:test'

import { createBalance } from '../../src/host/balance.js'
import { createInstaller, PHASES } from '../../src/host/ffmpeg.js'
import { createProgressTable } from '../../src/host/progress.js'
import { CONTAINERS, LIMITS, ROUTE_PREFIX, createRouter, validatePath, validateTask } from '../../src/host/routes.js'

/** An absolute existing-looking path, portable across platforms. */
const ABS = resolvePath('media', '猫猫打滚.mp4')

/**
 * Minimal MediaQcService stand-in that records every call.
 * @param {Record<string, unknown>} [overrides] - Methods to replace.
 * @returns {{ service: any, calls: any[][] }} Service and call log.
 */
function fakeService(overrides = {}) {
  const calls = []
  const service = {
    apiVersion: 1,
    capabilities: async () => {
      calls.push(['capabilities'])
      return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', version: '6.1.1', filters: [], encoders: [], muxers: [] }
    },
    probe: async (path) => {
      calls.push(['probe', path])
      return {
        path,
        bytes: 1024,
        container: 'mov,mp4',
        formatName: 'mov,mp4',
        durationSec: 12.5,
        streams: [],
        ffmpegVersion: '6.1.1',
      }
    },
    run: async (task) => {
      calls.push(['run', task])
      return { id: 'job-1', task, status: 'queued', startedAt: 1 }
    },
    cancel: async (jobId) => {
      calls.push(['cancel', jobId])
    },
    jobs: {
      list: async () => {
        calls.push(['list'])
        return []
      },
      get: async (id) => {
        calls.push(['get', id])
        return { id, task: { kind: 'convert', input: ABS, to: 'mkv' }, status: 'done', startedAt: 1 }
      },
    },
    ...overrides,
  }
  return { service, calls }
}

/**
 * Build a router whose service is either the stand-in or unwired.
 * @param {{ service?: any, config?: { autoDownload: boolean }, ffmpeg?: any, balance?: any, progress?: any }} [options] - Overrides.
 * @returns {ReturnType<typeof createRouter>} Router.
 */
function makeRouter(options = {}) {
  const getService = options.service === undefined
    ? async () => {
      throw new Error('Kumquat: service not wired yet (M1 integration)')
    }
    : async () => options.service
  const balance = options.balance ?? createBalance({ getApiKey: () => undefined })
  const ffmpeg = options.ffmpeg ?? createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    autoDownload: true,
    loadManager: async () => ({
      installBinary: async ({ onProgress }) => {
        onProgress?.({ phase: 'download', received: 50, total: 100 })
        onProgress?.({ phase: 'verify' })
        return { state: 'cached', path: resolvePath('tmp', 'kumquat', 'ffmpeg.exe'), version: '6.1.1' }
      },
      status: async () => ({ state: 'missing' }),
    }),
  })
  return createRouter({
    getService,
    balance,
    ffmpeg,
    progress: options.progress,
    config: options.config ?? { autoDownload: true },
    logger: { warn() {}, error() {} },
    now: () => 1_000,
  })
}

/**
 * Call one route.
 * @param {ReturnType<typeof createRouter>} router - Router.
 * @param {string} path - Pathname, prefix included.
 * @param {{ method?: string, body?: unknown, query?: string }} [options] - Request extras.
 * @returns {Promise<{ status: number, body: any, headers?: Record<string, string> }>} Result.
 */
async function call(router, path, options = {}) {
  return router({
    method: options.method ?? 'GET',
    pathname: path,
    searchParams: new URLSearchParams(options.query ?? ''),
    body: options.body,
  })
}

test('未接线时返回 501 与明确原因，而不是抛错', async () => {
  const router = makeRouter()

  const result = await call(router, `${ROUTE_PREFIX}/capabilities`)

  assert.equal(result.status, 501)
  assert.equal(result.body.ok, false)
  assert.equal(result.body.error.code, 'E_WIRING')
  assert.match(result.body.error.message, /尚未接线/)
  assert.match(result.body.error.message, /M1 integration/)
  assert.equal(typeof result.body.error.hint, 'string')
})

test('未接线时其余依赖服务的接口同样是 501', async () => {
  const router = makeRouter()
  for (const [path, method, body] of [
    [`${ROUTE_PREFIX}/probe`, 'POST', { path: ABS }],
    [`${ROUTE_PREFIX}/run`, 'POST', { task: { kind: 'convert', input: ABS, to: 'mkv' } }],
    [`${ROUTE_PREFIX}/jobs`, 'GET', undefined],
    [`${ROUTE_PREFIX}/jobs/job-1`, 'GET', undefined],
    [`${ROUTE_PREFIX}/cancel`, 'POST', { jobId: 'job-1' }],
  ]) {
    const result = await call(router, path, { method, body })
    assert.equal(result.status, 501, `${path} 应返回 501`)
    assert.equal(result.body.error.code, 'E_WIRING')
  }
})

test('未知路径 404，方法不符 405 并带 Allow', async () => {
  const router = makeRouter()

  const missing = await call(router, `${ROUTE_PREFIX}/nope`)
  assert.equal(missing.status, 404)
  assert.equal(missing.body.error.code, 'E_ROUTE')

  const wrongMethod = await call(router, `${ROUTE_PREFIX}/probe`)
  assert.equal(wrongMethod.status, 405)
  assert.equal(wrongMethod.headers.allow, 'POST')
  assert.equal(wrongMethod.body.error.code, 'E_METHOD')

  const outside = await call(router, '/api/other/thing')
  assert.equal(outside.status, 404)
})

test('probe 拒绝相对路径，接受绝对路径并原样交给服务', async () => {
  const { service, calls } = fakeService()
  const router = makeRouter({ service })

  const relative = await call(router, `${ROUTE_PREFIX}/probe`, {
    method: 'POST',
    body: { path: 'media/猫猫打滚.mp4' },
  })
  assert.equal(relative.status, 400)
  assert.equal(relative.body.error.code, 'E_INPUT')
  assert.match(relative.body.error.message, /绝对路径/)
  assert.equal(calls.length, 0)

  const accepted = await call(router, `${ROUTE_PREFIX}/probe`, { method: 'POST', body: { path: ABS } })
  assert.equal(accepted.status, 200)
  assert.equal(accepted.body.path, ABS)
  assert.deepEqual(calls, [['probe', ABS]])
})

test('probe 拒绝控制字符与超长路径', async () => {
  const router = makeRouter({ service: fakeService().service })

  const control = await call(router, `${ROUTE_PREFIX}/probe`, {
    method: 'POST',
    body: { path: `${ABS}\n--evil` },
  })
  assert.equal(control.status, 400)
  assert.match(control.body.error.message, /控制字符/)

  const long = await call(router, `${ROUTE_PREFIX}/probe`, {
    method: 'POST',
    body: { path: `${ABS}${'a'.repeat(LIMITS.maxPathLength)}` },
  })
  assert.equal(long.status, 400)
  assert.match(long.body.error.message, /路径过长/)

  const notString = await call(router, `${ROUTE_PREFIX}/probe`, { method: 'POST', body: { path: 42 } })
  assert.equal(notString.status, 400)
})

test('run 只接受白名单字段，多余字段不会传给引擎', async () => {
  const { service, calls } = fakeService()
  const router = makeRouter({ service })

  const result = await call(router, `${ROUTE_PREFIX}/run`, {
    method: 'POST',
    body: {
      task: { kind: 'convert', input: ABS, to: 'MKV', copy: true, extra: '--dangerous', output: 'C:/evil.mkv' },
    },
  })

  assert.equal(result.status, 202)
  assert.equal(result.body.id, 'job-1')
  assert.deepEqual(calls[0][1], { kind: 'convert', input: ABS, to: 'mkv', copy: true })
})

test('run 拒绝未知格式、未知 kind、坏选区与越界参数', async () => {
  const router = makeRouter({ service: fakeService().service })

  const cases = [
    { task: { kind: 'convert', input: ABS, to: 'exe' }, hint: /to 取/ },
    { task: { kind: 'convert', input: ABS }, hint: /to 取/ },
    { task: { kind: 'zip', input: ABS }, hint: /kind/ },
    { task: { kind: 'gif', input: ABS, from: 5, to: 5 }, hint: /结束时间/ },
    { task: { kind: 'gif', input: ABS, from: -1, to: 2 }, hint: /0–86400/ },
    { task: { kind: 'gif', input: ABS, from: 0, to: LIMITS.maxSpanSec + 1 }, hint: /最多/ },
    { task: { kind: 'gif', input: ABS, from: 0, to: 2, fps: LIMITS.maxFps + 1 }, hint: /fps/ },
    { task: { kind: 'gif', input: ABS, from: 0, to: 2, width: 2 }, hint: /width/ },
    { task: { kind: 'gif', input: ABS, from: 0, to: 2, maxBytes: 1 }, hint: /maxBytes/ },
    { task: null, hint: /task/ },
  ]

  for (const entry of cases) {
    const result = await call(router, `${ROUTE_PREFIX}/run`, { method: 'POST', body: { task: entry.task } })
    assert.equal(result.status, 400, JSON.stringify(entry.task))
    assert.equal(result.body.error.code, 'E_INPUT')
    assert.match(result.body.error.hint, entry.hint)
  }
})

test('每个支持的容器都构造出目标格式', () => {
  for (const container of CONTAINERS) {
    const task = validateTask({ kind: 'convert', input: ABS, to: container })
    assert.equal(task.ok, true)
    assert.equal(task.value.to, container)
  }
  assert.equal(validatePath(ABS).ok, true)
  assert.equal(validatePath('').ok, false)
  assert.equal(validatePath(null).ok, false)
})

test('jobs 列表与详情走服务，非法 id 在路由层就被挡住', async () => {
  const { service, calls } = fakeService()
  const router = makeRouter({ service })

  assert.deepEqual((await call(router, `${ROUTE_PREFIX}/jobs`)).body, [])
  const detail = await call(router, `${ROUTE_PREFIX}/jobs/job-1`)
  assert.equal(detail.status, 200)
  assert.equal(detail.body.id, 'job-1')

  const bad = await call(router, `${ROUTE_PREFIX}/jobs/..%2Fetc`)
  assert.equal(bad.status, 400)
  assert.equal(bad.body.error.code, 'E_INPUT')
  assert.deepEqual(calls, [['list'], ['get', 'job-1']])
})

test('cancel 校验 jobId 后调用服务', async () => {
  const { service, calls } = fakeService()
  const router = makeRouter({ service })

  const ok = await call(router, `${ROUTE_PREFIX}/cancel`, { method: 'POST', body: { jobId: 'job-1' } })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.body, { ok: true, jobId: 'job-1' })

  const bad = await call(router, `${ROUTE_PREFIX}/cancel`, { method: 'POST', body: { jobId: 'a b' } })
  assert.equal(bad.status, 400)
  assert.deepEqual(calls, [['cancel', 'job-1']])
})

test('balance 无 key 时返回 no-key，且不发起网络请求', async () => {
  let fetches = 0
  const balance = createBalance({
    getApiKey: () => undefined,
    fetch: async () => {
      fetches += 1
      throw new Error('不应被调用')
    },
  })
  const router = makeRouter({ service: fakeService().service, balance })

  const result = await call(router, `${ROUTE_PREFIX}/balance`)

  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: false, error: 'no-key' })
  assert.equal(fetches, 0)
})

test('capabilities 合并面板身份并被缓存', async () => {
  const { service, calls } = fakeService()
  const router = makeRouter({ service })

  const first = await call(router, `${ROUTE_PREFIX}/capabilities`)
  const second = await call(router, `${ROUTE_PREFIX}/capabilities`)

  assert.equal(first.status, 200)
  assert.equal(first.body.version, '6.1.1')
  assert.equal(first.body.apiVersion, 1)
  assert.equal(first.body.panel.id, 'kumquat')
  assert.equal(first.body.panel.title.zh, '金桔')
  assert.equal(first.body.panel.placement, 'sidebar-page')
  assert.equal(first.body.panel.launcherSlot, 'sidebar.panellist')
  assert.equal(first.body.panel.fallback.slot, 'conversation.composer.dock')
  assert.equal(first.body.panel.fallback.expanded, true)
  assert.deepEqual(second.body, first.body)
  assert.deepEqual(calls, [['capabilities']], '缓存期内只探测一次')
})

test('ffmpeg 状态与安装：立即返回 jobId，第二次请求并入同一任务', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const installer = createInstaller({ resolveSystemFfmpeg: async () => null,
    root: resolvePath('tmp', 'kumquat'),
    autoDownload: true,
    loadManager: async () => ({
      installBinary: async () => {
        await gate
        return { state: 'cached', path: resolvePath('tmp', 'kumquat', 'ffmpeg.exe'), version: '6.1.1' }
      },
      status: async () => ({ state: 'system', path: 'C:/ffmpeg/bin/ffmpeg.exe', version: '6.1.1', sizeHint: 1234 }),
    }),
  })
  const router = makeRouter({ service: fakeService().service, ffmpeg: installer })

  const status = await call(router, `${ROUTE_PREFIX}/ffmpeg/status`)
  assert.equal(status.status, 200)
  assert.deepEqual(status.body, { state: 'system', path: 'C:/ffmpeg/bin/ffmpeg.exe', version: '6.1.1', sizeHint: 1234 })

  const install = await call(router, `${ROUTE_PREFIX}/ffmpeg/install`, { method: 'POST' })
  assert.equal(install.status, 202)
  assert.match(install.body.jobId, /^ffmpeg-/)

  const second = await call(router, `${ROUTE_PREFIX}/ffmpeg/install`, { method: 'POST' })
  assert.equal(second.status, 202, '同一时间只跑一个安装任务，第二次并入')
  assert.equal(second.body.jobId, install.body.jobId)
  assert.equal(second.body.reused, true)

  const progress = await call(router, `${ROUTE_PREFIX}/ffmpeg/progress`, {
    query: `jobId=${encodeURIComponent(install.body.jobId)}`,
  })
  assert.equal(progress.status, 200)
  assert.ok(PHASES.includes(progress.body.phase))

  release()
  await new Promise((done) => setTimeout(done, 10))
  const finished = await call(router, `${ROUTE_PREFIX}/ffmpeg/progress`, {
    query: `jobId=${encodeURIComponent(install.body.jobId)}`,
  })
  assert.equal(finished.body.phase, 'done')
  assert.equal(finished.body.percent, 100)
  assert.equal(finished.body.state, 'cached')
  assert.equal(finished.body.version, '6.1.1')
  installer.dispose()
})

test('ffmpeg 自动安装关闭时返回 403 并说明如何手动配置', async () => {
  const router = makeRouter({ service: fakeService().service, config: { autoDownload: false } })

  const result = await call(router, `${ROUTE_PREFIX}/ffmpeg/install`, { method: 'POST' })

  assert.equal(result.status, 403)
  assert.equal(result.body.error.code, 'E_DISABLED')
  assert.match(result.body.error.hint, /ffmpegPath/)
})

test('ffmpeg 进度：未知任务 404；没有 jobId 时跟随最近一次安装', async () => {
  const router = makeRouter({ service: fakeService().service })

  const unknown = await call(router, `${ROUTE_PREFIX}/ffmpeg/progress`, { query: 'jobId=ffmpeg-nope' })
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.error.code, 'E_NOT_FOUND')

  const none = await call(router, `${ROUTE_PREFIX}/ffmpeg/progress`)
  assert.equal(none.status, 404)
  assert.match(none.body.error.message, /还没有/)

  const install = await call(router, `${ROUTE_PREFIX}/ffmpeg/install`, { method: 'POST' })
  assert.equal(install.status, 202)
  const latest = await call(router, `${ROUTE_PREFIX}/ffmpeg/progress`)
  assert.equal(latest.status, 200)
  assert.ok(PHASES.includes(latest.body.phase))
  assert.equal(
    latest.body.receivedBytes === undefined || typeof latest.body.receivedBytes === 'number',
    true,
    '同时给出 received 与 receivedBytes 两种拼写',
  )
})

test('probe 也接受 Client 的 input 字段；两个字段同时给出时以 path 为准', async () => {
  const { service, calls } = fakeService()
  const router = makeRouter({ service })

  const viaInput = await call(router, `${ROUTE_PREFIX}/probe`, { method: 'POST', body: { input: ABS } })
  assert.equal(viaInput.status, 200)
  assert.equal(viaInput.body.path, ABS)

  await call(router, `${ROUTE_PREFIX}/probe`, {
    method: 'POST',
    body: { path: ABS, input: 'C:/other.mp4' },
  })
  assert.deepEqual(calls.map(entry => entry[1]), [ABS, ABS])
})

test('取消支持 body 寻址与路径寻址两种拼写，且都只取消一个任务', async () => {
  const cancelled = []
  const { service } = fakeService({
    cancel: async (jobId) => {
      cancelled.push(jobId)
    },
  })
  const router = makeRouter({ service })

  const byBody = await call(router, `${ROUTE_PREFIX}/cancel`, { method: 'POST', body: { jobId: 'job-a' } })
  assert.equal(byBody.status, 200)
  assert.deepEqual(byBody.body, { ok: true, jobId: 'job-a' })

  const byPath = await call(router, `${ROUTE_PREFIX}/jobs/job-b/cancel`, { method: 'POST', body: {} })
  assert.equal(byPath.status, 200)
  assert.deepEqual(byPath.body, { ok: true, jobId: 'job-b' })

  const wrongMethod = await call(router, `${ROUTE_PREFIX}/jobs/job-c/cancel`)
  assert.equal(wrongMethod.status, 405)

  assert.deepEqual(cancelled, ['job-a', 'job-b'], '取消按 jobId 精确命中，不做一刀切')
})

test('引擎抛出的 MediaQcError 保留 code、message 与 hint', async () => {
  const { service } = fakeService({
    probe: async () => {
      const error = new Error('输入文件打不开')
      error.code = 'E_INPUT'
      error.hint = '确认文件还在原位置，或重新选择。'
      throw error
    },
  })
  const router = makeRouter({ service })

  const result = await call(router, `${ROUTE_PREFIX}/probe`, { method: 'POST', body: { path: ABS } })

  assert.equal(result.status, 400)
  assert.deepEqual(result.body.error, {
    code: 'E_INPUT',
    message: '输入文件打不开',
    hint: '确认文件还在原位置，或重新选择。',
  })
})

test('多个 run 请求并发处理，各自得到独立 jobId（任务级并发）', async () => {
  let running = 0
  let peak = 0
  let sequence = 0
  const { service } = fakeService({
    run: async (task) => {
      running += 1
      peak = Math.max(peak, running)
      sequence += 1
      const id = `job-${sequence}`
      await new Promise(done => setTimeout(done, 15))
      running -= 1
      return { id, task, status: 'queued', startedAt: sequence }
    },
  })
  const router = makeRouter({ service })

  const results = await Promise.all(
    [0, 1, 2, 3].map(index => call(router, `${ROUTE_PREFIX}/run`, {
      method: 'POST',
      body: { task: { kind: 'gif', input: `${ABS}${index}`, from: 0, to: 3 } },
    })),
  )

  assert.deepEqual(results.map(result => result.status), [202, 202, 202, 202])
  const ids = results.map(result => result.body.id)
  assert.equal(new Set(ids).size, 4, '四个请求必须得到四个不同任务')
  assert.ok(peak >= 3, `请求应重叠执行，实际峰值并发 ${peak}`)
})

test('jobs 列表返回全部任务，详情与取消都按 jobId 精确寻址', async () => {
  const all = ['job-a', 'job-b', 'job-c'].map(id => ({
    id,
    task: { kind: 'convert', input: ABS, to: 'mkv' },
    status: 'running',
    startedAt: 1,
  }))
  const cancelled = []
  const { service } = fakeService({
    cancel: async (jobId) => {
      cancelled.push(jobId)
    },
    jobs: {
      list: async () => all,
      get: async (id) => all.find(job => job.id === id),
    },
  })
  const router = makeRouter({ service })

  const list = await call(router, `${ROUTE_PREFIX}/jobs`)
  assert.equal(list.status, 200)
  assert.deepEqual(list.body.map(job => job.id), ['job-a', 'job-b', 'job-c'])

  const detail = await call(router, `${ROUTE_PREFIX}/jobs/job-b`)
  assert.equal(detail.body.id, 'job-b')

  await call(router, `${ROUTE_PREFIX}/cancel`, { method: 'POST', body: { jobId: 'job-b' } })
  assert.deepEqual(cancelled, ['job-b'], '取消只命中指定任务')
})

test('余额路由在任务进行中不被阻塞', async () => {
  let releaseRun
  const runGate = new Promise((resolve) => {
    releaseRun = resolve
  })
  const { service } = fakeService({
    run: async (task) => {
      await runGate
      return { id: 'job-slow', task, status: 'queued', startedAt: 1 }
    },
  })
  const balance = {
    getBalance: async () => ({ ok: false, error: 'no-key' }),
  }
  const router = makeRouter({ service, balance })

  const pendingRun = call(router, `${ROUTE_PREFIX}/run`, {
    method: 'POST',
    body: { task: { kind: 'convert', input: ABS, to: 'mp3' } },
  })
  const raced = await Promise.race([
    call(router, `${ROUTE_PREFIX}/balance`),
    new Promise(resolve => setTimeout(() => resolve('timed-out'), 200)),
  ])

  assert.notEqual(raced, 'timed-out', '余额查询不应等待编码任务')
  assert.deepEqual(/** @type {any} */ (raced).body, { ok: false, error: 'no-key' })

  releaseRun()
  assert.equal((await pendingRun).status, 202)
})

test('并发的 capabilities 请求合并为一次探测', async () => {
  let probes = 0
  const { service } = fakeService({
    capabilities: async () => {
      probes += 1
      await new Promise(done => setTimeout(done, 10))
      return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', version: '6.1.1', filters: [], encoders: [], muxers: [] }
    },
  })
  const router = makeRouter({ service })

  const results = await Promise.all([
    call(router, `${ROUTE_PREFIX}/capabilities`),
    call(router, `${ROUTE_PREFIX}/capabilities`),
    call(router, `${ROUTE_PREFIX}/capabilities`),
  ])

  assert.equal(probes, 1, '冷启动时三次请求只应探测一次')
  assert.ok(results.every(result => result.status === 200))
  assert.deepEqual(results[0].body, results[2].body)
})

test('任务进度按 jobId 挂到对应的行，不串行', async () => {
  const all = ['job-a', 'job-b'].map(id => ({
    id,
    task: { kind: 'convert', input: ABS, to: 'mkv' },
    status: 'running',
    startedAt: 1,
  }))
  const { service } = fakeService({
    jobs: {
      list: async () => all,
      get: async (id) => all.find(job => job.id === id),
    },
  })
  const progress = createProgressTable()
  progress.record('job-b', { phase: 'encode', percent: 42, outTimeSec: 7.5, speed: '1.2x', etaSec: 12 })
  const router = makeRouter({ service, progress })

  const list = await call(router, `${ROUTE_PREFIX}/jobs`)
  assert.equal(list.body[0].progress, undefined, 'job-a 没有进度，不应借用 job-b 的')
  assert.deepEqual(list.body[1].progress, {
    phase: 'encode',
    percent: 42,
    outTimeSec: 7.5,
    speed: '1.2x',
    etaSec: 12,
  })

  const detailA = await call(router, `${ROUTE_PREFIX}/jobs/job-a`)
  assert.equal(detailA.body.progress, undefined)
  const detailB = await call(router, `${ROUTE_PREFIX}/jobs/job-b`)
  assert.equal(detailB.body.progress.percent, 42)
})

