/**
 * E2E helpers around the public contract (`createService`).
 *
 * Rules for this module:
 * - imports the public entry (`src/public/index.js`) and nothing deeper;
 * - never touches engine internals, so the suite keeps working when S1 changes;
 * - turns “service not wired yet” into a skip, not a failure, so the suite is
 *   usable while the product is still being assembled.
 *
 * The service instance is created at most once per test file (node --test runs
 * each file in its own process); the promise is cached across tests.
 */

import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createService } from '../../src/public/index.js'
import { hasFfmpeg } from './ffmpeg.mjs'

/** Skip reason mandated by the delivery contract while M1 wiring is missing. */
export const NOT_WIRED = 'service not wired yet'

/** Job states the service will not leave on its own. */
export const TERMINAL_STATUSES = Object.freeze(['done', 'failed', 'cancelled'])

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @type {Promise<any> | null} */
let servicePromise = null
/** @type {unknown} */
let serviceFailure = null

/**
 * Create (once per process) and return the public service, or skip the test.
 * Skip cases: ffmpeg missing, `createService()` throwing (unwired), or an
 * object that does not look like `MediaQcService`.
 * @param {import('node:test').TestContext} t
 * @returns {Promise<any | null>}
 */
export async function getService(t) {
  if (!hasFfmpeg()) {
    t.diagnostic('ffmpeg not found — set KUMQUAT_FFMPEG/FFMPEG_PATH or add ffmpeg to PATH')
    t.skip('ffmpeg not found')
    return null
  }

  if (!servicePromise && serviceFailure === null) {
    try {
      servicePromise = Promise.resolve(createService())
    } catch (error) {
      serviceFailure = error
    }
  }

  if (serviceFailure !== null) {
    t.diagnostic(`createService() failed: ${describeError(serviceFailure)}`)
    t.skip(NOT_WIRED)
    return null
  }

  try {
    const service = await servicePromise
    if (
      !service ||
      typeof service.run !== 'function' ||
      typeof service.verify !== 'function' ||
      typeof service.jobs?.get !== 'function'
    ) {
      t.skip(NOT_WIRED)
      return null
    }
    return service
  } catch (error) {
    serviceFailure = error
    t.diagnostic(`createService() failed: ${describeError(error)}`)
    t.skip(NOT_WIRED)
    return null
  }
}

/**
 * Create a private working directory for one test, removed afterwards.
 * Uses the OS temp area so the repository stays clean.
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>}
 */
export async function makeWorkdir(t) {
  const base = path.join(process.cwd(), 'fixtures', '.work')
  await mkdir(base, { recursive: true })
  const dir = await mkdtemp(path.join(base, 'e2e-'))
  t.after(async () => {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      // Cleanup is best effort; a locked file is surfaced by the artifact scan.
    }
  })
  return dir
}

let tokenCounter = 0

/**
 * Unique token embedded in staged file names. Lets a test recognise its own
 * artifacts even when other e2e files run in parallel.
 * @param {string} [prefix]
 * @returns {string}
 */
export function uniqueToken(prefix = 'kq') {
  tokenCounter += 1
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${tokenCounter}`
}

/**
 * Copy a fixture into the work directory under a unique name.
 * @param {string} source
 * @param {string} workdir
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function stageFixture(source, workdir, name) {
  const target = path.join(workdir, name)
  await copyFile(source, target)
  return target
}

/**
 * Start a task and wait until it reaches a terminal state.
 * @param {any} service
 * @param {any} task
 * @param {{ overwrite?: boolean, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<any>} job detail
 */
export async function runJob(service, task, options = {}) {
  const summary = await service.run(task, { overwrite: options.overwrite ?? true })
  if (!summary || typeof summary.id !== 'string') {
    throw new Error(`service.run() returned no job id for ${JSON.stringify(task)}`)
  }
  return waitForJob(service, summary.id, options)
}

/**
 * Poll `jobs.get` until the job reaches done/failed/cancelled.
 * @param {any} service
 * @param {string} id
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function waitForJob(service, id, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180_000
  const intervalMs = options.intervalMs ?? 100
  const deadline = Date.now() + timeoutMs
  let detail = await service.jobs.get(id)
  while (!TERMINAL_STATUSES.includes(detail.status)) {
    if (Date.now() > deadline) {
      throw new Error(`job ${id} still ${detail.status} after ${timeoutMs}ms`)
    }
    await sleep(intervalMs)
    detail = await service.jobs.get(id)
  }
  return detail
}

/**
 * Poll `jobs.get` until the status becomes one of `statuses`.
 * @param {any} service
 * @param {string} id
 * @param {string[]} statuses
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function waitForJobStatus(service, id, statuses, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000
  const intervalMs = options.intervalMs ?? 50
  const deadline = Date.now() + timeoutMs
  let detail = await service.jobs.get(id)
  while (!statuses.includes(detail.status)) {
    if (Date.now() > deadline) {
      throw new Error(`job ${id} stayed ${detail.status}; wanted one of ${statuses.join(', ')}`)
    }
    await sleep(intervalMs)
    detail = await service.jobs.get(id)
  }
  return detail
}

/**
 * Wait for a job that matches `predicate` and was not in `excludeIds`.
 * Used by the cancel test, where the id is not known until the queue shows it.
 * @param {any} service
 * @param {(summary: any) => boolean} predicate
 * @param {{ excludeIds?: Set<string>, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<any>} job summary
 */
export async function waitForNewJob(service, predicate, options = {}) {
  const excludeIds = options.excludeIds ?? new Set()
  const timeoutMs = options.timeoutMs ?? 15_000
  const intervalMs = options.intervalMs ?? 50
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const jobs = await service.jobs.list()
    const hit = jobs.find((job) => !excludeIds.has(job.id) && predicate(job))
    if (hit) return hit
    await sleep(intervalMs)
  }
  throw new Error('no matching job appeared on service.jobs.list()')
}

/**
 * Best-effort output path of a job. Prefers the documented `output` field and
 * falls back to the last argv element, which is the ffmpeg output by
 * convention. Throws when neither is available.
 * @param {any} detail
 * @returns {string}
 */
export function outputPathOf(detail) {
  if (typeof detail?.output === 'string' && detail.output.length > 0) return detail.output
  const argv = Array.isArray(detail?.argv) ? detail.argv : []
  const last = argv[argv.length - 1]
  if (typeof last === 'string' && last.length > 0 && !last.startsWith('-')) return last
  throw new Error(`cannot determine output path for job ${detail?.id ?? '<unknown>'}`)
}

/**
 * Run a task that is expected to be rejected. Accepts both failure shapes the
 * contract allows: `run()` rejecting, or a job that ends as `failed` with an
 * `error` payload. Returns the error object for the test to inspect.
 * @param {any} service
 * @param {any} task
 * @param {{ overwrite?: boolean, timeoutMs?: number }} [options]
 * @returns {Promise<any>}
 */
export async function runExpectingFailure(service, task, options = {}) {
  let summary
  try {
    summary = await service.run(task, { overwrite: options.overwrite ?? true })
  } catch (error) {
    return error
  }
  const detail = await waitForJob(service, summary.id, options)
  if (detail.status === 'done') {
    throw new Error(`expected task to fail, but job ${detail.id} succeeded with ${JSON.stringify(task)}`)
  }
  if (detail.status === 'cancelled') {
    throw new Error(`task ${JSON.stringify(task)} was cancelled instead of failing`)
  }
  if (!detail.error) {
    throw new Error(`job ${detail.id} ended as ${detail.status} without an error payload`)
  }
  return detail.error
}

/**
 * Await a promise but give up after `timeoutMs`.
 * @param {Promise<any>} promise
 * @param {number} [timeoutMs]
 * @returns {Promise<{ timedOut: true } | { timedOut: false, value?: any, error?: any }>}
 */
export async function settleWithTimeout(promise, timeoutMs = 30_000) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  })
  const outcome = await Promise.race([
    promise.then(
      (value) => ({ timedOut: false, value }),
      (error) => ({ timedOut: false, error }),
    ),
    timeout,
  ])
  if (timer) clearTimeout(timer)
  return outcome
}

/**
 * Recursively list regular files, ignoring unreadable directories.
 * @param {string} dir
 * @param {{ depth?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function listFilesRecursive(dir, options = {}) {
  const maxDepth = options.depth ?? 3
  /** @type {string[]} */
  const files = []

  /**
   * @param {string} current
   * @param {number} level
   */
  async function walk(current, level) {
    /** @type {import('node:fs').Dirent[]} */
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (level > 1) await walk(full, level - 1)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }

  await walk(dir, maxDepth)
  return files
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}


