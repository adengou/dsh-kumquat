/**
 * Host plugin wiring: activation registers one prefix route, admission goes
 * through the Connection fence, and the pre-integration service still answers
 * 501 instead of taking the host down.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../../src/host/plugin.js'
import { ROUTE_PREFIX } from '../../src/host/routes.js'

const SECRET = 'sk-plugin-SECRET-1234567890'

/**
 * Build a Host Context stand-in with just the surface `apply` uses.
 * @param {{ connection?: any, config?: unknown, logger?: any }} [options] - Injected services.
 * @returns {{ ctx: any, routes: any[], logs: string[], dispose: () => void }} Harness.
 */
function fakeContext(options = {}) {
  const routes = []
  const logs = []
  const disposers = []
  const logger = options.logger ?? {
    info: (message) => logs.push(`info:${message}`),
    warn: (message) => logs.push(`warn:${message}`),
    error: (message) => logs.push(`error:${message}`),
  }
  const ctx = {
    logger,
    fiber: { entry: { options: { config: options.config ?? {} } } },
    effect(factory) {
      const dispose = factory()
      disposers.push(dispose)
      return dispose
    },
    inject(dependencies, callback) {
      const child = {
        webServer: {
          register(route) {
            routes.push(route)
            return () => {}
          },
        },
        get(name) {
          return name === 'connection' ? options.connection : undefined
        },
        effect: ctx.effect,
      }
      callback(child)
    },
    get(name) {
      return name === 'connection' ? options.connection : undefined
    },
  }
  return {
    ctx,
    routes,
    logs,
    dispose: () => {
      for (const dispose of disposers) {
        if (typeof dispose === 'function') dispose()
      }
    },
  }
}

/**
 * Build an IncomingMessage stand-in.
 * @param {{ method?: string, url: string, body?: string, headers?: Record<string, string> }} options - Request facts.
 * @returns {any} Request.
 */
function fakeRequest(options) {
  const request = {
    method: options.method ?? 'GET',
    url: options.url,
    headers: options.headers ?? {},
  }
  request[Symbol.asyncIterator] = async function* iterate() {
    if (options.body !== undefined && options.body !== '') yield Buffer.from(options.body, 'utf8')
  }
  return request
}

/**
 * Build a ServerResponse stand-in.
 * @returns {any} Response with captured state.
 */
function fakeResponse() {
  const state = { status: 0, headers: {}, body: '', destroyed: false }
  return {
    state,
    get headersSent() {
      return state.status !== 0
    },
    writeHead(status, headers) {
      state.status = status
      Object.assign(state.headers, headers ?? {})
    },
    end(chunk) {
      if (chunk !== undefined) state.body += chunk
    },
    destroy() {
      state.destroyed = true
    },
  }
}

/**
 * Invoke the registered route handler once.
 * @param {any} route - Registered route.
 * @param {{ method?: string, url: string, body?: string, headers?: Record<string, string> }} options - Request facts.
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string, json: any }>} Response.
 */
async function invoke(route, options) {
  const response = fakeResponse()
  await route.handler(fakeRequest(options), response)
  let json
  try {
    json = response.state.body === '' ? undefined : JSON.parse(response.state.body)
  } catch {
    json = undefined
  }
  return { status: response.state.status, headers: response.state.headers, body: response.state.body, json }
}

test('apply 注册一个 /api/kumquat 前缀路由并正常返回', async () => {
  const harness = fakeContext({ connection: { requestRejection: () => undefined } })

  await apply(harness.ctx)

  assert.equal(harness.routes.length, 1)
  assert.equal(harness.routes[0].kind, 'prefix')
  assert.equal(harness.routes[0].path, ROUTE_PREFIX)
  assert.equal(typeof harness.routes[0].handler, 'function')
  harness.dispose()
})

test('接线后 capabilities 返回 200，宿主不崩', async () => {
  const harness = fakeContext({ connection: { requestRejection: () => undefined } })
  await apply(harness.ctx)

  const response = await invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/capabilities` })

  assert.equal(response.status, 200)
  assert.equal(typeof response.json.version, 'string')
  assert.ok(Array.isArray(response.json.filters) || Array.isArray(response.json.encoders))
  harness.dispose()
})

test('没有 Connection 服务时按未认证处理，不注册无门槛入口', async () => {
  const harness = fakeContext()
  await apply(harness.ctx)

  const response = await invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/balance` })

  assert.equal(response.status, 503)
  assert.equal(response.body, 'unavailable')
  harness.dispose()
})

test('Connection 拒绝请求时原样返回 401 / 403', async () => {
  const harness = fakeContext({ connection: { requestRejection: () => 401 } })
  await apply(harness.ctx)

  const unauthorized = await invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/balance` })
  assert.equal(unauthorized.status, 401)
  assert.equal(unauthorized.body, 'unauthorized')

  harness.dispose()
  const forbiddenHarness = fakeContext({ connection: { requestRejection: () => 403 } })
  await apply(forbiddenHarness.ctx)
  const forbidden = await invoke(forbiddenHarness.routes[0], { url: `${ROUTE_PREFIX}/balance` })
  assert.equal(forbidden.status, 403)
  assert.equal(forbidden.body, 'forbidden')
  forbiddenHarness.dispose()
})

test('未接线时参数校验仍然先行：坏任务返回 400 而不是 501', async () => {
  const harness = fakeContext({ connection: { requestRejection: () => undefined } })
  await apply(harness.ctx)

  const response = await invoke(harness.routes[0], {
    method: 'POST',
    url: `${ROUTE_PREFIX}/run`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: { kind: 'convert', input: 'relative.mp4', to: 'mkv' } }),
  })

  assert.equal(response.status, 400)
  assert.equal(response.json.error.code, 'E_INPUT')
  harness.dispose()
})

test('请求体不是 JSON 或超限时给出可读错误', async () => {
  const harness = fakeContext({ connection: { requestRejection: () => undefined } })
  await apply(harness.ctx)

  const wrongType = await invoke(harness.routes[0], {
    method: 'POST',
    url: `${ROUTE_PREFIX}/probe`,
    headers: { 'content-type': 'text/plain' },
    body: 'not json',
  })
  assert.equal(wrongType.status, 415)

  const malformed = await invoke(harness.routes[0], {
    method: 'POST',
    url: `${ROUTE_PREFIX}/probe`,
    headers: { 'content-type': 'application/json' },
    body: '{oops',
  })
  assert.equal(malformed.status, 400)
  assert.equal(malformed.json.error.code, 'E_INPUT')

  const methodNotAllowed = await invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/probe` })
  assert.equal(methodNotAllowed.status, 405)
  assert.equal(methodNotAllowed.headers.allow, 'POST')
  harness.dispose()
})

test('autoDownload=false 时安装接口返回 403 且不联网', async () => {
  const harness = fakeContext({
    connection: { requestRejection: () => undefined },
    config: { autoDownload: false },
  })
  await apply(harness.ctx)

  const response = await invoke(harness.routes[0], { method: 'POST', url: `${ROUTE_PREFIX}/ffmpeg/install` })

  assert.equal(response.status, 403)
  assert.equal(response.json.error.code, 'E_DISABLED')
  harness.dispose()
})

test('启动日志与任何响应都不包含 key 明文', async () => {
  const harness = fakeContext({
    connection: { requestRejection: () => undefined },
    config: { apiKey: SECRET },
  })
  await apply(harness.ctx)

  const responses = await Promise.all([
    invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/balance` }),
    invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/capabilities` }),
    invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/ffmpeg/status` }),
  ])

  assert.ok(harness.logs.length > 0, '应有启动日志')
  for (const log of harness.logs) assert.ok(!log.includes(SECRET), `日志泄露了 key: ${log}`)
  for (const response of responses) assert.ok(!response.body.includes(SECRET), '响应泄露了 key')
  harness.dispose()
})

test('余额接口在无 key 时立即返回 not-configured，不发网络请求', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    throw new Error('不应联网')
  }
  try {
    const harness = fakeContext({ connection: { requestRejection: () => undefined } })
    await apply(harness.ctx)

    const response = await invoke(harness.routes[0], { url: `${ROUTE_PREFIX}/balance` })

    assert.equal(response.status, 200)
    assert.deepEqual(response.json, { ok: false, error: 'no-key' })
    assert.equal(calls, 0)
    harness.dispose()
  } finally {
    globalThis.fetch = originalFetch
  }
})
