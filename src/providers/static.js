export function parseStatic(_raw, configuredComponents) {
  return {
    components: (configuredComponents || []).map(component => ({
      name: typeof component === 'string' ? component : component.name,
      status: typeof component === 'string' ? 'operational' : component.status || 'operational',
    })),
    incidents: [],
  };
}
