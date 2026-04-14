// parser.js — minimal glyph-based syntax parser
// syntax: •N ~F >F !F ?F
// each token immediately mutates the target channel

const TOKEN = /([•~>!?])(\d+\.?\d*)/g;

function parse(line) {
  const ops = [];
  let ch = null;
  let match;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(line)) !== null) {
    const [, sym, val] = match;
    const n = parseFloat(val);
    if (sym === '•') { ch = n; continue; }
    if (ch !== null) ops.push({ ch, sym, val: n });
  }
  return ops;
}

module.exports = { parse };
