import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync, copyFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProvider } from './providers/index.js';
import { normalizeNode } from './domain/nodes.js';
import { getRoutePosture } from './domain/route-posture.js';
import { nodeStatus } from './domain/health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadConfig() {
  const path = join(ROOT, 'config.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

function loadPrevious(dir) {
  const statusPath = join(dir, 'status.json');
  if (!existsSync(statusPath)) return null;
  try {
    return JSON.parse(readFileSync(statusPath, 'utf-8'));
  } catch {
    return null;
  }
}

function loadLogs(dir, date) {
  const logPath = join(dir, 'logs', `${date}.json`);
  if (!existsSync(logPath)) return [];
  try {
    return JSON.parse(readFileSync(logPath, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function detectChanges(prevNode, newNode) {
  if (!prevNode) return true;
  if (prevNode.status !== newNode.status) return true;
  return false;
}

function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pruneLogs(outputDir, retentionDays) {
  const logsDir = join(outputDir, 'logs');
  if (!existsSync(logsDir)) return;
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const file of readdirSync(logsDir)) {
    if (!file.endsWith('.json')) continue;
    const filePath = join(logsDir, file);
    try {
      if (statSync(filePath).mtimeMs < cutoff) unlinkSync(filePath);
    } catch { /* skip */ }
  }
}

function buildEvents(prev, current) {
  const events = [];
  for (const node of current.nodes || []) {
    const prevNode = prev ? (prev.nodes || []).find(n => n.id === node.id) : null;
    if (detectChanges(prevNode, node)) {
      events.push({
        timestamp: new Date().toISOString(),
        node_id: node.id,
        old_status: prevNode ? prevNode.status : 'none',
        new_status: node.status,
      });
    }
  }
  return events;
}

async function pollNode(config, timeoutMs) {
  try {
    const raw = await fetchWithTimeout(config.status_url, timeoutMs);
    const { components, incidents } = parseProvider(raw, config);
    return { error: null, components, incidents };
  } catch (err) {
    return { error: err.message, components: null, incidents: null };
  }
}

async function main() {
  const outputDir = process.argv[2] || join(ROOT, 'dist');
  const config = loadConfig();
  const poll = config.poll || {};
  const timeoutMs = poll.request_timeout_ms || 10000;
  const staleMs = (poll.stale_threshold_minutes || 30) * 60 * 1000;
  const retentionDays = poll.log_retention_days || 30;

  const prev = loadPrevious(outputDir);
  const nodeConfigs = config.nodes || [];

  const results = await Promise.all(
    nodeConfigs.map(cfg => pollNode(cfg, timeoutMs))
  );

  const now = new Date().toISOString();
  const nodes = nodeConfigs.map((cfg, i) => {
    const result = results[i];
    const prevNode = prev ? (prev.nodes || []).find(n => n.id === cfg.id) : null;

    if (result.error) {
      return {
        id: cfg.id,
        name: cfg.name,
        status: prevNode ? prevNode.status : 'unknown',
        health: prevNode ? prevNode.health : 0,
        components: prevNode ? prevNode.components : [],
        incidents: prevNode ? prevNode.incidents : [],
        stale_since: prevNode ? (prevNode.stale_since || now) : now,
      };
    }

    const normalized = normalizeNode(result.components, result.incidents, cfg.id);
    const node = {
      id: cfg.id,
      name: cfg.name,
      status: normalized.status,
      health: normalized.health,
      components: normalized.components,
      incidents: normalized.incidents,
      stale_since: null,
    };

    if (prevNode && prevNode.stale_since && normalized.status !== 'unknown') {
      node.stale_since = prevNode.stale_since;
    }

    return node;
  });

  const routePosture = getRoutePosture(nodes);
  const events = buildEvents(prev, { nodes });
  const current = { timestamp: now, nodes, route_posture: routePosture, events };

  mkdirSync(outputDir, { recursive: true });

  writeJSON(join(outputDir, 'status.json'), current);

  if (events.length > 0) {
    const today = dateStr();
    const existingLogEvents = loadLogs(outputDir, today);
    const merged = [...existingLogEvents, ...events];
    writeJSON(join(outputDir, 'logs', `${today}.json`), merged);
  }

  pruneLogs(outputDir, retentionDays);

  const staticFiles = ['index.html', 'style.css', 'app.js', 'config.json'];
  for (const file of staticFiles) {
    const src = join(ROOT, file);
    const dest = join(outputDir, file);
    if (existsSync(src)) copyFileSync(src, dest);
  }

  const staticDirs = [
    ['src/deliberation', 'src/deliberation'],
    ['test/fixtures', 'test/fixtures'],
  ];
  for (const [srcDir, destDir] of staticDirs) {
    const src = join(ROOT, srcDir);
    const dest = join(outputDir, destDir);
    if (existsSync(src)) cpSync(src, dest, { recursive: true });
  }

  console.log(`Poll complete: ${nodes.length} nodes, ${events.length} changes`);
  console.log(JSON.stringify({ timestamp: now, statuses: nodes.map(n => `${n.id}:${n.status}`) }));

  if (events.length > 0) {
    for (const e of events) {
      console.log(`  ${e.node_id}: ${e.old_status} → ${e.new_status}`);
    }
  }
}

main().catch(err => {
  console.error('Poll failed:', err.message);
  process.exitCode = 1;
});
