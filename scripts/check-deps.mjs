#!/usr/bin/env node
/**
 * Enforce the “zero third-party dependencies” rule.
 *
 * `package.json` must not declare any of:
 *   dependencies / devDependencies / optionalDependencies
 *
 * Exit code 0 = clean, 1 = violation (or unreadable manifest). CI-friendly:
 * `node scripts/check-deps.mjs`.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = path.join(ROOT, 'package.json')
const FORBIDDEN_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies']

/**
 * @param {string} message
 */
function fail(message) {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

let raw
try {
  raw = await readFile(MANIFEST, 'utf8')
} catch (error) {
  console.error(`FAIL cannot read ${MANIFEST}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

/** @type {Record<string, unknown>} */
let manifest
try {
  manifest = JSON.parse(raw)
} catch (error) {
  console.error(`FAIL package.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

console.log(`checking ${manifest.name ?? '<unnamed>'}@${manifest.version ?? '?'} for npm dependencies`)

let violations = 0
for (const field of FORBIDDEN_FIELDS) {
  const value = manifest[field]
  if (value === undefined) {
    console.log(`  ${field.padEnd(20)} absent  ✓`)
    continue
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    console.log(`  ${field.padEnd(20)} malformed (${JSON.stringify(value)})  ✗`)
    violations += 1
    continue
  }
  const entries = Object.entries(value)
  if (entries.length === 0) {
    console.log(`  ${field.padEnd(20)} present but empty  ✓`)
    continue
  }
  violations += entries.length
  console.log(`  ${field.padEnd(20)} ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}  ✗`)
  for (const [name, version] of entries) {
    console.log(`      - ${name}@${String(version)}`)
  }
}

if (violations > 0) {
  console.error('')
  fail(`${violations} third-party dependenc${violations === 1 ? 'y' : 'ies'} declared; Kumquat must run on Node built-ins only.`)
  console.error('Remove them from package.json (runtime and build time are both zero-dependency).')
  process.exit(1)
}

console.log('')
console.log('OK: zero npm dependencies (runtime and build time).')
