// ai.js — async AI "fertilizer"
// runs asynchronously, produces delayed output, injects into channels
// AI is NOT a chatbot. It is interference.

const channels = require('./channels');
const { clamp, createLLMClient } = require('./llm');

let aiStarted = false;
const inFlightChannels = new Set();
const llm = createLLMClient();

function randomDelta(uncertainty) {
  return (Math.random() * 2 - 1) * uncertainty * 30;
}

async function resolveDelta(ch, current) {
  const fallback = randomDelta(current.uncertainty);
  if (!llm.enabled()) return { delta: fallback, source: 'fallback' };

  try {
    const result = await llm.suggestDelta({
      channel: ch,
      freq: current.freq,
      speed: current.speed,
      glitch: current.glitch,
      uncertainty: current.uncertainty,
    });

    if (!Number.isFinite(result.delta)) {
      return { delta: fallback, source: 'fallback' };
    }

    return { delta: result.delta, source: result.source || 'llm' };
  } catch (err) {
    return { delta: fallback, source: 'fallback' };
  }
}

// trigger a single AI perturbation for the given channel after a delay
function spawnAI(ch, uncertainty, onInject) {
  if (uncertainty <= 0) return;
  const delay = 120 + Math.random() * 320; // short delay to keep reactive behavior
  setTimeout(async () => {
    if (inFlightChannels.has(ch)) return;

    const current = channels.getChannel(ch);
    // only inject if channel is still active and uncertainty is set
    if (!current.active || current.uncertainty <= 0) return;

    inFlightChannels.add(ch);
    try {
      const result = await resolveDelta(ch, current);
      const fresh = channels.getChannel(ch);
      if (!fresh.active || fresh.uncertainty <= 0) return;

      const maxAbs = Math.max(1, fresh.uncertainty * 30);
      const delta = clamp(result.delta, -maxAbs, maxAbs);
      channels.injectAI(ch, delta, (channel, value) => {
        if (typeof onInject === 'function') onInject(channel, value, result.source);
      });
    } finally {
      inFlightChannels.delete(ch);
    }
  }, delay);
}

// periodically check channels and occasionally trigger AI perturbations
function startAI(onInject) {
  if (aiStarted) return;
  aiStarted = true;
  setInterval(() => {
    for (const n of channels.activeChannels()) {
      const ch = channels.getChannel(n);
      // higher uncertainty means more frequent AI injections
      const probability = 0.01 + ch.uncertainty * 0.04;
      if (ch.uncertainty > 0 && Math.random() < probability) {
        spawnAI(n, ch.uncertainty, onInject);
      }
    }
  }, 250);
}

async function chat(message) {
  return llm.chat(message);
}

function getLLMStatus() {
  return llm.info();
}

module.exports = { startAI, spawnAI, chat, getLLMStatus };
