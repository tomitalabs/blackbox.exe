'use strict';

const http = require('http');
const https = require('https');

function toInt(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function extractFirstJsonObject(text) {
  if (typeof text !== 'string') return null;

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseDeltaFromText(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  const jsonObject = extractFirstJsonObject(text);
  if (jsonObject) {
    try {
      const parsed = JSON.parse(jsonObject);
      const n = Number(parsed.delta);
      if (Number.isFinite(n)) return n;
    } catch (err) {
      // fall through to numeric extraction
    }
  }

  const fallbackNumber = text.match(/-?\d+(?:\.\d+)?/);
  if (!fallbackNumber) return null;

  const n = Number(fallbackNumber[0]);
  return Number.isFinite(n) ? n : null;
}

function postJson(urlString, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);

    const req = transport.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) {
          const msg = data.slice(0, 220).replace(/\s+/g, ' ').trim();
          reject(new Error(`HTTP ${statusCode}: ${msg || 'request failed'}`));
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error('Invalid JSON response from LLM server'));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`LLM timeout after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function createDisabledClient(reason) {
  return {
    enabled: () => false,
    info: () => ({
      enabled: false,
      provider: 'none',
      model: null,
      timeoutMs: 0,
      reason,
    }),
    suggestDelta: async () => {
      throw new Error(reason || 'LLM disabled');
    },
    chat: async () => `LLM disabled: ${reason || 'provider set to none'}`,
  };
}

function createOllamaClient(config) {
  const baseUrl = (config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = config.model || process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';
  const timeoutMs = toInt(config.timeoutMs || process.env.AI_TIMEOUT_MS, 220);

  async function generate(prompt, options) {
    const requestBody = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature,
        top_p: options.topP,
        num_predict: options.numPredict,
      },
    };

    return postJson(`${baseUrl}/api/generate`, requestBody, timeoutMs);
  }

  return {
    enabled: () => true,
    info: () => ({
      enabled: true,
      provider: 'ollama',
      model,
      timeoutMs,
      baseUrl,
      recommendedQuantized: 'qwen2.5:0.5b',
    }),

    suggestDelta: async (ctx) => {
      const uncertainty = clamp(Number(ctx.uncertainty) || 0, 0, 1);
      const maxAbs = clamp(uncertainty * 30, 1, 30);

      const prompt = [
        'You control live audio perturbations for a performance system.',
        'Return ONLY JSON with this exact shape:',
        '{"delta": number, "reason": "short"}',
        `channel=${ctx.channel}`,
        `freq=${Number(ctx.freq).toFixed(3)}`,
        `speed=${Number(ctx.speed).toFixed(3)}`,
        `glitch=${Number(ctx.glitch).toFixed(3)}`,
        `uncertainty=${uncertainty.toFixed(3)}`,
        `delta range must be between -${maxAbs.toFixed(2)} and ${maxAbs.toFixed(2)}.`,
      ].join('\n');

      const response = await generate(prompt, {
        temperature: 0.15,
        topP: 0.9,
        numPredict: 48,
      });

      const raw = typeof response.response === 'string' ? response.response.trim() : '';
      const parsed = parseDeltaFromText(raw);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid delta output: ${raw || '<empty>'}`);
      }

      return {
        delta: clamp(parsed, -maxAbs, maxAbs),
        source: 'llm',
        raw,
      };
    },

    chat: async (message) => {
      const userMessage = String(message || '').trim();
      if (!userMessage) return 'Mensagem vazia.';

      const prompt = [
        'You are a concise assistant for a live coding performance system.',
        'Reply in Portuguese-BR.',
        'Max 6 short lines.',
        'Focus on practical performance advice with low latency mindset.',
        `User: ${userMessage}`,
        'Assistant:',
      ].join('\n');

      const response = await generate(prompt, {
        temperature: 0.3,
        topP: 0.9,
        numPredict: 180,
      });

      const text = typeof response.response === 'string' ? response.response.trim() : '';
      return text || '(sem resposta do modelo)';
    },
  };
}

function createLLMClient(config = {}) {
  const provider = String(config.provider || process.env.AI_PROVIDER || 'ollama').toLowerCase();

  if (provider === 'none') {
    return createDisabledClient('provider set to none');
  }

  if (provider !== 'ollama') {
    return createDisabledClient(`unsupported provider: ${provider}`);
  }

  return createOllamaClient(config);
}

module.exports = {
  clamp,
  parseDeltaFromText,
  extractFirstJsonObject,
  createLLMClient,
};
