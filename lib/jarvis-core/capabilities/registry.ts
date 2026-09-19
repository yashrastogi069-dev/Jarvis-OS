/**
 * JARVIS CORE V2 — CANONICAL CAPABILITY REGISTRY
 * 
 * Checkpoint: C2 (Milestone 0)
 * Status: Authoritative Capability Substrate
 * 
 * Architectural Invariants:
 * 1. Single Source of Truth: Canonical typed registry containing all 47
 *    capabilities across 12 domains.
 * 2. Decoupled from ToolLoopAgent: Pure domain registry. Exposure adapters
 *    (`toAiSdkTool`, `getV1CompatibilityTools`) provide compatibility without
 *    forcing the registry to depend on agent orchestrator classes.
 * 3. Static/Runtime Integrity: Validates uniqueness of CapabilityIds, legacy
 *    names, schemas, handlers, domains, and action classes.
 * 4. Network Isolation: Importing and querying the registry never triggers
 *    external network calls or sidecar queries.
 */

import { tool, type Tool } from "ai"
import type { CapabilityId, ActionClass } from "../types"
import type {
  CapabilityDefinition,
  CapabilityDomain,
  RegistryValidationResult,
} from "./types"
import { ALL_CAPABILITY_DOMAINS } from "./types"
import { ALL_CAPABILITIES } from "./definitions"

export class CapabilityRegistry {
  private readonly capabilitiesById = new Map<string, CapabilityDefinition>()
  private readonly capabilitiesByLegacyName = new Map<string, CapabilityDefinition>()
  private readonly capabilitiesList: ReadonlyArray<CapabilityDefinition>

  constructor(definitions: ReadonlyArray<CapabilityDefinition> = ALL_CAPABILITIES) {
    this.capabilitiesList = [...definitions]
    for (const def of definitions) {
      this.capabilitiesById.set(def.id, def)
      if (def.legacyToolName) {
        this.capabilitiesByLegacyName.set(def.legacyToolName, def)
      }
    }
  }

  /**
   * Return all registered capabilities.
   */
  public getAll(): ReadonlyArray<CapabilityDefinition> {
    return this.capabilitiesList
  }

  /**
   * Return all user-facing capabilities (accessible to conversational agents).
   */
  public getUserFacing(): ReadonlyArray<CapabilityDefinition> {
    return this.capabilitiesList.filter((c) => c.userFacing)
  }

  /**
   * Look up capability by canonical namespaced CapabilityId (e.g. "tasks.create").
   */
  public getById(id: CapabilityId | string): CapabilityDefinition | undefined {
    return this.capabilitiesById.get(id)
  }

  /**
   * Look up capability by legacy V1 tool name (e.g. "createTask").
   */
  public getByLegacyName(name: string): CapabilityDefinition | undefined {
    return this.capabilitiesByLegacyName.get(name)
  }

  /**
   * Filter capabilities by operational domain.
   */
  public getByDomain(domain: CapabilityDomain): ReadonlyArray<CapabilityDefinition> {
    return this.capabilitiesList.filter((c) => c.domain === domain)
  }

  /**
   * Filter capabilities by ActionClass (e.g. "READ_ONLY", "LOCAL_CREATE", "EXTERNAL_SEND").
   */
  public getByActionClass(actionClass: ActionClass): ReadonlyArray<CapabilityDefinition> {
    return this.capabilitiesList.filter((c) => c.actionClass === actionClass)
  }

  /**
   * Validate registry integrity:
   * - No duplicate CapabilityIds
   * - No duplicate legacy tool names
   * - Missing handlers
   * - Missing or invalid input schemas
   * - Invalid domain vocabulary
   * - Contradictory metadata
   */
  public validateRegistry(): RegistryValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const seenIds = new Set<string>()
    const seenLegacy = new Set<string>()

    for (const cap of this.capabilitiesList) {
      // 1. Unique CapabilityId
      if (!cap.id || typeof cap.id !== "string") {
        errors.push(`Capability is missing a valid string id: ${JSON.stringify(cap)}`)
      } else if (seenIds.has(cap.id)) {
        errors.push(`Duplicate CapabilityId detected: "${cap.id}"`)
      } else {
        seenIds.add(cap.id)
      }

      // 2. Unique LegacyToolName
      if (!cap.legacyToolName || typeof cap.legacyToolName !== "string") {
        errors.push(`Capability "${cap.id}" is missing a valid legacyToolName.`)
      } else if (seenLegacy.has(cap.legacyToolName)) {
        errors.push(`Duplicate legacyToolName detected: "${cap.legacyToolName}"`)
      } else {
        seenLegacy.add(cap.legacyToolName)
      }

      // 3. Valid Domain
      if (!ALL_CAPABILITY_DOMAINS.includes(cap.domain)) {
        errors.push(`Capability "${cap.id}" has invalid domain: "${cap.domain}"`)
      }

      // 4. Valid Handler
      if (typeof cap.handler !== "function") {
        errors.push(`Capability "${cap.id}" is missing an executable handler function.`)
      }

      // 5. Valid Input Schema
      if (!cap.inputSchema || typeof (cap.inputSchema as any).safeParse !== "function") {
        errors.push(`Capability "${cap.id}" is missing a valid Zod inputSchema.`)
      }

      // 6. Valid ActionClass
      const validActionClasses: ReadonlyArray<ActionClass> = [
        "READ_ONLY",
        "LOCAL_CREATE",
        "LOCAL_UPDATE",
        "LOCAL_DELETE",
        "EXTERNAL_CREATE",
        "EXTERNAL_UPDATE",
        "EXTERNAL_SEND",
        "EXTERNAL_DELETE",
        "SYSTEM_ACTION",
      ]
      if (!validActionClasses.includes(cap.actionClass)) {
        errors.push(`Capability "${cap.id}" has invalid ActionClass: "${cap.actionClass}"`)
      }

      // 7. Metadata Consistency
      if (cap.actionClass === "READ_ONLY" && cap.idempotency.idempotencyClass !== "READ_ONLY") {
        errors.push(
          `Capability "${cap.id}" is marked ActionClass READ_ONLY but has non-READ_ONLY idempotency class "${cap.idempotency.idempotencyClass}"`,
        )
      }

      if (
        cap.actionClass.startsWith("EXTERNAL_") &&
        cap.idempotency.idempotencyClass === "LEDGER_REQUIRED" &&
        !cap.idempotency.duplicateRisk?.includes("EXTERNAL")
      ) {
        warnings.push(
          `Capability "${cap.id}" is an external action using LEDGER_REQUIRED without external duplicate risk explanation.`,
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalCapabilities: this.capabilitiesList.length,
      userFacingCount: this.capabilitiesList.filter((c) => c.userFacing).length,
    }
  }

  /**
   * Adapter: Convert a single CapabilityDefinition to a Vercel AI SDK Tool.
   */
  public toAiSdkTool(capability: CapabilityDefinition): Tool {
    return tool({
      description: capability.description,
      inputSchema: capability.inputSchema,
      execute: (args) => capability.handler(args),
    })
  }

  /**
   * Adapter: Generate a legacy `allTools` dictionary compatible with V1 callers.
   * Maps 1:1 to all 47 registered tools keyed by legacyToolName.
   */
  public getV1CompatibilityTools(): Record<string, Tool> {
    const map: Record<string, Tool> = {}
    for (const cap of this.getUserFacing()) {
      map[cap.legacyToolName] = this.toAiSdkTool(cap)
    }
    return map
  }
}

// Global Canonical Registry Singleton
export const capabilityRegistry = new CapabilityRegistry()

// Convenience exports
export const getCapability = (id: CapabilityId | string) => capabilityRegistry.getById(id)
export const getCapabilityByLegacyName = (name: string) => capabilityRegistry.getByLegacyName(name)
export const listCapabilities = (options?: {
  domain?: CapabilityDomain
  actionClass?: ActionClass
  userFacingOnly?: boolean
}) => {
  let list = options?.userFacingOnly !== false ? capabilityRegistry.getUserFacing() : capabilityRegistry.getAll()
  if (options?.domain) {
    list = list.filter((c) => c.domain === options.domain)
  }
  if (options?.actionClass) {
    list = list.filter((c) => c.actionClass === options.actionClass)
  }
  return list
}
export const validateCapabilityRegistry = () => capabilityRegistry.validateRegistry()
export const getV1CompatibilityTools = () => capabilityRegistry.getV1CompatibilityTools()
