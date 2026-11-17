/**
 * 服务层对「本机没有 FFmpeg」的态度：能力表降级为空表（面板仍能渲染），
 * 其余操作继续按 E_CAPABILITY 拒绝，由宿主映射成 412。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createService } from '../../src/app/service.js'

/** 无论环境里有没有 ffmpeg，都报告「找不到」。 */
const missing = async () => null

test('缺 FFmpeg 时 capabilities 返回空表而不是抛错', async () => {
  const service = createService({ resolveFfmpeg: missing })

  const caps = await service.capabilities()

  assert.equal(caps.available, false)
  assert.equal(caps.version, '')
  assert.equal(caps.ffmpeg, '')
  assert.deepEqual([...caps.muxers], [])
  assert.deepEqual([...caps.encoders], [])
  assert.deepEqual([...caps.filters], [])
})

test('缺 FFmpeg 时 capabilities 不缓存空表，装好后下一次就是真实能力', async () => {
  let calls = 0
  const service = createService({
    resolveFfmpeg: async () => {
      calls += 1
      return null
    },
  })

  await service.capabilities()
  await service.capabilities()

  assert.equal(calls, 2)
})

test('缺 FFmpeg 时 probe 仍以 E_CAPABILITY 拒绝，交给宿主映射状态码', async () => {
  const service = createService({ resolveFfmpeg: missing })

  await assert.rejects(
    service.probe({ path: 'whatever.mp4' }),
    (error) => {
      assert.equal(error.shape?.code, 'E_CAPABILITY')
      assert.match(error.shape.message, /没有可用的 FFmpeg/)
      assert.equal(typeof error.shape.hint, 'string')
      return true
    },
  )
})
