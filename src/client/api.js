/**
 * Kumquat · 宿主接口（浏览器半身）。
 *
 * 真实路由由 S5 提供；这里只定义契约、容错与可注入的 fake：
 *   GET  /api/kumquat/capabilities
 *   POST /api/kumquat/probe            { input }
 *   POST /api/kumquat/run              { task, overwrite? }
 *   GET  /api/kumquat/jobs/:id
 *   POST /api/kumquat/jobs/:id/cancel
 *   GET  /api/kumquat/balance
 *   GET  /api/kumquat/ffmpeg/status
 *   POST /api/kumquat/ffmpeg/install
 *   GET  /api/kumquat/ffmpeg/progress
 *
 * 所有方法都 resolve，不 reject：界面永远拿得到 { ok, data?, error? }，
 * 接口失败只会变成一句「未连接」或一句可执行提示，不会白屏。
 */

/** 默认路由表。ctx.endpoints 按方法名整体覆盖，S5 改路径不用动界面。 */
export const DEFAULT_ENDPOINTS = Object.freeze({
  capabilities: Object.freeze({ method: 'GET', path: '/api/kumquat/capabilities' }),
  fs: Object.freeze({ method: 'GET', path: '/api/kumquat/fs' }),
  pick: Object.freeze({ method: 'POST', path: '/api/kumquat/pick' }),
  reveal: Object.freeze({ method: 'POST', path: '/api/kumquat/reveal' }),
  probe: Object.freeze({ method: 'POST', path: '/api/kumquat/probe' }),
  run: Object.freeze({ method: 'POST', path: '/api/kumquat/run' }),
  job: Object.freeze({ method: 'GET', path: '/api/kumquat/jobs/{id}' }),
  jobs: Object.freeze({ method: 'GET', path: '/api/kumquat/jobs' }),
  cancel: Object.freeze({ method: 'POST', path: '/api/kumquat/jobs/{id}/cancel' }),
  balance: Object.freeze({ method: 'GET', path: '/api/kumquat/balance' }),
  binaryStatus: Object.freeze({ method: 'GET', path: '/api/kumquat/ffmpeg/status' }),
  binaryInstall: Object.freeze({ method: 'POST', path: '/api/kumquat/ffmpeg/install' }),
  binaryProgress: Object.freeze({ method: 'GET', path: '/api/kumquat/ffmpeg/progress' }),
})

/** 一句「未连接」的标准错误。 */
export const UNCONNECTED_ERROR = Object.freeze({
  code: 'E_OFFLINE',
  message: '未连接宿主',
  hint: '界面能看，但任务要等／api/kumquat 路由就绪；也可以注入 transport 或 fake。',
})

/** 宿主不在时的占位 api：方法齐全，全部返回未连接。 */
export function createUnavailableApi() {
  const fail = () => Promise.resolve({ ok: false, error: UNCONNECTED_ERROR, source: 'none' })
  return Object.freeze({
    capabilities: fail,
    probe: fail,
    run: fail,
    job: fail,
    jobs: fail,
    cancel: fail,
    balance: fail,
    binaryStatus: fail,
    binaryInstall: fail,
  })
}

/**
 * 把宿主错误收成 { code, message, hint }。
 * @param {unknown} value
 */
function apiErrorShape(value) {
  if (value && typeof value === 'object') {
    const shape = {
      code: typeof value.code === 'string' ? value.code : 'E_UNKNOWN',
      message: typeof value.message === 'string' && value.message !== '' ? value.message : '宿主返回了一个错误',
      hint: typeof value.hint === 'string' ? value.hint : '',
    }
    return shape
  }
  if (typeof value === 'string' && value !== '') {
    return { code: 'E_UNKNOWN', message: value, hint: '再试一次。' }
  }
  return { code: 'E_UNKNOWN', message: '宿主返回了一个错误', hint: '再试一次。' }
}

/**
 * 兼容三种响应体：裸数据、`{ ok, data }`、`{ ok:false, error }`。
 * @param {unknown} payload
 * @param {'host' | 'fake'} source
 */
function unwrap(payload, source) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.ok === false) return { ok: false, error: apiErrorShape(payload.error), source }
    if (payload.ok === true) {
      const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload
      return { ok: true, data, source }
    }
  }
  return { ok: true, data: payload, source }
}

/**
 * 默认 HTTP transport：同源相对路径 + JSON。
 * @param {(input: string, init?: object) => Promise<any>} fetchImpl
 * @param {string} baseUrl
 */
function httpTransport(fetchImpl, baseUrl) {
  return async (spec) => {
    const init = { method: spec.method, headers: { accept: 'application/json' } }
    if (spec.body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(spec.body)
    }
    if (spec.signal !== undefined) init.signal = spec.signal
    const response = await fetchImpl(`${baseUrl}${spec.path}`, init)
    const text = typeof response.text === 'function' ? await response.text() : ''
    let data = null
    if (text !== '') {
      try {
        data = JSON.parse(text)
      } catch (error) {
        data = text
      }
    }
    return { status: typeof response.status === 'number' ? response.status : 200, data }
  }
}

/**
 * Cordis contexts throw when a service is read without declaring it in inject.
 * Reading optional host hooks must never take the whole panel down.
 * @param {any} ctx
 * @param {string} key
 */
function safeGet(ctx, key) {
  if (ctx === null || ctx === undefined) return undefined
  try {
    return ctx[key]
  } catch {
    return undefined
  }
}

/**
 * @param {any} ctx
 */
function resolveTransport(ctx) {
  const provided = safeGet(ctx, 'transport')
  if (typeof provided === 'function') return provided
  if (provided && typeof provided.request === 'function') {
    return (spec) => provided.request(spec)
  }
  const fetchImpl = (typeof safeGet(ctx, 'fetch') === 'function' ? safeGet(ctx, 'fetch') : null)
    || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) return null
  const baseUrl = safeGet(ctx, 'baseUrl')
  return httpTransport(fetchImpl, typeof baseUrl === 'string' ? baseUrl : '')
}

/**
 * @param {unknown} status
 * @param {unknown} payload
 */
function httpError(status, payload) {
  const shaped = apiErrorShape(payload && typeof payload === 'object' ? payload.error || payload : payload)
  if (Number(status) === 404) {
    return { code: 'E_NOT_FOUND', message: shaped.message || '宿主没有这条路由', hint: '确认／api/kumquat 路由已由宿主注册（S5）。' }
  }
  if (Number(status) === 401 || Number(status) === 403) {
    return { code: 'E_FORBIDDEN', message: shaped.message || '宿主拒绝了请求', hint: '检查插件是否在 profile 里启用。' }
  }
  return shaped
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * @param {unknown} value
 */
function normalizeBinaryStatus(value) {
  const data = value && typeof value === 'object' ? value : {}
  const state = data.state === 'system' || data.state === 'cached' || data.state === 'missing'
    ? data.state
    : data.installed === true
      ? 'system'
      : data.present === true
        ? 'system'
        : 'missing'
  return {
    state,
    version: typeof data.version === 'string' ? data.version : null,
    sizeHint: Number.isFinite(data.sizeHint) ? data.sizeHint : Number.isFinite(data.size) ? data.size : null,
  }
}

/**
 * @param {unknown} value
 */
function normalizeProgress(value) {
  const data = value && typeof value === 'object' ? value : {}
  const received = Number.isFinite(data.receivedBytes)
    ? data.receivedBytes
    : Number.isFinite(data.received)
      ? data.received
      : null
  const total = Number.isFinite(data.totalBytes)
    ? data.totalBytes
    : Number.isFinite(data.total)
      ? data.total
      : null
  let percent = Number.isFinite(data.percent) ? data.percent : null
  if (percent === null && received !== null && total !== null && total > 0) percent = (received / total) * 100
  return {
    phase: typeof data.phase === 'string' ? data.phase : 'download',
    percent,
    receivedBytes: received,
    totalBytes: total,
  }
}

/**
 * 建一个宿主 api。
 * @param {{ transport?: any, endpoints?: any, baseUrl?: string, fetch?: any, pollMs?: number, maxPolls?: number }} [ctx]
 */
export function createApi(ctx = {}) {
  const transport = resolveTransport(ctx)
  const endpoints = { ...DEFAULT_ENDPOINTS, ...(safeGet(ctx, 'endpoints') || {}) }
  const pollMs = Number.isFinite(safeGet(ctx, 'pollMs')) ? Math.max(0, safeGet(ctx, 'pollMs')) : 400
  const maxPolls = Number.isFinite(safeGet(ctx, 'maxPolls')) ? Math.max(1, safeGet(ctx, 'maxPolls')) : 900

  /**
   * @param {string} name
   * @param {{ params?: Record<string, string>, query?: Record<string, string>, body?: any, signal?: any }} [options]
   */
  async function call(name, options = {}) {
    if (transport === null) return { ok: false, error: UNCONNECTED_ERROR, source: 'none' }
    const endpoint = endpoints[name]
    if (!endpoint) return { ok: false, error: { code: 'E_ROUTE', message: `未定义路由 ${name}`, hint: '检查 endpoints。' }, source: 'none' }
    let path = endpoint.path
    for (const key of Object.keys(options.params || {})) {
      path = path.split(`{${key}}`).join(encodeURIComponent(options.params[key]))
    }
    const query = Object.keys(options.query || {})
      .filter((key) => typeof options.query[key] === 'string' && options.query[key] !== '')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(options.query[key])}`)
    if (query.length > 0) path += `${path.indexOf('?') === -1 ? '?' : '&'}${query.join('&')}`
    try {
      const response = await transport({ method: endpoint.method, path, body: options.body, signal: options.signal })
      const status = response && Number.isFinite(response.status) ? response.status : 200
      const payload = response ? response.data : null
      if (status >= 400) return { ok: false, error: httpError(status, payload), source: 'host' }
      return unwrap(payload, 'host')
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消', hint: '' }, source: 'host' }
      }
      return {
        ok: false,
        error: {
          code: 'E_OFFLINE',
          message: '宿主没有响应',
          hint: '确认窗口还在、／api/kumquat 路由已注册；然后点重试。',
        },
        source: 'host',
      }
    }
  }

  return Object.freeze({
    async capabilities() {
      return call('capabilities')
    },
    async pick(mode, defaultName) {
      const body = {}
      if (mode === 'dir' || mode === 'save') body.mode = mode
      if (typeof defaultName === 'string' && defaultName !== '') body.defaultName = defaultName
      return call('pick', { body })
    },
    async reveal(path) {
      if (typeof path !== 'string' || path === '') return { ok: false, error: { code: 'E_INPUT', message: '没有输出路径', hint: '' }, source: 'none' }
      return call('reveal', { body: { path } })
    },
    async fsList(dir) {
      return call('fs', { query: typeof dir === 'string' && dir !== '' ? { path: dir } : {} })
    },
    async probe(input) {
      if (typeof input !== 'string' || input.trim() === '') {
        return { ok: false, error: { code: 'E_INPUT', message: '没有文件路径', hint: '先选文件，或粘贴绝对路径。' }, source: 'none' }
      }
      return call('probe', { body: { input } })
    },
    async run(task, opts) {
      if (!task || typeof task !== 'object') {
        return { ok: false, error: { code: 'E_INPUT', message: '任务不完整', hint: '检查文件与参数。' }, source: 'none' }
      }
      const body = { task, overwrite: Boolean(opts && opts.overwrite) }
      if (opts && typeof opts.outputDir === 'string' && opts.outputDir !== '') body.outputDir = opts.outputDir
      if (opts && typeof opts.outputPath === 'string' && opts.outputPath !== '') body.outputPath = opts.outputPath
      return call('run', { body })
    },
    async job(id) {
      if (typeof id !== 'string' || id === '') {
        return { ok: false, error: { code: 'E_INPUT', message: '任务 id 是空的', hint: '结果行会自己重试。' }, source: 'none' }
      }
      return call('job', { params: { id } })
    },
    /**
     * 一圈轮询：列表带每行的 progress（宿主在 list 上合并进度，detail 上不一定有）。
     * @returns {Promise<{ ok: boolean, data?: any[], error?: any, source: string }>}
     */
    async jobs() {
      const result = await call('jobs')
      if (!result.ok) return result
      const data = result.data
      const list = Array.isArray(data)
        ? data
        : data && Array.isArray(data.jobs)
          ? data.jobs
          : []
      return { ok: true, data: list, source: result.source }
    },
    async cancel(id) {
      if (typeof id !== 'string' || id === '') {
        return { ok: false, error: { code: 'E_INPUT', message: '任务 id 是空的', hint: '' }, source: 'none' }
      }
      return call('cancel', { params: { id }, body: {} })
    },
    async balance() {
      const result = await call('balance')
      if (result.ok) {
        const data = result.data && typeof result.data === 'object' ? result.data : {}
        return { ok: true, data, source: result.source }
      }
      if (result.error && (result.error.code === 'E_OFFLINE' || result.error.code === 'E_NO_TRANSPORT')) return result
      return { ok: true, data: { ok: false, error: result.error }, source: result.source }
    },
    async binaryStatus() {
      const result = await call('binaryStatus')
      if (!result.ok) return result
      return { ok: true, data: normalizeBinaryStatus(result.data), source: result.source }
    },
    /**
     * 装 FFmpeg：POST install 后轮询 progress，直到成功 / 失败 / 取消。
     * @param {(progress: { phase: string, percent: number | null, receivedBytes: number | null, totalBytes: number | null }) => void} [onProgress]
     * @param {{ signal?: any }} [options]
     */
    async binaryInstall(onProgress, options = {}) {
      const signal = options.signal
      const report = (progress) => {
        if (typeof onProgress === 'function') {
          try {
            onProgress(progress)
          } catch (error) {
            /* 进度回调的问题不能把下载带崩 */
          }
        }
      }
      if (signal && signal.aborted) {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '随时可以重试。' }, source: 'none' }
      }
      const started = await call('binaryInstall', { body: {}, signal })
      if (!started.ok) return started
      const startData = started.data && typeof started.data === 'object' ? started.data : {}
      const installJobId = typeof startData.jobId === 'string' && startData.jobId !== ''
        ? startData.jobId
        : typeof startData.id === 'string' && startData.id !== ''
          ? startData.id
          : undefined
      if (startData.state === 'system' || startData.state === 'cached') {
        return { ok: true, data: { state: startData.state, version: startData.version || null }, source: started.source }
      }
      for (let attempt = 0; attempt < maxPolls; attempt += 1) {
        if (signal && signal.aborted) {
          return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '随时可以重试。' }, source: 'none' }
        }
        const progress = await call('binaryProgress', {
          signal,
          query: installJobId === undefined ? undefined : { jobId: installJobId },
        })
        if (progress.ok) {
          const data = progress.data && typeof progress.data === 'object' ? progress.data : {}
          const shaped = normalizeProgress(data)
          report(shaped)
          if (data.state === 'system' || data.state === 'cached' || data.phase === 'done') {
            return {
              ok: true,
              data: { state: data.state === 'system' ? 'system' : 'cached', version: data.version || startData.version || null },
              source: progress.source,
            }
          }
          if (data.phase === 'failed' || data.phase === 'error' || data.state === 'failed') {
            const failure = apiErrorShape(data.error || { code: 'E_INSTALL', message: data.message || 'FFmpeg 下载失败', hint: '检查网络后重试。' })
            return { ok: false, error: failure, source: progress.source }
          }
        }
        if (attempt < maxPolls - 1) await delay(pollMs)
      }
      return {
        ok: false,
        error: {
          code: 'E_TIMEOUT',
          message: '下载一直没有完成',
          hint: '重试一次；反复失败就检查网络或代理。',
        },
        source: 'host',
      }
    },
  })
}

/* ────────────────────────────── 可注入的 fake ────────────────────────────── */

const FAKE_CAPABILITIES = Object.freeze({
  ffmpeg: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
  ffprobe: 'C:\\ffmpeg\\bin\\ffprobe.exe',
  version: '6.1.1',
  filters: ['fps', 'scale', 'palettegen', 'paletteuse', 'split', 'loudnorm'],
  encoders: ['libx264', 'libx265', 'libvpx-vp9', 'libopus', 'aac', 'libmp3lame', 'flac', 'pcm_s16le', 'gif'],
  muxers: ['mp4', 'matroska', 'mov', 'webm', 'avi', 'mp3', 'ipod', 'wav', 'flac', 'gif'],
})

/**
 * @param {string} path
 */
function fakeExt(path) {
  const name = String(path)
  const cut = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const base = cut === -1 ? name : name.slice(cut + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

const FAKE_VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'webm', 'avi']
const FAKE_AUDIO_EXTS = ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg']

/**
 * 一份可复现的 MediaFacts（不读盘，纯演示/测试）。
 * @param {string} path
 */
export function fakeFacts(path) {
  const ext = fakeExt(path)
  const isVideo = FAKE_VIDEO_EXTS.indexOf(ext) !== -1
  const isAudio = FAKE_AUDIO_EXTS.indexOf(ext) !== -1
  if (!isVideo && !isAudio) return null
  if (isAudio) {
    return {
      path,
      bytes: 3.2 * 1024 * 1024,
      container: ext,
      formatName: `${ext} (fake)`,
      durationSec: 142.6,
      streams: [{ index: 0, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 }],
      audio: { index: 0, type: 'audio', codec: 'mp3', sampleRate: 44100, channels: 2 },
      ffmpegVersion: '6.1.1',
    }
  }
  return {
    path,
    bytes: 18.2 * 1024 * 1024,
    container: ext,
    formatName: `${ext} (fake)`,
    durationSec: 12,
    streams: [
      { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
      { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
    ],
    video: { index: 0, type: 'video', codec: 'h264', width: 1920, height: 1080, fps: 30 },
    audio: { index: 1, type: 'audio', codec: 'aac', sampleRate: 48000, channels: 2 },
    ffmpegVersion: '6.1.1',
  }
}

/**
 * @param {any} task
 */
function fakeVerdict(task) {
  const facts = fakeFacts(task.input) || fakeFacts('C:\\fake\\input.mp4')
  if (task.kind === 'gif') {
    const span = Math.round((Number(task.to) - Number(task.from)) * 10) / 10
    const bytes = Math.round(1.2 * span * Math.pow((Number(task.width) || 480) / 480, 2) * ((Number(task.fps) || 12) / 12) * 1024 * 1024)
    const over = Number.isFinite(task.maxBytes) && bytes > task.maxBytes
    const checks = [
      { id: 'gif.duration', tier: 'L0', outcome: 'pass', expected: `${span.toFixed(1)}s ±0.2s`, actual: `${span.toFixed(1)}s` },
      { id: 'gif.frames', tier: 'L0', outcome: 'pass', expected: `≈ ${Math.round(span * (Number(task.fps) || 12))} 帧`, actual: `${Math.round(span * (Number(task.fps) || 12))} 帧` },
      { id: 'gif.loop', tier: 'L0', outcome: 'pass', expected: '无限循环', actual: '无限循环' },
      {
        id: 'gif.bytes',
        tier: 'L1',
        outcome: over ? 'warn' : 'pass',
        expected: Number.isFinite(task.maxBytes) ? `≤ ${(task.maxBytes / 1024 / 1024).toFixed(1)} MB` : '不设上限',
        actual: `${(bytes / 1024 / 1024).toFixed(1)} MB`,
        delta: over && Number.isFinite(task.maxBytes) ? `超 ${((bytes - task.maxBytes) / 1024 / 1024).toFixed(1)} MB` : '0',
        hint: over ? '已按建议降到 420px 重跑一次，或把宽度改小。' : '体积在目标以内。',
        repair: over ? { kind: 'reencode', width: 420 } : undefined,
      },
    ]
    return {
      ok: true,
      task,
      spec: { container: 'gif', gif: { from: task.from, to: task.to, fps: Number(task.fps) || 12, width: Number(task.width) || 480, loop: true }, maxBytes: task.maxBytes, decodable: 'sample' },
      facts: { ...facts, container: 'gif', bytes, formatName: 'gif (fake)', durationSec: span, video: undefined, audio: undefined, streams: [] },
      checks,
      repairs: [],
      evidencePath: `C:\\Users\\你\\Downloads\\Kumquat\\${'evidence'}\\verify.json`,
    }
  }
  return {
    ok: true,
    task,
    spec: { container: task.to, durationSec: { expect: facts.durationSec, toleranceSec: 0.2 }, decodable: 'sample' },
    facts,
    checks: [
      { id: 'container', tier: 'L0', outcome: 'pass', expected: task.to, actual: task.to },
      { id: 'duration', tier: 'L0', outcome: 'pass', expected: `${facts.durationSec.toFixed(1)}s ±0.2s`, actual: `${facts.durationSec.toFixed(1)}s` },
      { id: 'decodable', tier: 'L0', outcome: 'pass', expected: '可解码', actual: '前 1 秒可解码' },
    ],
    repairs: [],
    evidencePath: 'C:\\Users\\你\\Downloads\\Kumquat\\evidence\\verify.json',
  }
}

/**
 * 可注入的 fake api：不联网、不读盘、结果可复现。用于离线演示与单测。
 * @param {{ balance?: 'configured' | 'unconfigured' | 'offline', binary?: 'system' | 'cached' | 'missing', installFails?: boolean, failRun?: boolean }} [options]
 */
export function createFakeApi(options = {}) {
  const jobs = new Map()
  let sequence = 0
  const balanceMode = options.balance || 'unconfigured'
  let binaryState = options.binary || 'system'
  let installCalls = 0
  let progressCalls = 0

  const ok = (data) => ({ ok: true, data, source: 'fake' })
  const fail = (code, message, hint) => ({ ok: false, error: { code, message, hint: hint || '' }, source: 'fake' })

  /**
   * @param {string} id
   */
  function finishJob(id) {
    const entry = jobs.get(id)
    if (!entry) return null
    entry.job.status = 'done'
    entry.job.endedAt = entry.job.startedAt + 7000
    entry.job.output = entry.job.output || entry.output
    entry.job.verdict = fakeVerdict(entry.job.task)
    return entry.job
  }

  /**
   * Advance one job one poll step (shared by detail and list polling).
   * @param {string} id
   */
  function advanceJob(id) {
    const entry = jobs.get(id)
    if (!entry) return null
    if (entry.job.status === 'cancelled' || entry.job.status === 'done') return entry.job
    entry.polls += 1
    if (entry.polls === 1) {
      entry.job.status = 'running'
      entry.job.progress = { phase: 'encoding', percent: 30, outTimeSec: 3, speed: 1.3, etaSec: 6 }
    } else if (entry.polls === 2) {
      entry.job.status = 'verifying'
      entry.job.progress = { phase: 'verifying', percent: 85, outTimeSec: 10, speed: 1.1, etaSec: 2 }
    } else if (entry.polls >= 3) {
      finishJob(id)
    }
    return entry.job
  }

  return Object.freeze({
    async capabilities() {
      if (binaryState === 'missing') {
        return fail('E_CAPABILITY', '本机没有 FFmpeg', '先点「下载并安装」。')
      }
      return ok({ ...FAKE_CAPABILITIES })
    },
    async pick() {
      return fail('E_OFFLINE', '演示模式没有系统文件对话框', '改用「粘贴路径」。')
    },
    async reveal() {
      return fail('E_OFFLINE', '演示模式不能打开文件夹', '复制路径后手动打开。')
    },
    async fsList(dir) {
      return fail('E_OFFLINE', '演示模式没有目录列表', '改用「粘贴路径」。')
    },
    async probe(input) {
      if (typeof input !== 'string' || !/^([A-Za-z]:[\\/]|\\\\|\/)/.test(input)) {
        return fail('E_INPUT', '需要绝对路径', '例如 D:\\示例\\video.mp4。')
      }
      const facts = fakeFacts(input)
      if (facts === null) return fail('E_INPUT', '不认识的媒体文件', '支持 mp4/mkv/mov/webm/avi/mp3/m4a/wav/flac。')
      return ok(facts)
    },
    async run(task) {
      if (options.failRun) return fail('E_ENCODE', '编码器起不来', '确认 FFmpeg 可用后重试。')
      sequence += 1
      const id = `fake-${sequence}`
      const output = task.kind === 'gif'
        ? task.input.replace(/\.[^\\/.]*$/, '') + `_${String(task.from).replace('.', '-')}-${String(task.to).replace('.', '-')}.gif`
        : task.input.replace(/\.[^\\/.]*$/, '') + `.${task.to}`
      const job = {
        id,
        task,
        status: 'queued',
        startedAt: 1700000000000 + sequence,
        output,
      }
      jobs.set(id, { job, polls: 0, output })
      return ok({ id, task, status: 'queued', startedAt: job.startedAt })
    },
    async job(id) {
      const job = advanceJob(id)
      if (!job) return fail('E_INPUT', '没有这个任务', '结果行会自己重试。')
      return ok({ ...job })
    },
    async jobs() {
      const list = [...jobs.keys()].map((id) => advanceJob(id)).filter(Boolean)
      return ok(list.map((job) => ({ ...job })))
    },
    async cancel(id) {
      const entry = jobs.get(id)
      if (!entry) return fail('E_INPUT', '没有这个任务', '')
      if (entry.job.status !== 'done') entry.job.status = 'cancelled'
      return ok({ id })
    },
    async balance() {
      if (balanceMode === 'offline') return fail('E_OFFLINE', '宿主没有响应', '确认窗口还在。')
      if (balanceMode === 'configured') return ok({ ok: true, currency: 'CNY', total: '12.34', available: true })
      return ok({ ok: false, error: { code: 'E_NO_KEY', message: '没有配置 DeepSeek key' } })
    },
    async binaryStatus() {
      return ok({ state: binaryState, version: binaryState === 'missing' ? null : '6.1.1', sizeHint: 80 * 1024 * 1024 })
    },
    async binaryInstall(onProgress, installOptions = {}) {
      installCalls += 1
      const report = (progress) => {
        if (typeof onProgress === 'function') {
          try {
            onProgress(progress)
          } catch (error) {
            /* ignore */
          }
        }
      }
      if (installOptions.signal && installOptions.signal.aborted) {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '' }, source: 'fake' }
      }
      if (options.installFails) {
        report({ phase: 'download', percent: 42, receivedBytes: 32 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
        return { ok: false, error: { code: 'E_INSTALL', message: '下载中断了', hint: '检查网络后重试。' }, source: 'fake' }
      }
      report({ phase: 'download', percent: 0, receivedBytes: 0, totalBytes: 80 * 1024 * 1024 })
      if (installOptions.signal && installOptions.signal.aborted) {
        return { ok: false, error: { code: 'E_CANCELLED', message: '已取消下载', hint: '' }, source: 'fake' }
      }
      report({ phase: 'download', percent: 55, receivedBytes: 44 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      report({ phase: 'extract', percent: 100, receivedBytes: 80 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      report({ phase: 'verify', percent: 100, receivedBytes: 80 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      binaryState = 'cached'
      report({ phase: 'done', percent: 100, receivedBytes: 80 * 1024 * 1024, totalBytes: 80 * 1024 * 1024 })
      progressCalls += 1
      return { ok: true, data: { state: 'cached', version: '6.1.1' }, source: 'fake' }
    },
  })
}









