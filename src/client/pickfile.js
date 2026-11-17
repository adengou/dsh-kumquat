/**
 * 系统文件选择：隐藏的 <input type="file"> 打开原生对话框。
 * 桌面端尽量取回真实绝对路径；网页端拿不到路径，就把文件交给宿主写入临时目录。
 * `multiple` 只给批量转换用。
 */

/** @param {File} file */
function electronPath(file) {
  if (file && typeof file.path === 'string' && file.path !== '') return file.path
  try {
    const req = typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null
    if (req !== null) {
      const electron = req('electron')
      const webUtils = electron && electron.webUtils
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        const resolved = webUtils.getPathForFile(file)
        if (typeof resolved === 'string' && resolved !== '') return resolved
      }
    }
  } catch {
    /* fall through to upload */
  }
  return ''
}

/**
 * @param {boolean} [multiple]
 * @returns {Promise<{ ok: true, files: Array<{ file: File, name: string, path: string }> } | { ok: false, reason: 'cancel' }>}
 */
export function chooseLocalFile(multiple) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ ok: false, reason: 'cancel' })
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*,audio/*,.mkv,.flac,.m4a,.wav,.webm,.vdat,.sdv'
    if (multiple === true) input.multiple = true
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    const done = (value) => {
      input.remove()
      resolve(value)
    }
    input.addEventListener('change', () => {
      const picked = input.files ? Array.from(input.files) : []
      if (picked.length === 0) {
        done({ ok: false, reason: 'cancel' })
        return
      }
      done({
        ok: true,
        files: picked.map((file) => ({ file, name: file.name, path: electronPath(file) })),
      })
    })
    input.addEventListener('cancel', () => done({ ok: false, reason: 'cancel' }))
    input.click()
  })
}

/**
 * @param {File} file
 * @returns {Promise<{ ok: true, path: string, name: string } | { ok: false, error: { code: string, message: string, hint: string } }>}
 */
export async function uploadFile(file) {
  try {
    const response = await fetch(`/api/kumquat/upload?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    })
    /** @type {any} */
    let payload = null
    try { payload = await response.json() } catch { payload = null }
    if (!response.ok || !payload || typeof payload.path !== 'string') {
      return {
        ok: false,
        error: (payload && payload.error) || {
          code: 'E_UPLOAD',
          message: '文件复制到临时目录失败',
          hint: '改用桌面客户端，或点「粘贴路径」填绝对路径。',
        },
      }
    }
    return { ok: true, path: payload.path, name: typeof payload.name === 'string' ? payload.name : file.name }
  } catch {
    return {
      ok: false,
      error: { code: 'E_OFFLINE', message: '无法连接宿主', hint: '确认窗口还在，然后重试。' },
    }
  }
}
