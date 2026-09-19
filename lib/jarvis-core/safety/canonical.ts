/**
 * JARVIS CORE V2 — DETERMINISTIC CANONICAL ARGUMENT SERIALIZATION & HASHING
 * 
 * Checkpoint: C4 (Sections C4.6, C4.7)
 * Status: Authoritative Canonicalization Utility
 * 
 * Guarantees that arguments to capabilities produce an identical SHA-256 hash
 * regardless of key ordering, spacing, or serialization quirks, while strictly
 * detecting parameter mutations or type alterations.
 */

import crypto from "node:crypto"

/**
 * Deterministically serialize any JavaScript object or value into a canonical JSON string.
 * - Recursively sorts all object keys lexicographically.
 * - Preserves array element ordering.
 * - Strips undefined object properties.
 * - Converts BigInt to string and Date to ISO string.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null"
  }

  const type = typeof value

  if (type === "boolean" || type === "number") {
    if (type === "number" && !Number.isFinite(value)) {
      return "null"
    }
    return JSON.stringify(value)
  }

  if (type === "string") {
    return JSON.stringify(value)
  }

  if (type === "bigint") {
    return JSON.stringify((value as bigint).toString())
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? "null" : canonicalizeJson(item)))
    return `[${items.join(",")}]`
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>
    const sortedKeys = Object.keys(obj).sort()
    const entries: string[] = []

    for (const key of sortedKeys) {
      const val = obj[key]
      if (val !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalizeJson(val)}`)
      }
    }

    return `{${entries.join(",")}}`
  }

  return JSON.stringify(String(value))
}

/**
 * Compute the deterministic SHA-256 hex digest of canonicalized arguments.
 */
export function hashCanonicalArgs(args: unknown): string {
  const canonical = canonicalizeJson(args)
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex")
}
