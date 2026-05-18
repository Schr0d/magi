import { normalizeComponent } from '../domain/health.js';

export function parseGoogleCloud(raw, configuredComponents) {
  if (!Array.isArray(raw)) {
    throw new Error('Invalid Google Cloud response: expected array of incidents');
  }

  const targetSet = new Set(
    (configuredComponents || []).map(c => normalizeComponent(c))
  );

  const activeIncidents = (raw || []).filter(
    i => i.status_impact === 'ONGOING' && !i.end || i.active
  );

  const incidents = activeIncidents.map(i => ({
    id: i.number || i.id || i.incident_id,
    name: i.external_desc || i.summary || i.name || '',
    status: i.active ? 'active' : 'resolved',
    severity: i.severity || 'medium',
    components: (i.affected_products || [])
      .map(p => (typeof p === 'string' ? p : p.title || p.name || ''))
      .filter(Boolean),
    created_at: i.created || i.started_at || i.create_time,
    updated_at: i.most_recent_update || i.updated_at || i.update_time,
  }));

  const matchedIncidents = incidents.filter(incident =>
    incident.components.some(c =>
      Array.from(targetSet).some(target => normalizeComponent(c).includes(target))
    )
  );

  const components = (configuredComponents || []).map(name => {
    const isAffected = matchedIncidents.some(inc =>
      inc.components.some(c => normalizeComponent(c).includes(normalizeComponent(name)))
    );
    return {
      name,
      status: isAffected ? 'outage' : 'operational',
    };
  });

  return { components, incidents: matchedIncidents };
}
