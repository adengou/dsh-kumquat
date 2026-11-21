import test from 'node:test'
import assert from 'node:assert/strict'
import { revealNative, revealPath } from '../../src/host/reveal.js'

test('原生路径：Windows 调 explorer /select', () => {
  const calls = []
  const spawnImpl = (command, args) => { calls.push([command, args]); return { unref() {} } }
  const ok = revealNative('D:\\示例\\video.mp4', spawnImpl)
  assert.equal(ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ['explorer.exe', ['/select,', 'D:\\示例\\video.mp4']])
})

test('原生失败时回退 Electron shell', async () => {
  const calls = []
  const result = await revealPath('D:\\示例\\video.mp4', {
    native: false,
    loadElectron: async () => ({ shell: { showItemInFolder: (p) => calls.push(p) } }),
  })
  assert.equal(result.supported, true)
  assert.deepEqual(calls, ['D:\\示例\\video.mp4'])
})

test('原生与 Electron 都不可用时标记不支持', async () => {
  const result = await revealPath('D:\\示例\\video.mp4', {
    native: false,
    loadElectron: async () => { throw new Error('no electron') },
  })
  assert.equal(result.supported, false)
})

test('空路径不启动任何东西', async () => {
  const result = await revealPath('')
  assert.equal(result.supported, false)
})
