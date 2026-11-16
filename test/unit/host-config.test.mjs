/**
 * Host configuration: defaults, environment key, clamping, and the guarantee
 * that a description never contains the key.
 */

import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  DEFAULT_BALANCE_REFRESH_MS,
  binaryRoot,
  defaultOutputDir,
  describeConfig,
  dshHome,
  readRowConfig,
  resolveConfig,
} from '../../src/host/config.js'

const HOME = resolve('home', 'tester')
const SECRET = 'sk-config-SECRET-abcdef'

test('缺省配置：输出与源文件同目录，自动下载开启，刷新 30 秒，没有 key', () => {
  const config = resolveConfig({}, { env: {}, platform: 'win32', home: HOME })

  assert.equal(config.outputDir, '')
  assert.equal(config.ffmpegPath, undefined)
  assert.equal(config.apiKey, undefined)
  assert.equal(config.autoDownload, true)
  assert.equal(config.balanceRefreshMs, DEFAULT_BALANCE_REFRESH_MS)
  assert.equal(config.binaryRoot, join(HOME, '.dsh', 'kumquat'))
  assert.ok(Object.isFrozen(config))
})

test('默认输出为空，表示写在源文件旁边', () => {
  assert.equal(defaultOutputDir('linux', HOME, {}), '')
  assert.equal(defaultOutputDir('darwin', HOME, {}), '')
  assert.equal(defaultOutputDir('win32', HOME, {}), '')
})

test('DSH_HOME 覆盖默认的 ~/.dsh', () => {
  const custom = resolve('custom', 'dsh-home')
  assert.equal(dshHome({ DSH_HOME: custom }, HOME), custom)
  assert.equal(dshHome({}, HOME), join(HOME, '.dsh'))
  assert.equal(dshHome({ DSH_HOME: '   ' }, HOME), join(HOME, '.dsh'))
  assert.equal(binaryRoot({ DSH_HOME: custom }, HOME), join(custom, 'kumquat'))
})

test('key 先取配置，再取 DEEPSEEK_API_KEY 环境变量', () => {
  const fromEnv = resolveConfig({}, { env: { DEEPSEEK_API_KEY: SECRET }, platform: 'win32', home: HOME })
  assert.equal(fromEnv.apiKey, SECRET)

  const fromRow = resolveConfig(
    { apiKey: '  sk-row-wins  ' },
    { env: { DEEPSEEK_API_KEY: SECRET }, platform: 'win32', home: HOME },
  )
  assert.equal(fromRow.apiKey, 'sk-row-wins')

  const blank = resolveConfig({ apiKey: '   ' }, { env: { DEEPSEEK_API_KEY: '   ' }, platform: 'win32', home: HOME })
  assert.equal(blank.apiKey, undefined)
  assert.equal(blank.balanceRefreshMs, 30_000)
})

test('describeConfig 只报告 key 是否存在，绝不带明文', () => {
  const config = resolveConfig({ apiKey: SECRET }, { env: {}, platform: 'win32', home: HOME })
  const description = describeConfig(config)
  const serialized = JSON.stringify(description)

  assert.equal(description.hasApiKey, true)
  assert.equal('apiKey' in description, false)
  assert.ok(!serialized.includes(SECRET))
  assert.ok(!serialized.includes('sk-'))

  const withoutKey = describeConfig(resolveConfig({}, { env: {}, platform: 'win32', home: HOME }))
  assert.equal(withoutKey.hasApiKey, false)
})

test('数值越界被夹紧，非法类型回落到默认值', () => {
  const base = { env: {}, platform: 'win32', home: HOME }

  assert.equal(resolveConfig({ balanceRefreshMs: 5 }, base).balanceRefreshMs, 1_000)
  assert.equal(resolveConfig({ balanceRefreshMs: 99_999_999 }, base).balanceRefreshMs, 3_600_000)
  assert.equal(resolveConfig({ balanceRefreshMs: 'soon' }, base).balanceRefreshMs, 30_000)
  assert.equal(resolveConfig({ balanceRefreshMs: Number.NaN }, base).balanceRefreshMs, 30_000)
  assert.equal(resolveConfig({ balanceRefreshMs: 15_000 }, base).balanceRefreshMs, 15_000)
})

test('autoDownload 只接受布尔值，其余回落到 true', () => {
  const base = { env: {}, platform: 'win32', home: HOME }
  assert.equal(resolveConfig({ autoDownload: false }, base).autoDownload, false)
  assert.equal(resolveConfig({ autoDownload: true }, base).autoDownload, true)
  assert.equal(resolveConfig({ autoDownload: 'false' }, base).autoDownload, true)
})

test('ffmpegPath 与 outputDir 归一化为绝对路径，未知字段被丢弃', () => {
  const config = resolveConfig(
    { ffmpegPath: join('tools', 'ffmpeg.exe'), outputDir: join('out', 'videos'), evil: 'drop me' },
    { env: {}, platform: 'win32', home: HOME },
  )

  assert.equal(config.ffmpegPath, resolve(join('tools', 'ffmpeg.exe')))
  assert.equal(config.outputDir, resolve(join('out', 'videos')))
  assert.equal('evil' in config, false)
  assert.deepEqual(
    Object.keys(config).sort(),
    ['apiKey', 'autoDownload', 'balanceRefreshMs', 'binaryRoot', 'ffmpegPath', 'outputDir'],
  )
})

test('数组或标量形式的坏配置不会让解析崩掉', () => {
  const base = { env: {}, platform: 'win32', home: HOME }
  assert.equal(resolveConfig(null, base).outputDir, '')
  assert.equal(resolveConfig([], base).autoDownload, true)
  assert.equal(resolveConfig('nope', base).autoDownload, true)
})

test('readRowConfig 优先用 apply 的实参，其次读 fiber 入口', () => {
  const explicit = { outputDir: 'x' }
  assert.equal(readRowConfig({}, explicit), explicit)

  const ctx = { fiber: { entry: { options: { config: { autoDownload: false } } } } }
  assert.deepEqual(readRowConfig(ctx), { autoDownload: false })

  assert.deepEqual(readRowConfig({}), {})
  assert.deepEqual(readRowConfig({ fiber: {} }), {})
})

