// ai.js — async AI "fertilizer"
// runs asynchronously, produces delayed output, injects into channels
// AI is NOT a chatbot. It is interference.

const channels = require('./channels');

let aiStarted = false;

// trigger a single AI perturbation for the given channel after a delay
function spawnAI(ch, uncertainty, onInject) {
  if (uncertainty <= 0) return;
  const delay = 800 + Math.random() * 2000; // 0.8–2.8s delay (intentional)
  setTimeout(() => {
    const current = channels.getChannel(ch);
    // only inject if channel is still active and uncertainty is set
    if (!current.active || current.uncertainty <= 0) return;
    const delta = (Math.random() * 2 - 1) * current.uncertainty * 30;
    channels.injectAI(ch, delta, onInject);
  }, delay);
}

// periodically check channels and occasionally trigger AI perturbations
function startAI(onInject) {
  if (aiStarted) return;
  aiStarted = true;
  setInterval(() => {
    for (const n of channels.activeChannels()) {
      const ch = channels.getChannel(n);
      if (ch.uncertainty > 0 && Math.random() < 0.02) {
        spawnAI(n, ch.uncertainty, onInject);
      }
    }
  }, 500);
}

module.exports = { startAI, spawnAI };
