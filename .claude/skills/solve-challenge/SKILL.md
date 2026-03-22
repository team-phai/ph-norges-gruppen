---
name: solve-challenge
description: End-to-end workflow for solving NM i AI hackathon challenges. Covers research, strategy, model training, submission creation, and score iteration. Use when the user wants to solve a challenge, tackle a challenge, start a challenge, begin competing, build a model, or says "solve challenge", "tackle challenge", "start challenge", "compete", "new challenge".
---

# Solve Challenge

Step-by-step workflow for tackling any NM i AI hackathon challenge from scratch to competitive score.

## Prerequisites

- Playwright MCP available (for doc fetching and token retrieval)
- Agent tool available (for parallel research and experimentation)
- Challenge-specific dependencies installed

## Task Progress

Copy and update this checklist as you work:

```
- [ ] Phase 1: Research — fetch docs, understand rules
- [ ] Phase 2: Strategy — analyze challenge, pick approach
- [ ] Phase 3: MVP — implement minimum viable solution
- [ ] Phase 4: Local evaluation — validate before submitting
- [ ] Phase 5: Submit — get baseline score on leaderboard
- [ ] Phase 6: Iterate — analyze scores, optimize, repeat
```

## Phase 1: Research

### 1.1 Fetch challenge documentation

Use the `fetch-game-docs` skill to scrape the challenge spec:

```
/fetch-game-docs <challenge-docs-url>
```

This writes `docs/rules.md` and `docs/challenge.md` with the full specification.

### 1.2 Read and understand the rules — THOROUGHLY

Read `docs/rules.md` carefully. Extract and note:

- **Objective**: What scores points
- **Submission format**: How to submit (zip upload, API, WebSocket)
- **Scoring formula**: Exact calculation
- **Constraints**: Size limits, time limits, rate limits, sandbox restrictions
- **Environment**: Available packages, hardware, security restrictions

**CRITICAL**: Pay extreme attention to:
- What packages are pre-installed vs what you'd need to include
- Security restrictions (blocked imports, file types)
- Version pinning requirements
- Rate limits on submissions

## Phase 2: Strategy

### 2.1 Classify the challenge

Determine the challenge type:
- **Object Detection / CV**: Train model, write inference script, zip and upload
- **Real-time Game**: WebSocket bot, strategy per round
- **REST API**: Build endpoint, deploy, submit URL
- **Optimization**: Compute solution, submit answer

### 2.2 Design the approach

**For Object Detection challenges (e.g., NorgesGruppen):**

1. **Baseline first**: Pretrained model (YOLOv8n) → verify submission works
2. **Fine-tune**: Train on competition data with correct categories
3. **Scale up**: Larger model, more augmentation, longer training
4. **Advanced**: Ensembles, TTA, architecture experiments

**For Real-time Game challenges:**

1. **Observe**: Connect, capture game state, understand mechanics
2. **MVP bot**: Simple greedy strategy
3. **Mock server**: Build local testing environment
4. **Optimize**: Pathfinding, multi-agent coordination, advanced strategy

### 2.3 Plan the architecture

```
# Object Detection typical structure:
run.py              -- Inference script (sandbox entry point)
train.py            -- Training script (runs locally)
evaluate.py         -- Local mAP evaluation
create_submission.py -- Zip creation helper
data/               -- Training data (gitignored)
models/             -- Trained weights (gitignored)

# Real-time Game typical structure:
solve.py            -- WebSocket game loop
game_state.py       -- State parsing
strategy.py         -- Decision logic
pathfinding.py      -- Movement algorithms
mock_server.py      -- Local test server
```

## Phase 3: MVP

### 3.1 Get something scoring ASAP

**For Object Detection:**

1. Write `run.py` with pretrained model inference
2. Ensure correct output format (COCO JSON)
3. Test locally on sample images
4. Create submission zip
5. Upload and verify it runs (even if score is low)

**For Real-time Games:**

1. Write WebSocket connection and message parsing
2. Implement simplest viable strategy (random/greedy)
3. Connect to real server, verify it works
4. Record baseline score

### 3.2 Wire the submission pipeline

Ensure you can go from code → submission → score repeatably.

## Phase 4: Local Evaluation

**CRITICAL for rate-limited challenges**: Build local evaluation before burning submissions.

**For Object Detection:**
```python
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

# Load ground truth and predictions
coco_gt = COCO('annotations.json')
coco_dt = coco_gt.loadRes('predictions.json')

# Evaluate
coco_eval = COCOeval(coco_gt, coco_dt, 'bbox')
coco_eval.evaluate()
coco_eval.accumulate()
coco_eval.summarize()
```

**For Real-time Games:**
Build a mock server that replays real game captures.

## Phase 5: Submit and Baseline

1. Submit your MVP
2. Record the score as baseline
3. Compare with local evaluation to calibrate

## Phase 6: Iterate — The Core Loop

```
TRAIN/IMPROVE → EVALUATE LOCALLY → SUBMIT (if improved) → ANALYZE → REPEAT
```

### 6.1 Optimization priority

**For Object Detection:**

| Priority | Optimization | Expected Impact |
|----------|-------------|-----------------|
| 1 | Fine-tune on competition data | +20-30% mAP |
| 2 | Increase model size (n → s → m → l) | +5-15% mAP |
| 3 | Data augmentation | +5-10% mAP |
| 4 | Increase image size (640 → 1280) | +3-8% mAP |
| 5 | TTA (test-time augmentation) | +2-5% mAP |
| 6 | Model ensembles | +2-5% mAP |
| 7 | Pseudo-labeling | +1-3% mAP |

### 6.2 Run parallel experiments with Agent teams

Use separate worktrees for each experiment:

```bash
# Create worktree
git worktree add .claude/worktrees/experiment-yolov8l -b experiment/yolov8l HEAD

# Launch agent in worktree
# Tell the agent its working directory as first line

# After experiment, merge or discard
git worktree remove .claude/worktrees/experiment-yolov8l
```

### 6.3 Know when to stop

Signs you've hit the ceiling:
- 5+ experiments all within ±1% of each other
- Local mAP matches server score closely
- You're at the model's theoretical limit for this dataset size
- Another challenge has more marginal score potential

## Key Lessons

1. **Read constraints 3x** — blocked imports, version pinning, and size limits are the #1 cause of failed submissions.
2. **Local eval is your #1 tool** — with only 3 submissions/day, you must evaluate locally.
3. **Baseline first** — a working submission scoring 0.1 is infinitely better than a perfect model that fails to run.
4. **Pin versions** — the sandbox has specific versions. Train with the same ones.
5. **GPU is free** — the sandbox has an L4 GPU. Use it. Don't optimize for CPU.
6. **Submission pipeline** — automate zip creation. Manual zipping causes errors.
