# blackbox.exe

black | box.exe

Performative live coding system with real-time channels, glitch dynamics, and local LLM integration.

## Quickstart

1. Install Node.js (v14+).
2. Run:

```sh
npm install
npm run dev
```

## Local LLM (Ollama)

This MVP supports local chat and AI perturbations through Ollama.

1. Install Ollama: https://ollama.com
2. Pull a lightweight quantized model:

```sh
ollama pull qwen2.5:0.5b
```

3. Keep Ollama server running (default endpoint: http://127.0.0.1:11434).
4. Start this project:

```sh
npm run dev
```

Optional environment configuration:

```sh
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_TIMEOUT_MS=220
```

If LLM is unavailable or slow, the system automatically falls back to non-blocking random interference.

## REPL Commands

- :help
- :reset
- :llm
- :chat <message>
- :quit

## Integration Bridge (HTTP + WebSocket)

The core engine can now run as an integration bridge for external clients (such as the XR frontend in frontend).

Start bridge:

```sh
npm run bridge
```

Default endpoint:

- HTTP: http://127.0.0.1:8787
- WS events: ws://127.0.0.1:8787/events

Main routes:

- GET /health
- GET /status
- POST /command
- POST /chat

Environment:

```sh
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=8787
AI_PROVIDER=ollama|none
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_TIMEOUT_MS=220
```

## Unified Mode (core + XR frontend)

1. In root, run bridge:

```sh
npm run bridge
```

2. In frontend, run frontend:

```sh
cd frontend
npm install
npm run dev
```

3. In XR terminal, use official syntax directly:

```text
•1 ~220 >2 !0.3 ?0.5
:llm
:chat teste local
```

## GitHub Pages (frontend only)

Yes, the project can be deployed to GitHub Pages, but only for the static XR frontend in [frontend](frontend).

What runs on Pages:

1. React/Vite frontend bundle.

What does not run on Pages:

1. Node bridge (`src/bridge.js`).
2. Local LLM runtime (Ollama).

Deployment automation is already defined in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).

To publish:

1. Enable GitHub Pages with source `GitHub Actions`.
2. Add repository variable `VITE_BRIDGE_URL` pointing to a reachable bridge endpoint.
3. Push to `main` or `master` (or run the workflow manually).

## Performance Syntax

Use gesture-style commands:

- •N selects channel N
- ~F sets frequency (Hz)
- >F sets speed
- !F sets glitch probability [0..1]
- ?F sets AI uncertainty [0..1]

Example:

```text
•1 ~220 >2 !0.3 ?0.5
•2 ~440 ?0.2
```

Full visual guide: see USAGE.md.

## Docker Multi-Model Setup

This repo now includes multiple Docker configurations so users can test different local quantized models quickly.

Available profiles:

- qwen05b (lightest): qwen2.5:0.5b
- qwen15b (balanced): qwen2.5:1.5b
- llama1b (alternative): llama3.2:1b

Quick run with npm scripts:

```sh
npm run docker:qwen05b
# or
npm run docker:qwen15b
# or
npm run docker:llama1b
```

Direct docker compose commands:

```sh
docker compose --profile qwen05b up --build
docker compose --profile qwen15b up --build
docker compose --profile llama1b up --build
```

Notes:

- First build can take time because model weights are pulled into image/layer.
- Containers expose Ollama on host ports 11434 (qwen05b), 11435 (qwen15b), and 11436 (llama1b).
- App and model run in the same compose profile, already wired with OLLAMA_BASE_URL.
