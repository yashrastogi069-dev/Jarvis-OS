/**
 * JARVIS CORE V2 — UNREGISTERED CANDIDATE CLASSIFICATIONS
 * 
 * Checkpoint: C2 (Section 14)
 * Status: Formally Classified & Recorded
 * 
 * Invariant: Implemented capabilities in `lib/skills.ts` that are NOT exposed
 * as conversational agent tools must be classified explicitly with justification.
 * None of these candidates are registered in `ALL_CAPABILITIES`.
 */

import type { UnregisteredCandidateInfo } from "../types"

export const UNREGISTERED_CANDIDATES: ReadonlyArray<UnregisteredCandidateInfo> = [
  {
    name: "deploySkillToGithub",
    implementationFile: "lib/skills.ts",
    classification: "NOT_READY",
    intendedPurpose:
      "Exports a skill to SKILL.md format and deploys it to a remote GitHub repository via the GitHub Contents API.",
    sideEffects:
      "Directly commits and writes files to an external GitHub repository via PUT /repos/{owner}/{repo}/contents/{path}.",
    safetyRisk: "HIGH",
    rationale:
      "Requires repository authorization and file overwrite safety. Exposing directly to the conversational agent without C4 confirmation policy creates severe risk of corrupting remote repositories.",
    targetCheckpoint: "C17 / C19",
    deferredCode: "D-011",
  },
  {
    name: "deleteSkill",
    implementationFile: "lib/skills.ts",
    classification: "INTERNAL_ENGINE",
    intendedPurpose:
      "Permanently deletes a skill from the SQLite database, cascading deletions to all historical skillRuns.",
    sideEffects:
      "Irreversible database deletion of skill record and all linked execution logs.",
    safetyRisk: "HIGH",
    rationale:
      "Currently called by UI components/dashboards directly. Exposing as an unconfirmed conversational tool allows accidental skill destruction. Must be gated by C4 two-phase confirmation before agent exposure.",
    targetCheckpoint: "C4 / C17",
    deferredCode: "D-012",
  },
  {
    name: "proposeRefinement",
    implementationFile: "lib/skills.ts",
    classification: "INTERNAL_ENGINE",
    intendedPurpose:
      "Analyzes negative-rated skill runs (rating = -1) and generates a revised instruction prompt proposal.",
    sideEffects:
      "Consumes AI model inference tokens; does not mutate skill instructions until approved via applyRefinement.",
    safetyRisk: "LOW",
    rationale:
      "Internal routine of the Skill Factory / Loop Engine optimization pipeline. Designed to be triggered by developer/user UI actions or offline optimization passes, not inline user chat turns.",
    targetCheckpoint: "C17",
    deferredCode: "D-013",
  },
  {
    name: "discoverSkillCandidates",
    implementationFile: "lib/skills.ts",
    classification: "BACKGROUND",
    intendedPurpose:
      "Scans the last 200 agent requests in SQLite, identifies repeated task patterns (3+ occurrences), and creates draft candidate skills.",
    sideEffects:
      "Inserts draft candidate records into skills table and marks agentRuns as analyzed. High token consumption and multi-second execution latency.",
    safetyRisk: "MEDIUM",
    rationale:
      "Batch background discovery routine intended for scheduled jobs or explicit UI trigger in the Skill Factory dashboard. Giving this to the conversational agent during a chat turn causes latency spikes.",
    targetCheckpoint: "Phase 7 / D-005",
    deferredCode: "D-005",
  },
]
