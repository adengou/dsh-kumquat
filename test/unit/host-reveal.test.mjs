import test from 'node:test'
import assert from 'node:assert/strict'
import { revealPath } from '../../src/host/reveal.js'

test('有 Electron 时调用 showItemInFolder', async () => {
  const calls = []
  const result = await revealPath('D:\\示例\\video.mp4', {
    loadElectron: async () => ({ shell: { showItemInFolder: (p) => calls.push(p) } }),
  })
  assert.equal(result.supported, true)
  assert.deepEqual(calls, ['D:\\示例\\video.mp4'])
})

test('没有 Electron 时标记不支持', async () => {
  const result = await revealPath('D:\\示例\\video.mp4', {
    loadElectron: async () => { throw new Error('no electron') },
  })
  assert.equal(result.supported, false)
})

test('空路径不调用任何东西', async () => {
  const result = await revealPath('')
  assert.equal(result.supported, false)
})
