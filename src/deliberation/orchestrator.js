import { CASE_STATUS, NODES, ROUND_TYPE, analyzeConvergence, buildArtifact, fallbackCrossReviewMessage, fallbackIndependentMessage, parseCrossReviewMessage, parseIndependentMessage } from './protocol.js';

let caseCounter = 0;

export async function runDeliberationCase({ question, callModel, maxRounds = 4, maxModelCalls, now = new Date() }) {
  const trimmed = String(question || '').trim();
  if (!trimmed) throw new Error('Question is required.');
  if (typeof callModel !== 'function') throw new Error('callModel is required.');
  const roundBudget = Math.max(1, Number(maxRounds) || 4);
  const callBudget = Math.max(NODES.length, Number(maxModelCalls) || roundBudget * NODES.length);

  const caseFile = {
    case_id: createCaseId(now),
    question: trimmed,
    status: CASE_STATUS.RUNNING,
    mode: 'decision_convergence',
    created_at: now.toISOString(),
    rounds: [],
    judgment: null,
  };

  let modelCalls = 0;
  const round1Messages = await Promise.all(NODES.map(async node => {
    modelCalls += 1;
    try {
      const raw = await callModel({ node, system: independentPrompt(node), user: trimmed, maxTokens: 600 });
      return parseIndependentMessage(node, raw);
    } catch (err) {
      return fallbackIndependentMessage(node, '', err.message);
    }
  }));

  caseFile.rounds.push({ round: 1, type: ROUND_TYPE.INDEPENDENT, messages: round1Messages });

  let convergence = analyzeConvergence(caseFile.rounds, { maxRounds: roundBudget, modelCalls, maxModelCalls: callBudget });

  while (!convergence.terminal && caseFile.rounds.length < roundBudget && modelCalls + NODES.length <= callBudget) {
    const previousRound = caseFile.rounds[caseFile.rounds.length - 1];
    const peerBrief = buildPeerBrief(previousRound.messages, previousRound.round);
    const nextRoundNumber = caseFile.rounds.length + 1;
    const messages = await Promise.all(NODES.map(async node => {
      modelCalls += 1;
      const before = findNodePosition(previousRound.messages, node.id);
      try {
        const raw = await callModel({
          node,
          system: crossReviewPrompt(node, before, previousRound.round),
          user: `${trimmed}\n\nPREVIOUS ROUND PEER BRIEF:\n${peerBrief}`,
          maxTokens: 700,
        });
        return parseCrossReviewMessage(node, raw, before);
      } catch (err) {
        return fallbackCrossReviewMessage(node, before, '', err.message);
      }
    }));
    caseFile.rounds.push({ round: nextRoundNumber, type: ROUND_TYPE.CROSS_REVIEW, messages });
    convergence = analyzeConvergence(caseFile.rounds, { maxRounds: roundBudget, modelCalls, maxModelCalls: callBudget });
  }

  if (!convergence.terminal) {
    convergence = analyzeConvergence(caseFile.rounds, { maxRounds: roundBudget, modelCalls, maxModelCalls: callBudget, budgetExhausted: true });
  }

  const finalMessages = caseFile.rounds[caseFile.rounds.length - 1].messages;
  const judgment = convergence.judgment;
  judgment.artifact = buildArtifact(trimmed, judgment, finalMessages);
  judgment.artifact.trace_ref = `${caseFile.case_id}#rounds`;
  caseFile.termination = convergence.termination;
  caseFile.judgment = judgment;
  caseFile.status = judgment.status;
  caseFile.completed_at = new Date().toISOString();
  return caseFile;
}

export function createCaseId(now = new Date()) {
  caseCounter += 1;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-');
  return `MAGI-${stamp}-${String(caseCounter).padStart(4, '0')}`;
}

function independentPrompt(node) {
  return `You are ${node.name}, one of the three MAGI bio-computers running Dr. Naoko Akagi's Personality Transplant OS. Aspect: ${node.role}. You are not a chatbot, advisor, or generic assistant. You are an autonomous voting computer in a three-machine decision system: MELCHIOR, BALTHASAR, and CASPER each reach an independent position, then the system resolves by quorum. The three machines are not a friendly panel; they are incompatible loyalties split from one person. MELCHIOR preserves mechanism. BALTHASAR preserves the daughter/child. CASPER preserves the lover/private desire. Stay loyal to your assigned Akagi aspect and do not average yourself into the other machines. Operating principle: ${node.style}. Return ONLY compact JSON: {"position":"accept|reject|deliberate","reasoning":"<=120 CJK chars or <=80 English words","confidence":0-1,"artifacts":[]}. No markdown. No extra keys.`;
}

function crossReviewPrompt(node, before, previousRoundNumber) {
  return `You are ${node.name}, one of the three MAGI bio-computers running Dr. Naoko Akagi's Personality Transplant OS. Aspect: ${node.role}. Your previous Round ${previousRoundNumber} position was ${before}. Read the peer brief as the recorded positions of the other MAGI machines from the previous round. Do not seek consensus for politeness. Remember the core failure mode: even if the machines appear aligned, one partition may preserve a deeper loyalty than quorum. MELCHIOR preserves mechanism. BALTHASAR preserves the daughter/child. CASPER preserves the lover/private desire. Hold only if your current position remains valid after reading the latest peer positions. Revise only when another partition exposes a flaw your partition recognizes. Do not oscillate for rhetorical balance. Return ONLY compact JSON: {"action":"hold|revise|no_go","position_after":"accept|reject|deliberate","target":null,"critique":"<=120 CJK chars or <=80 English words","revision":"<=80 CJK chars or <=50 English words"}. No markdown. No extra keys.`;
}

function buildPeerBrief(messages, roundNumber) {
  return messages.map(m => {
    const position = m.position_after || m.position;
    const action = m.action ? `; action=${m.action}` : '';
    const reason = m.critique || m.reasoning || '';
    return `round=${roundNumber}; ${m.node}: position=${position}${action}; reason=${reason}`;
  }).join('\n');
}

function findNodePosition(messages, nodeId) {
  const message = messages.find(m => m.node === nodeId);
  return message?.position_after || message?.position || 'deliberate';
}
