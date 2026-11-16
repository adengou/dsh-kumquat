/**
 * DeepSeek balance widget, Host side.
 *
 * This is Kumquat's only network egress. The key stays in this process: it is
 * read through a callback, used as a Bearer header, and never returned,
 * logged, or cached inside a result.
 *
 * Failure policy: every failure resolves to `{ ok: false, error }`. The panel
 * keeps working and simply shows "未连接"; nothing here throws.
 */

import { DEFAULT_BALANCE_REFRESH_MS } from './config.js'

/** Balance endpoint fixed by the product decision (D3). */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** Hard request timeout in milliseconds. */
export const BALANCE_TIMEOUT_MS = 5_000

/** Marker resolved by the timeout arm of the race. */
const TIMED_OUT = Symbol('kumquat.balance.timeout')

/**
 * Freeze one balance result.
 * @param {import('../public/types.d.ts').BalanceInfo} info - Plain result.
 * @returns {Readonly<import('../public/types.d.ts').BalanceInfo>} Frozen result.
 */
function freezeInfo(info) {
  return Object.freeze(info)
}

/**
 * Failure result with a stable, machine-readable reason.
 * @param {string} error - Reason such as `no-key`, `timeout`, or `http-500`.
 * @returns {Readonly<import('../public/types.d.ts').BalanceInfo>} Frozen failure.
 */
function failure(error) {
  return freezeInfo({ ok: false, error })
}

/**
 * Read a balance string, keeping the API's decimal text untouched.
 * @param {unknown} value - Field from `balance_infos[0]`.
 * @returns {string | undefined} Text, or undefined when absent.
 */
function decimal(value) {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/**
 * Map one parsed endpoint body onto `BalanceInfo`.
 * @param {unknown} body - Parsed JSON from the endpoint.
 * @param {number} at - Milliseconds when the response arrived.
 * @returns {Readonly<import('../public/types.d.ts').BalanceInfo>} Result.
 */
export function mapBalance(body, at) {
  if (body === null || typeof body !== 'object') return failure('bad-shape')
  const record = /** @type {{ is_available?: unknown, balance_infos?: unknown }} */ (body)
  if (!Array.isArray(record.balance_infos) || record.balance_infos.length === 0) return failure('bad-shape')
  const first = record.balance_infos[0]
  if (first === null || typeof first !== 'object') return failure('bad-shape')
  const entry = /** @type {{ currency?: unknown, total_balance?: unknown,
   *   granted_balance?: unknown, topped_up_balance?: unknown }} */ (first)

  /** @type {import('../public/types.d.ts').BalanceInfo} */
  const info = { ok: true, at }
  const currency = decimal(entry.currency)
  if (currency !== undefined) info.currency = currency
  const total = decimal(entry.total_balance)
  if (total !== undefined) info.total = total
  const granted = decimal(entry.granted_balance)
  if (granted !== undefined) info.granted = granted
  const toppedUp = decimal(entry.topped_up_balance)
  if (toppedUp !== undefined) info.toppedUp = toppedUp
  if (typeof record.is_available === 'boolean') info.available = record.is_available
  return freezeInfo(info)
}

/**
 * Create the balance reader.
 *
 * @param {{
 *   fetch?: typeof fetch,
 *   getApiKey?: () => string | undefined | Promise<string | undefined>,
 *   now?: () => number,
 *   cacheMs?: number,
 *   timeoutMs?: number,
 *   url?: string,
 * }} [deps] - Injectable facts; tests replace all of them.
 * @returns {{ getBalance: () => Promise<Readonly<import('../public/types.d.ts').BalanceInfo>>, clear: () => void, url: string }}
 *   Reader with an explicit cache reset.
 */
export function createBalance(deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const getApiKey = deps.getApiKey ?? (() => undefined)
  const now = deps.now ?? Date.now
  const cacheMs = deps.cacheMs ?? DEFAULT_BALANCE_REFRESH_MS
  const timeoutMs = deps.timeoutMs ?? BALANCE_TIMEOUT_MS
  const url = deps.url ?? BALANCE_URL

  /** @type {{ expires: number, value: Readonly<import('../public/types.d.ts').BalanceInfo> } | null} */
  let cache = null

  /**
   * One request, one settle. Aborts the socket on timeout and still settles
   * when a stand-in fetch ignores the signal.
   * @param {string} key - Bearer token.
   * @returns {Promise<Readonly<import('../public/types.d.ts').BalanceInfo>>} Result.
   */
  async function fetchOnce(key) {
    if (typeof fetchImpl !== 'function') return failure('network')
    const controller = new AbortController()
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(TIMED_OUT)
      }, timeoutMs)
    })
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => fetchImpl(url, {
          method: 'GET',
          headers: { accept: 'application/json', authorization: `Bearer ${key}` },
          signal: controller.signal,
        })),
        timeout,
      ])
      if (response === TIMED_OUT) return failure('timeout')
      if (response === null || typeof response !== 'object') return failure('network')
      if (response.ok !== true) return failure(`http-${Number(response.status) || 0}`)
      let body
      try {
        body = await response.json()
      } catch {
        return failure('bad-json')
      }
      return mapBalance(body, now())
    } catch (error) {
      const name = error !== null && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      return failure(name === 'AbortError' ? 'timeout' : 'network')
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * Read the cached balance when fresh, otherwise ask the endpoint once.
   * A missing key is answered without a request, every time.
   * @returns {Promise<Readonly<import('../public/types.d.ts').BalanceInfo>>} Result.
   */
  async function getBalance() {
    const key = await getApiKey()
    if (typeof key !== 'string' || key.trim() === '') return failure('no-key')
    const stamp = now()
    if (cache !== null && stamp < cache.expires) return cache.value
    const value = await fetchOnce(key.trim())
    // Failures are cached for the same interval: a broken endpoint must not be
    // retried on every panel paint.
    cache = { expires: stamp + cacheMs, value }
    return value
  }

  /** Drop the memoized result, e.g. after a configuration change. */
  function clear() {
    cache = null
  }

  return { getBalance, clear, url }
}
