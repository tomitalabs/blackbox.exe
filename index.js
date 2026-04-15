#!/usr/bin/env node
// _black | box.exe
// performative live coding system
// code = gesture | time = medium | AI = interference | error = material

'use strict';

const readline = require('readline');
const parser   = require('./src/parser');
const channels = require('./src/channels');
const render   = require('./src/render');
const runtime  = require('./src/runtime');
const ai       = require('./src/ai');

const llmStatus = ai.getLLMStatus();

// ── boot sequence ─────────────────────────────────────────────────────────────

function boot(cb) {
  const llmLine = llmStatus.enabled
    ? `[boot] local llm: ${llmStatus.provider}:${llmStatus.model} (${llmStatus.timeoutMs}ms)`
    : `[boot] local llm: disabled (${llmStatus.reason})`;

  const lines = [
    '\n_black | box.exe\n',
    '[boot] initializing time...',
    '[boot] loading audio...',
    '[boot] spawning AI...',
    llmLine,
    '\x1b[33m[warning] instability enabled\x1b[0m',
    '\x1b[32m[ready]\x1b[0m\n',
  ];
  let i = 0;
  const next = () => {
    if (i >= lines.length) { cb(); return; }
    process.stdout.write(lines[i++] + '\n');
    setTimeout(next, 180);
  };
  next();
}

// ── REPL ──────────────────────────────────────────────────────────────────────

function startREPL() {
  let chatInFlight = false;
  let lineQueue = Promise.resolve();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[90m> \x1b[0m',
    terminal: true,
  });

  rl.prompt();

  async function handleLine(raw) {
    const line = raw.trim();
    if (!line) { rl.prompt(); return; }

    // special commands
    if (line === ':q' || line === ':quit' || line === ':exit') {
      process.stdout.write('\n[halt] time stops.\n');
      process.exit(0);
    }
    if (line === ':reset') {
      channels.resetAll();
      process.stdout.write('[reset] all channels cleared\n');
      rl.prompt();
      return;
    }
    if (line === ':help') {
      printHelp();
      rl.prompt();
      return;
    }
    if (line === ':llm') {
      printLLMStatus();
      rl.prompt();
      return;
    }
    if (line === ':chat' || line.startsWith(':chat ')) {
      const message = line.slice(5).trim();
      if (!message) {
        process.stdout.write('\x1b[33m[llm] use: :chat <mensagem>\x1b[0m\n');
        rl.prompt();
        return;
      }
      if (chatInFlight) {
        process.stdout.write('\x1b[33m[llm] aguarde a resposta atual\x1b[0m\n');
        rl.prompt();
        return;
      }

      chatInFlight = true;
      process.stdout.write('\x1b[36m[llm]\x1b[0m thinking...\n');
      try {
        const answer = await ai.chat(message);
        process.stdout.write(`\x1b[36m[llm]\x1b[0m ${answer}\n`);
      } catch (err) {
        process.stdout.write(`\x1b[31m[llm error]\x1b[0m ${err.message}\n`);
      } finally {
        chatInFlight = false;
        rl.prompt();
      }
      return;
    }

    // parse + apply
    const ops = parser.parse(line);
    if (ops.length > 0) {
      ops.forEach(op => channels.applyOp(op));
      // display the glyph-rendered version of what was typed
      process.stdout.write('\x1b[90m  ' + render.renderLine(line) + '\x1b[0m\n');
    } else {
      process.stdout.write('\x1b[31m  [parse error] unknown syntax\x1b[0m\n');
    }

    rl.prompt();
  }

  rl.on('line', (raw) => {
    lineQueue = lineQueue
      .then(() => handleLine(raw))
      .catch((err) => {
        process.stdout.write(`\x1b[31m[repl error]\x1b[0m ${err.message}\n`);
        rl.prompt();
      });
  });

  rl.on('close', () => {
    process.stdout.write('\n[halt] time stops.\n');
    process.exit(0);
  });
}

function printLLMStatus() {
  const status = ai.getLLMStatus();
  if (!status.enabled) {
    process.stdout.write(`[llm] disabled (${status.reason})\n`);
    return;
  }

  process.stdout.write([
    '[llm] status',
    `  provider: ${status.provider}`,
    `  model: ${status.model}`,
    `  timeout: ${status.timeoutMs}ms`,
    `  endpoint: ${status.baseUrl}`,
    `  hint: use a quantized small model, e.g. ${status.recommendedQuantized}`,
  ].join('\n') + '\n');
}

function printHelp() {
  process.stdout.write([
    '',
    '  syntax:  •N [ops...]',
    '  •N  — target channel N',
    '  ~F  — signal frequency F (Hz)',
    '  >F  — temporal speed F',
    '  !F  — glitch probability F (0–1)',
    '  ?F  — AI uncertainty F (0–1)',
    '',
    '  example: •1 ~220 >2 !0.3 ?0.5',
    '           •2 ~440 ?0.2',
    '',
    '  :reset  — clear all channels',
    '  :llm    — show local LLM status',
    '  :chat M — talk to local LLM (M = message)',
    '  :help   — this screen',
    '  :quit   — halt',
    '',
    '  env:',
    '  AI_PROVIDER=ollama|none',
    '  OLLAMA_MODEL=qwen2.5:0.5b',
    '  OLLAMA_BASE_URL=http://127.0.0.1:11434',
    '  AI_TIMEOUT_MS=220',
    '',
  ].join('\n') + '\n');
}

// ── main ──────────────────────────────────────────────────────────────────────

boot(() => {
  runtime.start();
  ai.startAI(runtime.logAI);
  startREPL();
});
