// test/blackbox.test.js - black-box quality tests mapped to observable behavior
'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { createLLMClient } = require('../src/llm');

const ROOT = path.resolve(__dirname, '..');
const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

let passed = 0;
let failed = 0;

function cleanOutput(text) {
  return String(text || '').replace(ANSI_RE, '').replace(/\r/g, '');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${err && err.message ? err.message : err}`);
    failed++;
  }
}

function runCliSession(lines, env, options = {}) {
  return new Promise((resolve, reject) => {
    const lineDelayMs = Number(options.lineDelayMs) > 0 ? Number(options.lineDelayMs) : 0;

    const child = spawn(process.execPath, ['index.js'], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('CLI session timed out'));
    }, 8000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`CLI exited with code ${code}. Output:\n${cleanOutput(output)}`));
        return;
      }
      resolve(cleanOutput(output));
    });

    if (lineDelayMs <= 0) {
      child.stdin.end(`${lines.join('\n')}\n`);
      return;
    }

    let idx = 0;
    const sendNext = () => {
      if (idx >= lines.length) {
        child.stdin.end();
        return;
      }

      child.stdin.write(`${lines[idx]}\n`);
      idx++;
      setTimeout(sendNext, lineDelayMs);
    };

    sendNext();
  });
}

function withFakeOllama(handler, run) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      try {
        const result = await run(baseUrl);
        server.close(() => resolve(result));
      } catch (err) {
        server.close(() => reject(err));
      }
    });

    server.on('error', reject);
  });
}

(async () => {
  console.log('\nblack-box cli');

  await test('boot and quit path stays healthy', async () => {
    const output = await runCliSession([':quit'], { AI_PROVIDER: 'none' });
    assert.match(output, /\[ready\]/);
    assert.match(output, /\[halt\] time stops\./);
  });

  await test('help command exposes public contract', async () => {
    const output = await runCliSession([':help', ':quit'], { AI_PROVIDER: 'none' });
    assert.match(output, /:reset/);
    assert.match(output, /:llm/);
    assert.match(output, /:chat M/);
    assert.match(output, /:quit/);
  });

  await test('invalid language input returns parse error', async () => {
    const output = await runCliSession(['hello world', ':quit'], { AI_PROVIDER: 'none' });
    assert.match(output, /\[parse error\] unknown syntax/);
  });

  await test('valid language input is accepted and rendered', async () => {
    const output = await runCliSession(['•1 ~220 >2 !0.3 ?0.5', ':quit'], { AI_PROVIDER: 'none' });
    assert.match(output, /•1 ∿220 ▷2 ⚡0\.3 ◇0\.5/);
  });

  await test('LLM status command reports disabled provider explicitly', async () => {
    const output = await runCliSession([':llm', ':quit'], { AI_PROVIDER: 'none' });
    assert.match(output, /\[llm\] disabled \(provider set to none\)/);
  });

  await test('chat command degrades gracefully when LLM is disabled', async () => {
    const output = await runCliSession([':chat oi', ':quit'], { AI_PROVIDER: 'none' }, { lineDelayMs: 450 });
    assert.match(output, /\[llm\] thinking\.\.\./);
    assert.match(output, /LLM disabled: provider set to none/);
  });

  console.log('\nblack-box llm provider');

  await test('ollama provider returns chat text through stable API', async () => {
    await withFakeOllama((req, res) => {
      req.resume();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ response: 'resposta local ok' }));
    }, async (baseUrl) => {
      const client = createLLMClient({ provider: 'ollama', baseUrl, model: 'fake', timeoutMs: 120 });
      const answer = await client.chat('oi');
      assert.strictEqual(answer, 'resposta local ok');
    });
  });

  await test('ollama provider clamps delta to uncertainty envelope', async () => {
    await withFakeOllama((req, res) => {
      req.resume();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ response: '{"delta": 999, "reason": "stress"}' }));
    }, async (baseUrl) => {
      const client = createLLMClient({ provider: 'ollama', baseUrl, model: 'fake', timeoutMs: 120 });
      const result = await client.suggestDelta({
        channel: 1,
        freq: 220,
        speed: 1,
        glitch: 0,
        uncertainty: 0.2,
      });
      assert.ok(result.delta <= 6);
      assert.ok(result.delta >= -6);
      assert.strictEqual(result.source, 'llm');
    });
  });

  await test('ollama provider fails fast on timeout', async () => {
    await withFakeOllama((req, res) => {
      setTimeout(() => {
        req.resume();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ response: '{"delta": 1}' }));
      }, 250);
    }, async (baseUrl) => {
      const client = createLLMClient({ provider: 'ollama', baseUrl, model: 'fake', timeoutMs: 60 });
      await assert.rejects(
        () => client.suggestDelta({ channel: 1, freq: 220, speed: 1, glitch: 0, uncertainty: 0.5 }),
        /timeout/i,
      );
    });
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
