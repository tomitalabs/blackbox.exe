// ai.js — async AI "fertilizer"
// runs asynchronously, produces delayed output, injects into channels
// AI is NOT a chatbot. It is interference.

const channels = require('./channels');

// schedule a random AI perturbation for the given channel
function spawnAI(ch, uncertainty) {
  if (uncertainty <= 0) return;
  const delay = 800 + Math.random() * 2000; // 0.8–2.8s delay (intentional)
  setTimeout(() => {
    const delta = (Math.random() * 2 - 1) * uncertainty * 30;
    channels.injectAI(ch, delta);
    // schedule next perturbation
    spawnAI(ch, uncertainty);
  }, delay);
}

// watch channel states and spawn AI when uncertainty > 0
function startAI() {
  setInterval(() => {
    for (const n of channels.activeChannels()) {
      const ch = channels.getChannel(n);
      if (ch.uncertainty > 0 && Math.random() < 0.02) {
        spawnAI(n, ch.uncertainty);
      }
    }
  }, 500);
}

module.exports = { startAI, spawnAI };
