export function getRoutePosture(nodes) {
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
