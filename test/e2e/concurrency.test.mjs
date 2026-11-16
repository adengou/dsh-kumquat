/**
 * E2E: task-level concurrency (ALGORITHM.md §3).
 *
 * Two layers, on purpose:
 *
 * 1. Scheduler layer — imports `src/app/scheduler.js` directly (approved bridge,
 *    see ALGORITHM.md §4). It runs today, before `createService()` is wired, and
 *    guards against the regression this file exists for: job state leaking into
 *    module-level globals, so that progress, cancellation or results of one job
 *    bleed into another.
 *
 * 2. Public service layer — the same behaviour through `createService()`; these
 *    tests skip with “service not wired yet” until M1 integration, then become
 *    the authoritative check.
 *
 * Scheduler contract used here (ALGORITHM.md §4, implementation current at the
 * time of writing): `createScheduler({ concurrency, onEvent })`,
 * `submit({ id, run(signal, onProgress) })`, `cancel(id)`, `stats()`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { FIXTURES, requireFixtures } from '../helpers/fixtures.mjs'
import {
  getService,
  makeWorkdir,
  outputPathOf,
  settleWithTimeout,
  sleep,
  stageFixture,
  uniqueToken,
  waitForJob,
  waitForNewJob,
} from '../helpers/service.mjs'

// @ts-ignore — internal app module; imported knowingly as a transitional bridge.
let createScheduler = null
let schedulerImportError = null
try {
  ;({ createScheduler } = await import('../../src/app/scheduler.js'))
} catch (error) {
  schedulerImportError = error
}

/**
 * @param {import('node:test').TestContext} t
 * @returns {boolean}
 */
function requireScheduler(t) {
  if (typeof createScheduler === 'function') return true
  t.diagnostic(
    `cannot import src/app/scheduler.js: ${schedulerImportError instanceof Error ? schedulerImportError.message : String(schedulerImportError)}`,
  )
  t.skip('scheduler module unavailable')
  return false
}

/**
 * @param {import('node:test').TestContext} t
 * @param {string[]} files
 * @returns {Promise<any | null>}
 */
async function setupService(t, files) {
  const service = await getService(t)
  if (!service) return null
  if (!requireFixtures(t, files)) return null
  return service
}

/**
 * @param {any} job
 */
function assertJobDone(job) {
  assert.equal(job.status, 'done', `job ${job.id} did not finish: ${JSON.stringify(job.error ?? null)}`)
  assert.ok(job.verdict, `job ${job.id} has no verdict`)
  assert.equal(job.verdict.ok, true, `verdict not ok: ${JSON.stringify((job.verdict.checks ?? []).filter((c) => c.outcome === 'fail'))}`)
}

/**
 * @param {string} id
 * @param {number} holdMs
 * @param {{ now: number, max: number }} active
 * @returns {any} scheduler job
 */
function fakeJob(id, holdMs, active) {
  return {
    id,
    run: async (signal, onProgress) => {
      active.now += 1
      active.max = Math.max(active.max, active.now)
      const started = Date.now()
      try {
        while (Date.now() - started < holdMs) {
          if (signal.aborted) {
            const error = new Error(`${id} aborted`)
            error.name = 'AbortError'
            throw error
          }
          onProgress({ job: id, elapsedMs: Date.now() - started })
          await sleep(20)
        }
        return { id, ok: true }
      } finally {
        active.now -= 1
      }
    },
  }
}

test('scheduler: two jobs overlap, progress stays per-job, results do not mix', { timeout: 30_000 }, async (t) => {
  if (!requireScheduler(t)) return

  /** @type {{ now: number, max: number }} */
  const active = { now: 0, max: 0 }
  /** @type {any[]} */
  const events = []
  const scheduler = createScheduler({ concurrency: 2, onEvent: (event) => events.push({ ...event }) })

  const alpha = scheduler.submit(fakeJob('alpha', 600, active))
  const beta = scheduler.submit(fakeJob('beta', 600, active))
  const [alphaResult, betaResult] = await Promise.all([alpha.promise, beta.promise])

  assert.equal(alphaResult.id, 'alpha')
  assert.equal(betaResult.id, 'beta')
  assert.equal(active.max, 2, 'the two jobs must actually overlap (max 2 active)')

  // Per-job progress: every event must carry the id it belongs to, and the
  // payload must be the payload that job produced — never another job's.
  const progressEvents = events.filter((event) => event.type === 'progress')
  const progressIds = new Set(progressEvents.map((event) => event.id))
  assert.deepEqual([...progressIds].sort(), ['alpha', 'beta'], 'progress must be emitted for both jobs separately')
  for (const event of progressEvents) {
    assert.ok(event.id === 'alpha' || event.id === 'beta', `unknown progress id ${event.id}`)
    assert.equal(event.progress?.job, event.id, `progress routed to ${event.id} carries ${event.progress?.job}'s payload`)
  }
  for (const id of ['alpha', 'beta']) {
    assert.ok(progressEvents.filter((event) => event.id === id).length >= 2, `no merged progress events for ${id}`)
    assert.ok(events.some((event) => event.type === 'start' && event.id === id), `no start event for ${id}`)
    assert.ok(events.some((event) => event.type === 'done' && event.id === id), `no done event for ${id}`)
  }

  const stats = scheduler.stats()
  assert.equal(stats.concurrency, 2)
  assert.equal(stats.running, 0)
  assert.equal(stats.queued, 0)
  assert.equal(stats.done, 2)
})

test('scheduler: cancelling one job lets the other finish untouched', { timeout: 30_000 }, async (t) => {
  if (!requireScheduler(t)) return

  /** @type {{ started: Record<string, number>, progressAfterCancel: number[] }} */
  const state = { started: {}, progressAfterCancel: [] }
  /** @type {any[]} */
  const events = []
  const scheduler = createScheduler({ concurrency: 2, onEvent: (event) => events.push({ ...event, at: Date.now() }) })

  let cancelAt = 0
  const long = scheduler.submit({
    id: 'long',
    run: async (signal, onProgress) => {
      state.started.long = Date.now()
      const started = Date.now()
      while (Date.now() - started < 5_000) {
        if (signal.aborted) {
          const error = new Error('long aborted')
          error.name = 'AbortError'
          throw error
        }
        onProgress({ job: 'long' })
        await sleep(20)
      }
      return { id: 'long' }
    },
  })
  const short = scheduler.submit({
    id: 'short',
    run: async (signal, onProgress) => {
      state.started.short = Date.now()
      const started = Date.now()
      while (Date.now() - started < 1_000) {
        if (signal.aborted) {
          const error = new Error('short aborted')
          error.name = 'AbortError'
          throw error
        }
        onProgress({ job: 'short' })
        if (cancelAt > 0) state.progressAfterCancel.push(Date.now())
        await sleep(20)
      }
      return { id: 'short' }
    },
  })

  const longOutcome = settleWithTimeout(long.promise, 15_000)
  const shortOutcome = settleWithTimeout(short.promise, 15_000)

  // Wait for both to start, then cancel only the long one.
  const deadline = Date.now() + 5_000
  while (!(state.started.long && state.started.short)) {
    if (Date.now() > deadline) assert.fail('both scheduler jobs must start within 5s')
    await sleep(10)
  }
  assert.equal(scheduler.cancel('long'), true, 'cancel() must report the job as found')
  cancelAt = Date.now()

  const [longResult, shortResult] = await Promise.all([longOutcome, shortOutcome])
  assert.equal(longResult.timedOut, false, 'cancelled job did not settle')
  assert.ok(longResult.error, 'cancelled job must reject rather than resolve')
  assert.match(String(longResult.error.message), /cancel|abort/i, `unexpected cancellation error: ${String(longResult.error)}`)

  assert.equal(shortResult.timedOut, false, 'the survivor job did not settle')
  assert.equal(shortResult.error, undefined, `survivor job rejected: ${String(shortResult.error)}`)
  assert.equal(shortResult.value.id, 'short')

  assert.ok(
    state.progressAfterCancel.length > 0,
    'the survivor stopped reporting progress when the other job was cancelled (global abort?)',
  )
  const shortProgress = events.filter((event) => event.type === 'progress' && event.id === 'short')
  assert.ok(shortProgress.length >= 2, 'survivor progress must keep flowing before cancel too')
  assert.ok(
    events.every((event) => event.type !== 'cancel' || event.id === 'long'),
    'only the cancelled job may emit a cancel event',
  )

  const stats = scheduler.stats()
  assert.equal(stats.running, 0)
  assert.equal(stats.done, 1)
  assert.equal(stats.cancelled, 1)
})

test('service: two submitted tasks finish without cross-talk', { timeout: 180_000 }, async (t) => {
  const service = await setupService(t, [FIXTURES.longGop, FIXTURES.bar12])
  if (!service) return

  const workdir = await makeWorkdir(t)
  const token = uniqueToken('par-svc')
  const gifInput = await stageFixture(FIXTURES.longGop, workdir, `${token}-gif.mp4`)
  const webmInput = await stageFixture(FIXTURES.bar12, workdir, `${token}-webm.mp4`)

  const existing = new Set((await service.jobs.list()).map((job) => job.id))
  const gifRun = settleWithTimeout(
    service.run({ kind: 'gif', input: gifInput, from: 0, to: 10, fps: 24, width: 640 }, { overwrite: true }),
    180_000,
  )
  const webmRun = settleWithTimeout(
    service.run({ kind: 'convert', input: webmInput, to: 'webm' }, { overwrite: true }),
    180_000,
  )

  const samePath = (a, b) => path.resolve(String(a)) === path.resolve(String(b))
  const gifSummary = await waitForNewJob(
    service,
    (job) => job.task?.kind === 'gif' && samePath(job.task.input, gifInput),
    { excludeIds: existing, timeoutMs: 30_000 },
  )
  const webmSummary = await waitForNewJob(
    service,
    (job) => job.task?.kind === 'convert' && samePath(job.task.input, webmInput),
    { excludeIds: existing, timeoutMs: 30_000 },
  )

  const [gifJob, webmJob] = await Promise.all([
    waitForJob(service, gifSummary.id, { timeoutMs: 180_000 }),
    waitForJob(service, webmSummary.id, { timeoutMs: 180_000 }),
  ])
  assertJobDone(gifJob)
  assertJobDone(webmJob)
  assert.equal(gifJob.id, gifSummary.id)
  assert.equal(webmJob.id, webmSummary.id)

  const gifOutput = outputPathOf(gifJob)
  const webmOutput = outputPathOf(webmJob)
  assert.notEqual(gifOutput, webmOutput, 'the two jobs must not share an output path')
  assert.equal(path.extname(gifOutput).toLowerCase(), '.gif')
  assert.equal(path.extname(webmOutput).toLowerCase(), '.webm')

  // Each job's argv may only mention its own input.
  if (Array.isArray(gifJob.argv) && gifJob.argv.length > 0) {
    assert.ok(gifJob.argv.includes(gifInput), 'gif job argv lost its own input')
    assert.ok(!gifJob.argv.includes(webmInput), 'gif job argv leaked the other task input')
  }
  if (Array.isArray(webmJob.argv) && webmJob.argv.length > 0) {
    assert.ok(webmJob.argv.includes(webmInput), 'convert job argv lost its own input')
    assert.ok(!webmJob.argv.includes(gifInput), 'convert job argv leaked the other task input')
  }

  // Codec facts prove the outputs were not swapped.
  const gifFacts = await service.probe(gifOutput)
  const webmFacts = await service.probe(webmOutput)
  assert.equal(gifFacts.audio, undefined, 'GIF output must not contain audio')
  assert.match(webmFacts.video?.codec ?? '', /^(vp8|vp9|av1)$/, `webm output has codec ${webmFacts.video?.codec}`)

  for (const outcome of [await gifRun, await webmRun]) {
    assert.equal(outcome.timedOut, false, 'run() did not settle')
    assert.equal(outcome.error, undefined, `run() rejected: ${String(outcome.error)}`)
  }
})

test('service: cancelling one task lets the other finish', { timeout: 180_000 }, async (t) => {
  const service = await setupService(t, [FIXTURES.longGop, FIXTURES.bar12])
  if (!service) return

  const workdir = await makeWorkdir(t)
  const token = uniqueToken('par-cancel')
  const longInput = await stageFixture(FIXTURES.longGop, workdir, `${token}-long.mp4`)
  const shortInput = await stageFixture(FIXTURES.bar12, workdir, `${token}-short.mp4`)

  const existing = new Set((await service.jobs.list()).map((job) => job.id))
  const longRun = settleWithTimeout(
    service.run({ kind: 'gif', input: longInput, from: 0, to: 30, fps: 30, width: 640 }, { overwrite: true }),
    180_000,
  )
  const shortRun = settleWithTimeout(
    service.run({ kind: 'gif', input: shortInput, from: 0, to: 11, fps: 24, width: 480 }, { overwrite: true }),
    180_000,
  )

  const samePath = (a, b) => path.resolve(String(a)) === path.resolve(String(b))
  const longSummary = await waitForNewJob(
    service,
    (job) => job.task?.kind === 'gif' && samePath(job.task.input, longInput),
    { excludeIds: existing, timeoutMs: 30_000 },
  )
  const shortSummary = await waitForNewJob(
    service,
    (job) => job.task?.kind === 'gif' && samePath(job.task.input, shortInput),
    { excludeIds: existing, timeoutMs: 30_000 },
  )

  // The survivor must still be in flight when the other is cancelled, otherwise
  // the test would not prove anything.
  const shortBefore = await service.jobs.get(shortSummary.id)
  if (shortBefore.status === 'done' || shortBefore.status === 'failed') {
    return t.skip('survivor task finished before cancel could be issued on this machine')
  }

  await service.cancel(longSummary.id)

  const shortJob = await waitForJob(service, shortSummary.id, { timeoutMs: 180_000 })
  assertJobDone(shortJob)
  assert.equal(path.extname(outputPathOf(shortJob)).toLowerCase(), '.gif')

  const longJob = await service.jobs.get(longSummary.id)
  assert.equal(longJob.status, 'cancelled', `cancelled job is ${longJob.status}`)
  if (longJob.output) {
    assert.equal(existsSync(longJob.output), false, 'cancelled task published an output file')
  }

  for (const outcome of [await longRun, await shortRun]) {
    assert.equal(outcome.timedOut, false, 'run() did not settle')
  }
})
