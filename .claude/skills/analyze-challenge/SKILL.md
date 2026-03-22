---
name: analyze-challenge
description: Analyzes hackathon challenges, researches winning strategies, and produces actionable competitive strategy documents. Triggers when analyzing a challenge, creating strategy, researching approaches, or on phrases like "analyze challenge", "create strategy", "research approaches", "how to win", "competitive analysis", "strategy recommendation", "what's the best approach".
---

# Analyze Challenge

Analyzes any hackathon challenge and produces a competitive strategy document with algorithm recommendations and a parallelization plan for Claude Agent teams.

## Arguments

- **docs path** (optional) — path to challenge docs. Defaults to `docs/rules.md`.

## Prerequisites

- Agent tool available (for parallel web research)
- Challenge documentation must exist (use `fetch-game-docs` skill first if needed)

## Task Progress

Copy and update this checklist as you work:

- [ ] Step 1: Read and classify the challenge
- [ ] Step 2: Decompose into sub-problems
- [ ] Step 3: Compute scoring ceiling and targets
- [ ] Step 4: Research strategies (parallel agents)
- [ ] Step 5: Identify edge cases and anti-patterns
- [ ] Step 6: Design parallelization plan
- [ ] Step 7: Synthesize and validate strategy document
- [ ] Step 8: Report findings to user

## Steps

### 1. Read and Classify the Challenge

Read the challenge docs. Extract:
- **Objective**: What needs to be accomplished
- **Challenge type**: Object detection / real-time game / REST API / optimization / data pipeline / hybrid
- **Scoring**: Points calculation, bonus structure, partial credit
- **Constraints**: Time, rate, resource, and submission limits
- **Environment**: Sandbox details, available packages, hardware
- **Input/Output format**: Data received and response expected

### 2. Decompose into Sub-Problems

Identify 4-8 core challenges. Output as a table:

| # | Sub-Problem | Scoring Impact | Impl. Difficulty | Dependencies |
|---|-------------|---------------|-----------------|--------------|
| 1 | ... | High/Med/Low | Easy/Med/Hard | — |

### 3. Compute Scoring Ceiling and Targets

Estimate the theoretical maximum score. Adapt by challenge type:
- **Object Detection**: SOTA mAP on similar datasets, dataset size impact
- **Real-time Game**: throughput × rounds, theoretical max completions
- **Optimization**: known optimal or best-known solutions
- **ML/Prediction**: SOTA benchmarks for similar problems

Set realistic targets (70-80% of theoretical max).

### 4. Research Strategies

Launch 2 parallel Agent calls (`subagent_type: general-purpose`):

**Agent A — Algorithms & Academic**: relevant techniques, papers, competition approaches. Provide the sub-problems from Step 2.

**Agent B — Implementations & Competitions**: winning solutions from similar competitions, Kaggle notebooks, GitHub repos. Provide the challenge type and constraints.

### 5. Identify Edge Cases and Anti-Patterns

Analyze challenge mechanics for:
- **Exploitable mechanics**: rules that can be leveraged non-obviously
- **Common pitfalls**: mistakes that waste submissions or score poorly
- **Bottlenecks**: training time, inference time, memory limits
- **Rate limit strategy**: optimal use of limited submissions

### 6. Design Parallelization Plan

Recommend how to split implementation across Claude Agent teammates:

- **Independent modules**: which sub-problems map to separate files?
- **Team structure**: 3-5 teammates with file ownership boundaries
- **Dependency order**: what must be built first?
- **Experiment parallelism**: can model variants be trained in parallel?

### 7. Synthesize and Validate Strategy Document

Write `docs/strategy.md` with these sections:
1. **Problem Summary** — objective, type, key constraints
2. **Core Sub-Problems** — table from Step 2
3. **Scoring Targets** — ceiling and targets from Step 3
4. **Algorithm Toolkit** — ONE recommended approach per sub-problem
5. **Edge Cases and Anti-Patterns** — from Step 5
6. **Parallelization Plan** — team structure from Step 6
7. **Priority Implementation Order** — numbered, highest impact first
8. **Research References** — papers, repos, links

### 8. Report Findings

Summarize to the user:
- Challenge type detected
- Top 3 scoring-impact sub-problems with recommended approach for each
- Highest-impact optimization to implement first
- Scoring targets
- Parallelization plan summary
- Files written
