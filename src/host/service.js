/**
 * Lazily created media service, single-flight.
 *
 * `src/public/index.js` is the only door into the engine. It is imported on
 * the first request, not during activation: a bundle whose service is not
 * wired yet must still activate and answer 501 instead of failing the host.
 *
 * Concurrent first requests share one creation attempt. Without that, two
 * panel calls arriving together would build two services, each with its own
 * job store, and `GET /jobs` would report whichever one won.
 */

/**
 * Create the service provider.
 *
 * @param {{
 *   load: () => Promise<{ createService?: Function }>,
 *   options: { outputDir: string, ffmpegPath?: string, binaryRoot: string },
 * }} deps - Module loader and creation options.
 * @returns {() => Promise<import('../public/types.d.ts').MediaQcService>} Provider;
 *   a rejected attempt is forgotten so the next request tries again.
 */
export function createServiceProvider(deps) {
  const load = deps.load
  const options = deps.options
  /** @type {Promise<import('../public/types.d.ts').MediaQcService> | undefined} */
  let pending

  return function getService() {
    if (pending !== undefined) return pending
    const attempt = (async () => {
      const module = await load()
      const createService = module?.createService
      if (typeof createService !== 'function') {
        throw new Error('src/public/index.js 没有导出 createService')
      }
      const service = await createService(options)
      if (service === null || typeof service !== 'object') {
        throw new Error('createService 没有返回服务对象')
      }
      return /** @type {import('../public/types.d.ts').MediaQcService} */ (service)
    })()
    // Keep one promise for every concurrent caller, but never cache a failure:
    // a later integration or reload can make the same call succeed.
    pending = attempt.catch((error) => {
      pending = undefined
      throw error
    })
    return pending
  }
}
