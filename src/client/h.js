/**
 * Kumquat · 取宿主的 React.createElement，绑一次，全局用 `h`。
 *
 * 组件不直接向宿主取 react：宿主只允许 client.js 的工厂拿取模块，
 * 拆出来的模块共用这里绑定的 `h`。没绑之前 `h` 是 null，组件不会被调用。
 */

/** @type {((type: any, props?: any, ...children: any[]) => any) | null} */
export let h = null

/**
 * 绑定宿主的 React（只取 createElement）。
 * @param {{ createElement: Function }} React
 */
export function bindHost(React) {
  h = React.createElement
  return h
}

/**
 * 拼 className，过滤假值。
 * @param {...any} parts
 */
export function cx(...parts) {
  return parts.filter((part) => typeof part === 'string' && part !== '').join(' ')
}
