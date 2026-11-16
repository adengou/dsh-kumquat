/**
 * Lazily created service: one creation attempt shared by concurrent callers,
 * and a failed attempt that is retried rather than cached.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createServiceProvider } from '../../src/host/service.js'

const OPTIONS = { outputDir: '/tmp/out', ffmpegPath: '/usr/bin/ffmpeg', binaryRoot: '/tmp/kumquat' }

test('并发首次调用只创建一次服务，并共用同一个实例', async () => {
  let created = 0
  const open = new Promise(resolve => setTimeout(resolve, 10))
  const service = { apiVersion: 1, ready: true }
  const getService = createServiceProvider({
    load: async () => ({
      createService: async () => {
        created += 1
        await open
        return service
      },
    }),
    options: OPTIONS,
  })

  const results = await Promise.all([getService(), getService(), getService()])

  assert.equal(created, 1, '三个并发调用只应创建一次')
  assert.ok(results.every(result => result === service))
})

test('创建失败不会缓存：下一次请求重新尝试', async () => {
  let calls = 0
  const getService = createServiceProvider({
    load: async () => ({
      createService: async () => {
        calls += 1
        if (calls === 1) throw new Error('Kumquat: service not wired yet (M1 integration)')
        return { apiVersion: 1 }
      },
    }),
    options: OPTIONS,
  })

  await assert.rejects(getService(), /not wired yet/)
  const service = await getService()

  assert.equal(calls, 2)
  assert.equal(service.apiVersion, 1)
})

test('模块缺少 createService 时给出明确错误', async () => {
  const getService = createServiceProvider({ load: async () => ({}), options: OPTIONS })

  await assert.rejects(getService(), /没有导出 createService/)
})

test('createService 返回空值时视为接线错误', async () => {
  const getService = createServiceProvider({
    load: async () => ({ createService: () => undefined }),
    options: OPTIONS,
  })

  await assert.rejects(getService(), /没有返回服务对象/)
})

test('创建参数原样交给 createService', async () => {
  let seen
  const getService = createServiceProvider({
    load: async () => ({
      createService: (options) => {
        seen = options
        return { apiVersion: 1 }
      },
    }),
    options: OPTIONS,
  })

  await getService()
  assert.deepEqual(seen, OPTIONS)
})
