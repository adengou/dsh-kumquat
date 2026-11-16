import test from 'node:test'
import assert from 'node:assert/strict'
import { pickFile } from '../../src/host/pick.js'

const fakeElectron = (result) => ({
  dialog: { showOpenDialog: async () => result },
  BrowserWindow: { getFocusedWindow: () => undefined },
})

test('原生选择器返回绝对路径', async () => {
  const picked = await pickFile({
    loadElectron: async () => fakeElectron({ canceled: false, filePaths: ['D:\\示例\\video.mp4'] }),
  })
  assert.equal(picked.supported, true)
  assert.equal(picked.canceled, false)
  assert.equal(picked.path, 'D:\\示例\\video.mp4')
})

test('取消返回 canceled，不返回路径', async () => {
  const picked = await pickFile({
    loadElectron: async () => fakeElectron({ canceled: true, filePaths: [] }),
  })
  assert.equal(picked.supported, true)
  assert.equal(picked.canceled, true)
  assert.equal(picked.path, undefined)
})

test('没有 Electron 时明确标记不支持，交给调用方降级', async () => {
  const picked = await pickFile({
    loadElectron: async () => { throw new Error('no electron') },
  })
  assert.equal(picked.supported, false)
})

test('Electron 没有 dialog 时也不假装支持', async () => {
  const picked = await pickFile({ loadElectron: async () => ({ BrowserWindow: {} }) })
  assert.equal(picked.supported, false)
})
