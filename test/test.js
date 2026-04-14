// test/test.js — minimal unit tests for parser and channels
'use strict';

const assert = require('assert');
const parser = require('../src/parser');
const channels = require('../src/channels');
const render = require('../src/render');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${e.message}`);
    failed++;
  }
}

// ── parser tests ──────────────────────────────────────────────────────────────

console.log('\nparser');

test('parses full expression', () => {
  const ops = parser.parse('•1 ~220 >2 !0.3 ?0.5');
  assert.strictEqual(ops.length, 4);
  assert.deepStrictEqual(ops[0], { ch: 1, sym: '~', val: 220 });
  assert.deepStrictEqual(ops[1], { ch: 1, sym: '>', val: 2 });
  assert.deepStrictEqual(ops[2], { ch: 1, sym: '!', val: 0.3 });
  assert.deepStrictEqual(ops[3], { ch: 1, sym: '?', val: 0.5 });
});

test('parses multiple channels', () => {
  const ops = parser.parse('•1 ~440 •2 ~880');
  assert.strictEqual(ops.length, 2);
  assert.strictEqual(ops[0].ch, 1);
  assert.strictEqual(ops[1].ch, 2);
  assert.strictEqual(ops[1].val, 880);
});

test('returns empty for unknown input', () => {
  const ops = parser.parse('hello world');
  assert.strictEqual(ops.length, 0);
});

test('ignores ops before first channel marker', () => {
  const ops = parser.parse('~220 •1 ~440');
  assert.strictEqual(ops.length, 1);
  assert.strictEqual(ops[0].val, 440);
});

test('handles decimal values', () => {
  const ops = parser.parse('•3 !0.75');
  assert.strictEqual(ops[0].val, 0.75);
});

// ── channels tests ────────────────────────────────────────────────────────────

console.log('\nchannels');

test('applyOp sets freq', () => {
  channels.applyOp({ ch: 10, sym: '~', val: 300 });
  const ch = channels.getChannel(10);
  assert.strictEqual(ch.freq, 300);
  assert.strictEqual(ch.active, true);
});

test('applyOp sets speed', () => {
  channels.applyOp({ ch: 11, sym: '>', val: 1.5 });
  assert.strictEqual(channels.getChannel(11).speed, 1.5);
});

test('applyOp clamps glitch to [0,1]', () => {
  channels.applyOp({ ch: 12, sym: '!', val: 5 });
  assert.strictEqual(channels.getChannel(12).glitch, 1);
  channels.applyOp({ ch: 12, sym: '!', val: -1 });
  assert.strictEqual(channels.getChannel(12).glitch, 0);
});

test('applyOp clamps uncertainty to [0,1]', () => {
  channels.applyOp({ ch: 13, sym: '?', val: 99 });
  assert.strictEqual(channels.getChannel(13).uncertainty, 1);
});

test('injectAI modifies freq and sets aiBuf', () => {
  channels.applyOp({ ch: 14, sym: '~', val: 200 });
  channels.injectAI(14, 20);
  const ch = channels.getChannel(14);
  assert.strictEqual(ch.freq, 220);
  assert.strictEqual(ch.aiBuf, 20);
});

test('injectAI calls onInject callback', () => {
  channels.applyOp({ ch: 16, sym: '~', val: 100 });
  let called = null;
  channels.injectAI(16, 10, (ch, delta) => { called = { ch, delta }; });
  assert.deepStrictEqual(called, { ch: 16, delta: 10 });
});

test('injectAI clamps freq to >= 0', () => {
  channels.applyOp({ ch: 15, sym: '~', val: 10 });
  channels.injectAI(15, -100);
  assert.strictEqual(channels.getChannel(15).freq, 0);
});

test('activeChannels returns sorted list of active channels', () => {
  channels.applyOp({ ch: 20, sym: '~', val: 100 });
  channels.applyOp({ ch: 21, sym: '~', val: 200 });
  const active = channels.activeChannels();
  assert.ok(active.includes(20));
  assert.ok(active.includes(21));
  // sorted
  for (let i = 1; i < active.length; i++) {
    assert.ok(active[i] > active[i - 1]);
  }
});

test('resetAll clears all channels', () => {
  channels.applyOp({ ch: 30, sym: '~', val: 440 });
  assert.ok(channels.activeChannels().includes(30));
  channels.resetAll();
  assert.strictEqual(channels.activeChannels().includes(30), false);
});

// ── render tests ──────────────────────────────────────────────────────────────

console.log('\nrender');

test('toGlyph maps ~ to ∿', () => {
  assert.strictEqual(render.toGlyph('~'), '∿');
});

test('toGlyph maps > to ▷', () => {
  assert.strictEqual(render.toGlyph('>'), '▷');
});

test('toGlyph maps ! to ⚡', () => {
  assert.strictEqual(render.toGlyph('!'), '⚡');
});

test('toGlyph maps ? to ◇', () => {
  assert.strictEqual(render.toGlyph('?'), '◇');
});

test('renderLine replaces ASCII with glyphs', () => {
  const result = render.renderLine('•1 ~220 >2 !0.3 ?0.5');
  assert.ok(result.includes('∿'));
  assert.ok(result.includes('▷'));
  assert.ok(result.includes('⚡'));
  assert.ok(result.includes('◇'));
});

test('renderChannel returns null for inactive channel', () => {
  const result = render.renderChannel(99, { active: false });
  assert.strictEqual(result, null);
});

test('renderChannel formats active channel', () => {
  const ch = { active: true, freq: 220, speed: 2, glitch: 0.3, uncertainty: 0.5, aiBuf: 0 };
  const result = render.renderChannel(1, ch);
  assert.ok(result.includes('220.0Hz'));
  assert.ok(result.includes('▷ 2.0'));
  assert.ok(result.includes('⚡ 0.30'));
  assert.ok(result.includes('◇ 0.50'));
});

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
