export function createOpenAICompatibleClient({ apiKey, model = 'deepseek-chat', baseUrl = 'https://api.deepseek.com/v1', apiUrl, timeoutMs = 20000 } = {}) {
  return async function callModel({ system, user, maxTokens = 400 }) {
    if (!apiKey) throw new Error('OPENAI_COMPATIBLE_API_KEY missing');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const url = apiUrl || `${String(baseUrl || '').replace(/\/$/, '')}/chat/completions`;
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
            { role: 'user', content: user },
          ],
          temperature: 0.7,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
      }
      const json = await resp.json();
      return json.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const createDeepSeekClient = createOpenAICompatibleClient;

export function createNodeModelRouter(configs = {}) {
  const fallbackConfig = configs.default || configs;
  const clients = new Map();

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
    return clients.get(cacheKey)({ system, user, maxTokens });
  };
}
