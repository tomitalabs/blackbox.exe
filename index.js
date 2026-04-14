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

// ── boot sequence ─────────────────────────────────────────────────────────────

function boot(cb) {
  const lines = [
    '\n_black | box.exe\n',
    '[boot] initializing time...',
    '[boot] loading audio...',
    '[boot] spawning AI...',
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
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[90m> \x1b[0m',
    terminal: true,
  });

  rl.prompt();

  rl.on('line', (raw) => {
    const line = raw.trim();
    if (!line) { rl.prompt(); return; }

    // special commands
    if (line === ':q' || line === ':quit' || line === ':exit') {
      process.stdout.write('\n[halt] time stops.\n');
      process.exit(0);
    }
    if (line === ':reset') {
      process.stdout.write('[reset]\n');
      rl.prompt();
      return;
    }
    if (line === ':help') {
      printHelp();
      rl.prompt();
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
  });

  rl.on('close', () => {
    process.stdout.write('\n[halt] time stops.\n');
    process.exit(0);
  });
}

function printHelp() {
  process.stdout.write([
    '',
    '  syntax:  •N [ops...]',
    '  •N  — target channel N (1–8)',
    '  ~F  — signal frequency F (Hz)',
    '  >F  — temporal speed F',
    '  !F  — glitch probability F (0–1)',
    '  ?F  — AI uncertainty F (0–1)',
    '',
    '  example: •1 ~220 >2 !0.3 ?0.5',
    '           •2 ~440 ~0.1',
    '',
    '  :reset  — clear all channels',
    '  :help   — this screen',
    '  :quit   — halt',
    '',
  ].join('\n') + '\n');
}

// ── patch AI injectAI to also log for display ─────────────────────────────────

const _injectAI = channels.injectAI.bind(channels);
channels.injectAI = (ch, delta) => {
  _injectAI(ch, delta);
  runtime.logAI(ch, delta);
};

// ── main ──────────────────────────────────────────────────────────────────────

boot(() => {
  runtime.start();
  ai.startAI();
  startREPL();
});
