export function isMajorIncident(incident) {
  return incident &&
    (incident.status === 'active' || incident.status === 'ongoing') &&
    (incident.severity === 'major' || incident.severity === 'high' || incident.severity === 'critical');
}

export function incidentAffectsComponent(incident, componentNames) {
  if (!incident || !componentNames || !incident.components) return false;
  const lower = incident.components.map(c => c.toLowerCase().trim());
  return componentNames.some(name =>
    lower.some(lc => lc.includes(name.toLowerCase().trim()))
  );
}

export function filterIncidentsForComponents(incidents, componentNames) {
  if (!incidents || !componentNames) return [];
  return incidents.filter(i => incidentAffectsComponent(i, componentNames));
}
