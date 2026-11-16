import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { platform } from '../../src/engine/platform/index.js'
import { run } from '../../src/engine/runner.js'

const NODE = process.execPath

/**
 * taskkill can be denied inside restricted job objects (e.g. this sandbox).
 * The probe uses the same command the runner uses, so the tree test can skip
 * honestly instead of failing where process-tree termination is impossible.
 */
async function canTerminateTree() {
  if (platform.name !== 'win32') return true
  const child = spawn(NODE, ['-e', 'setTimeout(() => {}, 5000)'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  const result = await run(['taskkill', '/PID', String(child.pid), '/T', '/F'], { timeoutMs: 5000 })
  try {
    child.kill()
  } catch {
    // already gone
  }
  return result.code === 0
}

test('run captures stdout/stderr and the exit code', async () => {
  const ok = await run([
    NODE,
    '-e',
    'process.stdout.write("hello"); process.stderr.write("warn")',
  ])
  assert.equal(ok.code, 0)
  assert.equal(ok.stdout, 'hello')
  assert.equal(ok.stderr, 'warn')
  assert.equal(ok.cancelled, false)
  assert.equal(ok.timedOut, false)
  assert.ok(ok.ms >= 0)

  const failed = await run([NODE, '-e', 'process.exit(3)'])
  assert.equal(failed.code, 3)
  assert.equal(failed.cancelled, false)
})

test('run keeps only the last 256 KiB of each stream', async () => {
  const result = await run([
    NODE,
    '-e',
    'process.stdout.write("START" + "x".repeat(300 * 1024) + "END")',
  ])

  assert.equal(result.code, 0)
  assert.equal(result.stdout.length, 256 * 1024)
  assert.ok(result.stdout.endsWith('END'), 'tail must survive truncation')
  assert.equal(result.stdout.includes('START'), false, 'head must be dropped')
})

test('run parses -progress pipe:1 blocks', async () => {
  const script =
    "process.stdout.write('out_time_us=1000000\\nspeed=1.5x\\nprogress=continue\\n" +
    "out_time_us=2500000\\nspeed=2.0x\\nprogress=end\\n')"
  const updates = []

  const result = await run([NODE, '-e', script, '--', '-progress', 'pipe:1'], {
    onProgress: (info) => updates.push(info),
  })

  assert.equal(result.code, 0)
  assert.ok(updates.length >= 1)
  assert.deepEqual(updates.at(-1), {
    outTimeUs: 2_500_000,
    seconds: 2.5,
    speed: 2,
    done: true,
  })
})

test('a timeout kills the process and reports cancellation', async () => {
  const started = Date.now()
  const result = await run([NODE, '-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 300 })

  assert.equal(result.cancelled, true)
  assert.equal(result.timedOut, true)
  assert.equal(typeof result.code, 'number')
  assert.ok(Date.now() - started < 5000, 'must not wait for the full sleep')
})

test('AbortSignal kills the process; pre-aborted signals never spawn', async () => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 150)
  const result = await run([NODE, '-e', 'setTimeout(() => {}, 10000)'], {
    signal: controller.signal,
  })
  clearTimeout(timer)

  assert.equal(result.cancelled, true)
  assert.equal(result.timedOut, false)

  const already = new AbortController()
  already.abort()
  const skipped = await run([NODE, '-e', 'process.stdout.write("should-not-run")'], {
    signal: already.signal,
  })
  assert.equal(skipped.cancelled, true)
  assert.equal(skipped.stdout, '')
})

test('run rejects with a readable error when the executable is missing', async () => {
  await assert.rejects(
    run(['kumquat-no-such-binary-xyz']),
    (error) => {
      assert.match(error.message, /Failed to start "kumquat-no-such-binary-xyz"/)
      assert.match(error.message, /not found/)
      return true
    },
  )
})

test('run only accepts an argv array, never a shell string', async () => {
  await assert.rejects(run('ffmpeg -i in.mp4 out.mp4'), /non-empty array of strings/)
  await assert.rejects(run([]), /non-empty array of strings/)
  await assert.rejects(run([NODE, 42]), /must be a string/)
})

test('timeout kills the whole process tree, including grandchildren', async (t) => {
  if (!(await canTerminateTree())) {
    t.skip('process-tree termination is denied by this sandbox (taskkill access denied)')
    return
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'kumquat-tree-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const marker = path.join(root, 'grandchild-was-here.txt')

  const grandchild =
    `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 700)`
  const parent =
    `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], ` +
    `{ stdio: 'ignore' }); setTimeout(() => {}, 10000)`

  const result = await run([NODE, '-e', parent], { timeoutMs: 300 })
  assert.equal(result.timedOut, true)

  await delay(1200)
  assert.equal(existsSync(marker), false, 'the grandchild must not outlive the kill')
})

test('concurrent runs keep argv, output and progress isolated', async () => {
  /** @param {number} id */
  const script = (id) =>
    `process.stdout.write('out_time_us=${id * 1_000_000}\\nspeed=${id}.0x\\nprogress=end\\n');` +
    `process.stderr.write('err-${id}')`

  const updatesA = []
  const updatesB = []

  const [a, b] = await Promise.all([
    run([NODE, '-e', script(2), '--', '-progress', 'pipe:1'], {
      onProgress: (info) => updatesA.push(info),
    }),
    run([NODE, '-e', script(5), '--', '-progress', 'pipe:1'], {
      onProgress: (info) => updatesB.push(info),
    }),
  ])

  assert.equal(a.code, 0)
  assert.equal(b.code, 0)
  assert.equal(a.stderr, 'err-2')
  assert.equal(b.stderr, 'err-5')
  assert.equal(a.stdout.includes('out_time_us=2000000'), true)
  assert.equal(a.stdout.includes('out_time_us=5000000'), false)
  assert.equal(b.stdout.includes('out_time_us=5000000'), true)
  assert.equal(updatesA.at(-1)?.seconds, 2)
  assert.equal(updatesB.at(-1)?.seconds, 5)
  assert.equal(updatesA.at(-1)?.speed, 2)
  assert.equal(updatesB.at(-1)?.speed, 5)
})
