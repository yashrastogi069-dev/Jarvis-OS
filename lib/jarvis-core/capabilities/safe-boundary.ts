/**
 * JARVIS CORE V2 — SAFE CAPABILITY EXECUTION BOUNDARY
 * 
 * Checkpoint: C3 (Milestone 0)
 * Status: Authoritative Execution Boundary Implementation
 * 
 * Architectural Invariants:
 * 1. Single Execution Gateway: Every capability invocation (whether via agent,
 *    orchestrator, DAG, or test) passes through this deterministic boundary.
 * 2. Exception Containment: All operational exceptions and thrown errors are caught
 *    and normalized into structured CapabilityFailure envelopes. No raw exceptions escape.
 * 3. Deterministic JSON Normalization: All output is converted via toJsonValue(),
 *    preventing raw Errors, circular graphs, BigInts, or Dates from corrupting streams.
 * 4. Observability: Preserves traceId, timing (durationMs), attempt counter, and
 *    logs unhandled INTERNAL_ERROR defects to server console with sanitized context.
 * 5. Framework Independence: ZERO imports from React, Next.js, or ToolLoopAgent.
 */

import { asCapabilityId, asTraceId, type CapabilityId, type JsonValue } from "../types"
import type { CapabilityDefinition } from "./types"
import type {
  CapabilityResult,
  CapabilityExecutionContext,
  CapabilityFailure,
} from "./result"
import { toJsonValue } from "./json"
import { normalizeError, sanitizeSecrets } from "./normalizer"
import { capabilityRegistry } from "./registry"

/**
 * Execute any registered capability through the safe execution boundary.
 * 
 * Guarantees:
 * - Deterministic return type (CapabilityResult<T> = Success | Failure)
 * - Safe schema validation of rawInput
 * - Error normalization with context-sensitive RetryHint
 * - Complete secret redaction from error messages
 * - JSON-safe data serialization
 * - Measured execution timing (durationMs)
 */
export async function executeCapabilitySafely<T extends JsonValue = JsonValue>(
  capabilityOrId: CapabilityDefinition | CapabilityId | string,
  rawInput: unknown,
  context?: CapabilityExecutionContext,
): Promise<CapabilityResult<T>> {
  const startTime = performance.now()
  const traceId =
    context?.trace?.traceId ??
    asTraceId(`trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`)
  const attempt = context?.attempt ?? 1

  // 1. Resolve Capability Definition
  let capability: CapabilityDefinition | undefined
  if (
    typeof capabilityOrId === "object" &&
    capabilityOrId !== null &&
    "handler" in capabilityOrId &&
    "id" in capabilityOrId
  ) {
    capability = capabilityOrId as CapabilityDefinition
  } else {
    const idStr = String(capabilityOrId)
    capability =
      capabilityRegistry.getById(idStr) ?? capabilityRegistry.getByLegacyName(idStr)
  }

  if (!capability) {
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100
    const capIdStr =
      typeof capabilityOrId === "string" ? capabilityOrId : "unknown"
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Capability "${capIdStr}" not found in registry.`,
        retryHint: "DO_NOT_RETRY",
        fixAction: "Check capability ID against CapabilityRegistry.list().",
      },
      metadata: {
        traceId,
        capabilityId: asCapabilityId(capIdStr),
        durationMs,
        attempt,
      },
    }
  }

  // 2. Cancellation Check
  if (context?.signal?.aborted) {
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100
    return {
      success: false,
      error: {
        code: "CANCELLED",
        message: "Capability execution was cancelled before invocation.",
        retryHint: "DO_NOT_RETRY",
      },
      metadata: {
        traceId,
        capabilityId: capability.id,
        durationMs,
        attempt,
      },
    }
  }

  // 3. Schema Validation
  const parseResult = capability.inputSchema.safeParse(rawInput ?? {})
  if (!parseResult.success) {
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100
    const issueSummary = parseResult.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ")
    return {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: sanitizeSecrets(
          `Input validation failed for ${capability.id}: ${issueSummary}`,
        ),
        retryHint: "DO_NOT_RETRY",
        fixAction: "Check tool input schema and provide valid parameters.",
        details: { issues: parseResult.error.issues as any },
      },
      metadata: {
        traceId,
        capabilityId: capability.id,
        durationMs,
        attempt,
      },
    }
  }

  // 4. Safe Execution & Normalization
  try {
    const rawOutput = await capability.handler(parseResult.data, context)
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100

    // Handle explicit failure return object
    if (
      typeof rawOutput === "object" &&
      rawOutput !== null &&
      (rawOutput as any).success === false &&
      "error" in rawOutput
    ) {
      const err = (rawOutput as any).error
      const normalized =
        typeof err === "object" && err !== null && "code" in err
          ? err
          : normalizeError(err, capability.actionClass)
      return {
        success: false,
        error: normalized,
        metadata: {
          traceId,
          capabilityId: capability.id,
          durationMs,
          attempt,
        },
      }
    }

    // Handle legacy error return pattern { error: string } (e.g. webSearch/fetchPage)
    if (
      typeof rawOutput === "object" &&
      rawOutput !== null &&
      "error" in rawOutput &&
      typeof (rawOutput as any).error === "string" &&
      !("results" in rawOutput && Array.isArray((rawOutput as any).results) && (rawOutput as any).results.length > 0) &&
      !(rawOutput as any).success
    ) {
      const normalized = normalizeError(
        new Error((rawOutput as any).error),
        capability.actionClass,
      )
      return {
        success: false,
        error: normalized,
        metadata: {
          traceId,
          capabilityId: capability.id,
          durationMs,
          attempt,
        },
      }
    }

    // Serialize output to deterministic JsonValue
    const jsonOutput = toJsonValue(rawOutput) as T
    return {
      success: true,
      data: jsonOutput,
      metadata: {
        traceId,
        capabilityId: capability.id,
        durationMs,
        attempt,
      },
    }
  } catch (thrown: unknown) {
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100
    const normalized = normalizeError(thrown, capability.actionClass)

    // For unexpected defects, log server-side for diagnostics while keeping client response clean
    if (normalized.code === "INTERNAL_ERROR") {
      console.error(
        `[JarvisCore:Defect] Capability "${capability.id}" failed with internal error (Trace: ${traceId}):`,
        sanitizeSecrets(
          thrown instanceof Error ? thrown.stack ?? thrown.message : String(thrown),
        ),
      )
    }

    return {
      success: false,
      error: normalized,
      metadata: {
        traceId,
        capabilityId: capability.id,
        durationMs,
        attempt,
      },
    }
  }
}
