/**
 * FFmpeg install jobs, Host side.
 *
 * D8 moved binary acquisition into the product: when no FFmpeg is found the
 * panel offers one download instead of sending the user to a vendor page.
 * The download, checksum, extraction, and verification all belong to the
 * binary manager (`src/binary/`, S6); this module owns only the job that the
 * panel watches:
 *
 * - one install runs at a time;
 * - the job lives on the Host, so closing the panel does not cancel it;
 * - progress is polled through `GET /api/kumquat/ffmpeg/progress`;
 * - the binary manager module is loaded lazily, so an unwired build reports
 *   a wiring error instead of crashing the host.
 */

import { randomUUID } from 'node:crypto'

import { WiringError } from './errors.js'

/** Progress phases the panel renders. */
export const PHASES = Object.freeze(['download', 'extract', 'verify', 'done', 'error'])

/** Status states the panel renders when it opens. */
export const STATUS_STATES = Object.freeze(['system', 'cached', 'missing'])

/** How many finished jobs stay readable, so a late poll still answers. */
const HISTORY_LIMIT = 8

/**
 * Load the binary manager.
 *
 * The module is owned by S6 and may not exist before integration; a missing
 * module is a wiring state, not a crash.
 * @returns {Promise<{ installBinary?: Function, status?: Function, default?: unknown } | undefined>}
 *   Module namespace, or undefined when the file does not exist yet.
 */
async function loadBinaryManager() {
  try {
    return await import('../binary/index.js')
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return undefined
    throw error
  }
}

/**
 * Pick the function export by name, falling back to a default-exported object.
 * @param {Record<string, unknown> | undefined} module - Loaded module.
 * @param {string} name - Export name.
 * @returns {Function | undefined} Function, when the module provides one.
 */
function pickExport(module, name) {
  if (module === undefined) return undefined
  const direct = module[name]
  if (typeof direct === 'function') return direct
  const fallback = module.default
  if (fallback !== null && typeof fallback === 'object' && name in fallback) {
    const nested = /** @type {Record<string, unknown>} */ (fallback)[name]
    if (typeof nested === 'function') return nested
  }
  return undefined
}

/**
 * Normalize one progress report from the binary manager.
 *
 * Unknown phases keep the previous phase and still update byte counters, so a
 * manager that adds a phase later cannot make the panel jump backwards.
 * @param {{ phase?: unknown, received?: unknown, total?: unknown, error?: unknown }} event - Raw report.
 * @param {{ phase: string, received?: number, total?: number, percent?: number, error?: string }} previous
 *   Last known job view.
 * @returns {{ phase: string, received?: number, total?: number, percent?: number, error?: string }}
 *   Normalized view.
 */
function normalizeProgress(event, previous) {
  const next = { ...previous }
  if (event !== null && typeof event === 'object') {
    const phase = typeof event.phase === 'string' ? event.phase : ''
    if (PHASES.includes(phase)) next.phase = phase
    if (typeof event.received === 'number' && Number.isFinite(event.received) && event.received >= 0) {
      next.received = Math.floor(event.received)
    }
    if (typeof event.total === 'number' && Number.isFinite(event.total) && event.total > 0) {
      next.total = Math.floor(event.total)
    }
    if (typeof event.error === 'string' && event.error !== '') next.error = event.error
    if (next.total !== undefined && next.received !== undefined) {
      next.percent = Math.min(100, Math.max(0, Math.round((next.received / next.total) * 100)))
    }
  }
  return next
}

/**
 * Normalize the binary manager's status answer.
 * @param {unknown} raw - Answer from the manager.
 * @returns {{ state: 'system' | 'cached' | 'missing', path?: string, version?: string, sizeHint?: number }}
 *   Status the panel renders.
 */
export function normalizeStatus(raw) {
  if (raw === null || typeof raw !== 'object') return { state: 'missing' }
  const record = /** @type {Record<string, unknown>} */ (raw)
  /** @type {'system' | 'cached' | 'missing'} */
  let state = 'missing'
  if (typeof record.state === 'string' && STATUS_STATES.includes(record.state)) {
    state = /** @type {'system' | 'cached' | 'missing'} */ (record.state)
  } else if (record.system === true) {
    state = 'system'
  } else if (typeof record.path === 'string' && record.path !== '') {
    state = 'cached'
  }
  /** @type {{ state: 'system' | 'cached' | 'missing', path?: string, version?: string, sizeHint?: number }} */
  const status = { state }
  if (typeof record.path === 'string' && record.path !== '') status.path = record.path
  if (typeof record.version === 'string' && record.version !== '') status.version = record.version
  if (typeof record.sizeHint === 'number' && Number.isFinite(record.sizeHint) && record.sizeHint > 0) {
    status.sizeHint = record.sizeHint
  }
  return status
}

/**
 * Create the install-job owner.
 *
 * @param {{
 *   root: string,
 *   autoDownload?: boolean,
 *   loadManager?: () => Promise<Record<string, unknown> | undefined>,
 *   now?: () => number,
 * }} options - Install root and injectable manager loader.
 * @returns {{
 *   status: () => Promise<{ state: 'system' | 'cached' | 'missing', path?: string, version?: string, sizeHint?: number }>,
 *   start: () => { jobId: string } | { busy: true, jobId: string } | { disabled: true },
 *   progress: (jobId: string) => { phase: string, state?: string, version?: string, received?: number,
 *     total?: number, percent?: number, error?: string } | undefined,
 *   latestJobId: () => string | undefined,
 *   runningJobId: () => string | undefined,
 *   dispose: () => void,
 * }} Job owner.
 */
export function createInstaller(options) {
  const root = options.root
  const resolveSystemFfmpeg = typeof options.resolveSystemFfmpeg === 'function'
    ? options.resolveSystemFfmpeg
    : async () => {
      const { resolveFfmpeg } = await import('../engine/locate.js')
      return resolveFfmpeg({})
    }
  const autoDownload = options.autoDownload !== false
  const loadManager = options.loadManager ?? loadBinaryManager
  const now = options.now ?? Date.now

  /** @type {Map<string, { jobId: string, phase: string, state?: string, received?: number, total?: number, percent?: number, error?: string, version?: string, done: boolean, startedAt: number, endedAt?: number }>} */
  const jobs = new Map()
  /** @type {AbortController | undefined} */
  let activeController
  /** @type {string | undefined} */
  let activeJobId
  /** @type {string | undefined} */
  let latest

  /**
   * Resolve the manager or fail as a wiring problem.
   * @returns {Promise<{ installBinary: Function, status: Function }>} Manager exports.
   */
  async function manager() {
    const module = await loadManager()
    const installBinary = pickExport(module, 'installBinary')
    const status = pickExport(module, 'status')
    if (installBinary === undefined || status === undefined) {
      throw new WiringError(
        'FFmpeg 安装器尚未接线（缺少 src/binary/index.js 的 installBinary/status）',
        '集成后重试；也可以手动把 ffmpeg 放到 PATH，或在配置里填写 ffmpegPath。',
      )
    }
    return { installBinary: /** @type {Function} */ (installBinary), status: /** @type {Function} */ (status) }
  }

  /**
   * Answer the current availability without starting anything.
   * @returns {Promise<{ state: 'system' | 'cached' | 'missing', path?: string, version?: string, sizeHint?: number }>}
   *   Status.
   */
  async function status() {
    // A working FFmpeg on this machine wins: do not ask the user to download
    // 110 MB when `ffmpeg` already answers on PATH.
    try {
      const found = await resolveSystemFfmpeg()
      if (found !== null && found !== undefined) {
        const rootPrefix = String(root).replace(/[\\/]+$/, '').toLowerCase()
        const normalized = String(found.ffmpeg).replace(/\\/g, '/').toLowerCase()
        const state = normalized.startsWith(rootPrefix.replace(/\\/g, '/')) ? 'cached' : 'system'
        return { state, path: found.ffmpeg, version: found.version }
      }
    } catch {
      /* fall through to the managed copy */
    }
    const { status: readStatus } = await manager()
    const raw = await readStatus()
    return normalizeStatus(raw)
  }

  /**
   * Keep the job table bounded: finished jobs fall off oldest first.
   */
  function prune() {
    const finished = [...jobs.values()].filter(job => job.done)
    while (jobs.size > HISTORY_LIMIT && finished.length > 0) {
      const oldest = finished.shift()
      if (oldest !== undefined) jobs.delete(oldest.jobId)
    }
  }

  /**
   * Run one install to completion; the panel polls instead of waiting.
   * @param {{ jobId: string, phase: string, state?: string, received?: number, total?: number, percent?: number,
   *   error?: string, version?: string, done: boolean, startedAt: number, endedAt?: number }} job
   *   Job record mutated in place.
   * @param {AbortController} controller - Cancels the install on disposal.
   * @returns {Promise<void>} Settles when the job settles.
   */
  async function runInstall(job, controller) {
    try {
      const { installBinary } = await manager()
      const result = await installBinary({
        root,
        signal: controller.signal,
        onProgress: (event) => {
          const view = normalizeProgress(event, job)
          job.phase = view.phase
          if (view.received !== undefined) job.received = view.received
          if (view.total !== undefined) job.total = view.total
          if (view.percent !== undefined) job.percent = view.percent
          if (view.error !== undefined) job.error = view.error
        },
      })
      const normalized = normalizeStatus(result)
      job.state = normalized.state === 'missing' ? 'cached' : normalized.state
      if (normalized.version !== undefined) job.version = normalized.version
      if (job.phase !== 'error') {
        job.phase = 'done'
        job.percent = 100
      }
    } catch (error) {
      job.phase = 'error'
      if (controller.signal.aborted) {
        job.error = 'cancelled'
      } else {
        job.error = error instanceof Error && error.message !== '' ? error.message : 'install-failed'
      }
    } finally {
      job.done = true
      job.endedAt = now()
      if (activeJobId === job.jobId) {
        activeJobId = undefined
        activeController = undefined
      }
      prune()
    }
  }

  /**
   * Start the one install this Host allows, or report why it did not.
   * @returns {{ jobId: string } | { busy: true, jobId: string } | { disabled: true }} Outcome.
   */
  function start() {
    if (!autoDownload) return { disabled: true }
    if (activeJobId !== undefined) return { busy: true, jobId: activeJobId }
    const jobId = `ffmpeg-${randomUUID()}`
    /** @type {{ jobId: string, phase: string, state?: string, received?: number, total?: number, percent?: number,
     *   error?: string, done: boolean, startedAt: number, endedAt?: number, version?: string }} */
    const job = { jobId, phase: 'download', percent: 0, done: false, startedAt: now() }
    jobs.set(jobId, job)
    latest = jobId
    const controller = new AbortController()
    activeController = controller
    activeJobId = jobId
    void runInstall(job, controller)
    return { jobId }
  }

  /**
   * Read one job's progress.
   * @param {string} jobId - Job identifier from the panel.
   * @returns {{ phase: string, state?: string, version?: string, received?: number, total?: number,
   *   percent?: number, error?: string } | undefined} Progress view, or undefined when unknown or pruned.
   */
  function progress(jobId) {
    const job = jobs.get(jobId)
    if (job === undefined) return undefined
    /** @type {{ phase: string, state?: string, version?: string, received?: number, total?: number,
     *   percent?: number, error?: string }} */
    const view = { phase: job.phase }
    if (job.state !== undefined) view.state = job.state
    if (job.version !== undefined) view.version = job.version
    if (job.received !== undefined) view.received = job.received
    if (job.total !== undefined) view.total = job.total
    if (job.percent !== undefined) view.percent = job.percent
    if (job.error !== undefined) view.error = job.error
    return view
  }

  /**
   * Most recently started job, running or finished.
   *
   * The panel's own poll omits the id; answering with the latest job keeps a
   * reopened panel attached to the same install instead of starting another.
   * @returns {string | undefined} Job id, or undefined when none ran yet.
   */
  function latestJobId() {
    return latest
  }

  /**
   * Current running job, for diagnostics.
   * @returns {string | undefined} Job id while an install runs.
   */
  function runningJobId() {
    return activeJobId
  }

  /** Abort the running install and forget the jobs. */
  function dispose() {
    activeController?.abort()
    activeController = undefined
    activeJobId = undefined
    latest = undefined
    jobs.clear()
  }

  return { status, start, progress, latestJobId, runningJobId, dispose }
}
