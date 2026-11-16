import test from 'node:test'
import assert from 'node:assert/strict'
import { createScheduler, defaultConcurrency } from '../../src/app/scheduler.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('并发不超过上限，且任务都能完成', async () => {
  const s = createScheduler({ concurrency: 2 })
  let active = 0
  let peak = 0
  const jobs = []
  for (let i = 0; i < 5; i++) {
    jobs.push(s.submit({
      run: async () => {
        active += 1
        peak = Math.max(peak, active)
        await sleep(20)
        active -= 1
        return i
      },
    }))
  }
  const results = await Promise.all(jobs.map((j) => j.promise))
  assert.equal(peak, 2)
  assert.deepEqual(results, [0, 1, 2, 3, 4])
  assert.equal(s.stats().done, 5)
})

test('FIFO 顺序', async () => {
  const s = createScheduler({ concurrency: 1 })
  const order = []
  const jobs = [0, 1, 2].map((i) => s.submit({
    run: async () => { order.push(i); await sleep(5) },
  }))
  await Promise.all(jobs.map((j) => j.promise))
  assert.deepEqual(order, [0, 1, 2])
})

test('取消排队中的任务不会执行', async () => {
  const s = createScheduler({ concurrency: 1 })
  const first = s.submit({ run: async () => { await sleep(30); return 'a' } })
  let ran = false
  const second = s.submit({ run: async () => { ran = true } })
  second.cancel()
  await first.promise
  await assert.rejects(second.promise, /cancelled/)
  assert.equal(ran, false)
})

test('取消运行中的任务会触发 abort', async () => {
  const s = createScheduler({ concurrency: 1 })
  let aborted = false
  const job = s.submit({
    run: (signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(new Error('aborted by signal'))
      })
      setTimeout(resolve, 200)
    }),
  })
  await sleep(10)
  job.cancel()
  await assert.rejects(job.promise, /cancelled/)
  await sleep(10)
  assert.equal(aborted, true)
})

test('内存预算收紧并发度', () => {
  const s = createScheduler({ concurrency: 8, memoryBudgetMb: 1400, perJobMb: 700 })
  assert.equal(s.concurrency, 2)
  const t = createScheduler({ concurrency: 8, memoryBudgetMb: 500, perJobMb: 700 })
  assert.equal(t.concurrency, 1)
})

test('进度回调被合并，不会每次调用都发事件', async () => {
  const events = []
  const s = createScheduler({ concurrency: 1, onEvent: (e) => events.push(e) })
  const job = s.submit({
    run: async (_signal, onProgress) => {
      for (let i = 0; i < 20; i++) onProgress({ percent: i * 5 })
      await sleep(120)
    },
  })
  await job.promise
  const progressEvents = events.filter((e) => e.type === 'progress')
  assert.ok(progressEvents.length <= 3, `got ${progressEvents.length}`)
  assert.ok(progressEvents.length >= 1)
})

test('单个任务失败不影响队列', async () => {
  const s = createScheduler({ concurrency: 1 })
  const bad = s.submit({ run: async () => { throw new Error('boom') } })
  const good = s.submit({ run: async () => 'ok' })
  await assert.rejects(bad.promise, /boom/)
  assert.equal(await good.promise, 'ok')
  assert.equal(s.stats().failed, 1)
  assert.equal(s.stats().done, 1)
})

test('cancelAll 清空队列与运行中任务', async () => {
  const s = createScheduler({ concurrency: 2 })
  const jobs = [0, 1, 2].map(() => s.submit({
    run: (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    }),
  }))
  await sleep(5)
  s.cancelAll()
  for (const j of jobs) await assert.rejects(j.promise, /cancelled/)
  assert.equal(s.stats().running, 0)
  assert.equal(s.stats().queued, 0)
})

test('默认并发度在 1..4 之间', () => {
  const n = defaultConcurrency()
  assert.ok(n >= 1 && n <= 4)
})
