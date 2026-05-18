import { ACTION, CASE_STATUS, NODES, ROUND_TYPE, buildArtifact, collectJudgment, fallbackCrossReviewMessage, fallbackIndependentMessage, parseCrossReviewMessage, parseIndependentMessage } from './protocol.js';

let caseCounter = 0;

export async function runDeliberationCase({ question, callModel, maxRounds = 2, now = new Date() }) {
  const trimmed = String(question || '').trim();
  if (!trimmed) throw new Error('Question is required.');
  if (typeof callModel !== 'function') throw new Error('callModel is required.');

  const caseFile = {
    case_id: createCaseId(now),
    question: trimmed,
    status: CASE_STATUS.RUNNING,
    mode: 'decision_convergence',
    created_at: now.toISOString(),
    rounds: [],
    judgment: null,
  };

  const round1Messages = await Promise.all(NODES.map(async node => {
    try {
      const raw = await callModel({ node, system: independentPrompt(node), user: trimmed, maxTokens: 600 });
      return parseIndependentMessage(node, raw);
    } catch (err) {
      return fallbackIndependentMessage(node, '', err.message);
    }
  }));

  caseFile.rounds.push({ round: 1, type: ROUND_TYPE.INDEPENDENT, messages: round1Messages });

  let finalMessages = round1Messages.map(m => ({
    ...m,
    position_before: m.position,
    position_after: m.position,
    action: m.action || ACTION.HOLD,
    critique: m.reasoning,
    revision: '',
  }));

  if (maxRounds >= 2) {
    const peerBrief = buildPeerBrief(round1Messages);
    finalMessages = await Promise.all(NODES.map(async node => {
      const before = round1Messages.find(m => m.node === node.id)?.position || 'deliberate';
      try {
        const raw = await callModel({ node, system: crossReviewPrompt(node, before), user: `${trimmed}\n\nPEER BRIEF:\n${peerBrief}`, maxTokens: 700 });
        return parseCrossReviewMessage(node, raw, before);
      } catch (err) {
        return fallbackCrossReviewMessage(node, before, '', err.message);
      }
    }));
    caseFile.rounds.push({ round: 2, type: ROUND_TYPE.CROSS_REVIEW, messages: finalMessages });
  }

  const judgment = collectJudgment(finalMessages);
  judgment.artifact = buildArtifact(trimmed, judgment, finalMessages);
  judgment.artifact.trace_ref = `${caseFile.case_id}#rounds`;
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

function crossReviewPrompt(node, before) {
  return `You are ${node.name}, one of the three MAGI bio-computers running Dr. Naoko Akagi's Personality Transplant OS. Aspect: ${node.role}. Your Round 1 position was ${before}. Read the peer brief as the recorded positions of the other MAGI machines. Do not seek consensus for politeness. Remember the core failure mode: even if the machines appear aligned, one partition may preserve a deeper loyalty than quorum. MELCHIOR preserves mechanism. BALTHASAR preserves the daughter/child. CASPER preserves the lover/private desire. Hold your vote unless another machine exposes a flaw your own partition would recognize. Return ONLY compact JSON: {"action":"hold|revise|no_go","position_after":"accept|reject|deliberate","target":null,"critique":"<=120 CJK chars or <=80 English words","revision":"<=80 CJK chars or <=50 English words"}. No markdown. No extra keys.`;
}

function buildPeerBrief(messages) {
  return messages.map(m => `${m.node}: position=${m.position}; confidence=${m.confidence}; reason=${m.reasoning}`).join('\n');
}
