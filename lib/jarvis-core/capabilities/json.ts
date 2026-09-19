/**
 * JARVIS CORE V2 — DETERMINISTIC JSON NORMALIZATION UTILITY
 * 
 * Checkpoint: C3 (Section 16)
 * Status: Authoritative Serialization Boundary
 * 
 * Guarantees that any data crossing the CapabilityResult boundary is strictly
 * compliant with JsonValue. Converts Date to ISO strings, BigInt to strings,
 * strips undefined, detects circular structures, and rejects raw Errors.
 */

import type { JsonValue, JsonObject } from "../types"
import { CapabilityOperationalError } from "./result"

export type JsonArray = JsonValue[]

/**
 * Deterministically normalize any raw JavaScript output into a pure JsonValue.
 * Throws CapabilityOperationalError with code "INTERNAL_ERROR" if circular
 * references or unhandled non-serializable objects (Functions, Symbols) are encountered.
 */
export function toJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): JsonValue {
  // Primitives
  if (value === null || value === undefined) {
    return null
  }

  const type = typeof value

  if (type === "boolean" || type === "string") {
    return value as string | boolean
  }

  if (type === "number") {
    return Number.isFinite(value) ? (value as number) : null
  }

  if (type === "bigint") {
    return (value as bigint).toString()
  }

  // Prohibited types
  if (type === "function" || type === "symbol") {
    throw new CapabilityOperationalError({
      code: "INTERNAL_ERROR",
      message: `Cannot serialize non-JSON type "${type}" in capability data payload.`,
    })
  }

  if (value instanceof Error) {
    throw new CapabilityOperationalError({
      code: "INTERNAL_ERROR",
      message: `Raw Error instances cannot be placed in capability data. Use CapabilityFailure instead.`,
    })
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  // Objects & Arrays
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new CapabilityOperationalError({
        code: "INTERNAL_ERROR",
        message: "Circular reference detected during capability result JSON serialization.",
      })
    }
    seen.add(value)

    if (Array.isArray(value)) {
      const arr: JsonArray = []
      for (const item of value) {
        arr.push(item === undefined ? null : toJsonValue(item, seen))
      }
      return arr
    }

    // Plain objects / class instances
    const obj: JsonObject = {}
    for (const [key, val] of Object.entries(value)) {
      // Omit undefined properties from serialized objects
      if (val !== undefined) {
        obj[key] = toJsonValue(val, seen)
      }
    }
    return obj
  }

  return String(value)
}

/**
 * Type guard for JsonObject
 */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
