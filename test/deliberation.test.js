import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDeliberationCase } from '../src/deliberation/orchestrator.js';
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
    const parsed = parseIndependentMessage({ id: 'melchior', name: 'MELCHIOR-1', role: '科学者' }, 'not json');
    assert.equal(parsed.action, ACTION.ERROR);
    assert.equal(parsed.position, POSITION.DELIBERATE);
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

  it('degrades malformed model output instead of crashing', async () => {
    const outputs = ['not json', 'not json', 'not json', 'not json', 'not json', 'not json'];
    const callModel = async () => outputs.shift();
    const caseFile = await runDeliberationCase({ question: 'Proceed?', callModel });
    assert.equal(caseFile.status, CASE_STATUS.FAILED);
    assert.equal(caseFile.judgment.verdict, VERDICT.FAILED);
  });
});
