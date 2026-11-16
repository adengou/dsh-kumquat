/**
 * Kumquat · 复制文本。
 *
 * 优先 navigator.clipboard；不可用（非安全上下文、老宿主）时退回 textarea +
 * execCommand。两条路都失败就老实返回 false，界面显示「复制失败，请手动选中」。
 */

/**
 * @param {unknown} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  const value = String(text === null || text === undefined ? '' : text)
  if (value === '') return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch (error) {
    /* 落到 textarea 方案 */
  }
  try {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.setAttribute('aria-hidden', 'true')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied === true
  } catch (error) {
    return false
  }
}
