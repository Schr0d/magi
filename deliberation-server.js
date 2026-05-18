import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAICompatibleClient } from './src/deliberation/model-client.js';
import { runDeliberationCase } from './src/deliberation/orchestrator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '.env');

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE_URL = process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

const callModel = createOpenAICompatibleClient({ apiKey: API_KEY, model: MODEL, baseUrl: BASE_URL, timeoutMs: 20000 });

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, headers, payload) {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const headers = corsHeaders();

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/deliberate') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      const question = String(parsed.question || '').trim();

      if (!question) {
        sendJson(res, 400, headers, { error: { code: 'invalid_question', message: 'Question is required.', case_id: null } });
        return;
      }

      const caseFile = await runDeliberationCase({
        question,
        callModel,
        maxRounds: Math.min(Number(parsed.max_rounds || 2), 2),
      });

      sendJson(res, 200, headers, { case: caseFile });
    } catch (err) {
      sendJson(res, 500, headers, { error: { code: 'internal_error', message: err.message, case_id: null } });
    }
    return;
  }

  sendJson(res, 404, headers, { error: { code: 'not_found', message: 'Not found.', case_id: null } });
});

server.listen(PORT, () => {
  console.log(`MAGI deliberation proxy on port ${PORT}`);
  if (!API_KEY) console.log('WARNING: DEEPSEEK_API_KEY not set. Set it before use.');
});
