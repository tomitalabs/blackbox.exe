// channels.js — multi-channel state management
// each channel holds: freq, speed, glitch, uncertainty, ai buffer

const MAX_CHANNELS = 8;

const state = {};

function getChannel(n) {
  if (!state[n]) {
    state[n] = { freq: 0, speed: 1, glitch: 0, uncertainty: 0, aiBuf: 0, active: false };
  }
  return state[n];
}

function applyOp(op) {
  const ch = getChannel(op.ch);
  ch.active = true;
  switch (op.sym) {
    case '~': ch.freq = op.val; break;
    case '>': ch.speed = op.val; break;
    case '!': ch.glitch = Math.min(1, Math.max(0, op.val)); break;
    case '?': ch.uncertainty = Math.min(1, Math.max(0, op.val)); break;
  }
}

function injectAI(ch, delta) {
  const c = getChannel(ch);
  c.aiBuf = delta;
  c.freq = Math.max(0, c.freq + delta);
}

function activeChannels() {
  return Object.keys(state)
    .map(Number)
    .filter(n => state[n].active)
    .sort((a, b) => a - b);
}

function tick(dt) {
  for (const n of activeChannels()) {
    const ch = state[n];
    // drift: glitch introduces random frequency perturbation
    if (ch.glitch > 0 && Math.random() < ch.glitch * 0.05) {
      ch.freq += (Math.random() * 2 - 1) * ch.glitch * 10;
      ch.freq = Math.max(0, ch.freq);
    }
    // AI buffer decays toward 0
    ch.aiBuf *= 0.95;
  }
}

module.exports = { getChannel, applyOp, injectAI, activeChannels, tick };
