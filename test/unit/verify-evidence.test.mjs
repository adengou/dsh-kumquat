import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  EVIDENCE_FILENAME,
  EVIDENCE_SCHEMA_VERSION,
  writeEvidence
} from '../../src/verify/evidence.js'

function makeVerdict(overrides = {}) {
  return {
    ok: false,
    task: { kind: 'convert', input: 'C:/in/a.mov', to: 'mp4' },
    spec: { durationSec: { expect: 12 } },
    facts: { path: 'C:/out/a.mp4', bytes: 1024, durationSec: -Infinity },
    checks: [
      { id: 'size.budget', tier: 'L0', outcome: 'fail', expected: '≤ 8MB', actual: '10MB' },
      { id: 'audio.loudness', tier: 'L1', outcome: 'pass', expected: 'ok', actual: 'ok' }
    ],
    repairs: [],
    ...overrides
  }
}

test('writeEvidence writes verify.json with schemaVersion, summary and the full verdict', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kumquat-evidence-'))
  try {
    const file = await writeEvidence(dir, makeVerdict())
    assert.equal(path.basename(file), EVIDENCE_FILENAME)
    assert.equal(path.dirname(file), path.resolve(dir))
    assert.ok((await stat(file)).size > 0)

    const payload = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(payload.schemaVersion, EVIDENCE_SCHEMA_VERSION)
    assert.equal(payload.kind, 'kumquat.verify')
    assert.ok(Date.parse(payload.writtenAt))
    assert.deepEqual(payload.summary, { ok: false, total: 2, pass: 1, warn: 0, fail: 1, skipped: 0 })
    assert.equal(payload.verdict.ok, false)
    assert.equal(payload.verdict.task.to, 'mp4')
    assert.equal(payload.verdict.facts.durationSec, '-Infinity')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeEvidence replaces an existing verify.json atomically and leaves no temp file', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kumquat-evidence-'))
  try {
    await writeEvidence(dir, makeVerdict())
    const second = makeVerdict({
      ok: true,
      checks: [{ id: 'size.budget', tier: 'L0', outcome: 'pass', expected: '≤ 8MB', actual: '5MB' }]
    })
    const file = await writeEvidence(dir, second)

    const entries = await readdir(dir)
    assert.deepEqual(entries, [EVIDENCE_FILENAME])
    const payload = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(payload.verdict.ok, true)
    assert.equal(payload.summary.ok, true)
    assert.equal(payload.summary.pass, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeEvidence creates nested directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kumquat-evidence-'))
  try {
    const dir = path.join(root, 'job', 'deep')
    const file = await writeEvidence(dir, makeVerdict())
    assert.equal(file, path.join(dir, EVIDENCE_FILENAME))
    assert.ok((await stat(file)).isFile())
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writeEvidence serializes NaN/Infinity without producing invalid JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kumquat-evidence-'))
  try {
    const file = await writeEvidence(dir, makeVerdict({
      facts: { path: 'x', durationSec: Infinity, bytes: NaN }
    }))
    const payload = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(payload.verdict.facts.durationSec, 'Infinity')
    assert.equal(payload.verdict.facts.bytes, 'NaN')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeEvidence rejects bad arguments and cleans up after a serialization failure', async () => {
  await assert.rejects(() => writeEvidence('', makeVerdict()), /non-empty string/)
  await assert.rejects(() => writeEvidence('some-dir', null), /verdict must be an object/)
  await assert.rejects(() => writeEvidence('some-dir', []), /verdict must be an object/)

  const dir = await mkdtemp(path.join(tmpdir(), 'kumquat-evidence-'))
  try {
    const circular = { checks: [] }
    circular.self = circular
    await assert.rejects(() => writeEvidence(dir, circular), /circular/i)
    assert.deepEqual(await readdir(dir), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
