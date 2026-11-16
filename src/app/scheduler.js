/**
 * Task-level scheduler: FIFO queue, bounded concurrency, per-job abort.
 * Parallelism lives here — between jobs — never inside one encode.
 * No third-party dependencies, no worker threads.
 */
import os from 'node:os'

const DEFAULT_PER_JOB_MB = 700

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function abortError(message) {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

export function defaultConcurrency() {
  const cores = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length
  return clampInt(Math.floor(cores / 2), 1, 4)
}

/**
 * @param {{
 *   concurrency?: number,
 *   memoryBudgetMb?: number,
 *   perJobMb?: number,
 *   onEvent?: (evt: object) => void,
 * }} [options]
 */
export function createScheduler(options = {}) {
  const requested = options.concurrency ?? defaultConcurrency()
  const perJobMb = options.perJobMb ?? DEFAULT_PER_JOB_MB
  const memoryBudgetMb = options.memoryBudgetMb ?? 4096
  const memoryLimit = Math.max(1, Math.floor(memoryBudgetMb / perJobMb))
  const limit = Math.max(1, Math.min(requested, memoryLimit))

  const queue = []
  const running = new Map()
  let seq = 0
  let counters = { done: 0, failed: 0, cancelled: 0 }

  const emit = (evt) => {
    if (typeof options.onEvent !== 'function') return
    try {
      options.onEvent(evt)
    } catch {
      /* listener errors must never break the queue */
    }
  }

  function makeProgress(id) {
    let last = 0
    let pending = null
    let timer = null
    const flush = () => {
      timer = null
      if (pending === null) return
      emit({ type: 'progress', id, progress: pending })
      pending = null
      last = Date.now()
    }
    return (progress) => {
      pending = progress
      const now = Date.now()
      if (now - last >= 100) {
        flush()
        return
      }
      if (timer === null) {
        timer = setTimeout(flush, 100)
        if (typeof timer.unref === 'function') timer.unref()
      }
    }
  }

  function settle(job, err, result) {
    if (!running.delete(job.id)) return
    if (job.cancelled) {
      counters.cancelled += 1
      job.reject(abortError(`job ${job.id} cancelled`))
      emit({ type: 'cancel', id: job.id })
    } else if (err) {
      counters.failed += 1
      job.reject(err)
      emit({ type: 'error', id: job.id, error: err })
    } else {
      counters.done += 1
      job.resolve(result)
      emit({ type: 'done', id: job.id })
    }
    pump()
  }

  function pump() {
    while (running.size < limit && queue.length > 0) {
      const job = queue.shift()
      if (job.cancelled) {
        counters.cancelled += 1
        job.reject(abortError(`job ${job.id} cancelled`))
        emit({ type: 'cancel', id: job.id })
        continue
      }
      running.set(job.id, job)
      emit({ type: 'start', id: job.id })
      Promise.resolve()
        .then(() => job.run(job.controller.signal, makeProgress(job.id)))
        .then(
          (result) => settle(job, null, result),
          (err) => settle(job, err ?? new Error('job failed')),
        )
    }
  }

  /**
   * @param {{
   *   id?: string,
   *   mb?: number,
   *   run: (signal: AbortSignal, onProgress: (p: any) => void) => Promise<any>,
   * }} job
   */
  function submit(job) {
    if (!job || typeof job.run !== 'function') {
      throw new TypeError('submit() needs a job with run(signal, onProgress)')
    }
    const id = job.id ?? `job-${++seq}`
    const controller = new AbortController()
    const record = { id, run: job.run, mb: job.mb ?? perJobMb, controller, cancelled: false }
    const promise = new Promise((resolve, reject) => {
      record.resolve = resolve
      record.reject = reject
    })
    // A cancelled job rejects before the caller may attach a handler.
    // Keep that from surfacing as an unhandled rejection; callers still see it.
    promise.catch(() => {})
    queue.push(record)
    emit({ type: 'queued', id })
    pump()
    return {
      id,
      promise,
      cancel() {
        cancel(id)
      },
    }
  }

  function cancel(id) {
    const queuedIndex = queue.findIndex((j) => j.id === id)
    if (queuedIndex >= 0) {
      const [job] = queue.splice(queuedIndex, 1)
      job.cancelled = true
      counters.cancelled += 1
      job.reject(abortError(`job ${id} cancelled`))
      emit({ type: 'cancel', id })
      return true
    }
    const job = running.get(id)
    if (!job) return false
    job.cancelled = true
    job.controller.abort()
    emit({ type: 'cancelling', id })
    return true
  }

  function cancelAll() {
    for (const job of [...queue]) cancel(job.id)
    for (const job of [...running.values()]) cancel(job.id)
  }

  function stats() {
    return {
      concurrency: limit,
      running: running.size,
      queued: queue.length,
      ...counters,
    }
  }

  return { submit, cancel, cancelAll, stats, concurrency: limit }
}
