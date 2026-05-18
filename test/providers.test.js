import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStatuspage } from '../src/providers/statuspage.js';
import { parseGoogleCloud } from '../src/providers/google-cloud.js';
import { parseStatic } from '../src/providers/static.js';
import { getAdapter } from '../src/providers/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));

describe('statuspage adapter', () => {
  it('maps operational components', () => {
    const raw = fixture('statuspage-operational.json');
    const components = ['Chat Completions', 'Images', 'Codex'];
    const result = parseStatuspage(raw, components);
    assert.equal(result.components.length, 3);
    assert.equal(result.components[0].status, 'operational');
    assert.equal(result.components[1].status, 'operational');
    assert.equal(result.components[2].status, 'operational');
  });

  it('maps degraded performance and major outage', () => {
    const raw = fixture('statuspage-degraded.json');
    const components = ['Chat Completions', 'Images', 'Codex'];
    const result = parseStatuspage(raw, components);
    assert.equal(result.components.length, 3);
    assert.equal(result.components[0].status, 'operational');
    assert.equal(result.components[1].status, 'degraded');
    assert.equal(result.components[2].status, 'outage');
  });

  it('extracts incidents', () => {
    const raw = fixture('statuspage-degraded.json');
    const result = parseStatuspage(raw, ['Codex']);
    assert.equal(result.incidents.length, 1);
    assert.equal(result.incidents[0].severity, 'major');
  });

  it('filters by configured components only', () => {
    const raw = fixture('statuspage-operational.json');
    const result = parseStatuspage(raw, ['Chat Completions']);
    assert.equal(result.components.length, 1);
    assert.equal(result.components[0].name, 'Chat Completions');
  });

  it('handles empty component config', () => {
    const raw = fixture('statuspage-operational.json');
    const result = parseStatuspage(raw, []);
    assert.equal(result.components.length, 0);
  });

  it('throws on missing components array', () => {
    assert.throws(
      () => parseStatuspage({}, ['x']),
      /missing components array/i
    );
  });

  it('matches case-insensitive', () => {
    const raw = fixture('statuspage-operational.json');
    const result = parseStatuspage(raw, ['chat completions']);
    assert.equal(result.components.length, 1);
  });
});

describe('google_cloud adapter', () => {
  it('maps incidents to component status', () => {
    const raw = fixture('google-cloud-incidents.json');
    const components = ['Gemini API', 'Vertex AI', 'AI Studio'];
    const result = parseGoogleCloud(raw, components);
    assert.equal(result.components.length, 3);
    assert.equal(result.components[0].status, 'outage');
    assert.equal(result.components[1].status, 'outage');
    assert.equal(result.components[2].status, 'operational');
  });

  it('returns only active incidents', () => {
    const raw = fixture('google-cloud-incidents.json');
    const result = parseGoogleCloud(raw, ['Gemini API']);
    assert.equal(result.incidents.length, 1);
    assert.equal(result.incidents[0].severity, 'high');
  });

  it('handles non-affected components as operational', () => {
    const raw = fixture('google-cloud-incidents.json');
    const result = parseGoogleCloud(raw, ['AI Studio']);
    assert.equal(result.components[0].status, 'operational');
  });

  it('throws on non-array input', () => {
    assert.throws(
      () => parseGoogleCloud({}, ['x']),
      /expected array/i
    );
  });
});

describe('adapter registry', () => {
  it('returns statuspage adapter', () => {
    const fn = getAdapter('statuspage');
    assert.equal(typeof fn, 'function');
  });

  it('returns google_cloud adapter', () => {
    const fn = getAdapter('google_cloud');
    assert.equal(typeof fn, 'function');
  });

  it('returns static adapter', () => {
    const fn = getAdapter('static');
    assert.equal(typeof fn, 'function');
  });

  it('throws on unknown provider type', () => {
    assert.throws(
      () => getAdapter('nonexistent'),
      /Unknown provider_type/i
    );
  });
});

describe('static adapter', () => {
  it('maps configured MAGI components to operational status', () => {
    const result = parseStatic({}, ['DeepSeek API', 'deepseek-v4-pro']);
    assert.deepEqual(result.components, [
      { name: 'DeepSeek API', status: 'operational' },
      { name: 'deepseek-v4-pro', status: 'operational' },
    ]);
    assert.deepEqual(result.incidents, []);
  });
});
