import fs from "fs"
import path from "path"
import { ALL_CAPABILITIES, UNREGISTERED_CANDIDATES } from "../lib/jarvis-core/capabilities/definitions"

interface MigrationMatrixEntry {
  CapabilityId: string
  legacyImplementation: string
  domain: string
  ActionClass: string
  readOrMutation: "READ" | "MUTATION"
  locality: "local" | "external"
  currentCoreV2Adapter: string
  abortSignalSupport: boolean
  authDependency: string
  confirmationRequirement: string
  idempotencyStrategy: string
  unknownCommitPossible: boolean
  migrationCheckpoint: "C17" | "C18" | "C19" | "DEFERRED"
  migrationStatus: "PENDING" | "MIGRATED" | "VERIFIED"
  testCoverage: string
  liveSmokeStatus: string
}

function determineCheckpoint(cap: (typeof ALL_CAPABILITIES)[0]): "C17" | "C18" | "C19" {
  const localOrResearch = ["tasks", "memory", "research", "skills", "feed", "wake_words", "preferences"]
  if (localOrResearch.includes(cap.domain)) {
    return "C17"
  }
  if (cap.actionClass === "READ_ONLY") {
    return "C18"
  }
  return "C19"
}

function determineAuth(cap: (typeof ALL_CAPABILITIES)[0]): string {
  if (cap.requirements?.requiredEnv && cap.requirements.requiredEnv.length > 0) {
    return cap.requirements.requiredEnv.join(", ")
  }
  if (cap.domain === "google") return "google_oauth"
  if (cap.domain === "apple") return "apple_caldav_credentials"
  if (cap.domain === "github") return "GITHUB_TOKEN"
  if (cap.domain === "telegram") return "TELEGRAM_BOT_TOKEN"
  if (cap.domain === "obsidian") return "obsidian_vault_path"
  if (cap.requirements?.localService) return cap.requirements.localService
  return "none"
}

const entries: MigrationMatrixEntry[] = ALL_CAPABILITIES.map((cap) => {
  const isRead = cap.actionClass === "READ_ONLY"
  const isLocal = ["tasks", "memory", "skills", "feed", "wake_words", "preferences"].includes(cap.domain)
  const isObsidian = cap.domain === "obsidian"
  const checkpoint = determineCheckpoint(cap)
  
  // UNKNOWN_COMMIT is only possible for remote external mutations where network drops can leave remote state ambiguous
  const unknownCommit = !isRead && !isLocal && !isObsidian

  return {
    CapabilityId: cap.id,
    legacyImplementation: cap.legacyToolName || "none",
    domain: cap.domain,
    ActionClass: cap.actionClass,
    readOrMutation: isRead ? "READ" : "MUTATION",
    locality: isLocal ? "local" : "external",
    currentCoreV2Adapter: `ALL_CAPABILITIES in lib/jarvis-core/capabilities/definitions/${cap.domain === "research" ? "research.ts" : isLocal ? "local.ts" : "connectors.ts"}`,
    abortSignalSupport: true,
    authDependency: determineAuth(cap),
    confirmationRequirement: cap.confirmation.defaultPolicy,
    idempotencyStrategy: cap.idempotency.idempotencyClass,
    unknownCommitPossible: unknownCommit,
    migrationCheckpoint: checkpoint,
    migrationStatus: "PENDING",
    testCoverage: "tests/jarvis-core/capability-migration.test.ts (planned)",
    liveSmokeStatus: "OFFLINE_DETERMINISTIC",
  }
})

// Add unregistered candidates
for (const cand of UNREGISTERED_CANDIDATES) {
  entries.push({
    CapabilityId: `unregistered.${cand.name}`,
    legacyImplementation: cand.name,
    domain: "skills",
    ActionClass: cand.classification === "NOT_READY" ? "EXTERNAL_MUTATION" : "INTERNAL_ENGINE",
    readOrMutation: "MUTATION",
    locality: cand.name === "deploySkillToGithub" ? "external" : "local",
    currentCoreV2Adapter: "UNREGISTERED_CANDIDATES in lib/jarvis-core/capabilities/definitions/unregistered.ts",
    abortSignalSupport: false,
    authDependency: cand.name === "deploySkillToGithub" ? "GITHUB_TOKEN" : "sqlite",
    confirmationRequirement: "REQUIRED",
    idempotencyStrategy: "NON_IDEMPOTENT_EXTERNAL",
    unknownCommitPossible: cand.name === "deploySkillToGithub",
    migrationCheckpoint: "DEFERRED",
    migrationStatus: "PENDING",
    testCoverage: "tests/jarvis-core/capability-registry.test.ts",
    liveSmokeStatus: "DEFERRED",
  })
}

const outputPath = path.resolve(__dirname, "../evals/core-v2-capability-migration.json")
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalCapabilities: ALL_CAPABILITIES.length,
      totalUnregisteredCandidates: UNREGISTERED_CANDIDATES.length,
      breakdown: {
        C17_Local_Memory_Research: entries.filter((e) => e.migrationCheckpoint === "C17").length,
        C18_ReadOnlyConnectors: entries.filter((e) => e.migrationCheckpoint === "C18").length,
        C19_ExternalMutations: entries.filter((e) => e.migrationCheckpoint === "C19").length,
        DEFERRED_Candidates: entries.filter((e) => e.migrationCheckpoint === "DEFERRED").length,
      },
      matrix: entries,
    },
    null,
    2
  )
)

console.log(`Generated ${entries.length} matrix entries to ${outputPath}`)
