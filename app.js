import { loadFixtureCase } from './src/deliberation/fixtures.js';
import { createNodeModelRouter } from './src/deliberation/model-client.js';
import { runDeliberationCase } from './src/deliberation/orchestrator.js';
import { validateCase } from './src/deliberation/protocol.js';
import { createMagiSoundSystem } from './src/deliberation/sound.js';

function getRoutePosture(nodes) {
  if (!nodes || nodes.length === 0) {
    return { status: 'standby', preferred_node_id: null, reason: 'no-data' };
  }

  const operational = nodes.filter(n => n.status === 'operational');
  const degraded = nodes.filter(n => n.status === 'degraded');
  const outage = nodes.filter(n => n.status === 'outage');

  if (outage.length >= 2) {
    return { status: 'locked', preferred_node_id: null, reason: `multiple-outage:${outage.length}` };
  }

  if (outage.length === 1) {
    const preferred = operational[0] || degraded[0];
    return {
      status: 'reroute',
      preferred_node_id: preferred ? preferred.id : null,
      reason: `outage:${outage[0].id}`,
    };
  }

  if (degraded.length >= 1) {
    const preferred = operational[0];
    return {
      status: 'caution',
      preferred_node_id: preferred ? preferred.id : null,
      reason: `degraded:${degraded.map(n => n.id).join(',')}`,
    };
  }

  if (operational.length === nodes.length) {
    return { status: 'standby', preferred_node_id: null, reason: 'all-operational' };
  }

  return { status: 'standby', preferred_node_id: null, reason: 'monitor-only' };
}

const pageStartTime = new Date();
let lastStatusData = null;
const magiSound = createMagiSoundSystem();

const DELIBERATION_PROXY = 'http://localhost:3001';
const FIXTURE_DELIBERATION_DELAY_MS = 5000;
const DELIBERATION_BLINK_MS = 700;
let deliberationCueTimer = null;

const PROVIDER_PRESETS = Object.freeze({
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  custom: { baseUrl: '', model: '' },
});

const deliberationState = {
  loading: false,
  mode: 'fixture',
  providerPreset: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  nodeConfigText: '',
  question: '',
  case: null,
  nodes: [],
  judgment: null,
  history: [],
  error: '',
};

function finalCaseMessages(caseFile) {
  const rounds = caseFile?.rounds || [];
  const round = rounds[rounds.length - 1];
  return (round?.messages || []).map(message => ({
    node_id: message.node,
    node_name: message.node_name || String(message.node || '').toUpperCase(),
    node_role: message.role || '',
    position: message.position_after || message.position || 'deliberate',
    label: String(message.position_after || message.position || 'deliberate').toUpperCase(),
    reasoning: message.critique || message.reasoning || '',
    action: message.action || 'hold',
  }));
}

function setDeliberationCase(caseFile) {
  deliberationState.case = caseFile;
  deliberationState.question = caseFile?.question || '';
  deliberationState.nodes = finalCaseMessages(caseFile);
  deliberationState.judgment = caseFile?.judgment || null;
  if (caseFile) {
    deliberationState.history.push({
      timestamp: caseFile.completed_at || caseFile.created_at,
      question: caseFile.question,
      judgment: caseFile.judgment,
      case_id: caseFile.case_id,
    });
  }
}

function judgmentCue(judgment) {
  const verdict = judgment?.verdict;
  if (verdict === 'accepted') return 'accepted';
  if (verdict === 'rejected' || verdict === 'no_go') return 'rejected';
  if (verdict === 'failed') return 'error';
  return 'vote';
}

function fitTerminal() {
  const scale = Math.min((window.innerWidth - 24) / 1365, (window.innerHeight - 24) / 768, 1);
  document.documentElement.style.setProperty('--fit-scale', scale.toFixed(4));
  document.documentElement.style.setProperty('--fit-width', `${Math.ceil(1365 * scale)}px`);
  document.documentElement.style.setProperty('--fit-height', `${Math.ceil(768 * scale)}px`);
}

function formatTimestamp(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} JST`;
}

function formatTime(hhmm) {
  if (!hhmm) return '--:--';
  const parts = String(hhmm).split(':');
  const hh = parts[0] || '00';
  const mm = parts[1] || '00';
  return `${hh}:${mm}`;
}

function elapsed() {
  const sec = Math.floor((Date.now() - pageStartTime.getTime()) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `RUN ${String(h).padStart(3, '0')}:${String(m).padStart(2, '0')}`;
}

function startTimeLabel() {
  const hh = String(pageStartTime.getHours()).padStart(2, '0');
  const mm = String(pageStartTime.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildByoModelConfig() {
  const defaults = {
    apiKey: deliberationState.apiKey.trim(),
    baseUrl: deliberationState.baseUrl.trim() || 'https://api.deepseek.com',
    model: deliberationState.model.trim() || 'deepseek-v4-pro',
  };
  if (!defaults.apiKey) throw new Error('global API key required');

  const config = { default: defaults };
  const raw = deliberationState.nodeConfigText.trim();
  if (!raw) return config;

  const parsed = JSON.parse(raw);
  for (const nodeId of ['melchior', 'balthasar', 'casper']) {
    if (!parsed[nodeId]) continue;
    config[nodeId] = { ...defaults, ...parsed[nodeId] };
  }
  return config;
}

function validateByoSubmission(question) {
  if (!String(question || '').trim()) return 'QUESTION REQUIRED // ENTER INTERROGATION TEXT';
  if (deliberationState.mode !== 'byo') return '';

  const apiKey = deliberationState.apiKey.trim();
  const baseUrl = deliberationState.baseUrl.trim();
  const model = deliberationState.model.trim();
  if (!apiKey) return 'KEY REQUIRED // ENTER DISPOSABLE LOW-LIMIT KEY';
  if (!model) return 'MODEL REQUIRED // SELECT PROVIDER OR ENTER MODEL';
  if (!/^https?:\/\//.test(baseUrl)) return 'BASE URL INVALID // USE https://api.deepseek.com';

  const raw = deliberationState.nodeConfigText.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      for (const nodeId of ['melchior', 'balthasar', 'casper']) {
        const node = parsed[nodeId];
        if (node?.baseUrl && !/^https?:\/\//.test(String(node.baseUrl))) {
          return `${nodeId.toUpperCase()} BASE URL INVALID // USE https://api.deepseek.com`;
        }
      }
    } catch {
      return 'NODE JSON INVALID // CHECK ADVANCED OVERRIDE';
    }
  }
  return '';
}

function applyProviderPreset(name, controls = {}) {
  const preset = PROVIDER_PRESETS[name];
  if (!preset) return;
  deliberationState.providerPreset = name;
  deliberationState.baseUrl = preset.baseUrl;
  deliberationState.model = preset.model;
  if (controls.baseUrl) controls.baseUrl.value = preset.baseUrl;
  if (controls.model) controls.model.value = preset.model;
  document.querySelectorAll('[data-provider-preset]').forEach(button => {
    button.classList.toggle('is-selected', button.dataset.providerPreset === name);
  });
  renderRemote();
}

function friendlyModelError(message) {
  const text = String(message || '');
  if (/API 401|API 403/i.test(text)) return 'KEY REJECTED // CHECK API KEY OR PROVIDER';
  if (/API 404/i.test(text)) return 'MODEL NOT FOUND // CHECK MODEL NAME';
  if (/API 429/i.test(text)) return 'RATE LIMITED // WAIT OR USE ANOTHER KEY';
  if (/abort|timeout/i.test(text)) return 'PROVIDER TIMEOUT // RETRY OR SWITCH NODE MODEL';
  if (/failed to fetch|cors|network/i.test(text)) return 'CORS BLOCKED // TRY LOCAL PROXY OR ANOTHER PROVIDER';
  if (/empty assistant content|empty model output/i.test(text)) return 'EMPTY MODEL RESPONSE // RETRIED ONCE // CHECK MODEL OR PROVIDER';
  if (/json|object|model output/i.test(text)) return 'NODE OUTPUT CORRUPT // MAGI FALLBACK ENGAGED';
  return text || 'MODEL FAILURE // CHECK PROVIDER SETTINGS';
}

function startDeliberationCue() {
  stopDeliberationCue();
  magiSound.play('vote');
  deliberationCueTimer = window.setInterval(() => {
    magiSound.play('vote');
  }, DELIBERATION_BLINK_MS);
}

function stopDeliberationCue() {
  if (deliberationCueTimer !== null) {
    window.clearInterval(deliberationCueTimer);
    deliberationCueTimer = null;
  }
}

function renderNodes(nodes) {
  for (const node of nodes) {
    const id = node.id;
    const el = document.getElementById(`node-${id}`);
    const label = document.getElementById(`label-${id}`);
    if (!el || !label) continue;

    el.className = el.className.replace(/\bstatus-\S+|\bdelib-\S+/g, '');
    el.classList.add('unit', id, `status-${node.status}`);
    if (deliberationState.loading) {
      el.classList.add('delib-result', 'delib-deliberate');
    } else if (deliberationState.nodes.length > 0) {
      const dNode = deliberationState.nodes.find(dn => dn.node_id === id);
      if (dNode) el.classList.add('delib-result', `delib-${dNode.position}`);
    }

    const fallback = id === 'casper' ? 'CASPER-3' : id === 'melchior' ? 'MELCHIOR-1' : id === 'balthasar' ? 'BALTHASAR-2' : id.toUpperCase();
    const text = node.name || fallback;
    label.textContent = text.toUpperCase();
  }
}

function renderStamp(statuses) {
  const allNormal = statuses.every(s => s === 'operational');
  const anyOutage = statuses.some(s => s === 'outage');
  const isDeliberating = deliberationState.loading;
  const hasJudgment = deliberationState.judgment !== null;

  const appealStamp = document.getElementById('stamp-appeal');
  const judgmentStamp = document.getElementById('stamp-judgment');

  if (isDeliberating) {
    if (appealStamp) appealStamp.textContent = '審議中';
    if (judgmentStamp) judgmentStamp.textContent = '審議中';
  } else if (hasJudgment) {
    const label = deliberationState.judgment.verdict === 'accepted' ? '可決' :
      deliberationState.judgment.verdict === 'rejected' ? '否決' :
        deliberationState.judgment.verdict === 'no_go' ? '否決' : '再議';
    if (appealStamp) appealStamp.textContent = label;
    if (judgmentStamp) judgmentStamp.textContent = label;
  } else if (anyOutage) {
    if (appealStamp) appealStamp.textContent = '緊急事態';
    if (judgmentStamp) judgmentStamp.textContent = '緊急事態';
  } else if (allNormal) {
    if (appealStamp) appealStamp.textContent = '正常';
    if (judgmentStamp) judgmentStamp.textContent = '正常';
  } else {
    if (appealStamp) appealStamp.textContent = '審議中';
    if (judgmentStamp) judgmentStamp.textContent = '審議中';
  }
}

function renderRightInfo(nodes, routePosture) {
  const el = document.getElementById('right-judgment');
  if (!el) return;

  const postureText = routePosture ? routePosture.status.toUpperCase() : 'STANDBY';
  const hasJudgment = deliberationState.judgment !== null;
  const verdict = deliberationState.judgment?.verdict;
  const decisionLine = verdict === 'no_go' ? 'ORDER 582 REJECTED' :
    verdict === 'rejected' ? 'MAJORITY REJECT' :
      verdict === 'accepted' ? 'MAJORITY ACCEPT' : 'FAILOVER WAIT';
  const lines = [
    'ABSOLUTE-L',
    hasJudgment ? `C50 // MAGI ${String(verdict).toUpperCase()}` : 'C50 // ROUTE OPEN',
    hasJudgment ? `C51 // ${String(deliberationState.judgment.convergence || '').toUpperCase()}` : 'C51 // FAILOVER WAIT',
    hasJudgment ? decisionLine : 'DANGER EMERGENCY',
    'ROUTE CONTROL',
    '',
  ];

  for (const node of nodes) {
    lines.push(`${node.id.toUpperCase()} ${node.status.toUpperCase()}`);
  }

  el.innerHTML = lines.join('<br>');
}

function renderStrip(statuses) {
  const anyDegraded = statuses.some(s => s === 'degraded' || s === 'outage');
  const anyOutage = statuses.some(s => s === 'outage');
  const allNormal = statuses.every(s => s === 'operational');

  const scanEl = document.getElementById('strip-scan');
  const syncEl = document.getElementById('strip-sync');
  const gateEl = document.getElementById('strip-gate');
  const dangerEl = document.getElementById('strip-danger');

  if (deliberationState.loading) {
    if (scanEl) scanEl.textContent = 'MAGI majority vote';
    if (syncEl) syncEl.textContent = 'Personality OS online';
    if (gateEl) gateEl.textContent = 'Type-666 firewall';
    if (dangerEl) dangerEl.textContent = 'Central Dogma sealed';
    return;
  }

  if (scanEl) scanEl.textContent = 'External API scan';
  if (syncEl) syncEl.textContent = allNormal ? 'Sync line active' : 'Sync line degraded';
  if (gateEl) gateEl.textContent = anyOutage ? 'Route gate locked' : 'Route gate standby';
  if (dangerEl) dangerEl.textContent = anyOutage ? 'DANGER ACTIVE' : anyDegraded ? 'Caution' : 'Nominal';
}

function renderEventLog(events) {
  const el = document.getElementById('event-log');
  if (!el) return;
  if (deliberationState.case) {
    const lines = [];
    for (const round of deliberationState.case.rounds || []) {
      for (const msg of round.messages || []) {
        lines.push(`ROUND ${String(round.round).padStart(2, '0')} ${String(msg.node).toUpperCase()} ${(msg.action || msg.position || '').toUpperCase()}`);
      }
    }
    el.innerHTML = lines.slice(-6).join('<br>') || '--:-- AWAITING SCAN';
    return;
  }
  if (!events || !events.length) {
    el.innerHTML = '--:-- AWAITING SCAN';
    return;
  }
  el.innerHTML = events.slice(-6).map(e => {
    const ts = e.timestamp ? formatTimestamp(e.timestamp).replace(' JST', '') : '--:--';
    const status = e.new_status || e.action || '';
    return `${ts} ${String(e.node_id || 'SYSTEM').toUpperCase()} ${String(status).toUpperCase()}`;
  }).join('<br>');
}

function renderJudgmentLog(data) {
  const el = document.getElementById('judgment-log');
  if (!el) return;
  if (deliberationState.judgment) {
    const accepts = deliberationState.nodes.filter(n => n.position === 'accept').length;
    const rejects = deliberationState.nodes.filter(n => n.position === 'reject').length;
    el.innerHTML = [
      `QUORUM:${accepts}/3 ACCEPT ${rejects}/3 REJECT`,
      `MAGI:${String(deliberationState.judgment.verdict).toUpperCase()}`,
      `DETAIL:${String(deliberationState.judgment.convergence || '').toUpperCase()}`,
      'CASE READY // ASK TO REVIEW TRACE',
    ].join('<br>');
    return;
  }
  const nodes = data.judgment_nodes || data.nodes || [];
  const quorum = nodes.filter(n => n.status === 'operational' || n.status === 'degraded').length;
  const posture = data.route_posture ? data.route_posture.status.toUpperCase() : 'STANDBY';
  el.innerHTML = [
    `QUORUM:${quorum}/3 ACCEPT`,
    `FAILOVER:${posture}`,
    'NEXT_POLL:T-300',
  ].join('<br>');
}

function renderClock(data) {
  const clockEl = document.getElementById('clock-display');
  const runEl = document.getElementById('run-label');
  const countdownEl = document.getElementById('countdown-label');

  if (clockEl) {
    clockEl.textContent = startTimeLabel();
  }
  if (runEl) runEl.textContent = elapsed();
  if (countdownEl) {
    const ts = data ? data.timestamp : null;
    if (ts) {
      const age = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      const next = Math.max(0, 300 - (age % 300));
      countdownEl.textContent = `T-${String(next).padStart(3, '0')}`;
    }
  }
}

function renderCodeReadout(data) {
  const el = document.getElementById('code-readout');
  if (!el) return;

  if (!data || !data.nodes) {
    el.textContent = 'CODE:378';
    return;
  }

  const statuses = data.nodes.map(n => n.status);
  const anyOutage = statuses.some(s => s === 'outage');
  const anyDegraded = statuses.some(s => s === 'degraded');

  if (anyOutage) el.textContent = 'CODE:911';
  else if (anyDegraded) el.textContent = 'CODE:601';
  else el.textContent = 'CODE:378';
}

function renderSysAppeal(nodes, routePosture) {
  const el = document.getElementById('sys-appeal');
  if (!el) return;

  const posture = routePosture ? routePosture.status.toUpperCase() : 'STANDBY';
  const lines = [
    '<span class="code">CODE:378</span>',
    'FILE:MAGI_SYS<br>',
    'EXTENTION:6008<br>',
    'EX_MODE:OFF<br>',
    'PRIORITY:AAA<br><br>',
    'NODE:3 BODY<br>',
    'JUDGE:ACTIVE<br>',
    `ROUTE:${posture}`,
  ];

  el.innerHTML = lines.join('');
}

function renderRemote() {
  const statusEl = document.getElementById('remote-status');
  if (statusEl) {
    const soundStatus = magiSound.isArmed() ? 'SOUND:ARMED' : 'SOUND:SAFE';
    if (deliberationState.loading) statusEl.textContent = `MAGI SYSTEM 審議中... // TYPE-666 FIREWALL // ${soundStatus}`;
    else if (deliberationState.error) statusEl.textContent = `ERROR: ${deliberationState.error}`;
    else if (deliberationState.nodes.length > 0) statusEl.textContent = `RESULT SEALED // PRESS ASK TO REVIEW CASE // ${soundStatus}`;
    else statusEl.textContent = `READY // MODE:${deliberationState.mode.toUpperCase()} // ${soundStatus}`;
  }

  document.querySelectorAll('[data-remote-mode]').forEach(button => {
    button.classList.toggle('is-selected', button.dataset.remoteMode === deliberationState.mode);
  });

  const keyWrap = document.getElementById('remote-key-wrap');
  if (keyWrap) keyWrap.hidden = deliberationState.mode !== 'byo';

  document.querySelectorAll('[data-provider-preset]').forEach(button => {
    button.classList.toggle('is-selected', button.dataset.providerPreset === deliberationState.providerPreset);
  });

  const resultsEl = document.getElementById('remote-results');
  if (resultsEl) resultsEl.hidden = deliberationState.nodes.length === 0;

  const nodesEl = document.getElementById('remote-nodes');
  if (nodesEl && deliberationState.nodes.length > 0) {
    nodesEl.innerHTML = deliberationState.nodes.map(n => {
      const color = n.position === 'accept' ? 'var(--card)' : n.position === 'reject' ? 'var(--red-hot)' : 'var(--orange-hot)';
      return `<div class="remote-node-result">
        <span class="remote-node-name" style="color:${color}">${n.node_name} (${n.node_role})</span>
        <span class="remote-node-pos" style="color:${color}">${n.label}</span>
        <span class="remote-node-reason">${n.reasoning}</span>
      </div>`;
    }).join('');
  }

  const judgmentEl = document.getElementById('remote-judgment');
  if (judgmentEl && deliberationState.judgment) {
    const j = deliberationState.judgment;
    judgmentEl.innerHTML = `<span class="remote-verdict">${String(j.verdict).toUpperCase()} // ${String(j.convergence).toUpperCase()}</span>`;
  }
}

function render(data) {
  const nodes = data ? data.nodes || [] : [];
  const statuses = nodes.map(n => n.status || 'unknown');
  const routePosture = data ? data.route_posture || getRoutePosture(nodes) : getRoutePosture([]);

  renderNodes(nodes);
  renderStamp(statuses);
  renderStrip(statuses);
  renderRightInfo(nodes, routePosture);
  renderJudgmentLog(data || { nodes: [] });
  renderEventLog(data ? data.events || [] : []);
  renderCodeReadout(data);
  renderSysAppeal(nodes, routePosture);
  renderRemote();

  if (data && data.timestamp) {
    const pollEl = document.getElementById('poll-timestamp');
    if (pollEl) pollEl.textContent = `LAST POLL ${formatTimestamp(data.timestamp)}`;
  }

  renderClock(data);
}

async function fetchStatus() {
  try {
    const resp = await fetch('status.json', { cache: 'no-store' });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function refresh() {
  const data = await fetchStatus();
  lastStatusData = data;
  render(data);
}

async function submitDeliberation(question) {
  if (deliberationState.loading) return;

  let cue = '';
  deliberationState.loading = true;
  deliberationState.question = question || '';
  deliberationState.nodes = [];
  deliberationState.judgment = null;
  deliberationState.case = null;
  deliberationState.error = '';
  render(lastStatusData);
  startDeliberationCue();

  try {
    if (deliberationState.mode === 'fixture') {
      await wait(FIXTURE_DELIBERATION_DELAY_MS);
      setDeliberationCase(await loadFixtureCase());
      cue = judgmentCue(deliberationState.judgment);
    } else if (deliberationState.mode === 'byo') {
      if (!question.trim()) throw new Error('question required');
      const callModel = createNodeModelRouter(buildByoModelConfig());
      setDeliberationCase(await runDeliberationCase({ question, callModel }));
      cue = judgmentCue(deliberationState.judgment);
    } else {
      if (!question.trim()) throw new Error('question required');
      const resp = await fetch(`${DELIBERATION_PROXY}/api/deliberate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, max_rounds: 2 }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error?.message || `proxy ${resp.status}`);
      setDeliberationCase(result.case);
      cue = judgmentCue(deliberationState.judgment);
    }
  } catch (e) {
    deliberationState.nodes = [];
    deliberationState.judgment = { verdict: 'failed', code: 'ERROR', detail: e.message, convergence: 'partial' };
    deliberationState.error = friendlyModelError(e.message);
    cue = 'error';
  } finally {
    stopDeliberationCue();
    deliberationState.loading = false;
  }
  render(lastStatusData);
  if (cue) magiSound.play(cue);
}

function setupRemote() {
  const open = document.getElementById('remote-open');
  const close = document.getElementById('remote-close');
  const overlay = document.getElementById('remote-overlay');
  const submit = document.getElementById('remote-submit');
  const question = document.getElementById('remote-question');
  const key = document.getElementById('remote-api-key');
  const baseUrl = document.getElementById('remote-base-url');
  const model = document.getElementById('remote-model');
  const nodeConfig = document.getElementById('remote-node-config');
  const exportButton = document.getElementById('remote-export');
  const importButton = document.getElementById('remote-import');
  const importFile = document.getElementById('remote-import-file');

  const openRemote = () => {
    if (!overlay) return;
    overlay.hidden = false;
    renderRemote();
  };

  const armAndOpenRemote = async () => {
    await magiSound.unlock();
    magiSound.play('access');
    openRemote();
  };

  const closeRemote = () => {
    magiSound.play('access');
    if (overlay) overlay.hidden = true;
  };

  const doSubmit = async () => {
    await magiSound.unlock();
    if (question) {
      const validationError = validateByoSubmission(question.value);
      if (validationError) {
        deliberationState.error = validationError;
        renderRemote();
        magiSound.play('error');
        return;
      }
      const submittedQuestion = question.value;
      question.value = '';
      closeRemote();
      submitDeliberation(submittedQuestion);
    }
  };

  if (open) open.addEventListener('click', armAndOpenRemote);
  if (window.location.hash === '#remote') window.setTimeout(openRemote, 0);
  if (close) close.addEventListener('click', closeRemote);
  if (overlay) {
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeRemote();
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeRemote();
  });

  if (submit) submit.addEventListener('click', doSubmit);
  document.querySelectorAll('[data-remote-mode]').forEach(button => {
    button.addEventListener('click', () => {
      deliberationState.mode = button.dataset.remoteMode;
      magiSound.play('access');
      renderRemote();
    });
  });
  if (key) key.addEventListener('input', () => { deliberationState.apiKey = key.value; deliberationState.error = ''; renderRemote(); });
  if (baseUrl) baseUrl.addEventListener('input', () => { deliberationState.baseUrl = baseUrl.value; deliberationState.providerPreset = 'custom'; deliberationState.error = ''; renderRemote(); });
  if (model) model.addEventListener('input', () => { deliberationState.model = model.value; deliberationState.providerPreset = 'custom'; deliberationState.error = ''; renderRemote(); });
  if (nodeConfig) nodeConfig.addEventListener('input', () => { deliberationState.nodeConfigText = nodeConfig.value; deliberationState.error = ''; renderRemote(); });
  document.querySelectorAll('[data-provider-preset]').forEach(button => {
    button.addEventListener('click', () => {
      applyProviderPreset(button.dataset.providerPreset, { baseUrl, model });
      magiSound.play('access');
    });
  });
  if (exportButton) exportButton.addEventListener('click', exportCase);
  if (importButton && importFile) importButton.addEventListener('click', () => importFile.click());
  if (importFile) importFile.addEventListener('change', importCase);
  if (question) {
    question.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        doSubmit();
      }
    });
  }
}

function exportCase() {
  if (!deliberationState.case) return;
  magiSound.play('access');
  const blob = new Blob([JSON.stringify(deliberationState.case, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deliberationState.case.case_id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importCase(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const caseFile = JSON.parse(text);
    if (!validateCase(caseFile)) throw new Error('invalid case file');
    deliberationState.error = '';
    setDeliberationCase(caseFile);
    render(lastStatusData);
    magiSound.play(judgmentCue(deliberationState.judgment));
  } catch (err) {
    deliberationState.error = err.message;
    renderRemote();
    magiSound.play('error');
  } finally {
    event.target.value = '';
  }
}

function startClock() {
  renderClock(null);
  setInterval(() => renderClock(null), 10000);
}

document.addEventListener('DOMContentLoaded', () => {
  fitTerminal();
  window.addEventListener('resize', fitTerminal);
  setupRemote();
  startClock();
  refresh();
  setInterval(refresh, 60000);
});
