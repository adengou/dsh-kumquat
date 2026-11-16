/**
 * Kumquat Host routes, transport-free.
 *
 * One prefix — `/api/kumquat` — owns every endpoint the panel calls:
 *
 * ```
 * GET  /api/kumquat/capabilities
 * POST /api/kumquat/probe                { path }            (also accepts { input })
 * POST /api/kumquat/run                  { task, overwrite? }
 * GET  /api/kumquat/jobs
 * GET  /api/kumquat/jobs/:id
 * POST /api/kumquat/cancel               { jobId }
 * POST /api/kumquat/jobs/:id/cancel      (same operation, path-addressed)
 * GET  /api/kumquat/balance
 * GET  /api/kumquat/ffmpeg/status
 * POST /api/kumquat/ffmpeg/install
 * GET  /api/kumquat/ffmpeg/progress?jobId=...   (jobId optional: latest job)
 * ```
 *
 * The path-addressed cancel and the `input` probe field exist because the
 * Client half shipped with them; both are aliases over one implementation, so
 * there is still exactly one cancel and one probe.
 * Everything an untrusted caller can send is rebuilt from a whitelist: unknown
 * keys are dropped, paths must be absolute and free of control characters, and
 * no value is ever handed to a shell — the engine receives an argv array built
 * from the validated fields.
 *
 * `handle()` never throws. Failures answer with the frozen
 * `{ ok: false, error: { code, message, hint } }` envelope.
 */

import { isAbsolute } from 'node:path'

import { HOST_CODES, WiringError, errorResult, toErrorShape } from './errors.js'
import { PANEL } from './panel.js'

/** Fixed route prefix. The Client hard-codes the same value. */
export const ROUTE_PREFIX = '/api/kumquat'

/** Output containers the product accepts for a convert task. */
export const CONTAINERS = Object.freeze(['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'wav', 'flac'])

/** Bounds applied to every user-supplied value. */
export const LIMITS = Object.freeze({
  /** Longest accepted filesystem path. */
  maxPathLength: 4096,
  /** Longest accepted job identifier. */
  maxIdLength: 64,
  /** Longest GIF segment, in seconds. */
  maxSpanSec: 600,
  /** Frame-rate range for a GIF. */
  minFps: 1,
  maxFps: 60,
  /** Output width range for a GIF, in pixels. */
  minWidth: 16,
  maxWidth: 1920,
  /** Target-size range for a GIF, in bytes. */
  minMaxBytes: 64 * 1024,
  maxMaxBytes: 512 * 1024 * 1024,
})

/** Job identifiers: one leading alphanumeric, then `._-`. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** Control characters a filesystem path must not carry. */
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/

/**
 * Build one failure result.
 * @param {number} status - HTTP status.
 * @param {string} code - Machine-readable code.
 * @param {string} message - Operator-facing sentence.
 * @param {string} [hint] - What to do next.
 * @param {Record<string, unknown>} [extra] - Additional body fields.
 * @returns {{ status: number, body: Record<string, unknown> }} Result.
 */
function fail(status, code, message, hint, extra) {
  return { status, body: { ok: false, error: { code, message, hint }, ...extra } }
}

/**
 * Reject a request whose method the route does not accept.
 * @param {string} allow - Accepted methods, joined for the `Allow` header.
 * @returns {{ status: number, headers: Record<string, string>, body: Record<string, unknown> }} Result.
 */
function methodNotAllowed(allow) {
  const result = fail(405, HOST_CODES.METHOD, `该接口只接受 ${allow}`, '换用正确的请求方法。')
  return { ...result, headers: { allow } }
}

/**
 * True for a plain JSON object.
 * @param {unknown} value - Candidate.
 * @returns {boolean} Whether the value is a non-array object.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Validate an absolute filesystem path.
 *
 * The path is never interpolated into a command line; the engine receives it
 * as one argv element. Rejecting relative paths removes an ambiguity the panel
 * cannot resolve (the Host's working directory is not the user's).
 * @param {unknown} value - Candidate from the request body.
 * @returns {{ ok: true, value: string } | { ok: false, message: string, hint: string }} Outcome.
 */
export function validatePath(value) {
  if (typeof value !== 'string' || value === '') {
    return { ok: false, message: '缺少文件路径', hint: '上传前先在面板里选择文件，或粘贴一个绝对路径。' }
  }
  if (value.length > LIMITS.maxPathLength) {
    return { ok: false, message: '路径过长', hint: `路径不能超过 ${LIMITS.maxPathLength} 个字符。` }
  }
  if (CONTROL_PATTERN.test(value)) {
    return { ok: false, message: '路径包含控制字符', hint: '重新选择文件；不要把换行或制表符粘进路径。' }
  }
  if (!isAbsolute(value)) {
    return { ok: false, message: '需要绝对路径', hint: '请粘贴以磁盘盘符或 / 开头的完整路径。' }
  }
  return { ok: true, value }
}

/**
 * Validate a job identifier.
 * @param {unknown} value - Candidate from the query string or body.
 * @returns {{ ok: true, value: string } | { ok: false, message: string, hint: string }} Outcome.
 */
export function validateJobId(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    return { ok: false, message: '任务编号不合法', hint: '使用 /api/kumquat/jobs 返回的 id 原样查询。' }
  }
  return { ok: true, value }
}

/**
 * Validate one numeric option inside a range.
 * @param {unknown} value - Candidate.
 * @param {number} min - Inclusive minimum.
 * @param {number} max - Inclusive maximum.
 * @param {boolean} integer - Whether a fractional value is rejected.
 * @returns {number | undefined} Accepted value, or undefined.
 */
function bounded(value, min, max, integer) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (integer && !Number.isInteger(value)) return undefined
  if (value < min || value > max) return undefined
  return value
}

/**
 * Rebuild a task from its whitelisted fields.
 *
 * The returned object is a new one, so a caller cannot smuggle extra keys
 * (for example an output template) into the engine through `task`.
 * @param {unknown} value - Candidate task.
 * @returns {{ ok: true, value: import('../public/types.d.ts').Task } | { ok: false, message: string, hint: string }} Outcome.
 */
export function validateTask(value) {
  if (!isPlainObject(value)) {
    return { ok: false, message: '缺少任务描述', hint: 'task 必须是 { kind: "convert" | "gif", … } 对象。' }
  }
  const raw = /** @type {Record<string, unknown>} */ (value)
  const kind = raw.kind
  if (kind !== 'convert' && kind !== 'gif') {
    return { ok: false, message: '未知的任务类型', hint: 'kind 只能是 "convert" 或 "gif"。' }
  }
  const input = validatePath(raw.input)
  if (!input.ok) return input

  if (kind === 'convert') {
    if (typeof raw.to !== 'string') {
      return { ok: false, message: '缺少目标格式', hint: `to 取 ${CONTAINERS.join(' / ')} 之一。` }
    }
    const to = raw.to.trim().toLowerCase()
    if (!CONTAINERS.includes(to)) {
      return { ok: false, message: `不支持的目标格式：${to.slice(0, 16)}`, hint: `to 取 ${CONTAINERS.join(' / ')} 之一。` }
    }
    /** @type {import('../public/types.d.ts').ConvertTask} */
    const task = { kind: 'convert', input: input.value, to }
    if (typeof raw.copy === 'boolean') task.copy = raw.copy
    return { ok: true, value: task }
  }

  const from = bounded(raw.from, 0, 86_400, false)
  const to = bounded(raw.to, 0, 86_400, false)
  if (from === undefined || to === undefined) {
    return { ok: false, message: '选区不合法', hint: 'from / to 是以秒为单位的数字，范围 0–86400。' }
  }
  if (to <= from) {
    return { ok: false, message: '选区结束时间必须晚于开始时间', hint: '把结束时间拖到开始时间右侧。' }
  }
  if (to - from > LIMITS.maxSpanSec) {
    return {
      ok: false,
      message: `选区过长（${Math.round(to - from)} 秒）`,
      hint: `单次 GIF 最多 ${LIMITS.maxSpanSec} 秒，缩短选区或分成几段。`,
    }
  }
  /** @type {import('../public/types.d.ts').GifTask} */
  const task = { kind: 'gif', input: input.value, from, to }
  if (raw.fps !== undefined) {
    const fps = bounded(raw.fps, LIMITS.minFps, LIMITS.maxFps, true)
    if (fps === undefined) {
      return { ok: false, message: '帧率不合法', hint: `fps 取 ${LIMITS.minFps}–${LIMITS.maxFps} 的整数。` }
    }
    task.fps = fps
  }
  if (raw.width !== undefined) {
    const width = bounded(raw.width, LIMITS.minWidth, LIMITS.maxWidth, true)
    if (width === undefined) {
      return { ok: false, message: '宽度不合法', hint: `width 取 ${LIMITS.minWidth}–${LIMITS.maxWidth} 的整数。` }
    }
    task.width = width
  }
  if (raw.maxBytes !== undefined) {
    const maxBytes = bounded(raw.maxBytes, LIMITS.minMaxBytes, LIMITS.maxMaxBytes, true)
    if (maxBytes === undefined) {
      return {
        ok: false,
        message: '目标体积不合法',
        hint: `maxBytes 取 ${LIMITS.minMaxBytes}–${LIMITS.maxMaxBytes} 字节。`,
      }
    }
    task.maxBytes = maxBytes
  }
  return { ok: true, value: task }
}

/**
 * Create one request handler.
 *
 * @param {{
 *   getService: () => Promise<import('../public/types.d.ts').MediaQcService>,
 *   balance: { getBalance: () => Promise<Readonly<import('../public/types.d.ts').BalanceInfo>> },
 *   ffmpeg: { status: () => Promise<unknown>, start: () => Record<string, unknown>, progress: (jobId: string) => unknown },
 *   progress?: { merge: (summary: unknown) => unknown },
 *   config: { autoDownload: boolean },
 *   logger?: { warn?: (message: string) => void, error?: (message: string, error?: unknown) => void },
 *   capabilitiesTtlMs?: number,
 *   now?: () => number,
 * }} options - Collaborators; every one is injectable for tests.
 * @returns {(request: { method: string, pathname: string, searchParams?: URLSearchParams, body?: unknown }) => Promise<{ status: number, body: unknown, headers?: Record<string, string> }>}
 *   Handler that always resolves.
 */
export function createRouter(options) {
  const getService = options.getService
  const balance = options.balance
  const ffmpeg = options.ffmpeg
  const config = options.config
  const logger = options.logger
  const now = options.now ?? Date.now
  const capabilitiesTtlMs = options.capabilitiesTtlMs ?? 60_000
  // Per-job progress supplied by the scheduler; identity when unwired.
  const progressTable = options.progress ?? { merge: summary => summary }

  /** @type {{ expires: number, value: unknown } | null} */
  let capabilitiesCache = null
  /** @type {Promise<Record<string, unknown>> | undefined} */
  let capabilitiesInFlight

  /**
   * Resolve the service, turning a pre-integration throw into a wiring answer.
   * @returns {Promise<import('../public/types.d.ts').MediaQcService>} Service.
   * @throws {WiringError} When the bundle is not wired yet.
   */
  async function service() {
    try {
      const instance = await getService()
      if (instance === null || typeof instance !== 'object') {
        throw new Error('createService 没有返回服务对象')
      }
      return instance
    } catch (cause) {
      throw new WiringError(
        `Kumquat 服务尚未接线：${cause instanceof Error ? cause.message : String(cause)}`,
        '这是集成前的预期状态；接线后无需重装插件，重新打开面板即可。',
        { cause },
      )
    }
  }

  /**
   * Capabilities, memoized: the probe behind them may spawn ffprobe.
   * A cold panel often fires this twice; the second call joins the first.
   * @returns {Promise<Record<string, unknown>>} Capabilities plus the panel identity.
   */
  async function capabilities() {
    const stamp = now()
    if (capabilitiesCache !== null && stamp < capabilitiesCache.expires) {
      return /** @type {Record<string, unknown>} */ (capabilitiesCache.value)
    }
    if (capabilitiesInFlight !== undefined) return capabilitiesInFlight
    const attempt = (async () => {
      const instance = await service()
      const capabilities = await instance.capabilities()
      const body = {
        apiVersion: instance.apiVersion ?? 1,
        ...capabilities,
        // Additive field: the Client reads the panel identity from one source.
        panel: PANEL,
      }
      capabilitiesCache = { expires: stamp + capabilitiesTtlMs, value: body }
      return body
    })()
    capabilitiesInFlight = attempt.finally(() => {
      capabilitiesInFlight = undefined
    })
    return capabilitiesInFlight
  }

  /**
   * Cancel exactly one job. Shared by the body-addressed and path-addressed
   * forms so the two spellings cannot drift.
   * @param {string} jobId - Validated job identifier.
   * @returns {Promise<{ status: number, body: unknown }>} Result.
   */
  async function cancelOne(jobId) {
    await (await service()).cancel(jobId)
    return { status: 200, body: { ok: true, jobId } }
  }

  /**
   * Build the FFmpeg progress body.
   *
   * The documented fields are `phase`/`received`/`total`/`percent`/`error`.
   * The Client reads `receivedBytes`/`totalBytes`, needs `state` to recognise
   * completion, and expects `error` as an object, so the same view carries
   * both spellings. Nothing is derived twice.
   * @param {{ phase: string, state?: string, version?: string, received?: number, total?: number,
   *   percent?: number, error?: string }} view - View from the installer.
   * @returns {Record<string, unknown>} Progress body.
   */
  function progressBody(view) {
    /** @type {Record<string, unknown>} */
    const body = { phase: view.phase }
    if (view.state !== undefined) body.state = view.state
    if (view.version !== undefined) body.version = view.version
    if (view.received !== undefined) {
      body.received = view.received
      body.receivedBytes = view.received
    }
    if (view.total !== undefined) {
      body.total = view.total
      body.totalBytes = view.total
    }
    if (view.percent !== undefined) body.percent = view.percent
    if (view.error !== undefined) {
      body.message = view.error
      body.error = {
        code: view.error === 'cancelled' ? 'E_CANCELLED' : 'E_INSTALL',
        message: view.error === 'cancelled' ? '已取消下载' : view.error,
        hint: view.error === 'cancelled' ? '随时可以重试。' : '检查网络或磁盘空间后重试。',
      }
    }
    return body
  }

  /**
   * Dispatch one parsed request.
   * @param {{ method: string, pathname: string, searchParams?: URLSearchParams, body?: unknown }} request
   *   Parsed request.
   * @returns {Promise<{ status: number, body: unknown, headers?: Record<string, string> }>} Result.
   */
  async function dispatch(request) {
    const method = typeof request.method === 'string' ? request.method.toUpperCase() : ''
    const pathname = typeof request.pathname === 'string' ? request.pathname : ''
    const searchParams = request.searchParams ?? new URLSearchParams()
    const body = isPlainObject(request.body) ? /** @type {Record<string, unknown>} */ (request.body) : {}

    if (!pathname.startsWith(`${ROUTE_PREFIX}/`)) {
      return fail(404, HOST_CODES.ROUTE, '没有这个接口', '调用 /api/kumquat 下的已知路径。')
    }
    const segments = pathname.slice(ROUTE_PREFIX.length + 1).split('/')
    if (segments.some(segment => segment === '')) {
      return fail(404, HOST_CODES.ROUTE, '没有这个接口', '调用 /api/kumquat 下的已知路径。')
    }

    if (segments.length === 1) {
      switch (segments[0]) {
        case 'capabilities':
          if (method !== 'GET') return methodNotAllowed('GET')
          return { status: 200, body: await capabilities() }
        case 'probe': {
          if (method !== 'POST') return methodNotAllowed('POST')
          // `path` is the documented field; `input` is the Client's spelling.
          const path = validatePath(body.path === undefined ? body.input : body.path)
          if (!path.ok) return fail(400, HOST_CODES.INPUT, path.message, path.hint)
          const instance = await service()
          return { status: 200, body: await instance.probe(path.value) }
        }
        case 'run': {
          if (method !== 'POST') return methodNotAllowed('POST')
          const task = validateTask(body.task)
          if (!task.ok) return fail(400, HOST_CODES.INPUT, task.message, task.hint)
          const instance = await service()
          const runOptions = typeof body.overwrite === 'boolean' ? { overwrite: body.overwrite } : undefined
          return { status: 202, body: progressTable.merge(await instance.run(task.value, runOptions)) }
        }
        case 'jobs':
          if (method !== 'GET') return methodNotAllowed('GET')
          return { status: 200, body: (await (await service()).jobs.list()).map(summary => progressTable.merge(summary)) }
        case 'cancel': {
          if (method !== 'POST') return methodNotAllowed('POST')
          const jobId = validateJobId(body.jobId)
          if (!jobId.ok) return fail(400, HOST_CODES.INPUT, jobId.message, jobId.hint)
          return cancelOne(jobId.value)
        }
        case 'balance':
          if (method !== 'GET') return methodNotAllowed('GET')
          return { status: 200, body: await balance.getBalance() }
        default:
          return fail(404, HOST_CODES.ROUTE, '没有这个接口', '调用 /api/kumquat 下的已知路径。')
      }
    }

    if (segments.length === 2) {
      if (segments[0] === 'jobs') {
        if (method !== 'GET') return methodNotAllowed('GET')
        const jobId = validateJobId(segments[1])
        if (!jobId.ok) return fail(400, HOST_CODES.INPUT, jobId.message, jobId.hint)
        return { status: 200, body: progressTable.merge(await (await service()).jobs.get(jobId.value)) }
      }
      if (segments[0] === 'ffmpeg') {
        switch (segments[1]) {
          case 'status':
            if (method !== 'GET') return methodNotAllowed('GET')
            return { status: 200, body: await ffmpeg.status() }
          case 'install': {
            if (method !== 'POST') return methodNotAllowed('POST')
            if (config.autoDownload === false) {
              return fail(
                403,
                HOST_CODES.DISABLED,
                '自动下载 FFmpeg 已关闭',
                '在插件配置里把 autoDownload 设为 true，或把已装好的 ffmpeg 路径填进 ffmpegPath。',
              )
            }
            const outcome = ffmpeg.start()
            if ('disabled' in outcome && outcome.disabled === true) {
              return fail(403, HOST_CODES.DISABLED, '自动下载 FFmpeg 已关闭', '在插件配置里把 autoDownload 设为 true。')
            }
            if ('busy' in outcome && outcome.busy === true) {
              // One install at a time: a second request joins the running job
              // instead of failing, so two panels cannot fight over the banner.
              return { status: 202, body: { jobId: outcome.jobId, reused: true } }
            }
            if (typeof outcome.jobId !== 'string') {
              return fail(500, HOST_CODES.HOST, '安装任务没有启动', '重试一次；若仍失败，查看宿主日志。')
            }
            return { status: 202, body: { jobId: outcome.jobId } }
          }
          case 'progress': {
            if (method !== 'GET') return methodNotAllowed('GET')
            const requested = searchParams.get('jobId')
            /** @type {string | undefined} */
            let jobId
            if (requested === null) {
              // The Client polls without an id; follow the latest install so a
              // reopened panel keeps watching the same job.
              jobId = ffmpeg.latestJobId()
              if (jobId === undefined) {
                return fail(
                  404,
                  HOST_CODES.NOT_FOUND,
                  '还没有 FFmpeg 安装任务',
                  '先调用 POST /api/kumquat/ffmpeg/install；也可以查询 /api/kumquat/ffmpeg/status。',
                )
              }
            } else {
              const checked = validateJobId(requested)
              if (!checked.ok) return fail(400, HOST_CODES.INPUT, checked.message, checked.hint)
              jobId = checked.value
            }
            const view = ffmpeg.progress(jobId)
            if (view === undefined) {
              return fail(
                404,
                HOST_CODES.NOT_FOUND,
                '没有这个安装任务',
                '任务编号来自 /api/kumquat/ffmpeg/install；宿主只保留最近几次任务，超时后重新查询状态。',
              )
            }
            return { status: 200, body: progressBody(view) }
          }
          default:
            return fail(404, HOST_CODES.ROUTE, '没有这个接口', '调用 /api/kumquat 下的已知路径。')
        }
      }
    }

    if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'cancel') {
      if (method !== 'POST') return methodNotAllowed('POST')
      const jobId = validateJobId(segments[1])
      if (!jobId.ok) return fail(400, HOST_CODES.INPUT, jobId.message, jobId.hint)
      return cancelOne(jobId.value)
    }

    return fail(404, HOST_CODES.ROUTE, '没有这个接口', '调用 /api/kumquat 下的已知路径。')
  }

  return async function handle(request) {
    try {
      return await dispatch(request)
    } catch (error) {
      // Engine, verify, and host errors all arrive here: project them, log the
      // detail, and never let a rejection escape into the HTTP adapter.
      const shape = toErrorShape(error)
      logger?.error?.(`kumquat: ${shape.code} ${shape.message}`, error)
      return errorResult(error)
    }
  }
}
