export function createOpenAICompatibleClient({ apiKey, model = 'deepseek-v4-pro', baseUrl = 'https://api.deepseek.com', apiUrl, timeoutMs = 20000 } = {}) {
  return async function callModel({ system, user, maxTokens = 400 }) {
    if (!apiKey) throw new Error('OPENAI_COMPATIBLE_API_KEY missing');
    const url = apiUrl || `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
    let lastEmpty = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
            { role: 'system', content: system },
              { role: 'user', content: emptyRetryUser(user, attempt) },
            ],
            temperature: 0.2,
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
        }
        const json = await resp.json();
        const content = extractAssistantContent(json);
        if (content) return content;
        lastEmpty = summarizeEmptyResponse(json);
      } finally {
        clearTimeout(timeout);
      }
    }

    return JSON.stringify({
      position: 'deliberate',
      reasoning: `Provider returned no assistant content after retries (${lastEmpty || 'no choices returned'}). Treat this node as inconclusive and retry later.`,
      confidence: 0,
      artifacts: [],
    });
  };
}

export function extractAssistantContent(json) {
  const choice = json?.choices?.[0];
  const message = choice?.message || choice?.delta || {};
  const content = normalizeContent(message.content || choice?.text || json?.output_text);
  if (content) return content;
  return normalizeContent(message.reasoning_content);
}

function normalizeContent(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(part => {
      if (typeof part === 'string') return part;
      return part?.text || part?.content || part?.input_text || '';
    }).join('').trim();
  }
  return '';
}

function summarizeEmptyResponse(json) {
  const choice = json?.choices?.[0];
  const reason = choice?.finish_reason || choice?.finish_details?.type;
  const role = choice?.message?.role || choice?.delta?.role;
  return [`finish=${reason || 'unknown'}`, `role=${role || 'unknown'}`].join(' ');
}

function emptyRetryUser(user, attempt) {
  if (attempt === 0) return user;
  return `${user}\n\nPrevious provider response was empty. Return exactly one compact JSON object and no prose.`;
}

export const createDeepSeekClient = createOpenAICompatibleClient;

export function createNodeModelRouter(configs = {}) {
  const fallbackConfig = configs.default || configs;
  const clients = new Map();
  const queues = new Map();

  return function callNodeModel({ node, system, user, maxTokens }) {
    const nodeConfig = configs[node?.id] || fallbackConfig;
    const cacheKey = JSON.stringify({
      apiKey: nodeConfig?.apiKey || '',
      model: nodeConfig?.model || '',
      baseUrl: nodeConfig?.baseUrl || '',
      apiUrl: nodeConfig?.apiUrl || '',
    });
    if (!clients.has(cacheKey)) {
      clients.set(cacheKey, createOpenAICompatibleClient(nodeConfig));
    }
    const previous = queues.get(cacheKey) || Promise.resolve();
    const next = previous.then(() => clients.get(cacheKey)({ system, user, maxTokens }));
    queues.set(cacheKey, next.catch(() => {}));
    return next;
  };
}
