// test/bridge.blackbox.test.js - black-box tests for HTTP/WS integration bridge
'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..');
const BRIDGE_PORT = 8788;
const BRIDGE_HOST = '127.0.0.1';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
      passed++;
    })
    .catch((err) => {
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`      ${err && err.message ? err.message : err}`);
      failed++;
    });
}

function httpJson(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request({
      host: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: route,
      method,
      headers: payload
        ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          }
        : {},
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${data}`));
          return;
        }
        resolve({ statusCode: res.statusCode || 0, body: parsed });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForBridgeReady(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await httpJson('GET', '/health');
      if (res.statusCode === 200 && res.body && res.body.ok) return;
    } catch (err) {
      // keep polling until timeout
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Bridge did not become ready in time');
}

function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${BRIDGE_HOST}:${BRIDGE_PORT}/events`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('WS connect timeout'));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

(async () => {
  const child = spawn(process.execPath, ['src/bridge.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_PROVIDER: 'none',
      BRIDGE_HOST,
      BRIDGE_PORT: String(BRIDGE_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c) => { logs += c; });
  child.stderr.on('data', (c) => { logs += c; });

  try {
    await waitForBridgeReady();

    console.log('\nblack-box bridge api/ws');

    await test('health endpoint is reachable', async () => {
      const res = await httpJson('GET', '/health');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.ok, true);
      assert.strictEqual(res.body.service, 'blackbox-bridge');
    });

    await test('status exposes llm disabled contract', async () => {
      const res = await httpJson('GET', '/status');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.ok, true);
      assert.strictEqual(res.body.llm.enabled, false);
      assert.strictEqual(res.body.llm.provider, 'none');
    });

    await test('command endpoint applies official language line', async () => {
      const res = await httpJson('POST', '/command', { line: '•1 ~220 >2 !0.3 ?0.5' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.ok, true);
      assert.strictEqual(res.body.type, 'ops');
      assert.ok(Array.isArray(res.body.channels));
      assert.strictEqual(res.body.channels[0].n, 1);
    });

    await test('command endpoint rejects invalid syntax', async () => {
      const res = await httpJson('POST', '/command', { line: 'hello world' });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.ok, false);
      assert.match(res.body.error, /unknown syntax/i);
    });

    await test('command endpoint supports :chat via shared llm contract', async () => {
      const res = await httpJson('POST', '/command', { line: ':chat oi' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.ok, true);
      assert.strictEqual(res.body.type, 'chat');
      assert.match(res.body.answer, /LLM disabled: provider set to none/);
    });

    await test('ws stream emits state and channel updates', async () => {
      const ws = await connectWs();

      const messages = [];
      const updatePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Did not receive channel_update. Messages: ${JSON.stringify(messages)}`));
        }, 5000);

        ws.on('message', (buf) => {
          const msg = JSON.parse(String(buf));
          messages.push(msg.type);
          if (msg.type === 'channel_update') {
            clearTimeout(timer);
            resolve(msg);
          }
        });
      });

      const commandRes = await httpJson('POST', '/command', { line: '•2 ~440 >1.5 !0.2 ?0.4' });
      assert.strictEqual(commandRes.statusCode, 200);

      const update = await updatePromise;
      assert.strictEqual(update.type, 'channel_update');
      assert.strictEqual(update.payload.n, 2);

      ws.close();
    });

    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.log('\n  \x1b[31mBridge suite setup failed\x1b[0m');
    console.log(`  ${err.message}`);
    console.log(`  logs: ${logs}`);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
