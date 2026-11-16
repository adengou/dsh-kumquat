/**
 * Kumquat Host plugin.
 *
 * The bundle's Host half does two things:
 *
 * 1. it owns the `/api/kumquat` route family the panel calls, and
 * 2. it keeps the process-side state those routes share — the lazily created
 *    media service, the DeepSeek balance cache, and the FFmpeg install job.
 *
 * The panel itself is a Client slot occupant (`src/host/panel.js` records the
 * agreed identity); the Host does not register UI. Routes are registered
 * through the Web server service with the standard `ctx.effect` disposer, and
 * every request is admitted by the Connection service, which owns browser
 * authentication and the Host/Origin fence.
 *
 * A bundle whose service is not wired yet answers 501 with the reason; it
 * never throws during activation, so a missing integration cannot take the
 * host down.
 */

import { createBalance } from './balance.js'
import { describeConfig, readRowConfig, resolveConfig } from './config.js'
import { createInstaller } from './ffmpeg.js'
import { createHttpHandler } from './http.js'
import { createProgressTable } from './progress.js'
import { createRouter, ROUTE_PREFIX } from './routes.js'
import { createServiceProvider } from './service.js'

/** Status the route answers when the Web transport cannot authenticate callers. */
const UNAVAILABLE = 503

/**
 * Create one caller logger that never receives configuration values.
 * @param {any} ctx - Host context.
 * @returns {{ info: (message: string) => void, warn: (message: string) => void, error: (message: string, error?: unknown) => void }}
 *   Logger facade.
 */
function createLogger(ctx) {
  /**
   * @param {'info' | 'warn' | 'error'} level - Level to emit.
   * @param {string} message - Static text.
   * @param {unknown} [error] - Optional cause.
   */
  function emit(level, message, error) {
    const logger = ctx?.logger
    if (logger === undefined || logger === null) return
    const method = logger[level]
    if (typeof method !== 'function') return
    try {
      if (error === undefined) method.call(logger, message)
      else method.call(logger, message, error)
    } catch {
      // Logging must never turn a request into a failure.
    }
  }
  return {
    info: message => emit('info', message),
    warn: message => emit('warn', message),
    error: (message, error) => emit('error', message, error),
  }
}

/**
 * Mount the Host half.
 *
 * @param {any} ctx - Host Cordis context.
 * @param {unknown} [config] - Profile row config; read from the fiber entry when
 *   the bundle entry forwards only `ctx`.
 * @returns {Promise<void>} Resolves once the routes are registered.
 */
export async function apply(ctx, config) {
  const resolved = resolveConfig(readRowConfig(ctx, config))
  const logger = createLogger(ctx)

  // Per-job progress from the scheduler. The scheduler emits one event per
  // update carrying the job id, so the table stays isolated per job; the
  // route layer attaches a slice only to the row it belongs to.
  const progressTable = createProgressTable()

  /**
   * Accept every progress shape the service may forward: `(jobId, progress)`,
   * a scheduler event `{ type, id, progress }`, or `{ jobId, …fields }`.
   * @param {unknown} first - Job id, or an event object.
   * @param {unknown} [second] - Progress when the first argument is an id.
   */
  function recordProgress(first, second) {
    try {
      if (typeof first === 'string') {
        progressTable.record(first, second)
        return
      }
      if (first === null || typeof first !== 'object') return
      const event = /** @type {{ id?: unknown, jobId?: unknown, progress?: unknown }} */ (first)
      if (event.progress !== undefined && (typeof event.id === 'string' || typeof event.jobId === 'string')) {
        progressTable.record(typeof event.id === 'string' ? event.id : event.jobId, event.progress)
        return
      }
      if (typeof event.jobId === 'string') progressTable.record(event.jobId, event)
    } catch {
      // A broken progress listener must never disturb the scheduler.
    }
  }

  const getService = createServiceProvider({
    load: () => import('../public/index.js'),
    options: {
      outputDir: resolved.outputDir,
      ffmpegPath: resolved.ffmpegPath,
      binaryRoot: resolved.binaryRoot,
      // The service owns the scheduler; it forwards updates through one of
      // these two names, both of which land in the same table.
      onProgress: recordProgress,
      onEvent: recordProgress,
    },
  })

  // Reuse the key Harness already stores (the same DEEPSEEK_API_KEY the chat
  // provider uses). Explicit plugin config still wins, then the process
  // environment, then the credential store.
  const readStoredKey = async () => {
    try {
      const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
      if (!credentials || typeof credentials.resolve !== 'function') return undefined
      const hit = await credentials.resolve('DEEPSEEK_API_KEY')
      const value = hit && typeof hit === 'object' ? hit.value : undefined
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  const balance = createBalance({
    getApiKey: async () => resolved.apiKey ?? (await readStoredKey()),
    cacheMs: resolved.balanceRefreshMs,
  })

  const installer = createInstaller({
    root: resolved.binaryRoot,
    autoDownload: resolved.autoDownload,
  })

  const router = createRouter({
    getService,
    balance,
    ffmpeg: installer,
    progress: progressTable,
    config: resolved,
    logger,
  })

  ctx.effect(() => () => {
    installer.dispose()
    balance.clear()
    progressTable.clear()
  }, 'kumquat: balance cache, install jobs, and per-job progress')

  ctx.inject(['webServer'], (webCtx) => {
    /**
     * Admit one request through Connection's browser fence and authentication.
     * @param {import('node:http').IncomingMessage} request - Incoming request.
     * @returns {number | undefined} Rejection status, or undefined when admitted.
     */
    function authorize(request) {
      const connection = webCtx.get('connection')
      if (connection === undefined || typeof connection.requestRejection !== 'function') return UNAVAILABLE
      return connection.requestRejection(request)
    }

    const handler = createHttpHandler(router, { authorize, logger })
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }),
      'kumquat: /api/kumquat routes',
    )
  })

  logger.info(`kumquat: host ready; ${JSON.stringify(describeConfig(resolved))}`)
}
