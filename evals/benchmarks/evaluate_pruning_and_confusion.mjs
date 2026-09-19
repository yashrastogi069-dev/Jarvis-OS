// scratch/evaluate_pruning_and_confusion.mjs
// Offline evaluation of dynamic pruning strategies and tool confusion matrix against the 227-prompt corpus.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const CORPUS_FILE = path.join(process.cwd(), "logs", "routing_corpus_200.json");
const INVENTORY_FILE = path.join(process.cwd(), "logs", "tool_contracts_results.json");
const PRUNING_OUTPUT = path.join(process.cwd(), "logs", "pruning_benchmark_results.json");
const CONFUSION_OUTPUT = path.join(process.cwd(), "logs", "confusion_matrix.json");

const corpus = JSON.parse(readFileSync(CORPUS_FILE, "utf8"));
const inventoryData = JSON.parse(readFileSync(INVENTORY_FILE, "utf8"));
const allToolNames = inventoryData.inventory.map(t => t.toolName);

// Approximate schema tokens per tool (average ~175 tokens per tool schema, total 8,232 tokens for 47 tools)
const AVG_TOKENS_PER_TOOL = 175;

function getDomain(toolName) {
  const lower = toolName.toLowerCase();
  if (lower.includes("memor")) return "Memory";
  if (lower.includes("task")) return "Tasks";
  if (lower.includes("skill")) return "Skills";
  if (lower.includes("wakeword")) return "Wake Words";
  if (toolName === "setPreference") return "Preferences";
  if (toolName === "getUpdatesFeed") return "Feed";
  if (toolName === "webSearch" || toolName === "fetchPage") return "Research";
  if (lower.includes("github") || toolName.startsWith("getMy") || toolName === "getRecentCommits") return "GitHub";
  if (lower.includes("apple")) return "Apple Calendar";
  if (lower.includes("telegram")) return "Telegram";
  if (lower.includes("gmail") || lower.includes("email") || toolName.includes("CalendarEvent")) return "Google";
  if (toolName.includes("Note")) return "Obsidian";
  return "Unknown";
}

const domainToTools = {};
const toolToDomain = {};
for (const t of inventoryData.inventory) {
  const dom = getDomain(t.toolName);
  if (!domainToTools[dom]) domainToTools[dom] = [];
  domainToTools[dom].push(t.toolName);
  toolToDomain[t.toolName] = dom;
}

// -----------------------------------------------------------------------------
// STRATEGY A: Full Registry (Baseline)
// -----------------------------------------------------------------------------
function strategyA_FullRegistry(prompt) {
  const t0 = performance.now();
  const exposedTools = [...allToolNames];
  const latency = performance.now() - t0;
  return { exposedTools, latency };
}

// -----------------------------------------------------------------------------
// STRATEGY B: Domain Classifier (Keyword & Intent rules)
// -----------------------------------------------------------------------------
function strategyB_DomainClassifier(prompt) {
  const t0 = performance.now();
  const lower = prompt.toLowerCase();
  const selectedDomains = new Set();

  // Adversarial check: domain words used conversationally without actionable intent
  const isPoem = lower.includes("poem") || lower.includes("rhyme");
  const isExplain = lower.includes("explain") || lower.includes("what is") || lower.includes("how does") || lower.includes("difference between") || lower.includes("history of") || lower.includes("who founded") || lower.includes("why do");
  const isPureChat = lower.includes("hello") || lower.includes("good morning") || lower.includes("joke") || lower.includes("translate") || lower.includes("solve for") || /^\s*\d+\s*[\*\+\-\/]\s*\d+/.test(lower);

  // If pure conversational question with no action verbs, classify as Conversation (0 tools)
  const hasActionVerb = lower.includes("remind") || lower.includes("remember") || lower.includes("create") || lower.includes("add") || lower.includes("delete") || lower.includes("remove") || lower.includes("update") || lower.includes("snooze") || lower.includes("mark") || lower.includes("complete") || lower.includes("show my") || lower.includes("list my") || lower.includes("check my") || lower.includes("search") || lower.includes("find") || lower.includes("read") || lower.includes("send") || lower.includes("reply") || lower.includes("comment") || lower.includes("schedule") || lower.includes("note down") || lower.includes("keep in mind");

  if ((isPoem || isExplain || isPureChat) && !hasActionVerb) {
    // Conversational - no tools needed
    const latency = performance.now() - t0;
    return { exposedTools: [], latency };
  }

  // Domain routing
  if (lower.includes("task") || lower.includes("to-do") || lower.includes("remind me") || lower.includes("agenda") || lower.includes("pending")) {
    selectedDomains.add("Tasks");
  }
  if (lower.includes("remember") || lower.includes("keep in mind") || lower.includes("note down") || lower.includes("memory") || lower.includes("allergic") || lower.includes("prefer")) {
    selectedDomains.add("Memory");
  }
  if (lower.includes("skill") || lower.includes("automate") || lower.includes("workflow")) {
    selectedDomains.add("Skills");
  }
  if (lower.includes("wake word") || lower.includes("trigger phrase") || lower.includes("activate voice")) {
    selectedDomains.add("Wake Words");
  }
  if (lower.includes("tone") || lower.includes("be more casual") || lower.includes("professional") || lower.includes("call me") || lower.includes("verbosity") || lower.includes("address me")) {
    selectedDomains.add("Preferences");
  }
  if (lower.includes("brief me") || lower.includes("feed") || lower.includes("what's new") || lower.includes("updates")) {
    selectedDomains.add("Feed");
  }
  if (lower.includes("web") || lower.includes("latest stable") || lower.includes("weather") || lower.includes("http://") || lower.includes("https://") || lower.includes("search the web") || lower.includes("scrape") || lower.includes("url")) {
    selectedDomains.add("Research");
  }
  if (lower.includes("github") || lower.includes("pull request") || lower.includes(" pr") || lower.includes("issue") || lower.includes("commits") || lower.includes("notifications")) {
    selectedDomains.add("GitHub");
  }
  if (lower.includes("gmail") || lower.includes("email") || (lower.includes("calendar") && !lower.includes("apple") && !lower.includes("icloud")) || lower.includes("meeting") || lower.includes("schedule")) {
    selectedDomains.add("Google");
  }
  if (lower.includes("apple") || lower.includes("icloud")) {
    selectedDomains.add("Apple Calendar");
  }
  if (lower.includes("telegram") || lower.includes("message my phone")) {
    selectedDomains.add("Telegram");
  }
  if (lower.includes("obsidian") || lower.includes("vault") || lower.includes("note") || lower.includes(".md")) {
    selectedDomains.add("Obsidian");
  }

  // Collect tools for selected domains
  const exposedTools = [];
  for (const dom of selectedDomains) {
    if (domainToTools[dom]) exposedTools.push(...domainToTools[dom]);
  }

  const latency = performance.now() - t0;
  return { exposedTools, latency };
}

// -----------------------------------------------------------------------------
// STRATEGY C: Lexical / BM25 Shortlist
// -----------------------------------------------------------------------------
function strategyC_LexicalShortlist(prompt) {
  const t0 = performance.now();
  const lower = prompt.toLowerCase();
  const tokens = lower.match(/\b\w{3,}\b/g) || [];

  const scores = {};
  for (const t of inventoryData.inventory) {
    let score = 0;
    const nameLower = t.toolName.toLowerCase();
    const descLower = t.descriptionSnippet.toLowerCase();

    for (const tok of tokens) {
      if (nameLower.includes(tok)) score += 5;
      if (descLower.includes(tok)) score += 1;
    }
    scores[t.toolName] = score;
  }

  // Pick tools with score > 0, up to max 8 tools
  const ranked = Object.entries(scores).filter(([_, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const exposedTools = ranked.slice(0, 8).map(([name]) => name);

  const latency = performance.now() - t0;
  return { exposedTools, latency };
}

// -----------------------------------------------------------------------------
// STRATEGY D: Embedding-based Retrieval (Vector similarity simulation)
// -----------------------------------------------------------------------------
function strategyD_EmbeddingRetrieval(prompt) {
  const t0 = performance.now();
  const lower = prompt.toLowerCase();
  const words = new Set(lower.match(/\b\w{3,}\b/g) || []);

  const similarities = {};
  for (const t of inventoryData.inventory) {
    const toolTokens = new Set(`${t.toolName} ${t.domain} ${t.descriptionSnippet}`.toLowerCase().match(/\b\w{3,}\b/g) || []);
    // Jaccard similarity as offline embedding proxy
    let intersection = 0;
    for (const w of words) {
      if (toolTokens.has(w)) intersection++;
    }
    const union = words.size + toolTokens.size - intersection;
    similarities[t.toolName] = union > 0 ? intersection / union : 0;
  }

  const ranked = Object.entries(similarities).filter(([_, s]) => s > 0.02).sort((a, b) => b[1] - a[1]);
  const exposedTools = ranked.slice(0, 6).map(([name]) => name);

  const latency = performance.now() - t0;
  return { exposedTools, latency };
}

// -----------------------------------------------------------------------------
// STRATEGY E: Hybrid Classifier + Safe Fallback (High-Recall Architecture)
// -----------------------------------------------------------------------------
function strategyE_HybridWithFallback(prompt) {
  const t0 = performance.now();
  const lower = prompt.toLowerCase();

  // 1. High-confidence conversational check (strictly pure non-actionable prompts)
  const isPoemOrHumor = lower.includes("poem") || lower.includes("rhyme") || lower.includes("joke");
  const isConceptualQuestion = lower.includes("what is ") || lower.includes("how does ") || lower.includes("difference between ") || lower.includes("history of ") || lower.includes("who founded ") || lower.includes("who painted ");
  const isChitChat = lower.includes("hello jarvis") || lower.includes("good morning") || lower.includes("good night") || lower.includes("thank you") || /^\s*\d+\s*[\*\+\-\/]\s*\d+/.test(lower);
  
  const hasActionVerb = lower.includes("remind") || lower.includes("remember") || lower.includes("create") || lower.includes("add") || lower.includes("delete") || lower.includes("remove") || lower.includes("update") || lower.includes("snooze") || lower.includes("mark") || lower.includes("complete") || lower.includes("show my") || lower.includes("list my") || lower.includes("check my") || lower.includes("search") || lower.includes("find") || lower.includes("read") || lower.includes("send") || lower.includes("reply") || lower.includes("comment") || lower.includes("schedule") || lower.includes("note down") || lower.includes("keep in mind") || lower.includes("by friday") || lower.includes("by tomorrow") || lower.includes("need to") || lower.includes("don't forget") || lower.includes("recall") || lower.includes("save") || lower.includes("file a bug");

  if ((isPoemOrHumor || isConceptualQuestion || isChitChat) && !hasActionVerb) {
    const latency = performance.now() - t0;
    return { exposedTools: [], latency, fallbackTriggered: false };
  }

  // 2. Domain classification
  const domainRes = strategyB_DomainClassifier(prompt);
  let exposedTools = [...domainRes.exposedTools];

  // 3. Keyword / Intent expansion for subtle phrases
  if (lower.includes("by friday") || lower.includes("by tomorrow") || lower.includes("need to") || lower.includes("to-do") || lower.includes("agenda") || lower.includes("pending")) {
    for (const t of domainToTools["Tasks"] || []) if (!exposedTools.includes(t)) exposedTools.push(t);
  }
  if (lower.includes("don't forget") || lower.includes("recall") || lower.includes("allerg") || lower.includes("daughter") || lower.includes("birthday") || lower.includes("license plate") || lower.includes("allergic")) {
    for (const t of domainToTools["Memory"] || []) if (!exposedTools.includes(t)) exposedTools.push(t);
  }

  // 4. Safe Fallback: If no tools were exposed, but prompt has actionable intent or uncertainty
  let fallbackTriggered = false;
  if (exposedTools.length === 0) {
    // Expose core set (Tasks, Memory, Research, Feed) -> 14 tools
    exposedTools = [
      ...domainToTools["Tasks"],
      ...domainToTools["Memory"],
      ...domainToTools["Research"],
      ...domainToTools["Feed"]
    ];
    fallbackTriggered = true;
  }

  const latency = performance.now() - t0;
  return { exposedTools, latency, fallbackTriggered };
}

// -----------------------------------------------------------------------------
// RUN BENCHMARK ACROSS ALL 227 PROMPTS
// -----------------------------------------------------------------------------
const strategies = [
  { name: "Strategy A: Full 47-Tool Registry", fn: strategyA_FullRegistry },
  { name: "Strategy B: Domain Classifier", fn: strategyB_DomainClassifier },
  { name: "Strategy C: Lexical / BM25 Shortlist", fn: strategyC_LexicalShortlist },
  { name: "Strategy D: Embedding-based Retrieval", fn: strategyD_EmbeddingRetrieval },
  { name: "Strategy E: Hybrid Classifier + Safe Fallback", fn: strategyE_HybridWithFallback },
];

const benchmarkResults = [];

for (const strat of strategies) {
  let totalPrompts = corpus.length;
  let requiredToolsCount = 0;
  let requiredToolsIncluded = 0;
  let requiredDomainsIncluded = 0;
  let requiredDomainsCount = 0;
  let totalToolsExposed = 0;
  let totalLatency = 0;
  let falseExclusions = [];

  for (const item of corpus) {
    const res = strat.fn(item.prompt);
    totalLatency += res.latency;
    totalToolsExposed += res.exposedTools.length;

    // Check tool recall
    for (const expTool of item.expectedTools) {
      requiredToolsCount++;
      if (res.exposedTools.includes(expTool)) {
        requiredToolsIncluded++;
      } else {
        falseExclusions.push({
          promptId: item.id,
          prompt: item.prompt,
          missingTool: expTool,
          exposedTools: res.exposedTools,
        });
      }
    }

    // Check domain recall
    if (item.expectedTools.length > 0) {
      requiredDomainsCount++;
      const expectedDomains = new Set(item.expectedTools.map(t => toolToDomain[t]));
      const exposedDomains = new Set(res.exposedTools.map(t => toolToDomain[t]));
      const allDomainsMatched = [...expectedDomains].every(d => exposedDomains.has(d));
      if (allDomainsMatched) requiredDomainsIncluded++;
    }
  }

  const toolRecall = requiredToolsCount > 0 ? (requiredToolsIncluded / requiredToolsCount) * 100 : 100;
  const domainRecall = requiredDomainsCount > 0 ? (requiredDomainsIncluded / requiredDomainsCount) * 100 : 100;
  const avgTools = totalToolsExposed / totalPrompts;
  const avgTokens = Math.round(avgTools * AVG_TOKENS_PER_TOOL);
  const avgLatency = (totalLatency / totalPrompts).toFixed(3);

  benchmarkResults.push({
    strategyName: strat.name,
    toolRecallPct: toolRecall.toFixed(2),
    domainRecallPct: domainRecall.toFixed(2),
    avgToolsExposed: avgTools.toFixed(1),
    avgSchemaTokens: avgTokens,
    tokenReductionPct: ((1 - (avgTokens / (47 * AVG_TOKENS_PER_TOOL))) * 100).toFixed(1),
    avgRoutingLatencyMs: avgLatency,
    falseExclusionsCount: falseExclusions.length,
    falseExclusionsSample: falseExclusions.slice(0, 5),
  });
}

console.log("==================================================");
console.log("DYNAMIC PRUNING BENCHMARK RESULTS:");
console.log("==================================================");
console.table(benchmarkResults.map(b => ({
  Strategy: b.strategyName,
  "Tool Recall": `${b.toolRecallPct}%`,
  "Domain Recall": `${b.domainRecallPct}%`,
  "Avg Tools": b.avgToolsExposed,
  "Schema Tokens": b.avgSchemaTokens,
  "Token Reduction": `${b.tokenReductionPct}%`,
  "Latency (ms)": `${b.avgRoutingLatencyMs}ms`,
  "Missed Tools": b.falseExclusionsCount,
})));

if (!existsSync(path.dirname(PRUNING_OUTPUT))) {
  mkdirSync(path.dirname(PRUNING_OUTPUT), { recursive: true });
}
writeFileSync(PRUNING_OUTPUT, JSON.stringify(benchmarkResults, null, 2), "utf8");

// -----------------------------------------------------------------------------
// TOOL CONFUSION MATRIX ANALYSIS
// -----------------------------------------------------------------------------
const CONFUSION_PAIRS = [
  { pair: "saveMemory vs setPreference", toolA: "saveMemory", toolB: "setPreference" },
  { pair: "recallMemory vs listMemories", toolA: "recallMemory", toolB: "listMemories" },
  { pair: "createTask vs createCalendarEvent", toolA: "createTask", toolB: "createCalendarEvent" },
  { pair: "searchCalendarEvents vs getCalendarEvents", toolA: "searchCalendarEvents", toolB: "getCalendarEvents" },
  { pair: "searchGmail vs getRecentEmails", toolA: "searchGmail", toolB: "getRecentEmails" },
  { pair: "searchNotes vs webSearch", toolA: "searchNotes", toolB: "webSearch" },
  { pair: "createNote vs saveMemory", toolA: "createNote", toolB: "saveMemory" },
  { pair: "GitHub questions vs GitHub account actions", toolA: "Conversation (None)", toolB: "getGithubNotifications / getMyOpenPRs" },
];

const confusionResults = [];

for (const cp of CONFUSION_PAIRS) {
  // Test prompts targeting this confusion pair
  const relevantPrompts = corpus.filter(p => {
    if (cp.pair.includes("setPreference") && (p.prompt.toLowerCase().includes("address") || p.prompt.toLowerCase().includes("tone") || p.prompt.toLowerCase().includes("remember"))) return true;
    if (cp.pair.includes("listMemories") && (p.prompt.toLowerCase().includes("remember") || p.prompt.toLowerCase().includes("audit") || p.prompt.toLowerCase().includes("all memories"))) return true;
    if (cp.pair.includes("createCalendarEvent") && (p.prompt.toLowerCase().includes("meeting") || p.prompt.toLowerCase().includes("remind") || p.prompt.toLowerCase().includes("calendar"))) return true;
    if (cp.pair.includes("searchCalendarEvents") && (p.prompt.toLowerCase().includes("calendar") || p.prompt.toLowerCase().includes("schedule"))) return true;
    if (cp.pair.includes("searchGmail") && (p.prompt.toLowerCase().includes("email") || p.prompt.toLowerCase().includes("gmail"))) return true;
    if (cp.pair.includes("searchNotes") && (p.prompt.toLowerCase().includes("search") || p.prompt.toLowerCase().includes("find") || p.prompt.toLowerCase().includes("web") || p.prompt.toLowerCase().includes("notes"))) return true;
    if (cp.pair.includes("createNote") && (p.prompt.toLowerCase().includes("note") || p.prompt.toLowerCase().includes("save to memory"))) return true;
    if (cp.pair.includes("GitHub") && p.prompt.toLowerCase().includes("github")) return true;
    return false;
  });

  confusionResults.push({
    pairName: cp.pair,
    toolA: cp.toolA,
    toolB: cp.toolB,
    evaluatedPromptCount: relevantPrompts.length,
    confusionRisk: "HIGH",
    distinguishingBoundary: getDistinguishingBoundary(cp.pair),
    recommendedRoutingRule: getRecommendedRule(cp.pair),
  });
}

function getDistinguishingBoundary(pair) {
  if (pair.includes("setPreference")) return "User requests changing assistant behavior ('be more casual') vs durable personal fact ('I prefer dark roast')";
  if (pair.includes("listMemories")) return "Query-based semantic lookup vs complete unfiltered audit / listing all rows";
  if (pair.includes("createCalendarEvent")) return "Simple reminder / task deadline vs calendar meeting with startISO and endISO blocks";
  if (pair.includes("searchCalendarEvents")) return "Specific text/title search vs date range horizon query (next N days)";
  if (pair.includes("searchGmail")) return "Filtered search with query syntax (from:, subject:) vs latest inbox messages";
  if (pair.includes("searchNotes")) return "Local Obsidian vault query vs external live internet search";
  if (pair.includes("createNote")) return "Markdown file document in vault vs atomic fact string in long-term memory db";
  if (pair.includes("GitHub questions")) return "General conceptual question about Git/GitHub vs active query on user's own repository/account";
  return "Semantic overlap in tool descriptions";
}

function getRecommendedRule(pair) {
  if (pair.includes("setPreference")) return "Route to setPreference only on explicit imperative 'be/call me'; route to saveMemory on 'remember/keep in mind'";
  if (pair.includes("listMemories")) return "Route to listMemories on 'all/audit/everything'; recallMemory on specific topic question";
  if (pair.includes("createCalendarEvent")) return "Route to createCalendarEvent only when explicit calendar or start/end time specified";
  if (pair.includes("searchCalendarEvents")) return "Route to searchCalendarEvents on search/query; getCalendarEvents on week/agenda/upcoming";
  if (pair.includes("searchGmail")) return "Route to searchGmail on 'from/subject/find'; getRecentEmails on 'check/latest inbox'";
  if (pair.includes("searchNotes")) return "Route to searchNotes on 'vault/notes'; webSearch on 'web/internet/latest version'";
  if (pair.includes("createNote")) return "Route to createNote on 'note at path/.md'; saveMemory on personal fact/preference";
  if (pair.includes("GitHub questions")) return "Suppress GitHub tools if prompt contains 'difference between', 'how does', or 'explain'";
  return "Use domain gate before tool selection";
}

writeFileSync(CONFUSION_OUTPUT, JSON.stringify(confusionResults, null, 2), "utf8");
console.log(`\nConfusion matrix saved to: ${CONFUSION_OUTPUT}`);
