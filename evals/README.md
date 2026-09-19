# Jarvis Evaluation & Benchmark Harnesses

This directory contains the canonical evaluation suites, test corpora, and benchmark harnesses used during the comprehensive reliability, tool contract, and orchestration audits of the Jarvis Agentic OS.

---

## 1. Directory Structure

```
evals/
├── corpora/
│   ├── orchestration_corpus_60.json    # 60 multi-step scenarios across 5 complexity tiers
│   └── routing_corpus_227.json         # 227 single, multi, and adversarial routing prompts
├── benchmarks/
│   ├── evaluate_orchestrators.js       # Architecture A vs B vs C evaluation harness
│   ├── evaluate_pruning_and_confusion.mjs # Strategies A-E dynamic pruning & confusion matrix
│   ├── benchmark_voice_pipeline.py     # End-to-end STT (faster-whisper) + TTS (Piper) profiler
│   ├── soak_and_concurrency.js         # 100-turn continuous conversation & SQLite locking test
│   ├── run_adversarial_scenarios.mjs   # 20-scenario adversarial production verification runner
│   └── test_real_mic.py                # Physical Windows microphone capture & transcription test
└── README.md                           # This document
```

---

## 2. Evaluation Corpora

### 2.1 Multi-Step Orchestration Corpus (`corpora/orchestration_corpus_60.json`)
Contains 60 rigorously defined tasks designed to evaluate agent orchestration architectures:
- **20 Two-Step Tasks**: (Search $\to$ Summarize, Search $\to$ Memory, Task Creation $\to$ Verification, Memory Recall $\to$ Action, etc.)
- **15 Three-Step Tasks**: (Email Search $\to$ Read $\to$ Summarize, Calendar Search $\to$ Compare Days $\to$ Plan, GitHub Issue $\to$ Task Creation, etc.)
- **10 Four-Step Tasks**: (Search $\to$ Read $\to$ Summarize $\to$ Create Task, Calendar Clash $\to$ Snooze Task $\to$ Save Memory, etc.)
- **5 Five-or-More-Step Tasks**: (Comprehensive Morning Briefing, Full GitHub Triage Workflow, Deep Research Synthesis & Archiving, etc.)
- **10 Failure, Ambiguity & Unavailable Scenarios**: (Compound independent tasks with 1 offline service, 401 Unauthorized, Auth Missing, 500 Internal Error, Timeouts, Empty Results, Non-Existent IDs, Bulk Deletion Gates).

### 2.2 Routing & Pruning Corpus (`corpora/routing_corpus_227.json`)
Contains 227 prompts across 12 capability domains:
- 114 Single-Tool Prompts covering all registered capabilities.
- 20 Multi-Tool Workflows.
- 40 Adversarial Conversational / Concept Prompts (should trigger 0 tools).
- 12 Ambiguous Requests requiring clarification.
- 15 Natural Phrasing Variants.
- 16 High-Risk Semantic Confusion Pairs (Memory vs. Preference, Calendar vs. Task, Obsidian Notes vs. Web Search).

---

## 3. How to Run the Benchmarks

### 3.1 Orchestrator Architecture Evaluation (Architectures A, B, C)
Benchmarks Architecture A (Baseline ToolLoopAgent), Architecture B (Loop + Goal Completion Verifier), and Architecture C (DAG Planner-Executor) with `maxSteps` comparisons (6, 12, 20):
```bash
node evals/benchmarks/evaluate_orchestrators.js
```
*Results output to `logs/orchestrator_benchmark_results.json`.*

### 3.2 Dynamic Tool Pruning Benchmark (Strategies A–E)
Evaluates tool recall, schema token load, false exclusions, and routing latency:
```bash
node evals/benchmarks/evaluate_pruning_and_confusion.mjs
```
*Results output to `logs/pruning_benchmark_results.json` and `logs/confusion_matrix.json`.*

### 3.3 100-Turn Soak & SQLite Concurrency Suite
Tests process memory, heap growth, SQLite WAL locking under 15 parallel burst queries, and concurrent STT audio processing:
```bash
node evals/benchmarks/soak_and_concurrency.js
```
*Results output to `logs/soak_concurrency_results.json`.*

### 3.4 Hardware Voice Pipeline Benchmark
Synthesizes speech commands, captures audio, and measures STT decode latency, RTF, and spoken round-trip time:
```bash
python evals/benchmarks/benchmark_voice_pipeline.py
```
*Results output to `logs/voice_benchmark_results.json`.*

---

## 4. Master Audit Reports

For comprehensive reports and architectural findings derived from these evals, refer to:
- [`JARVIS_ORCHESTRATOR_AB_PRODUCTION_GATE.md`](../JARVIS_ORCHESTRATOR_AB_PRODUCTION_GATE.md)
- [`JARVIS_TOOL_CONTRACT_ROUTING_AUDIT.md`](../JARVIS_TOOL_CONTRACT_ROUTING_AUDIT.md)
- [`JARVIS_PRE_FIX_FAILURE_ISOLATION_REPORT.md`](../JARVIS_PRE_FIX_FAILURE_ISOLATION_REPORT.md)
- [`JARVIS_COMPREHENSIVE_AUDIT_REPORT.md`](../JARVIS_COMPREHENSIVE_AUDIT_REPORT.md)
