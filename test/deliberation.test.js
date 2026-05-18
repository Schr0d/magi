import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDeliberationCase } from '../src/deliberation/orchestrator.js';
import { createNodeModelRouter, extractAssistantContent } from '../src/deliberation/model-client.js';
import { ACTION, CASE_STATUS, CONVERGENCE, POSITION, VERDICT, buildArtifact, collectJudgment, parseIndependentMessage, validateCase } from '../src/deliberation/protocol.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function msg(node, position, action = ACTION.HOLD) {
  return { node, position_after: position, action, critique: `${node} ${position}` };
}

describe('deliberation convergence', () => {
  const cases = [
    ['3 accept', [msg('a', POSITION.ACCEPT), msg('b', POSITION.ACCEPT), msg('c', POSITION.ACCEPT)], CASE_STATUS.RESOLVED, VERDICT.ACCEPTED, CONVERGENCE.UNANIMOUS],
    ['3 reject', [msg('a', POSITION.REJECT), msg('b', POSITION.REJECT), msg('c', POSITION.REJECT)], CASE_STATUS.RESOLVED, VERDICT.REJECTED, CONVERGENCE.UNANIMOUS],
    ['3 deliberate', [msg('a', POSITION.DELIBERATE), msg('b', POSITION.DELIBERATE), msg('c', POSITION.DELIBERATE)], CASE_STATUS.RESOLVED, VERDICT.DELIBERATE, CONVERGENCE.DEADLOCK],
    ['2 accept', [msg('a', POSITION.ACCEPT), msg('b', POSITION.ACCEPT), msg('c', POSITION.REJECT)], CASE_STATUS.RESOLVED, VERDICT.ACCEPTED, CONVERGENCE.MAJORITY_WITH_DISSENT],
    ['2 reject', [msg('a', POSITION.REJECT), msg('b', POSITION.REJECT), msg('c', POSITION.ACCEPT)], CASE_STATUS.RESOLVED, VERDICT.REJECTED, CONVERGENCE.MAJORITY_WITH_DISSENT],
    ['1-1-1', [msg('a', POSITION.ACCEPT), msg('b', POSITION.REJECT), msg('c', POSITION.DELIBERATE)], CASE_STATUS.RESOLVED, VERDICT.DELIBERATE, CONVERGENCE.DEADLOCK],
    ['no-go blocks', [msg('a', POSITION.ACCEPT), msg('b', POSITION.REJECT, ACTION.NO_GO), msg('c', POSITION.ACCEPT)], CASE_STATUS.NO_GO, VERDICT.NO_GO, CONVERGENCE.BLOCKED],
    ['partial majority', [msg('a', POSITION.ACCEPT), msg('b', POSITION.ACCEPT), msg('c', POSITION.DELIBERATE, ACTION.ERROR)], CASE_STATUS.PARTIAL, VERDICT.ACCEPTED, CONVERGENCE.PARTIAL],
    ['failed quorum', [msg('a', POSITION.ACCEPT, ACTION.ERROR), msg('b', POSITION.ACCEPT, ACTION.ERROR), msg('c', POSITION.ACCEPT, ACTION.ERROR)], CASE_STATUS.FAILED, VERDICT.FAILED, CONVERGENCE.PARTIAL],
  ];

  for (const [name, messages, status, verdict, convergence] of cases) {
    it(name, () => {
      const result = collectJudgment(messages);
      assert.equal(result.status, status);
      assert.equal(result.verdict, verdict);
      assert.equal(result.convergence, convergence);
    });
  }
});

describe('protocol parsing and artifacts', () => {
  it('parses valid independent JSON', () => {
    const parsed = parseIndependentMessage({ id: 'melchior', name: 'MELCHIOR-1', role: '科学者' }, '{"position":"accept","reasoning":"yes","confidence":0.9,"artifacts":[]}');
    assert.equal(parsed.position, POSITION.ACCEPT);
    assert.equal(parsed.confidence, 0.9);
  });

  it('turns malformed output into an error message', () => {
    const parsed = parseIndependentMessage({ id: 'melchior', name: 'MELCHIOR-1', role: '科学者' }, '');
    assert.equal(parsed.action, ACTION.ERROR);
    assert.equal(parsed.position, POSITION.DELIBERATE);
  });

  it('uses natural language model output as reasoning when JSON is missing', () => {
    const parsed = parseIndependentMessage({ id: 'balthasar', name: 'BALTHASAR-2', role: '母' }, 'I accept this because the user impact is low.');
    assert.equal(parsed.position, POSITION.ACCEPT);
    assert.equal(parsed.reasoning, 'I accept this because the user impact is low.');
    assert.equal(parsed.action, undefined);
  });

  it('salvages reasoning from truncated JSON output', () => {
    const raw = '{"position":"accept","reasoning":"偶尔吃一次肯德基是可接受的小奖励。","confidence":0.';
    const parsed = parseIndependentMessage({ id: 'balthasar', name: 'BALTHASAR-2', role: '母' }, raw);
    assert.equal(parsed.position, POSITION.ACCEPT);
    assert.equal(parsed.reasoning, '偶尔吃一次肯德基是可接受的小奖励。');
    assert.equal(parsed.confidence, 0.4);
  });

  it('builds deterministic artifact', () => {
    const judgment = collectJudgment([msg('melchior', POSITION.ACCEPT), msg('balthasar', POSITION.ACCEPT), msg('casper', POSITION.ACCEPT)]);
    const artifact = buildArtifact('question?', judgment, [msg('melchior', POSITION.ACCEPT)]);
    assert.match(artifact.summary, /accepted/);
    assert.equal(typeof artifact.recommendation, 'string');
  });

  it('validates sample fixture', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'magi-case-sample.json'), 'utf-8');
    assert.equal(validateCase(JSON.parse(raw)), true);
  });
});

describe('orchestrator', () => {
  it('runs two rounds with mocked model client', async () => {
    const outputs = [
      '{"position":"accept","reasoning":"r1","confidence":0.8,"artifacts":[]}',
      '{"position":"deliberate","reasoning":"r1","confidence":0.6,"artifacts":[]}',
      '{"position":"accept","reasoning":"r1","confidence":0.7,"artifacts":[]}',
      '{"action":"hold","position_after":"accept","critique":"ok","revision":""}',
      '{"action":"revise","position_after":"accept","critique":"ok","revision":"warn"}',
      '{"action":"hold","position_after":"accept","critique":"ok","revision":""}'
    ];
    const callModel = async () => outputs.shift();
    const caseFile = await runDeliberationCase({ question: 'Proceed?', callModel, now: new Date('2026-05-11T00:00:00.000Z') });
    assert.equal(caseFile.rounds.length, 2);
    assert.equal(caseFile.status, CASE_STATUS.RESOLVED);
    assert.equal(caseFile.judgment.verdict, VERDICT.ACCEPTED);
    assert.equal(validateCase(caseFile), true);
  });

  it('returns no_go when one cross-review blocks', async () => {
    const outputs = [
      '{"position":"accept","reasoning":"r1","confidence":0.8,"artifacts":[]}',
      '{"position":"reject","reasoning":"r1","confidence":0.6,"artifacts":[]}',
      '{"position":"accept","reasoning":"r1","confidence":0.7,"artifacts":[]}',
      '{"action":"hold","position_after":"accept","critique":"ok","revision":""}',
      '{"action":"no_go","position_after":"reject","critique":"blocking flaw","revision":""}',
      '{"action":"hold","position_after":"accept","critique":"ok","revision":""}'
    ];
    const callModel = async () => outputs.shift();
    const caseFile = await runDeliberationCase({ question: 'Proceed?', callModel });
    assert.equal(caseFile.status, CASE_STATUS.NO_GO);
    assert.equal(caseFile.judgment.verdict, VERDICT.NO_GO);
  });

  it('degrades empty model output instead of crashing', async () => {
    const outputs = ['', '', '', '', '', ''];
    const callModel = async () => outputs.shift();
    const caseFile = await runDeliberationCase({ question: 'Proceed?', callModel });
    assert.equal(caseFile.status, CASE_STATUS.FAILED);
    assert.equal(caseFile.judgment.verdict, VERDICT.FAILED);
  });
});

describe('model router', () => {
  it('serializes calls sharing the same provider config', async () => {
    const originalFetch = globalThis.fetch;
    let active = 0;
    let peak = 0;
    const seenModels = [];
    const seenUrls = [];

    globalThis.fetch = async (url, options) => {
      active += 1;
      peak = Math.max(peak, active);
      seenUrls.push(String(url));
      seenModels.push(JSON.parse(options.body).model);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    };

    try {
      const callModel = createNodeModelRouter({ default: { apiKey: 'test-key' } });
      await Promise.all(['melchior', 'balthasar', 'casper'].map(id => (
        callModel({ node: { id }, system: 'system', user: 'user' })
      )));
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(peak, 1);
    assert.deepEqual(seenModels, ['deepseek-v4-pro', 'deepseek-v4-pro', 'deepseek-v4-pro']);
    assert.deepEqual(seenUrls, [
      'https://api.deepseek.com/chat/completions',
      'https://api.deepseek.com/chat/completions',
      'https://api.deepseek.com/chat/completions',
    ]);
  });

  it('allows per-node JSON override configs to run independently', async () => {
    const originalFetch = globalThis.fetch;
    const seen = [];

    globalThis.fetch = async (url, options) => {
      seen.push({ url: String(url), model: JSON.parse(options.body).model });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    };

    try {
      const callModel = createNodeModelRouter({
        default: { apiKey: 'global-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' },
        balthasar: { apiKey: 'node-key', baseUrl: 'https://node.example', model: 'node-model' },
      });
      await callModel({ node: { id: 'melchior' }, system: 'system', user: 'user' });
      await callModel({ node: { id: 'balthasar' }, system: 'system', user: 'user' });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(seen, [
      { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-pro' },
      { url: 'https://node.example/chat/completions', model: 'node-model' },
    ]);
  });

  it('extracts assistant text from common OpenAI-compatible response shapes', () => {
    assert.equal(extractAssistantContent({ choices: [{ message: { content: ' ok ' } }] }), 'ok');
    assert.equal(extractAssistantContent({ choices: [{ text: ' text ' }] }), 'text');
    assert.equal(extractAssistantContent({ output_text: ' output ' }), 'output');
    assert.equal(extractAssistantContent({ choices: [{ message: { content: [{ text: 'array' }] } }] }), 'array');
  });

  it('retries when provider returns empty assistant content', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = async () => {
      calls += 1;
      const content = calls === 1 ? '' : '{"position":"accept","reasoning":"ok","confidence":1,"artifacts":[]}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    };

    try {
      const callModel = createNodeModelRouter({ default: { apiKey: 'test-key' } });
      const result = await callModel({ node: { id: 'melchior' }, system: 'system', user: 'user' });
      assert.match(result, /"position":"accept"/);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns a valid inconclusive JSON message after repeated empty responses', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }), { status: 200 });
    };

    try {
      const callModel = createNodeModelRouter({ default: { apiKey: 'test-key' } });
      const result = JSON.parse(await callModel({ node: { id: 'balthasar' }, system: 'system', user: 'user' }));
      assert.equal(result.position, 'deliberate');
      assert.match(result.reasoning, /no assistant content/i);
      assert.equal(result.confidence, 0);
      assert.equal(calls, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
