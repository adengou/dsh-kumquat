/**
 * Balance widget: field mapping, no-key short circuit, HTTP failure, timeout,
 * and the 30-second memo. The key must never appear in a result.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createBalance, mapBalance, BALANCE_URL } from '../../src/host/balance.js'

const SECRET = 'sk-test-DO-NOT-LEAK-1234567890'

/**
 * Build a minimal Response stand-in.
 * @param {unknown} body - JSON value.
 * @param {number} [status] - HTTP status.
 * @returns {{ ok: boolean, status: number, json: () => Promise<unknown> }} Response.
 */
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

/** The real endpoint's response shape. */
const REAL_BODY = {
  is_available: true,
  balance_infos: [
    {
      currency: 'CNY',
      total_balance: '12.34',
      granted_balance: '0.00',
      topped_up_balance: '12.34',
    },
  ],
}

test('正常响应按 types.d.ts 映射，且请求携带 Bearer 头', async () => {
  const calls = []
  const balance = createBalance({
    getApiKey: () => SECRET,
    now: () => 1_700_000_000_000,
    fetch: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse(REAL_BODY)
    },
  })

  const info = await balance.getBalance()

  assert.deepEqual(info, {
    ok: true,
    currency: 'CNY',
    total: '12.34',
    granted: '0.00',
    toppedUp: '12.34',
    available: true,
    at: 1_700_000_000_000,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, BALANCE_URL)
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.headers.authorization, `Bearer ${SECRET}`)
  assert.ok(info instanceof Object)
  assert.ok(JSON.stringify(info).includes('12.34'))
  assert.ok(!JSON.stringify(info).includes(SECRET), '余额结果不得包含 key')
})

test('没有 key 时返回 no-key，且不发起任何网络请求', async () => {
  let calls = 0
  const balance = createBalance({
    getApiKey: () => undefined,
    fetch: async () => {
      calls += 1
      return jsonResponse(REAL_BODY)
    },
  })

  const first = await balance.getBalance()
  const second = await balance.getBalance()

  assert.deepEqual(first, { ok: false, error: 'no-key' })
  assert.deepEqual(second, { ok: false, error: 'no-key' })
  assert.equal(calls, 0)
})

test('环境里只有空白 key 视同没有 key', async () => {
  let calls = 0
  const balance = createBalance({
    getApiKey: () => '   ',
    fetch: async () => {
      calls += 1
      return jsonResponse(REAL_BODY)
    },
  })

  assert.deepEqual(await balance.getBalance(), { ok: false, error: 'no-key' })
  assert.equal(calls, 0)
})

test('HTTP 500 静默降级为 http-500，不抛异常', async () => {
  const balance = createBalance({
    getApiKey: () => SECRET,
    fetch: async () => jsonResponse({ error: 'boom' }, 500),
  })

  const info = await balance.getBalance()

  assert.deepEqual(info, { ok: false, error: 'http-500' })
  assert.ok(!JSON.stringify(info).includes(SECRET))
})

test('超时返回 timeout，即使 fetch 忽略 AbortSignal', async () => {
  let seenSignal
  const balance = createBalance({
    getApiKey: () => SECRET,
    timeoutMs: 20,
    fetch: (_url, init) => {
      seenSignal = init.signal
      return new Promise(() => {}) // 永不 settle，模拟卡住的连接
    },
  })

  const started = Date.now()
  const info = await balance.getBalance()

  assert.deepEqual(info, { ok: false, error: 'timeout' })
  assert.ok(Date.now() - started < 2_000)
  assert.equal(seenSignal.aborted, true, '超时后应中止底层请求')
})

test('网络异常返回 network，不抛异常', async () => {
  const balance = createBalance({
    getApiKey: () => SECRET,
    fetch: async () => {
      throw new TypeError('fetch failed')
    },
  })

  assert.deepEqual(await balance.getBalance(), { ok: false, error: 'network' })
})

test('30 秒内缓存命中：只请求一次；过期后重新请求', async () => {
  let calls = 0
  let clock = 1_000
  const balance = createBalance({
    getApiKey: () => SECRET,
    cacheMs: 30_000,
    now: () => clock,
    fetch: async () => {
      calls += 1
      return jsonResponse(REAL_BODY)
    },
  })

  const first = await balance.getBalance()
  clock += 29_999
  const cached = await balance.getBalance()
  assert.equal(calls, 1, '30 秒内应复用缓存')
  assert.equal(cached, first, '缓存命中应返回同一对象')

  clock += 2
  await balance.getBalance()
  assert.equal(calls, 2, '超过 30 秒应重新请求')
})

test('失败也进入缓存，避免面板每次绘制都打接口', async () => {
  let calls = 0
  const balance = createBalance({
    getApiKey: () => SECRET,
    cacheMs: 30_000,
    now: () => 5_000,
    fetch: async () => {
      calls += 1
      return jsonResponse(null, 503)
    },
  })

  await balance.getBalance()
  await balance.getBalance()
  assert.equal(calls, 1)

  balance.clear()
  await balance.getBalance()
  assert.equal(calls, 2, 'clear() 后应重新请求')
})

test('mapBalance 对缺字段与坏形状给出稳定错误', () => {
  assert.deepEqual(mapBalance({}, 1), { ok: false, error: 'bad-shape' })
  assert.deepEqual(mapBalance({ balance_infos: [] }, 1), { ok: false, error: 'bad-shape' })
  assert.deepEqual(mapBalance({ balance_infos: [null] }, 1), { ok: false, error: 'bad-shape' })
  assert.deepEqual(mapBalance(null, 1), { ok: false, error: 'bad-shape' })

  const partial = mapBalance({ balance_infos: [{ total_balance: '0.01' }] }, 7)
  assert.deepEqual(partial, { ok: true, total: '0.01', at: 7 })
})

test('is_available=false 时仍返回余额，只把 available 置 false', () => {
  const info = mapBalance({ is_available: false, balance_infos: [{ currency: 'USD', total_balance: '0.00' }] }, 9)
  assert.deepEqual(info, { ok: true, currency: 'USD', total: '0.00', available: false, at: 9 })
})
