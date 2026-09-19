/**
 * JARVIS CORE V2 — CANONICAL CAPABILITY DEFINITIONS AGGREGATOR
 * 
 * Aggregates all 47 verified user-facing capabilities across 12 domains:
 * - Local (18): Tasks (6), Memory (4), Skills (3), Feed (1), Wake Words (3), Preferences (1)
 * - Research (2): webSearch, fetchPage
 * - Connectors (27): GitHub (6), Google (10), Apple (5), Telegram (2), Obsidian (4)
 * 
 * Also exports the 4 formally classified unregistered skill candidates.
 */

import type { CapabilityDefinition } from "../types"
import { LOCAL_CAPABILITIES } from "./local"
import { RESEARCH_CAPABILITIES } from "./research"
import { CONNECTOR_CAPABILITIES } from "./connectors"

export { LOCAL_CAPABILITIES } from "./local"
export { RESEARCH_CAPABILITIES } from "./research"
export { CONNECTOR_CAPABILITIES } from "./connectors"
export { UNREGISTERED_CANDIDATES } from "./unregistered"

export const ALL_CAPABILITIES: ReadonlyArray<CapabilityDefinition> = [
  ...LOCAL_CAPABILITIES,
  ...RESEARCH_CAPABILITIES,
  ...CONNECTOR_CAPABILITIES,
]
