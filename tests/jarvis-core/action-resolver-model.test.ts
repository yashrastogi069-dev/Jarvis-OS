/**
 * JARVIS CORE V2 — ACTION RESOLVER MODEL FALLBACK TEST (GATE C)
 * 
 * Pre-Migration Gate C: ACTION_RESOLVER must not be regex-only.
 * Verifies that obvious requests use the fast path, while complex requests fall back
 * to the ACTION_RESOLVER model role, passing through canonical normalization
 * while maintaining Zero Model Authority.
 */

import { describe, it, expect } from "vitest"
import { ActionArgumentResolver } from "../../lib/jarvis-core/action/resolver"
import { RouterActionArgumentModel } from "../../lib/jarvis-core/action/model-adapter"
import { capabilityRegistry } from "../../lib/jarvis-core/capabilities/registry"
import { asCapabilityId } from "../../lib/jarvis-core/types"
import { ProviderRoleRouter } from "../../lib/jarvis-core/providers/router"
import { MockModelAdapter } from "../../lib/jarvis-core/providers/mock"
import type { ActionArgumentModel } from "../../lib/jarvis-core/action/types"

describe("JARVIS CORE V2 — Action Resolver Model Fallback (Gate C)", () => {
  const resolver = new ActionArgumentResolver()

  it("resolves obvious exact commands via deterministic fast path without invoking model", async () => {
    const cap = capabilityRegistry.getById(asCapabilityId("tasks.create"))!
    expect(cap).toBeDefined()

    let modelInvoked = false
    const spyModel: ActionArgumentModel = {
      resolveArguments: async () => {
        modelInvoked = true
        return { title: "From Model" }
      },
    }

    const res = await resolver.resolve(
      {
        userRequest: "Create a task Buy groceries for dinner",
        capabilityId: asCapabilityId("tasks.create"),
        capability: cap,
      },
      spyModel
    )

    expect(res.status).toBe("RESOLVED")
    expect(modelInvoked).toBe(false)
    expect(res.canonicalArguments).toEqual({ title: "Buy groceries for dinner" })
  })

  it("falls back to ACTION_RESOLVER model role for complex natural language requests", async () => {
    const cap = capabilityRegistry.getById(asCapabilityId("tasks.create"))!
    expect(cap).toBeDefined()

    const mockAdapter = new MockModelAdapter("mock-fast", "Mock Fast Model")
    mockAdapter.enqueueObject({
      title: "Call John tomorrow evening",
    })

    const router = new ProviderRoleRouter()
    router.registerAdapter(mockAdapter)
    router.configureRole({
      role: "ACTION_RESOLVER",
      primaryProvider: "mock-fast",
      primaryModel: "mock-v1",
    })

    const modelAdapter = new RouterActionArgumentModel(router)

    // A request that doesn't match standard regex: "Make sure John gets a call from me tomorrow evening"
    const res = await resolver.resolve(
      {
        userRequest: "Make sure John gets a call from me tomorrow evening",
        capabilityId: asCapabilityId("tasks.create"),
        capability: cap,
      },
      modelAdapter
    )

    expect(res.status).toBe("RESOLVED")
    expect(res.canonicalArguments).toEqual({ title: "Call John tomorrow evening" })
  })

  it("enforces Zero Model Authority: invalid model candidates are rejected by canonical normalization", async () => {
    const cap = capabilityRegistry.getById(asCapabilityId("tasks.create"))!
    expect(cap).toBeDefined()

    const mockAdapter = new MockModelAdapter("mock-invalid", "Mock Invalid Model")
    // Model returns invalid candidate lacking required 'title'
    mockAdapter.enqueueObject({
      invalidField: 12345,
    })

    const router = new ProviderRoleRouter()
    router.registerAdapter(mockAdapter)
    router.configureRole({
      role: "ACTION_RESOLVER",
      primaryProvider: "mock-invalid",
      primaryModel: "mock-v1",
    })

    const modelAdapter = new RouterActionArgumentModel(router)

    const res = await resolver.resolve(
      {
        userRequest: "Something totally obscure that regex cannot parse",
        capabilityId: asCapabilityId("tasks.create"),
        capability: cap,
      },
      modelAdapter
    )

    expect(res.status).toBe("INVALID")
    expect(res.error).toBeDefined()
  })
})
