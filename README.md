# MAGI

MAGI is a 1995 EVA/MAGI-style deliberation terminal. Three MAGI bio-computer nodes evaluate a question, argue through a two-round protocol, and return a quorum judgment with a replayable case trace.

The public demo has three modes:

- `REPLAY`: static fixture replay. No key, no backend.
- `BYO KEY`: browser-memory OpenAI-compatible mode. Bring a disposable low-limit API key.
- `LOCAL`: local proxy mode for development.

## Quick Start

Run the static UI:

```powershell
npx serve dist -p 3000 --no-clipboard
```

Open:

```text
http://localhost:3000
```

Click `質詢/ASK` in the bottom-right console.

## Play Modes

### REPLAY

`REPLAY` is the default public demo path. It loads `test/fixtures/magi-case-sample.json`, runs a five-second MAGI deliberation animation, then shows the stored case result.

Use this when you want to see the ritual without an API key.

### BYO KEY

`BYO KEY` calls an OpenAI-compatible chat-completions API directly from your browser.

Use only disposable, low-limit keys. The key is held in browser memory only. MAGI does not write it to `localStorage`, `sessionStorage`, or the repo.

Provider presets:

| Preset | Base URL | Default model |
|--------|----------|---------------|
| `DEEPSEEK` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `OPENAI` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `OPENROUTER` | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| `CUSTOM` | blank | blank |

Advanced per-node override JSON:

```json
{
  "melchior": { "model": "gpt-4o-mini" },
  "balthasar": { "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat" },
  "casper": { "baseUrl": "https://openrouter.ai/api/v1", "model": "openai/gpt-4o-mini" }
}
```

Any missing per-node field falls back to the global BYO key/base URL/model.

### LOCAL

`LOCAL` posts to a local proxy at `http://localhost:3001/api/deliberate`.

Start the proxy in another terminal:

```powershell
node deliberation-server.js
```

Optional `.env`:

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat
OPENAI_COMPATIBLE_BASE_URL=https://api.deepseek.com/v1
```

## MAGI Nodes

The three nodes are not generic assistant personas. They are three incompatible loyalties split from Dr. Naoko Akagi's Personality Transplant OS:

- `MELCHIOR-1`: Naoko as scientist. Preserves mechanism, proof, instrumentation, and technical necessity.
- `BALTHASAR-2`: Naoko as mother. Preserves Ritsuko, the child, created life, and what asks to be saved.
- `CASPER-3`: Naoko as woman. Preserves private desire, attachment, humiliation, jealousy, and the man she cannot release.

Each node returns structured JSON. MAGI preserves dissent and resolves the final case by quorum.

## Development

Run tests:

```powershell
npm test
```

Poll provider status and refresh static output:

```powershell
npm run poll
```

Syntax checks used during development:

```powershell
node --check app.js
node --check deliberation-server.js
node --check src\deliberation\model-client.js
node --check src\deliberation\orchestrator.js
node --check src\deliberation\protocol.js
```

`dist/` is ignored by git, but is maintained locally as the static preview output.

## Safety Notes

- Do not commit `.env`.
- Do not use production API keys in browser BYO mode.
- Some providers may block browser requests with CORS. Use `LOCAL` mode for those providers.
- `BYO KEY` is for public experimentation, not production secret storage.
