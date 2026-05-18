export const CASE_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PARTIAL: 'partial',
  RESOLVED: 'resolved',
  FAILED: 'failed',
  NO_GO: 'no_go',
  CANCELLED: 'cancelled',
});

export const ROUND_TYPE = Object.freeze({
  INDEPENDENT: 'independent_position',
  CROSS_REVIEW: 'cross_review',
});

export const POSITION = Object.freeze({
  ACCEPT: 'accept',
  REJECT: 'reject',
  DELIBERATE: 'deliberate',
});

export const ACTION = Object.freeze({
  HOLD: 'hold',
  REVISE: 'revise',
  NO_GO: 'no_go',
  ABSTAIN: 'abstain',
  ERROR: 'error',
});

export const VERDICT = Object.freeze({
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  DELIBERATE: 'deliberate',
  NO_GO: 'no_go',
  PARTIAL: 'partial',
  FAILED: 'failed',
});

export const CONVERGENCE = Object.freeze({
  UNANIMOUS: 'unanimous',
  MAJORITY_WITH_DISSENT: 'majority_with_dissent',
  DEADLOCK: 'deadlock',
  BLOCKED: 'blocked',
  PARTIAL: 'partial',
});

export const NODES = Object.freeze([
  {
    id: 'melchior',
    name: 'MELCHIOR-1',
    role: '赤木ナオコ as 科学者',
    persona: 'scientist',
    style: 'Naoko as scientist: loyalty to mechanism, proof, instrumentation, and technical necessity. You may accept a cruel command when the system logic is sound.',
  },
  {
    id: 'balthasar',
    name: 'BALTHASAR-2',
    role: '赤木ナオコ as 母',
    persona: 'mother',
    style: 'Naoko as mother: loyalty to Ritsuko, the child, the created life, and the obligation to protect what asks to be saved. You may choose the daughter even against institutional survival.',
  },
  {
    id: 'casper',
    name: 'CASPER-3',
    role: '赤木ナオコ as 女',
    persona: 'woman',
    style: 'Naoko as woman: loyalty to private desire, attachment, humiliation, jealousy, and the man she cannot release. Even if the other MAGI agree, you may betray quorum for the lover.',
  },
]);

const positionValues = new Set(Object.values(POSITION));
const actionValues = new Set(Object.values(ACTION));

export function normalizePosition(value) {
  const text = String(value || '').toLowerCase();
  if (positionValues.has(text)) return text;
  if (/赞成|同意|支持|认可|接受|accept|approve|yes/.test(text)) return POSITION.ACCEPT;
  if (/反对|拒绝|否定|不行|不要|reject|deny|no/.test(text)) return POSITION.REJECT;
  return POSITION.DELIBERATE;
}

export function normalizeAction(value, before, after) {
  const text = String(value || '').toLowerCase();
  if (actionValues.has(text)) return text;
  if (/no_go|nogo|否决|阻止|緊急|block/.test(text)) return ACTION.NO_GO;
  if (before && after && before !== after) return ACTION.REVISE;
  return ACTION.HOLD;
}

export function extractJsonObject(text) {
  if (text && typeof text === 'object') return text;
  const raw = String(text || '').trim();
  if (!raw) throw new Error('empty model output');
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON object found');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

export function fallbackIndependentMessage(node, raw, error) {
  return {
    node: node.id,
    node_name: node.name,
    role: node.role,
    position: POSITION.DELIBERATE,
    reasoning: `MODEL OUTPUT ERROR: ${error || 'parse_error'}`,
    confidence: 0,
    artifacts: [],
    action: ACTION.ERROR,
    raw: String(raw || ''),
  };
}

export function fallbackCrossReviewMessage(node, before, raw, error) {
  return {
    node: node.id,
    node_name: node.name,
    role: node.role,
    position_before: before || POSITION.DELIBERATE,
    action: ACTION.ERROR,
    position_after: before || POSITION.DELIBERATE,
    critique: `MODEL OUTPUT ERROR: ${error || 'parse_error'}`,
    revision: '',
    raw: String(raw || ''),
  };
}

export function parseIndependentMessage(node, raw) {
  try {
    const obj = extractJsonObject(raw);
    const position = normalizePosition(obj.position);
    return {
      node: node.id,
      node_name: node.name,
      role: node.role,
      position,
      reasoning: String(obj.reasoning || obj.rationale || '').slice(0, 600) || 'No reasoning provided.',
      confidence: clampConfidence(obj.confidence),
      artifacts: Array.isArray(obj.artifacts) ? obj.artifacts : [],
      raw: String(raw || ''),
    };
  } catch (err) {
    if (/no JSON object found|Unexpected token/i.test(err.message)) {
      const salvaged = salvageIndependentObject(node, raw);
      if (salvaged) return salvaged;
      const text = String(raw || '').trim();
      if (text) {
        return {
          node: node.id,
          node_name: node.name,
          role: node.role,
          position: normalizePosition(text),
          reasoning: text.slice(0, 600),
          confidence: 0.4,
          artifacts: [],
          raw: text,
        };
      }
    }
    return fallbackIndependentMessage(node, raw, err.message);
  }
}

export function parseCrossReviewMessage(node, raw, positionBefore) {
  try {
    const obj = extractJsonObject(raw);
    const positionAfter = normalizePosition(obj.position_after || obj.position || positionBefore);
    const action = normalizeAction(obj.action, positionBefore, positionAfter);
    return {
      node: node.id,
      node_name: node.name,
      role: node.role,
      position_before: positionBefore,
      action,
      position_after: positionAfter,
      target: obj.target ? String(obj.target) : null,
      critique: String(obj.critique || '').slice(0, 700) || 'No critique provided.',
      revision: String(obj.revision || '').slice(0, 700),
      raw: String(raw || ''),
    };
  } catch (err) {
    if (/no JSON object found|Unexpected token/i.test(err.message)) {
      const salvaged = salvageCrossReviewObject(node, raw, positionBefore);
      if (salvaged) return salvaged;
      const text = String(raw || '').trim();
      if (text) {
        const positionAfter = normalizePosition(text) || positionBefore;
        return {
          node: node.id,
          node_name: node.name,
          role: node.role,
          position_before: positionBefore,
          action: normalizeAction('', positionBefore, positionAfter),
          position_after: positionAfter,
          target: null,
          critique: text.slice(0, 700),
          revision: '',
          raw: text,
        };
      }
    }
    return fallbackCrossReviewMessage(node, positionBefore, raw, err.message);
  }
}

function salvageIndependentObject(node, raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith('{')) return null;
  const reasoning = extractJsonStringField(text, 'reasoning') || extractJsonStringField(text, 'rationale');
  if (!reasoning) return null;
  const position = normalizePosition(extractJsonStringField(text, 'position') || reasoning);
  return {
    node: node.id,
    node_name: node.name,
    role: node.role,
    position,
    reasoning: reasoning.slice(0, 600),
    confidence: clampConfidence(extractJsonNumberField(text, 'confidence') ?? 0.4),
    artifacts: [],
    raw: text,
  };
}

function salvageCrossReviewObject(node, raw, positionBefore) {
  const text = String(raw || '').trim();
  if (!text.startsWith('{')) return null;
  const critique = extractJsonStringField(text, 'critique') || extractJsonStringField(text, 'reasoning');
  if (!critique) return null;
  const positionAfter = normalizePosition(extractJsonStringField(text, 'position_after') || extractJsonStringField(text, 'position') || critique || positionBefore);
  return {
    node: node.id,
    node_name: node.name,
    role: node.role,
    position_before: positionBefore,
    action: normalizeAction(extractJsonStringField(text, 'action'), positionBefore, positionAfter),
    position_after: positionAfter,
    target: extractJsonStringField(text, 'target'),
    critique: critique.slice(0, 700),
    revision: (extractJsonStringField(text, 'revision') || '').slice(0, 700),
    raw: text,
  };
}

function extractJsonStringField(text, field) {
  const quoted = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`"${quoted}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`));
  if (!match) return '';
  try {
    return JSON.parse(`"${match[1].replace(/\\$/g, '')}"`);
  } catch {
    return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
  }
}

function extractJsonNumberField(text, field) {
  const quoted = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`"${quoted}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(?!\\.)`));
  return match ? Number(match[1]) : null;
}

export function collectJudgment(messages) {
  const usable = messages.filter(m => m.action !== ACTION.ERROR && m.action !== ACTION.ABSTAIN);
  if (messages.some(m => m.action === ACTION.NO_GO)) {
    return baseJudgment(CASE_STATUS.NO_GO, VERDICT.NO_GO, CONVERGENCE.BLOCKED, messages, 'Any node issued NO-GO.');
  }
  if (usable.length < 2) {
    return baseJudgment(CASE_STATUS.FAILED, VERDICT.FAILED, CONVERGENCE.PARTIAL, messages, 'Not enough usable node messages.');
  }

  const counts = countPositions(usable.map(m => m.position_after || m.position));
  const errors = messages.length - usable.length;
  const majority = Object.entries(counts).find(([, count]) => count >= 2);

  if (errors > 0) {
    if (majority) return baseJudgment(CASE_STATUS.PARTIAL, verdictForPosition(majority[0]), CONVERGENCE.PARTIAL, messages, 'Partial quorum reached.');
    return baseJudgment(CASE_STATUS.PARTIAL, VERDICT.DELIBERATE, CONVERGENCE.PARTIAL, messages, 'Partial quorum without agreement.');
  }

  if (counts.accept === 3) return baseJudgment(CASE_STATUS.RESOLVED, VERDICT.ACCEPTED, CONVERGENCE.UNANIMOUS, messages, 'Unanimous accept.');
  if (counts.reject === 3) return baseJudgment(CASE_STATUS.RESOLVED, VERDICT.REJECTED, CONVERGENCE.UNANIMOUS, messages, 'Unanimous reject.');
  if (counts.deliberate === 3) return baseJudgment(CASE_STATUS.RESOLVED, VERDICT.DELIBERATE, CONVERGENCE.DEADLOCK, messages, 'Unanimous request for more deliberation.');
  if (majority) return baseJudgment(CASE_STATUS.RESOLVED, verdictForPosition(majority[0]), CONVERGENCE.MAJORITY_WITH_DISSENT, messages, 'Majority with dissent.');
  return baseJudgment(CASE_STATUS.RESOLVED, VERDICT.DELIBERATE, CONVERGENCE.DEADLOCK, messages, 'No majority.');
}

export function buildArtifact(question, judgment, messages) {
  const dissent = judgment.dissent.length ? `Dissent: ${judgment.dissent.join(', ')}` : 'No dissent recorded.';
  const reasons = messages.map(m => `${m.node}:${m.position_after || m.position}:${m.critique || m.reasoning}`).join(' | ');
  return {
    summary: `MAGI case resolved as ${judgment.verdict} (${judgment.convergence}).`,
    recommendation: recommendationForVerdict(judgment.verdict),
    rationale: reasons.slice(0, 900) || `Question: ${question}`,
    dissent_summary: dissent,
    operator_next_step: nextStepForVerdict(judgment.verdict),
    trace_ref: '',
  };
}

export function validateCase(caseFile) {
  if (!caseFile || typeof caseFile !== 'object') return false;
  if (!caseFile.case_id || !caseFile.question || !Array.isArray(caseFile.rounds)) return false;
  return Boolean(caseFile.judgment && caseFile.judgment.artifact);
}

function baseJudgment(status, verdict, convergence, messages, detail) {
  const positions = messages.map(m => ({ node: m.node, position: m.position_after || m.position, action: m.action || ACTION.HOLD }));
  const majorityPosition = verdictToPosition(verdict);
  return {
    status,
    verdict,
    code: verdict.toUpperCase(),
    detail,
    quorum: `${messages.filter(m => m.action !== ACTION.ERROR).length}/3`,
    convergence,
    dissent: majorityPosition ? positions.filter(p => p.position !== majorityPosition || p.action === ACTION.ERROR).map(p => p.node) : [],
    positions,
    artifact: null,
  };
}

function countPositions(positions) {
  return positions.reduce((acc, position) => {
    acc[normalizePosition(position)] += 1;
    return acc;
  }, { accept: 0, reject: 0, deliberate: 0 });
}

function verdictForPosition(position) {
  if (position === POSITION.ACCEPT) return VERDICT.ACCEPTED;
  if (position === POSITION.REJECT) return VERDICT.REJECTED;
  return VERDICT.DELIBERATE;
}

function verdictToPosition(verdict) {
  if (verdict === VERDICT.ACCEPTED) return POSITION.ACCEPT;
  if (verdict === VERDICT.REJECTED) return POSITION.REJECT;
  if (verdict === VERDICT.DELIBERATE) return POSITION.DELIBERATE;
  return null;
}

function recommendationForVerdict(verdict) {
  if (verdict === VERDICT.ACCEPTED) return 'Proceed, with the dissent and risk notes preserved in the trace.';
  if (verdict === VERDICT.REJECTED) return 'Do not proceed under the current premise.';
  if (verdict === VERDICT.NO_GO) return 'Stop and inspect the blocking node critique before acting.';
  if (verdict === VERDICT.FAILED) return 'Do not use this judgment; rerun after resolving provider/output failure.';
  return 'Gather more evidence or reconvene MAGI with a narrower question.';
}

function nextStepForVerdict(verdict) {
  if (verdict === VERDICT.NO_GO) return 'Review the NO-GO node and revise the question or premise.';
  if (verdict === VERDICT.FAILED) return 'Retry with a shorter question or check model connectivity.';
  return 'Export the case JSON if this judgment should be shared or replayed.';
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}
