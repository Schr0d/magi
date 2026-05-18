export function computeHealth(components) {
  if (!components || components.length === 0) return 0;
  const operational = components.filter(c => c.status === 'operational').length;
  return operational / components.length;
}

export function nodeStatus(components, incidents) {
  if (!components || components.length === 0) return 'unknown';

  const statuses = components.map(c => c.status);
  const hasOutage = statuses.some(s => s === 'outage');
  const hasDegraded = statuses.some(s => s === 'degraded');
  const allOperational = statuses.every(s => s === 'operational');

  const majorIncidentActive = incidents && incidents.some(i =>
    i.status === 'active' || i.status === 'ongoing' || i.severity === 'major'
  );

  if (majorIncidentActive) return 'outage';
  if (hasOutage) return 'outage';
  if (hasDegraded) return 'degraded';
  if (allOperational) return 'operational';
  return 'unknown';
}

export function normalizeComponent(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function mapExternalToInternal(status) {
  switch (status) {
    case 'operational': return 'operational';
    case 'degraded_performance': return 'degraded';
    case 'partial_outage': return 'degraded';
    case 'major_outage': return 'outage';
    case 'under_maintenance': return 'outage';
    default: return 'unknown';
  }
}
