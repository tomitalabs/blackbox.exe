'use strict';

const http = require('http');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const parser = require('./parser');
const channels = require('./channels');
const render = require('./render');
const ai = require('./ai');

const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.BRIDGE_PORT || 8787);
const TICK_MS = 100;

let tickTimer = null;
let started = false;

const wsClients = new Set();

function nowTs() {
  return Date.now();
}

function buildChannel(n) {
  const ch = channels.getChannel(n);
  return {
    n,
    freq: ch.freq,
    speed: ch.speed,
    glitch: ch.glitch,
    uncertainty: ch.uncertainty,
    aiBuf: ch.aiBuf,
    active: ch.active,
  };
}

function buildStateSnapshot() {
  const active = channels.activeChannels();
  return {
    activeChannels: active,
    channels: active.map(buildChannel),
  };
}

function formatHelpLines() {
  return [
    'syntax: •N [ops...]',
    '•N — target channel N',
    '~F — signal frequency F (Hz)',
    '>F — temporal speed F',
    '!F — glitch probability F (0-1)',
    '?F — AI uncertainty F (0-1)',
    ':reset — clear all channels',
    ':llm — show local LLM status',
    ':chat M — talk to local LLM (M = message)',
  ];
}

function broadcast(type, payload) {
  const frame = JSON.stringify({ type, payload, ts: nowTs() });
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) ws.send(frame);
  }
}

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, body) {
  withCors(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

async function runLanguageLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return { ok: false, statusCode: 400, error: 'line is required' };

  if (line === ':help') {
    return { ok: true, type: 'help', help: formatHelpLines() };
  }

  if (line === ':reset') {
    channels.resetAll();
    broadcast('system_status', { event: 'reset' });
    broadcast('state_snapshot', buildStateSnapshot());
    return { ok: true, type: 'reset', message: 'all channels cleared' };
  }

  if (line === ':llm') {
    return { ok: true, type: 'llm', llm: ai.getLLMStatus() };
  }

  if (line.startsWith(':chat')) {
    const message = line.slice(5).trim();
    if (!message) return { ok: false, statusCode: 400, error: 'use :chat <message>' };

    const answer = await ai.chat(message);
    return { ok: true, type: 'chat', answer };
  }

  if (line === ':q' || line === ':quit' || line === ':exit') {
    return { ok: true, type: 'noop', message: 'quit is only supported in CLI mode' };
  }

  const ops = parser.parse(line);
  if (ops.length === 0) return { ok: false, statusCode: 400, error: 'unknown syntax' };

  const touched = new Set();
  ops.forEach((op) => {
    channels.applyOp(op);
    touched.add(op.ch);
  });

  for (const ch of touched) {
    broadcast('channel_update', buildChannel(ch));
  }
  broadcast('state_snapshot', buildStateSnapshot());

  return {
    ok: true,
    type: 'ops',
    opsApplied: ops.length,
    rendered: render.renderLine(line),
    channels: Array.from(touched).map(buildChannel),
  };
}

function startEngine() {
  if (started) return;
  started = true;

  ai.startAI((ch, delta, source) => {
    broadcast('ai_injection', { ch, delta, source: source || 'ai' });
    broadcast('channel_update', buildChannel(ch));
  });

  tickTimer = setInterval(() => {
    channels.tick(TICK_MS / 1000);
    broadcast('state_snapshot', buildStateSnapshot());
  }, TICK_MS);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      withCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'blackbox-bridge', ts: nowTs() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      sendJson(res, 200, {
        ok: true,
        llm: ai.getLLMStatus(),
        state: buildStateSnapshot(),
        clients: wsClients.size,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/chat') {
      const body = await readJsonBody(req);
      const message = String(body.message || '').trim();
      if (!message) {
        sendJson(res, 400, { ok: false, error: 'message is required' });
        return;
      }

      const answer = await ai.chat(message);
      sendJson(res, 200, { ok: true, answer });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/command') {
      const body = await readJsonBody(req);
      const result = await runLanguageLine(body.line);
      if (!result.ok) {
        sendJson(res, result.statusCode || 400, result);
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message || 'internal error' });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').split('?')[0] !== '/events') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  wsClients.add(ws);

  ws.send(JSON.stringify({
    type: 'system_status',
    payload: {
      bridge: 'online',
      llm: ai.getLLMStatus(),
    },
    ts: nowTs(),
  }));

  ws.send(JSON.stringify({
    type: 'state_snapshot',
    payload: buildStateSnapshot(),
    ts: nowTs(),
  }));

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

startEngine();

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  if (tickTimer) clearInterval(tickTimer);
  for (const ws of wsClients) ws.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
