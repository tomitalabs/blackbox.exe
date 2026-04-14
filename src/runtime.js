// runtime.js — continuous non-blocking runtime loop
// time never stops; no blocking calls; glitch/drift are features

const channels = require('./channels');
const render = require('./render');

const TICK_MS = 100;   // channel state tick (10Hz)
const PRINT_MS = 200;  // display refresh (5Hz)

let lastPrintTime = 0;
let aiLog = [];        // recent AI injections to surface in display
let running = false;

function logAI(ch, delta) {
  aiLog.push({ ch, delta, ts: Date.now() });
  // keep only last 3 entries
  if (aiLog.length > 3) aiLog.shift();
}

function start() {
  if (running) return;
  running = true;

  // state tick
  setInterval(() => {
    channels.tick(TICK_MS / 1000);
  }, TICK_MS);

  // display refresh
  setInterval(() => {
    printState();
  }, PRINT_MS);
}

function printState() {
  const active = channels.activeChannels();
  if (active.length === 0) return;

  const lines = active.map(n => render.renderChannel(n, channels.getChannel(n))).filter(Boolean);
  if (lines.length === 0) return;

  // clear current display block and redraw
  process.stdout.write('\x1b[2K\r'); // clear current line
  lines.forEach(l => process.stdout.write(l + '\n'));

  // flush AI log lines
  const now = Date.now();
  aiLog = aiLog.filter(e => now - e.ts < 1500);
  aiLog.forEach(e => {
    const sign = e.delta > 0 ? '+' : '';
    process.stdout.write(`  \x1b[35m[ai] •${e.ch} freq ${sign}${e.delta.toFixed(1)}\x1b[0m\n`);
  });

  // move cursor back up so next print overwrites
  const total = lines.length + aiLog.length;
  if (total > 0) process.stdout.write(`\x1b[${total}A`);
}

module.exports = { start, logAI };
