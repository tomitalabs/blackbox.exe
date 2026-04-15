# BLACK_BLOX.xr frontend (unified mode)

This frontend now works as a client for the core language engine bridge.

## What changed

1. The terminal accepts official Black Blox syntax and sends it to the core bridge.
2. The scene updates from real-time state streaming over WebSocket.
3. Local XR helper commands still work (`play()`, `color()`, etc.).

## Unified run flow

In the repository root:

1. Start the core bridge:
   `npm run bridge`

In this folder (`frontend`):

1. Install dependencies:
   `npm install`
2. (Optional) set bridge URL in `.env.local`:
   `VITE_BRIDGE_URL=http://127.0.0.1:8787`
3. Run frontend:
   `npm run dev`

## GitHub Pages deploy

The XR frontend can be deployed as a static site on GitHub Pages.

Important:

1. GitHub Pages hosts only the frontend bundle.
2. The Node bridge and local Ollama runtime are not hosted on Pages.
3. Set a public bridge endpoint with repository variable `VITE_BRIDGE_URL`.

This repository includes workflow [.github/workflows/deploy-pages.yml](../.github/workflows/deploy-pages.yml) to build and deploy [frontend](.) automatically.

Recommended repository settings:

1. In GitHub, enable Pages with source: GitHub Actions.
2. Add repository variable `VITE_BRIDGE_URL` (example: `https://your-bridge.example.com`).
3. Optional: add `VITE_BASE_PATH` if you want to force a custom base path.

After pushing to `main` or `master`, the workflow publishes the `dist` folder.

## Official syntax examples in XR terminal

```text
•1 ~220 >2 !0.3 ?0.5
•2 ~440 ?0.2
:llm
:chat como melhorar a performance?
```

## Local XR helper commands (still available)

- `help()`
- `play("bd hh sn hh")`
- `bpm(140)`
- `color("#00ff00")`
- `glitch(7)`
- `rotate(2.5)`
- `scale(2)`
- `wireframe(1)`
- `body(1)`
- `editor()`
- `stop()`
