import { parseStatuspage } from './statuspage.js';
import { parseGoogleCloud } from './google-cloud.js';

const adapters = {
  statuspage: parseStatuspage,
  google_cloud: parseGoogleCloud,
};

export function getAdapter(providerType) {
  const adapter = adapters[providerType];
  if (!adapter) {
    throw new Error(`Unknown provider_type: ${providerType}. Supported: ${Object.keys(adapters).join(', ')}`);
  }
  return adapter;
}

export function parseProvider(raw, config) {
  const adapter = getAdapter(config.provider_type);
  return adapter(raw, config.components || []);
}

export default adapters;
