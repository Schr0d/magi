# Changelog

## 1.0.0 (2026-05-21)

### Added
- Multi-round MAGI convergence protocol with bounded rounds (max 4) and model-call budget (max 12)
- Termination conditions: unanimous, no_go, stable_hold, oscillation, budget_exhausted
- Oscillation detection via position signature comparison
- Case export/import (JSON) in the ASK+LOG panel
- Web Audio cue system for deliberation events (vote, accepted, rejected, error)
- BYO KEY mode with per-node model/key/URL override JSON
- Provider presets: DeepSeek, OpenAI, OpenRouter, Custom
- LOCAL mode with Node.js deliberation proxy (port 3001)
- REPLAY mode with static fixture demo
- EVA/MAGI-style terminal UI with fixed 1365x768 viewport-scaled stage
- Structured position/action parsing with salvage for malformed model output
- Fallback handling for empty model responses with retry
- GitHub Pages deployment via Actions (push-to-main trigger)

### Protocol
- Three MAGI nodes: MELCHIOR-1 (scientist), BALTHASAR-2 (mother), CASPER-3 (woman)
- Round 1: independent position (accept/reject/deliberate)
- Round 2+: cross-review with hold/revise/no_go
- Judgment by quorum with dissent preservation
- Convergence types: unanimous, majority_with_dissent, deadlock, partial, stable_hold, oscillation, budget_exhausted
