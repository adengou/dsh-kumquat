/**
 * Per-job progress, fed by the scheduler and read back by the panel.
 *
 * The scheduler owns the queue and emits `{ type: 'progress', id, progress }`
 * for one job at a time. The Host keeps the latest slice per job id — never a
 * single "current job" — so `GET /jobs` and `GET /jobs/:id` can attach progress
 * to exactly the rows it belongs to. A finished or absent job carries none.
 *
 * The table is bounded: a long session must not grow it without limit.
 */

/** Fields the panel reads, per the extended `JobSummary.progress`. */
export const PROGRESS_FIELDS = Object.freeze(['phase', 'percent', 'outTimeSec', 'speed', 'etaSec'])

/** Default number of tracked jobs. */
const DEFAULT_LIMIT = 256

/** Longest accepted phase label. */
const MAX_PHASE_LENGTH = 32

/**
 * Freeze a finite non-negative number, or drop it.
 * @param {unknown} value - Candidate.
 * @returns {number | undefined} Accepted number.
 */
function nonNegative(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

/**
 * Normalize one scheduler progress report.
 *
 * Only the five documented fields survive, so an engine change cannot leak
 * process text (or a path) into the panel. Unknown phases are kept as text:
 * the vocabulary belongs to the engine, not to this table.
 * @param {unknown} raw - Report from the engine through the scheduler.
 * @returns {{ phase?: string, percent?: number, outTimeSec?: number, speed?: string | number, etaSec?: number } | undefined}
 *   Frozen normalized progress, or undefined when nothing usable arrived.
 */
export function normalizeProgress(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  const record = /** @type {Record<string, unknown>} */ (raw)
  /** @type {{ phase?: string, percent?: number, outTimeSec?: number, speed?: string | number, etaSec?: number }} */
  const progress = {}

  if (typeof record.phase === 'string') {
    const phase = record.phase.trim()
    if (phase !== '' && phase.length <= MAX_PHASE_LENGTH) progress.phase = phase
  }
  if (typeof record.percent === 'number' && Number.isFinite(record.percent)) {
    progress.percent = Math.min(100, Math.max(0, record.percent))
  }
  const outTimeSec = nonNegative(record.outTimeSec)
  if (outTimeSec !== undefined) progress.outTimeSec = outTimeSec
  if (typeof record.speed === 'string') {
    if (record.speed.trim() !== '') progress.speed = record.speed.trim()
  } else {
    const speed = nonNegative(record.speed)
    if (speed !== undefined) progress.speed = speed
  }
  const etaSec = nonNegative(record.etaSec)
  if (etaSec !== undefined) progress.etaSec = etaSec

  if (Object.keys(progress).length === 0) return undefined
  return Object.freeze(progress)
}

/**
 * Create the progress table.
 *
 * @param {{ limit?: number }} [options] - Table bound.
 * @returns {{
 *   record: (jobId: unknown, progress: unknown) => boolean,
 *   get: (jobId: unknown) => Readonly<Record<string, unknown>> | undefined,
 *   merge: <T>(summary: T) => T | (T & { progress: Readonly<Record<string, unknown>> }),
 *   size: () => number,
 *   clear: () => void,
 * }} Table.
 */
export function createProgressTable(options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT
  /** @type {Map<string, Readonly<Record<string, unknown>>>} */
  const table = new Map()

  /**
   * Keep the newest entry for one job.
   * @param {unknown} jobId - Job identifier from the scheduler.
   * @param {unknown} raw - Progress report.
   * @returns {boolean} Whether the report was usable.
   */
  function record(jobId, raw) {
    if (typeof jobId !== 'string' || jobId === '') return false
    const progress = normalizeProgress(raw)
    if (progress === undefined) return false
    // Re-insert so Map order tracks recency for eviction.
    table.delete(jobId)
    table.set(jobId, progress)
    while (table.size > limit) {
      const oldest = table.keys().next()
      if (oldest.done === true) break
      table.delete(oldest.value)
    }
    return true
  }

  /**
   * Read one job's progress.
   * @param {unknown} jobId - Job identifier.
   * @returns {Readonly<Record<string, unknown>> | undefined} Progress.
   */
  function get(jobId) {
    if (typeof jobId !== 'string' || jobId === '') return undefined
    return table.get(jobId)
  }

  /**
   * Attach progress to one summary, leaving it untouched when there is none
   * or when the service already supplied its own.
   * @template T
   * @param {T} summary - Job summary from the service.
   * @returns {T | (T & { progress: Readonly<Record<string, unknown>> })} Summary.
   */
  function merge(summary) {
    if (summary === null || typeof summary !== 'object') return summary
    const job = /** @type {{ id?: unknown, progress?: unknown }} */ (summary)
    if (job.progress !== undefined) return summary
    const progress = get(job.id)
    if (progress === undefined) return summary
    return { ...summary, progress }
  }

  /** Number of tracked jobs. */
  function size() {
    return table.size
  }

  /** Forget every entry. */
  function clear() {
    table.clear()
  }

  return { record, get, merge, size, clear }
}
