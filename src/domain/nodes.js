import { computeHealth, nodeStatus } from './health.js';

export function normalizeNode(rawComponents, incidents, nodeId) {
  const components = rawComponents || [];
  const status = nodeStatus(components, incidents);
  const health = computeHealth(components);
  return {
    id: nodeId,
    status,
    health,
    components,
    incidents: incidents || [],
    stale_since: null,
  };
}

export function applyStaleSince(node, staleThresholdMs) {
  if (!node.stale_since) return node;
  const age = Date.now() - new Date(node.stale_since).getTime();
  if (age > staleThresholdMs) {
    return { ...node, status: 'unknown', health: 0 };
  }
  return node;
}
