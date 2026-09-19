/**
 * JARVIS CORE V2 — DETERMINISTIC OPERATION DEDUPE KEY COMPUTATION
 * 
 * Checkpoint: C5 (Section C5.4)
 * Status: Canonical Parameter Normalizer & Deduplication Hasher
 * 
 * Invariants:
 * 1. Stable Hashes: Object key insertion order does not affect dedupeKey.
 * 2. Actor & Domain Scope: Dedupe keys isolate operations across actors and capabilities.
 * 3. Idempotency Binding: Computes deterministic SHA-256 digests.
 */

import crypto from "node:crypto"
import type { CapabilityId, ActionClass, IdempotencyClass } from "../types"
import { canonicalizeJson } from "../safety/canonical"
import { asDedupeKey, type DedupeKey } from "./types"

export interface DedupeKeyOptions {
  readonly capabilityId: CapabilityId
  readonly actionClass: ActionClass
  readonly idempotencyClass: IdempotencyClass
  readonly input: unknown
  readonly actor?: string
  readonly timeBucketMs?: number
}

/**
 * Compute a deterministic SHA-256 hash of canonicalized input arguments.
 */
export function hashCanonicalInput(input: unknown): string {
  const canonical = canonicalizeJson(input)
  return crypto.createHash("sha256").update(canonical).digest("hex")
}

/**
 * Compute an authoritative, deterministic DedupeKey for an operation.
 * Key format: `dk_<capabilityId>_<hash24>`
 */
export function computeDedupeKey(options: DedupeKeyOptions): DedupeKey {
  const { capabilityId, input, actor = "user", timeBucketMs } = options

  const canonicalArgs = canonicalizeJson(input)
  let payloadToHash = `${actor}:${capabilityId}:${canonicalArgs}`

  if (timeBucketMs && timeBucketMs > 0) {
    const bucket = Math.floor(Date.now() / timeBucketMs)
    payloadToHash += `:bucket_${bucket}`
  }

  const hash = crypto.createHash("sha256").update(payloadToHash).digest("hex").slice(0, 24)
  const safeCap = capabilityId.replace(/[^a-zA-Z0-9_]/g, "_")

  return asDedupeKey(`dk_${safeCap}_${hash}`)
}
