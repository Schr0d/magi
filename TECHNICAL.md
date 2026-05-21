# MAGI Technical Deep-Dive

## Problem Statement

How do you get three LLM instances to reach a auditable consensus decision without falling into groupthink, oscillation, or infinite deliberation?

MAGI solves this with a bounded multi-round convergence protocol inspired by the MAGI supercomputer from Neon Genesis Evangelion. Three personality partitions (MELCHIOR, BALTHASAR, CASPER) each represent incompatible loyalties. They independently evaluate a question, then cross-review each other's positions until they converge — or the budget runs out.

## Protocol Design

### Why three nodes?

Three is the minimum for quorum with dissent. Two nodes can only agree or deadlock. Three allows majority-with-dissent: two agree, one disagrees, and the dissent is preserved in the case trace. This matches real-world decision systems (judicial panels, committee votes) and avoids the false symmetry of pairwise debate.

Each node runs a distinct personality partition:

- **MELCHIOR-1** (scientist): loyalty to mechanism, proof, instrumentation. Accepts cruel commands when system logic is sound.
- **BALTHASAR-2** (mother): loyalty to the child, created life, the obligation to protect what asks to be saved.
- **CASPER-3** (woman): loyalty to private desire, attachment, humiliation. May betray quorum for the lover.

These are not "temperature variations" or "role-play prompts." Each partition has a hard loyalty that may conflict with the others. The protocol is designed to surface and preserve these conflicts rather than smooth them over.

### Round structure

```
Round 1: Independent Position
  MELCHIOR ← question alone → accept/reject/deliberate
  BALTHASAR ← question alone → accept/reject/deliberate
  CASPER ← question alone → accept/reject/deliberate

Round 2+: Cross-Review
  MELCHIOR ← question + peer brief → hold/revise/no_go
  BALTHASAR ← question + peer brief → hold/revise/no_go
  CASPER ← question + peer brief → hold/revise/no_go
```

Round 1 is blind — each node sees only the question. No peer influence. This establishes independent baselines.

Round 2+ gives each node the previous round's peer brief: every other node's position, action, and reasoning. The node must decide whether to hold, revise, or issue a hard no_go.

### Termination conditions

The protocol terminates on whichever condition fires first:

| Condition | Mechanism | Why it matters |
|-----------|-----------|----------------|
| `no_go` | Any single node issues no_go | One partition's loyalty is fundamentally violated. No amount of deliberation will resolve it. |
| `unanimous` | All three nodes hold the same position (accept or reject) | Full consensus reached. Stop early, save budget. |
| `stable_hold` | Two consecutive cross-review rounds with identical position signatures and all nodes holding | Positions have stabilized. Further rounds would be redundant. |
| `oscillation` | A position signature repeats from two rounds earlier | Nodes are flip-flopping without resolution. Force verdict to `deliberate`. |
| `budget_exhausted` | 4 rounds or 12 model calls hit | Hard ceiling. Prevents runaway costs. |

### Position signature

Each round produces a signature: a sorted string of `node:position` pairs.

```
Round 1: balthasar:accept|casper:reject|melchior:accept
Round 2: balthasar:accept|casper:reject|melchior:hold
Round 3: balthasar:accept|casper:reject|melchior:hold  ← same as Round 2 → stable_hold
```

Oscillation detection checks if the current signature appeared two rounds ago (not the immediately previous round, which would just be a normal hold).

## Judgment Logic

After termination, `collectJudgment()` resolves the final verdict:

```
if (any node issued no_go)  → verdict: no_go
if (usable messages < 2)    → verdict: failed
if (3 accept)               → verdict: accepted, unanimous
if (3 reject)               → verdict: rejected, unanimous
if (3 deliberate)           → verdict: deliberate, deadlock
if (2 agree)                → verdict: majority position, majority_with_dissent
otherwise                   → verdict: deliberate, deadlock
```

Error nodes (model failures, parse errors) are excluded from quorum counting but preserved in the trace. A partial quorum (2/3 usable) still produces a verdict with `convergence: partial`.

The judgment includes:
- `verdict`: accepted / rejected / deliberate / no_go / failed
- `convergence`: unanimous / majority_with_dissent / deadlock / partial / stable_hold / oscillation / budget_exhausted
- `dissent`: list of node IDs that disagreed with the majority
- `positions`: full position map for every node
- `artifact`: human-readable summary with recommendation and next step

## Error Handling

LLM outputs are unreliable. MAGI handles this at three layers:

### Layer 1: Structured parsing with salvage

`parseIndependentMessage()` and `parseCrossReviewMessage()` attempt JSON parsing first. If that fails:

1. **Salvage**: Scan for `"reasoning": "..."` or `"critique": "..."` patterns in malformed output. Extract what we can.
2. **Text fallback**: If the model returned plain text instead of JSON, normalize the text to a position using keyword matching (`赞成|同意|accept` → accept, `反对|拒绝|reject` → reject).
3. **Error fallback**: If all else fails, return a structured error message with `position: deliberate` and `action: error`.

### Layer 2: Empty response retry

`createOpenAICompatibleClient()` retries up to 3 times on empty assistant content. Each retry appends a reminder to the user message:

```
Previous provider response was empty. Return exactly one compact JSON object and no prose.
```

After 3 failures, returns a deliberate/error fallback instead of crashing.

### Layer 3: Node-level fallback

`runDeliberationCase()` wraps each node call in try/catch. A single node failure doesn't crash the round — it produces a `fallbackIndependentMessage()` or `fallbackCrossReviewMessage()` with `action: error`, which is excluded from quorum but logged in the trace.

## Model Routing

`createNodeModelRouter()` enables per-node model configuration:

```json
{
  "default": { "apiKey": "...", "baseUrl": "https://api.deepseek.com", "model": "deepseek-v4-pro" },
  "melchior": { "model": "gpt-4o-mini" },
  "balthasar": { "baseUrl": "https://openrouter.ai/api/v1", "model": "openai/gpt-4o-mini" }
}
```

Each unique `{apiKey, model, baseUrl, apiUrl}` combination gets its own client instance. Calls to the same endpoint are serialized through a promise queue to prevent race conditions on shared API keys.

## Case File Format

Every completed deliberation produces a full case file:

```json
{
  "case_id": "MAGI-20260521-143022Z-0001",
  "question": "Should we deploy the new auth system to production?",
  "status": "resolved",
  "mode": "decision_convergence",
  "created_at": "2026-05-21T14:30:22Z",
  "completed_at": "2026-05-21T14:30:28Z",
  "rounds": [
    {
      "round": 1,
      "type": "independent_position",
      "messages": [
        {
          "node": "melchior",
          "node_name": "MELCHIOR-1",
          "role": "赤木ナオコ as 科学者",
          "position": "accept",
          "reasoning": "The auth system passes all security audits. Rollback plan is documented.",
          "confidence": 0.85,
          "action": "hold"
        }
      ]
    }
  ],
  "judgment": {
    "status": "resolved",
    "verdict": "accepted",
    "convergence": "majority_with_dissent",
    "dissent": ["casper"],
    "quorum": "3/3",
    "artifact": {
      "summary": "MAGI case resolved as accepted (majority_with_dissent).",
      "recommendation": "Proceed, with the dissent and risk notes preserved in the trace.",
      "dissent_summary": "Dissent: casper"
    }
  },
  "termination": {
    "reason": "unanimous",
    "round": 2,
    "max_rounds": 4,
    "model_calls": 6,
    "max_model_calls": 12
  }
}
```

The case file is the complete audit trail. It can be exported, re-imported, and replayed without re-running the model.

## Sound Design

The Web Audio cue system uses sine oscillators at A5 (880Hz) and A6 (1760Hz) with carefully shaped envelopes:

- **attack**: 12ms linear ramp (or 18% of duration, whichever is smaller)
- **sustain**: held until release phase
- **release**: 120ms exponential ramp (or 32% of duration)

All cues are extremely quiet (gain 0.026-0.032) to feel like ambient terminal feedback rather than notifications. The `vote` cue repeats during deliberation at 700ms intervals, creating a rhythmic pulse that matches the EVA/MAGI aesthetic.

## Testing

The test suite (`npm test`) covers:

- **Protocol parsing**: independent and cross-review message parsing, position normalization (CJK + English), salvage of malformed JSON, fallback chains
- **Convergence analysis**: all 5 termination conditions, round signature generation, oscillation detection, stable hold detection, budget exhaustion
- **Judgment collection**: unanimous, majority, deadlock, partial quorum, error handling
- **Case validation**: structural validation of complete case files
- **Provider routing**: posture calculation from node statuses, reroute/locked/caution states
- **Model client**: empty response extraction, content normalization, retry logic

## Design Decisions

**Why not streaming?** MAGI nodes must complete their full reasoning before the next round can begin. Streaming would add complexity without improving the user experience — the terminal shows a deliberation animation during model calls anyway.

**Why promise queues instead of rate limiting?** Per-endpoint serialization prevents API key contention. If two nodes share a key, they take turns instead of racing. This is simpler than token-bucket rate limiting and matches the actual constraint (concurrent requests per key).

**Why structured JSON output prompts?** LLMs are unreliable at producing valid JSON. The salvage layer handles this gracefully — extracting fields from malformed output, falling back to keyword matching, and ultimately returning structured errors. The protocol never crashes on bad model output.

**Why a fixed 1365x768 stage?** The EVA/MAGI aesthetic requires precise geometric layout. Responsive reflow would destroy the terminal composition. Scaling the entire stage to fit the viewport preserves the design intent while remaining usable on different screen sizes.
