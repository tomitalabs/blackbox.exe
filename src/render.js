// render.js — visual glyph layer (ASCII input → glyph display)
// never alters underlying text; this is display-only

const GLYPHS = { '~': '∿', '>': '▷', '!': '⚡', '?': '◇', '•': '•' };

function toGlyph(sym) {
  return GLYPHS[sym] || sym;
}

function renderChannel(n, ch) {
  if (!ch.active) return null;
  const freq = ch.freq.toFixed(1);
  const ai = ch.aiBuf !== 0 ? `  [ai:${ch.aiBuf > 0 ? '+' : ''}${ch.aiBuf.toFixed(1)}]` : '';
  return `  •${n}  ∿ ${freq}Hz  ▷ ${ch.speed.toFixed(1)}  ⚡ ${ch.glitch.toFixed(2)}  ◇ ${ch.uncertainty.toFixed(2)}${ai}`;
}

function renderLine(line) {
  // replace ASCII symbols with glyphs for display
  return line
    .replace(/~/g, '∿')
    .replace(/>/g, '▷')
    .replace(/!/g, '⚡')
    .replace(/\?/g, '◇');
}

module.exports = { toGlyph, renderChannel, renderLine };
