import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ENDPOINTS,
  createApi,
  createFakeApi,
  createUnavailableApi,
  fakeFacts,
} from '../../src/client/api.js'

const MB = 1024 * 1024

/**
 * 一个按脚本回放的 transport：按顺序吐出预设响应，并记录每次请求。
 * @param {Array<any | ((spec: any) => any)>} script
 */
function scriptedTransport(script) {
  const calls = []
  const queue = script.slice()
  const transport = async (spec) => {
    calls.push(spec)
    const next = queue.length > 1 ? queue.shift() : queue[0]
    if (typeof next === 'function') return next(spec)
    if (next instanceof Error) throw next
    return next
  }
  return { transport, calls }
}

test('api: 默认路由表覆盖全部方法', () => {
  for (const name of ['capabilities', 'probe', 'run', 'job', 'jobs', 'cancel', 'balance', 'binaryStatus', 'binaryInstall', 'binaryProgress']) {
    assert.ok(DEFAULT_ENDPOINTS[name], `缺少 ${name} 路由`)
    assert.match(DEFAULT_ENDPOINTS[name].path, /^\/api\/kumquat\//)
    assert.match(DEFAULT_ENDPOINTS[name].method, /^(GET|POST)$/)
  }
  assert.match(DEFAULT_ENDPOINTS.binaryProgress.path, /ffmpeg\/progress/)
  assert.equal(DEFAULT_ENDPOINTS.jobs.path, '/api/kumquat/jobs')
})

test('api: 宿主不在时每个方法都返回未连接而不是抛错', async () => {
  const api = createUnavailableApi()
  for (const method of ['capabilities', 'probe', 'run', 'job', 'jobs', 'cancel', 'balance', 'binaryStatus']) {
    const result = await api[method](method === 'probe' ? 'C:\\a.mp4' : method === 'job' || method === 'cancel' ? 'id' : undefined)
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'E_OFFLINE')
    assert.equal(result.source, 'none')
  }
  const install = await api.binaryInstall(() => {})
  assert.equal(install.ok, false)
  assert.equal(install.error.code, 'E_OFFLINE')
})

test('api: 网络异常折算成一句可重试的未连接', async () => {
  const api = createApi({
    transport: async () => {
      throw new TypeError('fetch failed')
    },
  })
  const result = await api.capabilities()
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'E_OFFLINE')
  assert.match(result.error.hint, /重试/)
})

test('api: 三种响应体都能解包', async () => {
  const enveloped = createApi({ transport: scriptedTransport([{ status: 200, data: { ok: true, data: { version: '6.1.1' } } }]).transport })
  assert.equal((await enveloped.capabilities()).data.version, '6.1.1')

  const bare = createApi({ transport: scriptedTransport([{ status: 200, data: { version: '7.0' } }]).transport })
  assert.equal((await bare.capabilities()).data.version, '7.0')

  const failed = createApi({
    transport: scriptedTransport([{ status: 200, data: { ok: false, error: { code: 'E_CAPABILITY', message: '没有 ffmpeg', hint: '装一个' } } }]).transport,
  })
  const failure = await failed.capabilities()
  assert.equal(failure.ok, false)
  assert.equal(failure.error.code, 'E_CAPABILITY')
  assert.equal(failure.error.hint, '装一个')
})

test('api: HTTP 错误码转成带下一句的提示', async () => {
  const notFound = createApi({ transport: scriptedTransport([{ status: 404, data: null }]).transport })
  const missing = await notFound.capabilities()
  assert.equal(missing.error.code, 'E_NOT_FOUND')
  assert.match(missing.error.hint, /S5|路由/)

  const forbidden = createApi({ transport: scriptedTransport([{ status: 403, data: { error: { message: '插件被停用' } } }]).transport })
  const denied = await forbidden.run({ kind: 'convert', input: 'C:\\a.mp4', to: 'mkv' })
  assert.equal(denied.error.code, 'E_FORBIDDEN')
})

test('api: probe / run / job / cancel 的参数形状', async () => {
  const scripted = scriptedTransport([
    { status: 200, data: { ok: true, data: fakeFacts('C:\\v\\cat.mp4') } },
    { status: 200, data: { ok: true, data: { id: 'job-1', status: 'queued' } } },
    { status: 200, data: { ok: true, data: { id: 'job-1', status: 'running' } } },
    { status: 200, data: { ok: true, data: { id: 'job-1' } } },
  ])
  const api = createApi({ transport: scripted.transport })

  assert.equal((await api.probe('')).error.code, 'E_INPUT')
  const probed = await api.probe('C:\\v\\cat.mp4')
  assert.equal(probed.ok, true)
  assert.equal(scripted.calls[0].body.input, 'C:\\v\\cat.mp4')

  const task = { kind: 'convert', input: 'C:\\v\\cat.mp4', to: 'mkv', copy: true }
  assert.equal((await api.run(null)).error.code, 'E_INPUT')
  const started = await api.run(task, { overwrite: true })
  assert.equal(started.ok, true)
  assert.deepEqual(scripted.calls[1].body, { task, overwrite: true })

  await api.job('a/b')
  assert.match(scripted.calls[2].path, /a%2Fb/)
  await api.cancel('job-1')
  assert.match(scripted.calls[3].path, /job-1\/cancel$/)
})

test('api: 任务列表带每行 progress，兼容数组与 { jobs } 两种包法', async () => {
  const rows = [
    { id: 'a', status: 'running', progress: { phase: 'encoding', percent: 40, etaSec: 5 } },
    { id: 'b', status: 'queued' },
  ]
  const bare = createApi({ transport: scriptedTransport([{ status: 200, data: rows }]).transport })
  const listed = await bare.jobs()
  assert.equal(listed.ok, true)
  assert.equal(listed.data.length, 2)
  assert.equal(listed.data[0].progress.phase, 'encoding')

  const wrapped = createApi({ transport: scriptedTransport([{ status: 200, data: { jobs: rows } }]).transport })
  assert.deepEqual((await wrapped.jobs()).data.map((row) => row.id), ['a', 'b'])

  const empty = createApi({ transport: scriptedTransport([{ status: 200, data: null }]).transport })
  assert.deepEqual((await empty.jobs()).data, [])
})

test('api: 余额无 key 是「未配置」而不是错误', async () => {
  const unconfigured = createApi({
    transport: scriptedTransport([{ status: 200, data: { ok: false, error: { code: 'E_NO_KEY', message: '没有 key' } } }]).transport,
  })
  const result = await unconfigured.balance()
  assert.equal(result.ok, true)
  assert.equal(result.data.ok, false)
  assert.equal(result.data.error.code, 'E_NO_KEY')

  const configured = createApi({
    transport: scriptedTransport([{ status: 200, data: { ok: true, currency: 'CNY', total: '12.34' } }]).transport,
  })
  const balance = await configured.balance()
  assert.equal(balance.ok, true)
  assert.equal(balance.data.total, '12.34')
})

test('api: 余额接口的 500 也降级成未配置，离线才报未连接', async () => {
  const serverError = createApi({ transport: scriptedTransport([{ status: 500, data: { error: { code: 'E_BALANCE', message: '上游 500' } } }]).transport })
  const degraded = await serverError.balance()
  assert.equal(degraded.ok, true)
  assert.equal(degraded.data.ok, false)

  const offline = createApi({ transport: async () => { throw new Error('offline') } })
  assert.equal((await offline.balance()).ok, false)
})

test('api: binaryStatus 归一 system/cached/missing', async () => {
  const status = createApi({
    transport: scriptedTransport([{ status: 200, data: { state: 'missing', version: null, sizeHint: 80 * MB } }]).transport,
  })
  assert.deepEqual((await status.binaryStatus()).data, { state: 'missing', version: null, sizeHint: 80 * MB })

  const installed = createApi({
    transport: scriptedTransport([{ status: 200, data: { installed: true, version: '6.1.1' } }]).transport,
  })
  assert.equal((await installed.binaryStatus()).data.state, 'system')

  const cached = createApi({
    transport: scriptedTransport([{ status: 200, data: { state: 'cached', size: 100 } }]).transport,
  })
  assert.equal((await cached.binaryStatus()).data.state, 'cached')
})

test('api: binaryInstall 轮询到装好，并把进度交给界面', async () => {
  const scripted = scriptedTransport([
    { status: 202, data: { jobId: 'ff-1' } },
    { status: 200, data: { phase: 'download', percent: null, totalBytes: 80 * MB } },
    { status: 200, data: { phase: 'download', receivedBytes: 30 * MB, totalBytes: 80 * MB } },
    { status: 200, data: { phase: 'extract', percent: 100 } },
    { status: 200, data: { phase: 'done', state: 'cached', version: '6.1.1' } },
  ])
  const api = createApi({ transport: scripted.transport, pollMs: 0 })
  const seen = []
  const result = await api.binaryInstall((progress) => seen.push(progress))
  assert.equal(result.ok, true)
  assert.equal(result.data.state, 'cached')
  assert.equal(result.data.version, '6.1.1')
  assert.equal(seen.length, 4)
  assert.equal(seen[1].percent, 37.5)
  assert.equal(seen[3].phase, 'done')
  assert.equal(scripted.calls[0].body && Object.keys(scripted.calls[0].body).length, 0)
  assert.match(scripted.calls[1].path, /jobId=ff-1/)
})

test('api: binaryInstall 失败给一句人话，取消与超时都不 reject', async () => {
  const failed = createApi({
    transport: scriptedTransport([
      { status: 202, data: { jobId: 'ff-2' } },
      { status: 200, data: { phase: 'error', error: { code: 'E_INSTALL', message: '下载中断了', hint: '检查网络后重试。' } } },
    ]).transport,
    pollMs: 0,
  })
  const failure = await failed.binaryInstall(() => {})
  assert.equal(failure.ok, false)
  assert.equal(failure.error.message, '下载中断了')
  assert.match(failure.error.hint, /重试|网络/)

  const installRejected = createApi({ transport: scriptedTransport([{ status: 503, data: { error: { message: '装不了' } } }]).transport })
  assert.equal((await installRejected.binaryInstall(() => {})).ok, false)

  const controller = new AbortController()
  controller.abort()
  const cancelled = await createApi({ transport: scriptedTransport([{ status: 200, data: {} }]).transport }).binaryInstall(() => {}, { signal: controller.signal })
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.error.code, 'E_CANCELLED')

  const slow = createApi({
    transport: scriptedTransport([
      { status: 202, data: { jobId: 'ff-3' } },
      { status: 200, data: { phase: 'download', percent: 10 } },
    ]).transport,
    pollMs: 0,
    maxPolls: 3,
  })
  const timedOut = await slow.binaryInstall(() => {})
  assert.equal(timedOut.ok, false)
  assert.equal(timedOut.error.code, 'E_TIMEOUT')
})

test('fake: 能力、探测与坏路径', async () => {
  const api = createFakeApi()
  const caps = await api.capabilities()
  assert.equal(caps.ok, true)
  assert.equal(caps.data.version, '6.1.1')
  assert.ok(caps.data.muxers.includes('matroska'))

  const video = await api.probe('C:\\videos\\猫猫.mp4')
  assert.equal(video.ok, true)
  assert.equal(video.data.video.codec, 'h264')
  assert.equal(video.data.durationSec, 12)

  assert.equal((await api.probe('relative/cat.mp4')).error.code, 'E_INPUT')
  assert.equal((await api.probe('C:\\videos\\cat.txt')).error.code, 'E_INPUT')

  const audio = await api.probe('C:\\audio\\pod.mp3')
  assert.equal(audio.data.audio.codec, 'mp3')
  assert.equal(audio.data.video, undefined)

  const missing = createFakeApi({ binary: 'missing' })
  assert.equal((await missing.binaryStatus()).data.state, 'missing')
  assert.equal((await missing.capabilities()).error.code, 'E_CAPABILITY')
})

test('fake: 任务从排队跑到验收，结果可复现', async () => {
  const api = createFakeApi()
  const task = { kind: 'convert', input: 'C:\\videos\\猫猫.mp4', to: 'mkv', copy: true }
  const started = await api.run(task)
  assert.equal(started.ok, true)
  assert.equal(started.data.status, 'queued')

  const first = await api.job(started.data.id)
  assert.equal(first.data.status, 'running')
  assert.equal(first.data.progress.phase, 'encoding')
  const second = await api.job(started.data.id)
  assert.equal(second.data.status, 'verifying')
  assert.equal(second.data.progress.phase, 'verifying')
  const third = await api.job(started.data.id)
  assert.equal(third.data.status, 'done')
  assert.ok(third.data.output.endsWith('.mkv'))
  assert.ok(Array.isArray(third.data.verdict.checks))
  assert.equal(third.data.verdict.checks[0].outcome, 'pass')

  const cancelled = await api.run({ kind: 'convert', input: 'C:\\videos\\a.mp4', to: 'mp3' })
  await api.cancel(cancelled.data.id)
  assert.equal((await api.job(cancelled.data.id)).data.status, 'cancelled')

  const listed = await api.jobs()
  assert.equal(listed.ok, true)
  assert.equal(listed.data.length, 2)
  assert.equal(listed.data[0].status, 'done')
  assert.equal(listed.data[1].status, 'cancelled')

  const failing = createFakeApi({ failRun: true })
  assert.equal((await failing.run(task)).error.code, 'E_ENCODE')
})

test('fake: 列表轮询同样推进每行的 progress', async () => {
  const api = createFakeApi()
  const task = { kind: 'gif', input: 'C:\\videos\\猫猫.mp4', from: 0, to: 5, fps: 12, width: 480 }
  const started = await api.run(task)
  const first = await api.jobs()
  assert.equal(first.data[0].status, 'running')
  assert.equal(first.data[0].progress.phase, 'encoding')
  assert.equal(first.data[0].id, started.data.id)
  const second = await api.jobs()
  assert.equal(second.data[0].status, 'verifying')
  const third = await api.jobs()
  assert.equal(third.data[0].status, 'done')
  assert.ok(third.data[0].verdict)
})

test('fake: GIF 超目标给警告与修复建议', async () => {
  const api = createFakeApi()
  const task = { kind: 'gif', input: 'C:\\videos\\猫猫.mp4', from: 0, to: 8, fps: 12, width: 480, maxBytes: 8 * MB }
  const started = await api.run(task)
  for (let index = 0; index < 3; index += 1) await api.job(started.data.id)
  const done = await api.job(started.data.id)
  const verdict = done.data.verdict
  assert.equal(verdict.ok, true)
  const bytesCheck = verdict.checks.filter((check) => check.id === 'gif.bytes')[0]
  assert.equal(bytesCheck.outcome, 'warn')
  assert.ok(bytesCheck.delta)
  assert.deepEqual(bytesCheck.repair, { kind: 'reencode', width: 420 })
})

test('fake: 余额配置 / 未配置 / 离线', async () => {
  assert.equal((await createFakeApi({ balance: 'configured' }).balance()).data.total, '12.34')
  assert.equal((await createFakeApi({ balance: 'unconfigured' }).balance()).data.ok, false)
  assert.equal((await createFakeApi({ balance: 'offline' }).balance()).error.code, 'E_OFFLINE')
})

test('fake: 装 FFmpeg 的进度序列与失败分支', async () => {
  const api = createFakeApi({ binary: 'missing' })
  const phases = []
  const result = await api.binaryInstall((progress) => phases.push(progress.phase))
  assert.equal(result.ok, true)
  assert.equal(result.data.state, 'cached')
  assert.deepEqual(phases, ['download', 'download', 'extract', 'verify', 'done'])
  assert.equal((await api.binaryStatus()).data.state, 'cached')

  const failing = createFakeApi({ binary: 'missing', installFails: true })
  const failure = await failing.binaryInstall(() => {})
  assert.equal(failure.ok, false)
  assert.equal(failure.error.code, 'E_INSTALL')
  assert.match(failure.error.hint, /重试/)

  const controller = new AbortController()
  controller.abort()
  const cancelled = await createFakeApi({ binary: 'missing' }).binaryInstall(() => {}, { signal: controller.signal })
  assert.equal(cancelled.error.code, 'E_CANCELLED')
})
