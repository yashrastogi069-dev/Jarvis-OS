/**
 * JARVIS CORE V2 — DETERMINISTIC PLAN VALIDATOR
 * 
 * Checkpoint C10: Cryptographic, structural, and graph verification of execution plans.
 * Ensures zero model authority over action class, confirmation policies, or capabilities.
 */

import type {
  ActionClass,
  CapabilityId,
  IdempotencyClass,
  PlanId,
  PlanStepId,
  QuestId,
  TraceId,
} from "../types"
import { asPlanStepId } from "../types"
import type { CapabilityRegistry } from "../capabilities/registry"
import type { CapabilityDefinition, ConfirmationPolicyLevel } from "../capabilities/types"
import type {
  ExecutionPlan,
  PlannerStep,
  StructuredArguments,
  CompletionCriterion,
} from "./types"
import { PLAN_LIMITS } from "./types"
import { extractStepReferences } from "./references"

// ============================================================================
// 1. VALIDATION ISSUES & CODES (Section 6.8)
// ============================================================================

export type PlanValidationIssueCode =
  | "UNKNOWN_CAPABILITY"
  | "CAPABILITY_NOT_USER_FACING"
  | "INVALID_SCHEMA"
  | "CYCLIC_DEPENDENCY"
  | "SELF_DEPENDENCY"
  | "UNKNOWN_DEPENDENCY"
  | "INVALID_REFERENCE"
  | "FUTURE_REFERENCE"
  | "SELF_REFERENCE"
  | "UNDECLARED_DEPENDENCY_REFERENCE"
  | "PLAN_TOO_LARGE"
  | "EXCESSIVE_FAN_OUT"
  | "EXCESSIVE_DEPTH"
  | "CAPABILITY_UNAVAILABLE"
  | "POLICY_CONFLICT"
  | "UNSAFE_PLAN"

export interface PlanValidationIssue {
  readonly code: PlanValidationIssueCode
  readonly message: string
  readonly stepId?: PlanStepId
  readonly capabilityId?: CapabilityId
  readonly path?: string
  readonly details?: unknown
}

// ============================================================================
// 2. TRUSTED VALIDATED PLAN (Section 6.5)
// ============================================================================

export interface ValidatedStepMetadata {
  readonly actionClass: ActionClass
  readonly confirmationPolicy: ConfirmationPolicyLevel
  readonly idempotencyClass: IdempotencyClass
  readonly requiresConfirmation: boolean
  readonly domain: string
  readonly previewSupported: boolean
}

export interface ValidatedPlanStep {
  readonly id: PlanStepId
  readonly objective: string
  readonly capabilityId: CapabilityId
  readonly arguments: StructuredArguments
  readonly dependsOn: ReadonlyArray<PlanStepId>
  readonly completionCriteria: ReadonlyArray<CompletionCriterion>
  readonly required: boolean
  readonly trustedMetadata: ValidatedStepMetadata
}

export interface ValidatedExecutionPlan {
  readonly id: PlanId
  readonly questId: QuestId
  readonly traceId: TraceId
  readonly objective: string
  readonly version: number
  readonly steps: ReadonlyArray<ValidatedPlanStep>
  readonly createdAt: number
  readonly topologicalOrder: ReadonlyArray<PlanStepId>
}

export type PlanValidationResult =
  | {
      readonly valid: true
      readonly plan: ValidatedExecutionPlan
      readonly warnings?: ReadonlyArray<string>
    }
  | {
      readonly valid: false
      readonly issues: ReadonlyArray<PlanValidationIssue>
    }

export interface PlanValidatorOptions {
  readonly routedCapabilityIds?: ReadonlySet<string>
}

// ============================================================================
// 3. DETERMINISTIC PLAN VALIDATOR CLASS
// ============================================================================

export class DeterministicPlanValidator {
  constructor(private readonly registry: CapabilityRegistry) {}

  /**
   * Deterministically validates an execution plan against canonical capabilities,
   * input schemas, graph invariants, and safety boundaries.
   */
  public validate(
    plan: ExecutionPlan,
    options?: PlanValidatorOptions
  ): PlanValidationResult {
    const issues: PlanValidationIssue[] = []
    const warnings: string[] = []

    // 1. Structure & Size Limits (Section 6.1)
    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      return {
        valid: false,
        issues: [
          {
            code: "UNSAFE_PLAN",
            message: "Plan object is missing required 'steps' array.",
          },
        ],
      }
    }

    if (plan.steps.length === 0) {
      return {
        valid: false,
        issues: [
          {
            code: "UNSAFE_PLAN",
            message: "Plan must contain at least 1 execution step.",
          },
        ],
      }
    }

    if (plan.steps.length > PLAN_LIMITS.MAX_STEPS) {
      issues.push({
        code: "PLAN_TOO_LARGE",
        message: `Plan contains ${plan.steps.length} steps, exceeding maximum limit of ${PLAN_LIMITS.MAX_STEPS}.`,
      })
    }

    const serializedBytes = Buffer.byteLength(JSON.stringify(plan), "utf8")
    if (serializedBytes > PLAN_LIMITS.MAX_SERIALIZED_BYTES) {
      issues.push({
        code: "PLAN_TOO_LARGE",
        message: `Plan serialized size (${serializedBytes} bytes) exceeds limit of ${PLAN_LIMITS.MAX_SERIALIZED_BYTES} bytes.`,
      })
    }

    // 2. Step ID Uniqueness & Index
    const stepIds = new Set<string>()
    const stepsById = new Map<string, PlannerStep>()

    for (const step of plan.steps) {
      if (!step.id || typeof step.id !== "string" || step.id.trim().length === 0) {
        issues.push({
          code: "UNSAFE_PLAN",
          message: "Step has missing or empty id.",
        })
        continue
      }

      if (stepIds.has(step.id)) {
        issues.push({
          code: "UNSAFE_PLAN",
          stepId: step.id,
          message: `Duplicate step ID "${step.id}" found in plan.`,
        })
      }
      stepIds.add(step.id)
      stepsById.set(step.id, step)
    }

    // Stop if basic structure is broken
    if (issues.length > 0) {
      return { valid: false, issues }
    }

    // 3. Dependency DAG Invariants (Section 6.2)
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    const reverseAdjacency = new Map<string, string[]>()

    for (const id of stepIds) {
      inDegree.set(id, 0)
      adjacency.set(id, [])
      reverseAdjacency.set(id, [])
    }

    for (const step of plan.steps) {
      // Normalize duplicate dependencies safely
      const uniqueDeps: string[] = Array.from(new Set<string>(step.dependsOn))
      if (uniqueDeps.length < step.dependsOn.length) {
        warnings.push(`Step "${step.id}" contained duplicate dependencies; normalized.`)
      }

      if (uniqueDeps.length > PLAN_LIMITS.MAX_DEPENDENCIES_PER_STEP) {
        issues.push({
          code: "PLAN_TOO_LARGE",
          stepId: step.id,
          message: `Step "${step.id}" has ${uniqueDeps.length} dependencies, exceeding maximum of ${PLAN_LIMITS.MAX_DEPENDENCIES_PER_STEP}.`,
        })
      }

      for (const depId of uniqueDeps) {
        // Self-dependency
        if (depId === step.id) {
          issues.push({
            code: "SELF_DEPENDENCY",
            stepId: step.id,
            message: `Step "${step.id}" depends on itself.`,
          })
          continue
        }

        // Nonexistent dependency
        if (!stepIds.has(depId)) {
          issues.push({
            code: "UNKNOWN_DEPENDENCY",
            stepId: step.id,
            message: `Step "${step.id}" depends on nonexistent step "${depId}".`,
            details: { stepId: step.id, dependencyId: depId },
          })
          continue
        }

        adjacency.get(depId)!.push(step.id)
        reverseAdjacency.get(step.id)!.push(depId)
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1)
      }
    }

    // 4. Cycle Detection & Topological Sort (Kahn's Algorithm)
    const queue: string[] = []
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id)
    }

    const topologicalOrder: PlanStepId[] = []
    while (queue.length > 0) {
      const curr = queue.shift()!
      topologicalOrder.push(asPlanStepId(curr))
      for (const neighbor of adjacency.get(curr) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) {
          queue.push(neighbor)
        }
      }
    }

    if (topologicalOrder.length !== stepIds.size) {
      issues.push({
        code: "CYCLIC_DEPENDENCY",
        message: "Cycle detected in plan step dependency graph.",
      })
    }

    // 5. Fan-out & Graph Depth Limits
    for (const [id, outgoing] of adjacency.entries()) {
      if (outgoing.length > PLAN_LIMITS.MAX_FAN_OUT) {
        issues.push({
          code: "EXCESSIVE_FAN_OUT",
          stepId: asPlanStepId(id),
          message: `Step "${id}" has fan-out of ${outgoing.length}, exceeding limit of ${PLAN_LIMITS.MAX_FAN_OUT}.`,
        })
      }
    }

    // Calculate depth via topological relaxation
    if (topologicalOrder.length === stepIds.size) {
      const depthMap = new Map<string, number>()
      for (const id of stepIds) depthMap.set(id, 1)

      for (const curr of topologicalOrder) {
        const currDepth = depthMap.get(curr) ?? 1
        for (const neighbor of adjacency.get(curr) ?? []) {
          const newDepth = Math.max(depthMap.get(neighbor) ?? 1, currDepth + 1)
          depthMap.set(neighbor, newDepth)
          if (newDepth > PLAN_LIMITS.MAX_DEPTH) {
            issues.push({
              code: "EXCESSIVE_DEPTH",
              stepId: asPlanStepId(neighbor),
              message: `Plan dependency depth (${newDepth}) exceeds maximum depth limit of ${PLAN_LIMITS.MAX_DEPTH}.`,
            })
          }
        }
      }
    }

    // Precompute topological index map for order checks
    const topoIndex = new Map<string, number>()
    topologicalOrder.forEach((id, idx) => topoIndex.set(id, idx))

    // 6. Capability Existence & Exposure Verification (Section 6.3)
    const validatedSteps: ValidatedPlanStep[] = []

    for (const step of plan.steps) {
      const capDef = typeof this.registry.getById === "function"
        ? this.registry.getById(step.capabilityId)
        : (this.registry as any).get?.(step.capabilityId)

      if (!capDef) {
        issues.push({
          code: "UNKNOWN_CAPABILITY",
          stepId: step.id,
          capabilityId: step.capabilityId,
          message: `Step "${step.id}" references unregistered capability "${step.capabilityId}".`,
        })
        continue
      }

      // Must be user-facing (blocks internal engine tools like deleteSkill, deploySkillToGithub)
      if (!capDef.userFacing) {
        issues.push({
          code: "CAPABILITY_NOT_USER_FACING",
          stepId: step.id,
          capabilityId: step.capabilityId,
          message: `Step "${step.id}" references internal engine capability "${step.capabilityId}" which is not permitted in user plans.`,
        })
        continue
      }

      // Check routed capabilities set if provided
      if (
        options?.routedCapabilityIds &&
        !options.routedCapabilityIds.has(step.capabilityId)
      ) {
        issues.push({
          code: "UNKNOWN_CAPABILITY",
          stepId: step.id,
          capabilityId: step.capabilityId,
          message: `Step "${step.id}" references capability "${step.capabilityId}" which was not routed by CapabilityRouter.`,
        })
      }

      // Check static availability
      if (capDef.availability.staticState === "DISABLED") {
        issues.push({
          code: "CAPABILITY_UNAVAILABLE",
          stepId: step.id,
          capabilityId: step.capabilityId,
          message: `Capability "${step.capabilityId}" is statically disabled in registry.`,
        })
      }

      // 7. Input Argument Validation & Step Output References (Section 6.4)
      const refs = extractStepReferences(step.arguments)
      let hasReferences = refs.length > 0

      for (const ref of refs) {
        if (!ref.path.startsWith("/")) {
          issues.push({
            code: "INVALID_REFERENCE",
            stepId: step.id,
            message: `Step "${step.id}" has invalid JSON pointer "${ref.path}": must start with "/".`,
            details: ref,
          })
        }

        // Prototype pollution check
        if (
          ref.path.includes("__proto__") ||
          ref.path.includes("constructor") ||
          ref.path.includes("prototype")
        ) {
          issues.push({
            code: "INVALID_REFERENCE",
            stepId: step.id,
            message: `Step "${step.id}" reference contains forbidden property access in path "${ref.path}".`,
            details: ref,
          })
        }

        if (ref.stepId === step.id) {
          issues.push({
            code: "SELF_REFERENCE",
            stepId: step.id,
            message: `Step "${step.id}" cannot reference its own output.`,
            details: ref,
          })
          continue
        }

        if (!stepIds.has(ref.stepId)) {
          issues.push({
            code: "INVALID_REFERENCE",
            stepId: step.id,
            message: `Step "${step.id}" references nonexistent step "${ref.stepId}".`,
            details: ref,
          })
          continue
        }

        if (!step.dependsOn.includes(ref.stepId)) {
          issues.push({
            code: "UNDECLARED_DEPENDENCY_REFERENCE",
            stepId: step.id,
            message: `Step "${step.id}" references output from step "${ref.stepId}", but "${ref.stepId}" is not declared in dependsOn.`,
            details: ref,
          })
          continue
        }

        // Check topological precedence (cannot reference future step)
        const currentIdx = topoIndex.get(step.id) ?? -1
        const refIdx = topoIndex.get(ref.stepId) ?? -1
        if (refIdx >= currentIdx && currentIdx !== -1) {
          issues.push({
            code: "FUTURE_REFERENCE",
            stepId: step.id,
            message: `Step "${step.id}" references future or concurrent step "${ref.stepId}".`,
            details: ref,
          })
        }
      }

      // If arguments have ZERO step references, validate literal schema statically now!
      if (!hasReferences && capDef.inputSchema) {
        let argsToValidate = { ...step.arguments }
        if (!("confirmed" in argsToValidate)) {
          // If schema requires legacy 'confirmed' field, test with confirmed: false
          const testRes = capDef.inputSchema.safeParse({ ...argsToValidate, confirmed: false })
          if (testRes.success) {
            argsToValidate = { ...argsToValidate, confirmed: false }
          }
        }
        const schemaRes = capDef.inputSchema.safeParse(argsToValidate)
        if (!schemaRes.success) {
          issues.push({
            code: "INVALID_SCHEMA",
            stepId: step.id,
            capabilityId: step.capabilityId,
            message: `Step "${step.id}" literal arguments fail input schema validation for "${step.capabilityId}".`,
            details: schemaRes.error.issues,
          })
        }
      }

      // 8. Derive Trusted Metadata from Registry & Safety Policy (Section 6.5 & 6.6)
      // Runtime owns actionClass, confirmationPolicy, and idempotency. Model carries zero authority.
      const actionClass: ActionClass = capDef.actionClass
      const confirmationPolicy: ConfirmationPolicyLevel = capDef.confirmation.defaultPolicy
      const idempotencyClass: IdempotencyClass = capDef.idempotency.idempotencyClass

      // Determine confirmation requirement from canonical policy
      const requiresConfirmation =
        actionClass !== "READ_ONLY" &&
        (confirmationPolicy === "REQUIRED" ||
          confirmationPolicy === "POLICY_MANAGED" ||
          actionClass === "LOCAL_DELETE" ||
          actionClass === "EXTERNAL_DELETE" ||
          actionClass === "EXTERNAL_SEND")

      const validatedStep: ValidatedPlanStep = {
        id: step.id,
        objective: step.objective,
        capabilityId: capDef.id,
        arguments: step.arguments,
        dependsOn: step.dependsOn,
        completionCriteria: step.completionCriteria,
        required: step.required,
        trustedMetadata: {
          actionClass,
          confirmationPolicy,
          idempotencyClass,
          requiresConfirmation,
          domain: capDef.domain,
          previewSupported: capDef.confirmation.previewSupported ?? true,
        },
      }

      validatedSteps.push(validatedStep)
    }

    if (issues.length > 0) {
      return { valid: false, issues }
    }

    const validatedPlan: ValidatedExecutionPlan = {
      id: plan.id,
      questId: plan.questId,
      traceId: plan.traceId,
      objective: plan.objective,
      version: plan.version,
      steps: validatedSteps,
      createdAt: plan.createdAt,
      topologicalOrder,
    }

    return {
      valid: true,
      plan: validatedPlan,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }
}
