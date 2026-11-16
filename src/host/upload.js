/**
 * Raw file upload for the web client, where a file input yields bytes but no
 * absolute path. The bytes are written to a private temp directory and the
 * absolute path is returned; desktop clients normally skip this path entirely.
 */
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

function safeName(raw) {
  const text = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'upload.bin'
  return text.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
}

/**
 * @param {{ root: string }} options
 */
export function createUploader(options) {
  const root = options.root

  return async function upload(request, url) {
    const name = safeName(url.searchParams.get('name'))
    const dir = path.join(root, 'uploads')
    const bucket = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(bucket, { recursive: true })
    // Keep the original file name as the basename so the produced file name
    // does not inherit an upload prefix.
    const dest = path.join(bucket, name)

    let size = 0
    let failed = null
    await new Promise((resolve) => {
      const out = createWriteStream(dest)
      request.on('data', (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > MAX_UPLOAD_BYTES && failed === null) {
          failed = 'too-large'
          request.destroy()
          out.destroy()
        }
      })
      request.on('end', () => { if (failed === null) out.end(resolve) })
      request.on('error', () => { if (failed === null) { failed = 'aborted'; out.destroy(); resolve() } })
      out.on('error', () => { if (failed === null) { failed = 'write'; resolve() } })
      request.pipe(out)
    })

    if (failed === 'too-large') {
      return {
        status: 413,
        body: {
          ok: false,
          error: { code: 'E_BODY', message: '文件超过 2 GB', hint: '改用桌面客户端，或把文件放到本机后用「粘贴路径」。' },
        },
      }
    }
    if (failed !== null) {
      return {
        status: 500,
        body: { ok: false, error: { code: 'E_HOST', message: '文件写入失败', hint: '检查临时目录是否可写。' } },
      }
    }
    if (size === 0) {
      return {
        status: 400,
        body: { ok: false, error: { code: 'E_INPUT', message: '没有收到文件内容', hint: '重新选择文件。' } },
      }
    }
    return { status: 200, body: { path: dest, name, size } }
  }
}
