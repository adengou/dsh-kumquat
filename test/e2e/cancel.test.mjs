/**
 * E2E: cancelling a long job.
 *
 * The contract only exposes job state and artifacts, so “the ffmpeg process is
 * gone” is asserted through observable evidence:
 *   1. `cancel()` resolves and `run()` settles (or rejects with E_CANCEL);
 *   2. the job ends as `cancelled` with `endedAt` recorded;
 *   3. no output file is published for the cancelled job;
 *   4. no `.part`/`.tmp` file is left behind, and no file appears during a
 *      grace period afterwards, which would mean a writer is still alive.
 *
 * A fast copy job first teaches the test where the service writes outputs, so
 * the scan runs in the real output directory rather than next to the input.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { FIXTURES, requireFixtures } from '../helpers/fixtures.mjs'
import {
  getService,
  listFilesRecursive,
  makeWorkdir,
  outputPathOf,
  runJob,
  settleWithTimeout,
  sleep,
  stageFixture,
  uniqueToken,
  waitForJobStatus,
  waitForNewJob,
} from '../helpers/service.mjs'

test('cancel() stops a long GIF job and leaves no partial artifacts', { timeout: 180_000 }, async (t) => {
  const service = await getService(t)
  if (!service) return
  if (!requireFixtures(t, [FIXTURES.longGop])) return

  const workdir = await makeWorkdir(t)
  const token = uniqueToken('cancel')
  const input = await stageFixture(FIXTURES.longGop, workdir, `${token}.mp4`)

  // 1. A cheap copy conversion reveals the output directory and the baseline.
  const probeJob = await runJob(service, { kind: 'convert', input, to: 'mkv', copy: true })
  assert.equal(probeJob.status, 'done', `copy probe failed: ${JSON.stringify(probeJob.error ?? null)}`)
  const probeOutput = outputPathOf(probeJob)
  const outputDir = path.dirname(probeOutput)
  const baseline = new Set(await listFilesRecursive(outputDir))

  // 2. Start a deliberately heavy GIF (30s selection at 30fps) and let it run.
  const existingIds = new Set((await service.jobs.list()).map((job) => job.id))
  let pending
  try {
    pending = service.run(
      { kind: 'gif', input, from: 0, to: 30, fps: 30, width: 640 },
      { overwrite: true },
    )
  } catch (error) {
    assert.fail(`service.run() threw synchronously instead of returning a promise: ${error}`)
  }
  assert.ok(pending && typeof pending.then === 'function', 'service.run() must return a promise')

  // Attach a settle handler immediately so an early rejection cannot escape.
  const runOutcome = settleWithTimeout(pending, 120_000)

  const summary = await waitForNewJob(
    service,
    (job) => job.task?.kind === 'gif' && path.resolve(job.task.input) === path.resolve(input),
    { excludeIds: existingIds, timeoutMs: 20_000 },
  )
  await waitForJobStatus(service, summary.id, ['running'], { timeoutMs: 30_000, intervalMs: 50 })

  // Give ffmpeg a moment to actually open its writer before pulling the plug.
  await sleep(300)
  await service.cancel(summary.id)

  // run() resolves as soon as the job is queued; completion is observed through
  // jobs.get(), so wait for the terminal state before checking leftovers.
  await waitForJobStatus(service, summary.id, ['cancelled'], { timeoutMs: 30_000, intervalMs: 50 })
  await runOutcome

  const detail = await service.jobs.get(summary.id)
  assert.equal(detail.status, 'cancelled', `job status is ${detail.status}, expected cancelled`)
  assert.ok(Number.isFinite(detail.endedAt), 'a cancelled job must record endedAt')
  if (detail.output) {
    assert.equal(existsSync(detail.output), false, `cancelled job published an output file: ${detail.output}`)
  }

  // 3. No committed or partial artifact may carry this test's token.
  const after = await listFilesRecursive(outputDir)
  const leaked = after.filter((file) => !baseline.has(file) && path.basename(file).includes(token))
  assert.deepEqual(leaked, [], `cancel left new files behind: ${leaked.join(', ')}`)

  const partials = after.filter(
    (file) => path.basename(file).includes(token) && /\.(part|tmp|partial)$/i.test(file),
  )
  assert.deepEqual(partials, [], `cancel left partial files behind: ${partials.join(', ')}`)

  const workdirPartials = (await listFilesRecursive(workdir)).filter((file) =>
    /\.(part|tmp|partial)$/i.test(file),
  )
  assert.deepEqual(workdirPartials, [], `cancel left partial files in the work directory: ${workdirPartials.join(', ')}`)

  // 4. Nothing may appear after the grace period: a live writer would keep going.
  await sleep(1000)
  const later = await listFilesRecursive(outputDir)
  const lateArrivals = later.filter((file) => !after.includes(file) && path.basename(file).includes(token))
  assert.deepEqual(lateArrivals, [], `files appeared after cancel(): ${lateArrivals.join(', ')}`)

  const finalDetail = await service.jobs.get(summary.id)
  assert.equal(finalDetail.status, 'cancelled', 'cancelled job changed state during the grace period')
})
