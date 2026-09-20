/**
 * JARVIS CORE V2 — TYPED STEP OUTPUT REFERENCES (RFC 6901 JSON POINTER)
 * 
 * Checkpoint C9: Deterministic dataflow between plan steps without arbitrary JavaScript,
 * eval, or expression languages.
 */

import type { PlanStepId } from "../types"
import type { StepOutputReference, StructuredArguments, StructuredArgumentValue } from "./types"

/**
 * Result of evaluating a JSON pointer.
 */
export interface PointerResolutionResult {
  readonly found: boolean
  readonly value?: unknown
  readonly error?: string
}

/**
 * Evaluates a JSON pointer string (RFC 6901) against an object.
 *
 * Examples:
 * - "" -> root object
 * - "/id" -> root.id
 * - "/items/0/title" -> root.items[0].title
 * - "/a~1b" -> root["a/b"]
 * - "/m~0n" -> root["m~n"]
 */
export function resolveJsonPointer(target: unknown, pointer: string): PointerResolutionResult {
  if (pointer === "") {
    return { found: true, value: target }
  }

  if (!pointer.startsWith("/")) {
    return {
      found: false,
      error: `Invalid JSON pointer "${pointer}": must start with "/" or be empty.`,
    }
  }

  const tokens = pointer
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"))

  let current: unknown = target

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (current === null || current === undefined || typeof current !== "object") {
      return {
        found: false,
        error: `Cannot traverse property "${token}" on non-object at path "${tokens.slice(0, i).join("/")}".`,
      }
    }

    if (Array.isArray(current)) {
      const index = Number(token)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return {
          found: false,
          error: `Array index out of bounds or invalid: "${token}" (array length is ${current.length}).`,
        }
      }
      current = current[index]
    } else {
      // Prototype pollution defense
      if (token === "__proto__" || token === "constructor" || token === "prototype") {
        return {
          found: false,
          error: `Access to forbidden property "${token}" is blocked.`,
        }
      }

      const record = current as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(record, token)) {
        return {
          found: false,
          error: `Property "${token}" not found at path "${tokens.slice(0, i).join("/")}".`,
        }
      }
      current = record[token]
    }
  }

  return { found: true, value: current }
}

/**
 * Checks if a value is a valid StepOutputReference ($ref).
 */
export function isStepReference(value: unknown): value is { readonly $ref: StepOutputReference } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const refObj = (value as Record<string, unknown>).$ref
  if (!refObj || typeof refObj !== "object" || Array.isArray(refObj)) {
    return false
  }
  const candidate = refObj as Record<string, unknown>
  return (
    typeof candidate.stepId === "string" &&
    candidate.stepId.trim().length > 0 &&
    typeof candidate.path === "string"
  )
}

/**
 * Extracts all StepOutputReferences from a structured arguments object or any nested value.
 */
export function extractStepReferences(value: unknown): StepOutputReference[] {
  const refs: StepOutputReference[] = []

  function walk(current: unknown): void {
    if (!current || typeof current !== "object") {
      return
    }

    if (isStepReference(current)) {
      refs.push(current.$ref)
      return
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        walk(item)
      }
      return
    }

    for (const key of Object.keys(current)) {
      // Prototype guard
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue
      walk((current as Record<string, unknown>)[key])
    }
  }

  walk(value)
  return refs
}

/**
 * Resolves all $ref references in a StructuredArguments payload against completed step outputs.
 */
export function resolveStepReferences(
  args: StructuredArguments,
  stepOutputs: Map<PlanStepId, unknown>
): {
  readonly resolved: Record<string, unknown>
  readonly missingReferences: ReadonlyArray<StepOutputReference>
  readonly resolutionErrors: ReadonlyArray<string>
} {
  const missingReferences: StepOutputReference[] = []
  const resolutionErrors: string[] = []

  function resolveValue(val: unknown): unknown {
    if (isStepReference(val)) {
      const ref = val.$ref
      if (!stepOutputs.has(ref.stepId)) {
        missingReferences.push(ref)
        return null
      }

      const stepOutput = stepOutputs.get(ref.stepId)
      const resolution = resolveJsonPointer(stepOutput, ref.path)
      if (!resolution.found) {
        resolutionErrors.push(
          `Failed to resolve reference from step "${ref.stepId}" at "${ref.path}": ${resolution.error}`
        )
        return null
      }
      return resolution.value
    }

    if (Array.isArray(val)) {
      return val.map((item) => resolveValue(item))
    }

    if (val && typeof val === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val)) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") continue
        out[k] = resolveValue(v)
      }
      return out
    }

    return val
  }

  const resolved = resolveValue(args) as Record<string, unknown>

  return {
    resolved,
    missingReferences,
    resolutionErrors,
  }
}
