import { mapExternalToInternal, normalizeComponent } from '../domain/health.js';

export function parseStatuspage(raw, configuredComponents) {
  if (!raw || !raw.components) {
    throw new Error('Invalid Statuspage response: missing components array');
  }

  const targetSet = new Set(
    (configuredComponents || []).map(c => normalizeComponent(c))
  );

  const components = (raw.components || [])
    .filter(c => !c.group_id)
    .filter(c => {
      const name = normalizeComponent(c.name);
      for (const target of targetSet) {
        if (name.includes(target)) return true;
      }
      return false;
    })
    .map(c => ({
      name: c.name,
      status: mapExternalToInternal(c.status || ''),
    }));

  const incidents = (raw.incidents || []).map(i => ({
    id: i.id,
    name: i.name,
    status: i.status,
    severity: i.impact || i.severity,
    components: (i.components || []).map(c => c.name || c),
    created_at: i.created_at || i.started_at,
    updated_at: i.updated_at,
  }));

  return { components, incidents };
}
