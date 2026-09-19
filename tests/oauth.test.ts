import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Covers the generic OAuth module (lib/connectors/oauth.ts) — specifically the
 * two real, previously-confirmed defects this chunk fixes:
 *
 *   1. CSRF: buildAuthUrl must mint a `state` and persist it; handleOAuthCallback
 *      must reject a missing/mismatched/expired state WITHOUT ever calling the
 *      token endpoint, and must reject a replay of an already-consumed state.
 *   2. Refresh-token rotation: getAccessToken must persist a NEW refresh_token
 *      returned by the provider, not silently keep the old one.
 *
 * Uses an isolated in-memory SQLite DB (AGENTIC_OS_DB_PATH=":memory:") so this
 * never touches data/agentic-os.db, and a mocked global fetch so no real
 * network call is made.
 */

let buildAuthUrl: typeof import("@/lib/connectors/oauth").buildAuthUrl
let handleOAuthCallback: typeof import("@/lib/connectors/oauth").handleOAuthCallback
let getAccessToken: typeof import("@/lib/connectors/oauth").getAccessToken
let getConnectorConfig: typeof import("@/lib/settings").getConnectorConfig
let setConnectorConfig: typeof import("@/lib/settings").setConnectorConfig

beforeAll(async () => {
  process.env.AGENTIC_OS_DB_PATH = ":memory:"
  ;({ buildAuthUrl, handleOAuthCallback, getAccessToken } = await import("@/lib/connectors/oauth"))
  ;({ getConnectorConfig, setConnectorConfig } = await import("@/lib/settings"))
})

const descriptor = {
  settingsKey: "test-oauth",
  authorizeUrl: "https://example.test/authorize",
  tokenUrl: "https://example.test/token",
  scopes: ["scope-a", "scope-b"],
  extraAuthParams: { access_type: "offline" },
  pkce: false,
  clientAuth: "body" as const,
}

function seedClient() {
  setConnectorConfig(descriptor.settingsKey, {
    clientId: "client-123",
    clientSecret: "shh-secret",
  })
}

describe("lib/connectors/oauth", () => {
  beforeEach(() => {
    setConnectorConfig(descriptor.settingsKey, {})
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("buildAuthUrl produces a URL containing a state param, and persists matching pendingAuth", () => {
    seedClient()
    const url = buildAuthUrl(descriptor, "https://app.test/callback")
    const parsed = new URL(url)
    const state = parsed.searchParams.get("state")
    expect(state).toBeTruthy()
    expect(state!.length).toBeGreaterThanOrEqual(32)

    const stored = getConnectorConfig<{ pendingAuth?: { state: string } }>(descriptor.settingsKey)
    expect(stored?.pendingAuth?.state).toBe(state)
  })

  it("rejects a missing/mismatched state without calling the token endpoint", async () => {
    seedClient()
    buildAuthUrl(descriptor, "https://app.test/callback")

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const badParams = new URLSearchParams({ code: "attacker-code", state: "totally-wrong-state" })
    await expect(handleOAuthCallback(descriptor, badParams, "https://app.test/callback")).rejects.toThrow(
      /invalid or expired authorization state/,
    )
    expect(fetchMock).not.toHaveBeenCalled()

    const missingStateParams = new URLSearchParams({ code: "attacker-code" })
    await expect(
      handleOAuthCallback(descriptor, missingStateParams, "https://app.test/callback"),
    ).rejects.toThrow(/invalid or expired authorization state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("exchanges successfully with valid state and persists tokens; a replay of the same state is rejected", async () => {
    seedClient()
    const url = buildAuthUrl(descriptor, "https://app.test/callback")
    const state = new URL(url).searchParams.get("state")!

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const params = new URLSearchParams({ code: "good-code", state })
    await handleOAuthCallback(descriptor, params, "https://app.test/callback")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const stored = getConnectorConfig<{ refreshToken?: string; accessToken?: string; pendingAuth?: unknown }>(
      descriptor.settingsKey,
    )
    expect(stored?.refreshToken).toBe("refresh-1")
    expect(stored?.accessToken).toBe("access-1")
    expect(stored?.pendingAuth).toBeUndefined()

    // Replay: same state, same code — pendingAuth was already cleared, so this
    // must be rejected and must NOT hit the token endpoint again.
    fetchMock.mockClear()
    const replayParams = new URLSearchParams({ code: "good-code", state })
    await expect(
      handleOAuthCallback(descriptor, replayParams, "https://app.test/callback"),
    ).rejects.toThrow(/invalid or expired authorization state/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("persists a rotated refresh_token from a refresh response instead of the old one", async () => {
    seedClient()
    setConnectorConfig(descriptor.settingsKey, {
      clientId: "client-123",
      clientSecret: "shh-secret",
      refreshToken: "old-refresh-token",
      accessToken: "stale-access-token",
      accessTokenExpiresAt: Date.now() - 1000, // already expired -> forces a refresh
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access-token",
        refresh_token: "rotated-refresh-token",
        expires_in: 3600,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const token = await getAccessToken(descriptor)
    expect(token).toBe("new-access-token")

    const stored = getConnectorConfig<{ refreshToken?: string }>(descriptor.settingsKey)
    expect(stored?.refreshToken).toBe("rotated-refresh-token")
    expect(stored?.refreshToken).not.toBe("old-refresh-token")
  })

  it("keeps the old refresh_token when the refresh response omits a new one", async () => {
    seedClient()
    setConnectorConfig(descriptor.settingsKey, {
      clientId: "client-123",
      clientSecret: "shh-secret",
      refreshToken: "old-refresh-token",
      accessTokenExpiresAt: Date.now() - 1000,
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access-token-2",
        expires_in: 3600,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await getAccessToken(descriptor)

    const stored = getConnectorConfig<{ refreshToken?: string }>(descriptor.settingsKey)
    expect(stored?.refreshToken).toBe("old-refresh-token")
  })
})
