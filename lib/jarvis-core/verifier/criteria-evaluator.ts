/**
 * JARVIS CORE V2 — CRITERIA EVALUATOR
 * 
 * Checkpoint C12: Deterministic verification of completion criteria against
 * ledger audit records and verified capability outputs.
 */

import type { JsonValue } from "../types"
import type { CompletionCriterion } from "../planner/types"
import type { ValidatedPlanStep } from "../planner/validator"
import type { OperationRecord } from "../ledger/types"
import { resolveJsonPointer } from "../planner/references"
import type { CriterionEvaluationResult } from "./types"

export class CriteriaEvaluator {
  /**
   * Deterministically evaluate a completion criterion against step output and ledger record.
   */
  public evaluateCriterion(
    criterion: CompletionCriterion,
    step: ValidatedPlanStep,
    stepOutput: JsonValue | null,
    ledgerRecord?: OperationRecord
  ): CriterionEvaluationResult {
    switch (criterion.type) {
      case "CAPABILITY_SUCCEEDED": {
        // Must be verified from Operation Ledger or valid output payload
        if (ledgerRecord) {
          const isSucceeded = ledgerRecord.status === "SUCCEEDED"
          return {
            criterion,
            satisfied: isSucceeded,
            evidence: {
              operationId: ledgerRecord.operationId,
              status: ledgerRecord.status,
              completedAt: ledgerRecord.completedAt,
            },
            reason: isSucceeded
              ? "Operation verified as SUCCEEDED in persistent Operation Ledger."
              : `Operation status in ledger is "${ledgerRecord.status}" (expected SUCCEEDED).`,
          }
        }

        const hasOutput = stepOutput !== null && stepOutput !== undefined
        return {
          criterion,
          satisfied: hasOutput,
          evidence: stepOutput,
          reason: hasOutput
            ? "Capability output present."
            : "No output produced for step.",
        }
      }

      case "OUTPUT_PRESENT": {
        if (stepOutput === null || stepOutput === undefined) {
          return {
            criterion,
            satisfied: false,
            reason: "Step produced null or undefined output payload.",
          }
        }

        if (criterion.path) {
          const resolution = resolveJsonPointer(stepOutput, criterion.path)
          if (!resolution.found) {
            return {
              criterion,
              satisfied: false,
              reason: `Required output path "${criterion.path}" not found: ${resolution.error}`,
            }
          }

          const hasVal = resolution.value !== null && resolution.value !== undefined
          return {
            criterion,
            satisfied: hasVal,
            evidence: resolution.value,
            reason: hasVal
              ? `Required property at "${criterion.path}" is present.`
              : `Property at "${criterion.path}" is null or undefined.`,
          }
        }

        return {
          criterion,
          satisfied: true,
          evidence: stepOutput,
          reason: "Output payload is present.",
        }
      }

      case "CONFIRMATION_ACCEPTED": {
        if (!step.trustedMetadata.requiresConfirmation) {
          return {
            criterion,
            satisfied: true,
            reason: "Step does not require user confirmation; criterion vacuously satisfied.",
          }
        }

        const confirmedInLedger =
          ledgerRecord &&
          ledgerRecord.status === "SUCCEEDED" &&
          ledgerRecord.completedAt !== null

        return {
          criterion,
          satisfied: Boolean(confirmedInLedger),
          evidence: ledgerRecord?.operationId,
          reason: confirmedInLedger
            ? "Confirmation verified by committed ledger record."
            : "No confirmed execution found in ledger.",
        }
      }

      case "DEPENDENCY_RESOLVED": {
        return {
          criterion,
          satisfied: true,
          reason: "Prerequisite dependencies satisfied prior to execution.",
        }
      }

      default: {
        return {
          criterion,
          satisfied: false,
          reason: `Unrecognized completion criterion type: "${(criterion as any).type}".`,
        }
      }
    }
  }
}
