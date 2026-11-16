/**
 * Node HTTP adapter for the Kumquat routes.
 *
 * The route table itself is transport-free (`routes.js`); this module owns the
 * parts that only exist on a socket: admission, a bounded JSON body read, and
 * the response write. A handler failure never reaches the process: the socket
 * is answered with an error envelope, and headers already sent only close it.
 */

import { HOST_CODES } from './errors.js'

/** Largest accepted request body. Every endpoint takes a tiny JSON object. */
export const MAX_BODY_BYTES = 64 * 1024

/**
 * Read a request body with a hard size cap.
 * @param {import('node:http').IncomingMessage} request - Incoming request.
 * @returns {Promise<string>} UTF-8 body text.
 * @throws {Error & { code: string }} `E_BODY` when the cap is exceeded.
 */
async function readBody(request) {
  let size = 0
  /** @type {Buffer[]} */
  const chunks = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      const error = new Error(`请求体超过 ${MAX_BODY_BYTES} 字节`)
      error.code = HOST_CODES.BODY
      throw error
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} response - Response to own.
 * @param {{ status: number, body: unknown, headers?: Record<string, string> }} result - Result from the router.
 * @param {boolean} [head] - Send headers only.
 */
function writeJson(response, result, head = false) {
  const payload = JSON.stringify(result.body === undefined ? null : result.body)
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...result.headers,
  }
  response.writeHead(result.status, headers)
  response.end(head ? undefined : payload)
}

/**
 * Create the socket handler registered on `/api/kumquat`.
 *
 * @param {(request: { method: string, pathname: string, searchParams: URLSearchParams, body?: unknown }) => Promise<{ status: number, body: unknown, headers?: Record<string, string> }>} handle
 *   Route table.
 * @param {{
 *   authorize?: (request: import('node:http').IncomingMessage) => number | undefined,
 *   logger?: { warn?: (message: string, error?: unknown) => void, error?: (message: string, error?: unknown) => void },
 * }} [options] - Admission and logging.
 * @returns {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<void>}
 *   Node request handler.
 */
export function createHttpHandler(handle, options = {}) {
  const authorize = options.authorize ?? (() => undefined)
  const logger = options.logger

  return async function onRequest(request, response) {
    try {
      const rejection = authorize(request)
      if (rejection !== undefined) {
        response.writeHead(rejection)
        response.end(rejection === 401 ? 'unauthorized' : rejection === 403 ? 'forbidden' : 'unavailable')
        return
      }

      const method = (request.method ?? 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
        response.writeHead(405, { allow: 'GET, HEAD, POST' })
        response.end()
        return
      }

      /** @type {unknown} */
      let body
      const url = new URL(request.url ?? '/', 'http://kumquat.invalid')
      if (method === 'POST' && typeof options.upload === 'function' && url.pathname.endsWith('/upload')) {
        const uploaded = await options.upload(request, url)
        writeJson(response, uploaded)
        return
      }
      if (method === 'POST') {
        const mediaType = (request.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
        const text = await readBody(request)
        if (text !== '') {
          if (mediaType !== 'application/json') {
            writeJson(response, {
              status: 415,
              body: {
                ok: false,
                error: {
                  code: HOST_CODES.INPUT,
                  message: '请求体必须是 application/json',
                  hint: '设置 Content-Type: application/json，并把参数放进 JSON 对象。',
                },
              },
            })
            return
          }
          try {
            body = JSON.parse(text)
          } catch {
            writeJson(response, {
              status: 400,
              body: {
                ok: false,
                error: {
                  code: HOST_CODES.INPUT,
                  message: '请求体不是合法 JSON',
                  hint: '检查引号与逗号；空请求体表示无参数。',
                },
              },
            })
            return
          }
        }
      }

      const result = await handle({
        method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body,
      })
      writeJson(response, result, method === 'HEAD')
    } catch (error) {
      const code = error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : HOST_CODES.HOST
      if (response.headersSent) {
        response.destroy()
        return
      }
      if (code === HOST_CODES.BODY) {
        writeJson(response, {
          status: 413,
          body: {
            ok: false,
            error: {
              code: HOST_CODES.BODY,
              message: error instanceof Error ? error.message : '请求体过大',
              hint: '这个接口只接收很小的 JSON 对象。',
            },
          },
        })
        return
      }
      logger?.error?.('kumquat: request failed', error)
      writeJson(response, {
        status: 500,
        body: {
          ok: false,
          error: {
            code: HOST_CODES.HOST,
            message: 'Kumquat 宿主处理请求失败',
            hint: '重试一次；若仍失败，查看宿主日志。',
          },
        },
      })
    }
  }
}
