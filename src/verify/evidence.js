/**
 * Evidence package: write the complete verdict to `<dir>/verify.json`.
 *
 * - Atomic on Windows and POSIX: write a sibling temp file, fsync, then rename
 *   over the target (with a remove-and-retry fallback for locked targets).
 * - Self-describing: carries schemaVersion and a summary of check outcomes.
 * - Non-finite numbers (e.g. -Infinity from a silent loudness measurement) are
 *   serialized as strings so the file stays valid JSON.
 *
 * Only node: built-ins are used.
 */

import { mkdir, open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

/** Bump only when the on-disk shape changes incompatibly. */
export const EVIDENCE_SCHEMA_VERSION = 1
/** Fixed filename inside each job directory. */
export const EVIDENCE_FILENAME = 'verify.json'

/**
 * @param {string} dir Per-job evidence directory.
 * @param {object} verdict Verdict (plain data) to persist.
 * @returns {Promise<string>} Absolute path of the written verify.json.
 */
export async function writeEvidence(dir, verdict) {
  if (typeof dir !== 'string' || dir.trim() === '') {
    throw new TypeError('writeEvidence(dir, verdict): dir must be a non-empty string')
  }
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) {
    throw new TypeError('writeEvidence(dir, verdict): verdict must be an object')
  }

  const absoluteDir = path.resolve(dir)
  await mkdir(absoluteDir, { recursive: true })

  const target = path.join(absoluteDir, EVIDENCE_FILENAME)
  const payload = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    kind: 'kumquat.verify',
    writtenAt: new Date().toISOString(),
    summary: summarize(verdict.checks),
    verdict
  }
  const body = `${JSON.stringify(payload, jsonReplacer, 2)}\n`
  const temp = path.join(absoluteDir, `.${EVIDENCE_FILENAME}.${process.pid}.${randomUUID()}.tmp`)

  let handle = null
  try {
    handle = await open(temp, 'wx', 0o644)
    await handle.writeFile(body, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await renameWithReplace(temp, target)
  } catch (error) {
    if (handle) await handle.close().catch(() => {})
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }

  return target
}

/**
 * Rename over an existing target. POSIX replaces atomically; libuv on Windows
 * usually does too, but a locked/AV-scanned target can raise EPERM/EEXIST.
 * @param {string} from
 * @param {string} to
 */
async function renameWithReplace(from, to) {
  try {
    await rename(from, to)
  } catch (error) {
    if (error && (error.code === 'EEXIST' || error.code === 'EPERM' || error.code === 'EACCES')) {
      await rm(to, { force: true })
      await rename(from, to)
      return
    }
    throw error
  }
}

/**
 * @param {unknown} checks
 */
function summarize(checks) {
  const counts = { pass: 0, warn: 0, fail: 0, skipped: 0 }
  const list = Array.isArray(checks) ? checks : []
  for (const item of list) {
    if (item && Object.prototype.hasOwnProperty.call(counts, item.outcome)) {
      counts[item.outcome] += 1
    }
  }
  return {
    ok: counts.fail === 0,
    total: list.length,
    ...counts
  }
}

/**
 * Keep JSON valid for Infinity/NaN/BigInt. -Infinity is meaningful for
 * loudness (silent track) so preserve it as a tagged string.
 * @param {string} _key
 * @param {unknown} value
 */
function jsonReplacer(_key, value) {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN'
    if (value === Infinity) return 'Infinity'
    if (value === -Infinity) return '-Infinity'
  }
  if (typeof value === 'bigint') return value.toString()
  return value
}
