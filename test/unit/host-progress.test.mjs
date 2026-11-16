/**
 * Per-job progress table: field whitelist, isolation by job id, merge rules,
 * and a bounded size.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createProgressTable, normalizeProgress, PROGRESS_FIELDS } from '../../src/host/progress.js'

test('只保留文档承诺的五个字段，其余丢弃', () => {
  const progress = normalizeProgress({
    phase: 'encode',
    percent: 42.5,
    outTimeSec: 12.25,
    speed: '1.24x',
    etaSec: 30,
    argv: ['-i', 'C:/secret.mp4'],
    stderr: 'frame= 100',
  })

  assert.deepEqual(progress, { phase: 'encode', percent: 42.5, outTimeSec: 12.25, speed: '1.24x', etaSec: 30 })
  assert.deepEqual(Object.keys(progress).sort(), [...PROGRESS_FIELDS].sort())
  assert.ok(Object.isFrozen(progress))
})

test('百分比夹紧到 0–100，负数与坏值被丢弃', () => {
  assert.equal(normalizeProgress({ percent: 120 }).percent, 100)
  assert.equal(normalizeProgress({ percent: -5 }).percent, 0)
  assert.deepEqual(normalizeProgress({ percent: Number.NaN }), undefined)
  assert.deepEqual(normalizeProgress({ outTimeSec: -1 }), undefined)
  assert.deepEqual(normalizeProgress({ etaSec: 'soon' }), undefined)
  assert.deepEqual(normalizeProgress({ speed: 2.5 }), { speed: 2.5 })
  assert.deepEqual(normalizeProgress(null), undefined)
  assert.deepEqual(normalizeProgress('encoding'), undefined)
  assert.deepEqual(normalizeProgress({ ignored: true }), undefined)
})

test('phase 限长且去空白；超长或空串被丢弃', () => {
  assert.deepEqual(normalizeProgress({ phase: '  verify  ' }), { phase: 'verify' })
  assert.deepEqual(normalizeProgress({ phase: '   ' }), undefined)
  assert.deepEqual(normalizeProgress({ phase: 'x'.repeat(33) }), undefined)
})

test('进度按 jobId 隔离，不会把最后一个任务写给所有行', () => {
  const table = createProgressTable()

  table.record('job-a', { phase: 'probe', percent: 5 })
  table.record('job-b', { phase: 'encode', percent: 42 })
  table.record('job-a', { phase: 'verify', percent: 95 })

  assert.deepEqual(table.get('job-a'), { phase: 'verify', percent: 95 })
  assert.deepEqual(table.get('job-b'), { phase: 'encode', percent: 42 })
  assert.equal(table.get('job-c'), undefined)

  const a = { id: 'job-a', status: 'running' }
  const b = { id: 'job-b', status: 'running' }
  const c = { id: 'job-c', status: 'queued' }

  assert.deepEqual(table.merge(a), { id: 'job-a', status: 'running', progress: { phase: 'verify', percent: 95 } })
  assert.deepEqual(table.merge(b), { id: 'job-b', status: 'running', progress: { phase: 'encode', percent: 42 } })
  assert.deepEqual(table.merge(c), c, '没有进度的任务保持原样')
  assert.deepEqual(a, { id: 'job-a', status: 'running' }, '不得原地修改服务返回的对象')
})

test('服务自己给的 progress 优先，不被覆盖', () => {
  const table = createProgressTable()
  table.record('job-a', { phase: 'encode', percent: 10 })

  const mine = { id: 'job-a', progress: { phase: 'done', percent: 100 } }
  assert.deepEqual(table.merge(mine), mine)
})

test('非对象摘要原样返回，坏 jobId 被忽略', () => {
  const table = createProgressTable()
  assert.equal(table.merge(null), null)
  assert.equal(table.merge(undefined), undefined)
  assert.equal(table.record('', { percent: 1 }), false)
  assert.equal(table.record(42, { percent: 1 }), false)
  assert.equal(table.record('job-a', null), false)
  assert.equal(table.size(), 0)
})

test('表大小有上限，最旧的条目先被淘汰', () => {
  const table = createProgressTable({ limit: 3 })
  for (const id of ['j1', 'j2', 'j3', 'j4']) table.record(id, { percent: 1 })

  assert.equal(table.size(), 3)
  assert.equal(table.get('j1'), undefined, '最旧的条目应被淘汰')
  assert.notEqual(table.get('j4'), undefined)

  table.clear()
  assert.equal(table.size(), 0)
  assert.equal(table.get('j4'), undefined)
})
