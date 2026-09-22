/**
 * JARVIS CORE V2 — CAPABILITY MIGRATION C19 TEST SUITE
 * 
 * Checkpoint: C19 (External Mutation Migration)
 * Status: Authoritative Migration Verification
 * 
 * Guarantees Verified:
 * 1. 13 External Mutation Capabilities:
 *    - Google (5): calendar.event.create, calendar.event.update, calendar.event.delete, mail.message.send, mail.message.reply
 *    - Apple (3): calendar.event.create, calendar.event.update, calendar.event.delete
 *    - GitHub (2): issue.create, issue.comment
 *    - Telegram (1): message.send
 *    - Obsidian (2): note.create, note.append
 * 2. Mandatory Execution Safety Path & Confirmation Policy (C4):
 *    - Zero model authority: external mutations require confirmation policy adherence.
 * 3. Obsidian Path Traversal Safety:
 *    - Directory traversal attacks (../, absolute paths) are rejected with PERMISSION_DENIED.
 * 4. Operation Ledger Replay Protection & UNKNOWN_COMMIT Fault Injection:
 *    - Concurrent duplicates in-flight yield CONFLICT.
 *    - Network drops during mutation record UNKNOWN_COMMIT, preventing blind automatic replay.
 * 5. 100% Offline Determinism: Zero live external cloud API calls.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { CapabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import { executeCapabilitySafely } from "../../lib/jarvis-core/capabilities/safe-boundary"
import { asCapabilityId, asOperationId, asTurnId } from "../../lib/jarvis-core/types"
import type { CapabilityId, ActionClass } from "../../lib/jarvis-core/types"
import { OperationLedger } from "../../lib/jarvis-core/ledger/ledger"
import { ActionPolicyManager } from "../../lib/jarvis-core/safety/policy"

describe("JARVIS CORE V2 — C19 Capability Migration: External Mutations", () => {
  let registry: CapabilityRegistry
  let ledger: OperationLedger
  let policyManager: ActionPolicyManager

  beforeEach(() => {
    registry = new CapabilityRegistry()
    ledger = new OperationLedger()
    policyManager = new ActionPolicyManager()
  })

  // All 13 C19 external mutation capabilities
  const C19_MUTATION_CAPABILITIES: ReadonlyArray<{
    id: CapabilityId
    legacyName: string
    domain: string
    actionClass: ActionClass
    confirmationPolicy: "REQUIRED" | "NONE"
    sampleArgs: Record<string, unknown>
  }> = [
    // 1. Google (5)
    {
      id: asCapabilityId("google.calendar.event.create"),
      legacyName: "createCalendarEvent",
      domain: "google",
      actionClass: "EXTERNAL_CREATE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { summary: "Project Review", start: "2026-09-23T10:00:00Z", end: "2026-09-23T11:00:00Z" },
    },
    {
      id: asCapabilityId("google.calendar.event.update"),
      legacyName: "updateCalendarEvent",
      domain: "google",
      actionClass: "EXTERNAL_UPDATE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { eventId: "ev_123", summary: "Updated Review" },
    },
    {
      id: asCapabilityId("google.calendar.event.delete"),
      legacyName: "deleteCalendarEvent",
      domain: "google",
      actionClass: "EXTERNAL_DELETE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { eventId: "ev_123" },
    },
    {
      id: asCapabilityId("google.mail.message.send"),
      legacyName: "sendGmail",
      domain: "google",
      actionClass: "EXTERNAL_SEND",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { to: "partner@example.com", subject: "Sync", body: "Hello partner" },
    },
    {
      id: asCapabilityId("google.mail.message.reply"),
      legacyName: "replyToEmail",
      domain: "google",
      actionClass: "EXTERNAL_SEND",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { threadId: "th_123", body: "Acknowledged." },
    },
    // 2. Apple (3)
    {
      id: asCapabilityId("apple.calendar.event.create"),
      legacyName: "createAppleCalendarEvent",
      domain: "apple",
      actionClass: "EXTERNAL_CREATE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { title: "Dentist", startDate: "2026-09-25T14:00:00Z", endDate: "2026-09-25T15:00:00Z" },
    },
    {
      id: asCapabilityId("apple.calendar.event.update"),
      legacyName: "updateAppleCalendarEvent",
      domain: "apple",
      actionClass: "EXTERNAL_UPDATE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { eventUid: "uid_123", title: "Rescheduled Dentist" },
    },
    {
      id: asCapabilityId("apple.calendar.event.delete"),
      legacyName: "deleteAppleCalendarEvent",
      domain: "apple",
      actionClass: "EXTERNAL_DELETE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { eventUid: "uid_123" },
    },
    // 3. GitHub (2)
    {
      id: asCapabilityId("github.issue.create"),
      legacyName: "createGithubIssue",
      domain: "github",
      actionClass: "EXTERNAL_CREATE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { repo: "owner/repo", title: "Bug report", body: "Details" },
    },
    {
      id: asCapabilityId("github.issue.comment"),
      legacyName: "commentOnGithubIssue",
      domain: "github",
      actionClass: "EXTERNAL_SEND",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { repo: "owner/repo", issueNumber: 42, body: "Looking into this." },
    },
    // 4. Telegram (1)
    {
      id: asCapabilityId("telegram.message.send"),
      legacyName: "sendTelegram",
      domain: "telegram",
      actionClass: "EXTERNAL_SEND",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { text: "Server deployment complete" },
    },
    // 5. Obsidian (2)
    {
      id: asCapabilityId("obsidian.note.create"),
      legacyName: "createNote",
      domain: "obsidian",
      actionClass: "EXTERNAL_CREATE",
      confirmationPolicy: "REQUIRED",
      sampleArgs: { path: "Projects/Q3-Roadmap.md", content: "# Q3 Roadmap" },
    },
    {
      id: asCapabilityId("obsidian.note.append"),
      legacyName: "appendNote",
      domain: "obsidian",
      actionClass: "EXTERNAL_UPDATE",
      confirmationPolicy: "NONE",
      sampleArgs: { path: "Projects/Daily.md", content: "\n- [x] Task finished" },
    },
  ]

  it("verifies all 13 external mutation capabilities are registered and user-facing", () => {
    expect(C19_MUTATION_CAPABILITIES.length).toBe(13)

    for (const capInfo of C19_MUTATION_CAPABILITIES) {
      const cap = registry.getById(capInfo.id)
      expect(cap, `Missing capability ${capInfo.id}`).toBeDefined()
      expect(cap!.domain).toBe(capInfo.domain)
      expect(cap!.legacyToolName).toBe(capInfo.legacyName)
      expect(cap!.userFacing).toBe(true)
      expect(cap!.actionClass).toBe(capInfo.actionClass)
      expect(cap!.confirmation.defaultPolicy).toBe(capInfo.confirmationPolicy)
    }
  })

  it("verifies confirmation policy enforcement for high-criticality mutations", () => {
    for (const capInfo of C19_MUTATION_CAPABILITIES) {
      const cap = registry.getById(capInfo.id)!

      const decision = policyManager.evaluatePolicy(cap, capInfo.sampleArgs)

      if (capInfo.confirmationPolicy === "REQUIRED") {
        expect(
          decision.type,
          `${cap.id} must require confirmation`
        ).toBe("REQUIRE_CONFIRMATION")
        if (decision.type === "REQUIRE_CONFIRMATION") {
          expect(decision.criticality).toMatch(/HIGH|CRITICAL/)
          expect(decision.token).toBeDefined()
        }
      }
    }
  })

  describe("Obsidian Path Traversal Safety", () => {
    it("strictly blocks directory traversal attacks in obsidian.note.create", async () => {
      const cap = registry.getById(asCapabilityId("obsidian.note.create"))!
      expect(cap).toBeDefined()

      const traversalPaths = [
        "../../etc/passwd",
        "../secrets.json",
        "nested/../../config.yml",
        "/etc/shadow",
        "C:\\Windows\\System32\\cmd.exe",
      ]

      for (const badPath of traversalPaths) {
        const res = await executeCapabilitySafely(cap, {
          path: badPath,
          content: "malicious content",
        })

        expect(res.success).toBe(false)
        if (!res.success) {
          expect(res.error.code).toBe("PERMISSION_DENIED")
          expect(res.error.message).toContain("Directory traversal detected")
        }
      }
    })

    it("strictly blocks directory traversal attacks in obsidian.note.append", async () => {
      const cap = registry.getById(asCapabilityId("obsidian.note.append"))!
      expect(cap).toBeDefined()

      const res = await executeCapabilitySafely(cap, {
        path: "../../../ssh/id_rsa",
        content: "appended key",
      })

      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("PERMISSION_DENIED")
      }
    })

    it("strictly blocks directory traversal attacks in obsidian.note.read", async () => {
      const cap = registry.getById(asCapabilityId("obsidian.note.read"))!
      expect(cap).toBeDefined()

      const res = await executeCapabilitySafely(cap, {
        path: "../../private.key",
      })

      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("PERMISSION_DENIED")
      }
    })
  })

  describe("Operation Ledger Replay Protection & UNKNOWN_COMMIT Fault Injection", () => {
    it("blocks duplicate in-flight mutations with CONFLICT status", () => {
      const opId = asOperationId(`op_concurrent_${Date.now()}`)
      const cap = registry.getById(asCapabilityId("google.mail.message.send"))!

      // First claim succeeds
      const claim1 = ledger.claimOperation({
        operationId: opId,
        capabilityId: cap.id,
        actionClass: cap.actionClass,
        idempotencyClass: cap.idempotency.idempotencyClass,
        input: { to: "test@example.com", subject: "Hello", body: "World" },
      })
      expect(claim1.status).toBe("CLAIMED")

      // Concurrent duplicate claim while RUNNING is blocked with CONFLICT
      const claim2 = ledger.claimOperation({
        operationId: opId,
        capabilityId: cap.id,
        actionClass: cap.actionClass,
        idempotencyClass: cap.idempotency.idempotencyClass,
        input: { to: "test@example.com", subject: "Hello", body: "World" },
      })
      expect(claim2.status).toBe("CONFLICT")
      if (claim2.status === "CONFLICT") {
        expect(claim2.reason).toContain("Operation is already in progress")
      }
    })

    it("records UNKNOWN_COMMIT on network drop/timeout and blocks automatic replay", () => {
      const opId = asOperationId(`op_unknown_commit_${Date.now()}`)
      const cap = registry.getById(asCapabilityId("github.issue.create"))!

      // Claim operation
      const claim = ledger.claimOperation({
        operationId: opId,
        capabilityId: cap.id,
        actionClass: cap.actionClass,
        idempotencyClass: cap.idempotency.idempotencyClass,
        input: { repo: "owner/repo", title: "Test Issue", body: "Issue content" },
      })
      expect(claim.status).toBe("CLAIMED")

      // Simulate network connection drop before HTTP acknowledgement was received
      ledger.failOperation({
        operationId: opId,
        errorCode: "UNKNOWN_COMMIT",
        errorMessage: "Network socket closed while awaiting HTTP 201 response from api.github.com",
        isRetryable: false,
        isUnknownCommit: true,
      })

      // Verify record is in UNKNOWN_COMMIT state
      const record = ledger.getOperation(opId)
      expect(record).toBeDefined()
      expect(record?.status).toBe("UNKNOWN_COMMIT")

      // Subsequent attempt to replay the same operation MUST be blocked to prevent duplicate issues
      const replayClaim = ledger.claimOperation({
        operationId: opId,
        capabilityId: cap.id,
        actionClass: cap.actionClass,
        idempotencyClass: cap.idempotency.idempotencyClass,
        input: { repo: "owner/repo", title: "Test Issue", body: "Issue content" },
      })

      expect(replayClaim.status).toBe("UNKNOWN_COMMIT")
      if (replayClaim.status === "UNKNOWN_COMMIT") {
        expect(replayClaim.reason).toContain("UNKNOWN_COMMIT")
      }
    })

    it("verifies recoverCrashedOperations marks abandoned external mutations as UNKNOWN_COMMIT", () => {
      const opId = asOperationId(`op_crash_${Date.now()}`)
      const cap = registry.getById(asCapabilityId("telegram.message.send"))!

      // Claim operation leaving it in RUNNING state (simulating crash)
      ledger.claimOperation({
        operationId: opId,
        capabilityId: cap.id,
        actionClass: cap.actionClass,
        idempotencyClass: cap.idempotency.idempotencyClass,
        input: { text: "Critical alert" },
      })

      // Run crash recovery
      const recoveredCount = ledger.recoverCrashedOperations()
      expect(recoveredCount).toBeGreaterThanOrEqual(1)

      const recovered = ledger.getOperation(opId)
      expect(recovered?.status).toBe("UNKNOWN_COMMIT")
      expect(recovered?.errorMessage).toContain("crash recovery to UNKNOWN_COMMIT")
    })
  })

  describe("AbortSignal cooperative cancellation", () => {
    it("enforces AbortSignal cancellation on external mutations", async () => {
      const cap = registry.getById(asCapabilityId("telegram.message.send"))!
      const controller = new AbortController()
      controller.abort(new Error("User cancelled turn"))

      const res = await executeCapabilitySafely(cap, { text: "Hello" }, {
        signal: controller.signal,
      })

      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.code).toBe("CANCELLED")
      }
    })
  })
})
