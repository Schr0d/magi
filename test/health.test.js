import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeHealth, nodeStatus, mapExternalToInternal, normalizeComponent } from '../src/domain/health.js';

describe('computeHealth', () => {
  it('returns 1 for all operational', () => {
    const comps = [{ name: 'A', status: 'operational' }, { name: 'B', status: 'operational' }];
    assert.equal(computeHealth(comps), 1);
  });

  it('returns 0.5 for half operational', () => {
    const comps = [{ name: 'A', status: 'operational' }, { name: 'B', status: 'degraded' }];
    assert.equal(computeHealth(comps), 0.5);
  });

  it('returns 0 for empty components', () => {
    assert.equal(computeHealth([]), 0);
  });

  it('returns 0 for null/undefined', () => {
    assert.equal(computeHealth(null), 0);
    assert.equal(computeHealth(undefined), 0);
  });

  it('returns 0 when all are outage', () => {
    const comps = [{ name: 'A', status: 'outage' }, { name: 'B', status: 'outage' }];
    assert.equal(computeHealth(comps), 0);
  });
});

describe('nodeStatus', () => {
  it('returns operational when all components ok', () => {
    const comps = [{ name: 'A', status: 'operational' }];
    assert.equal(nodeStatus(comps, []), 'operational');
  });

  it('returns degraded when any component degraded', () => {
    const comps = [{ name: 'A', status: 'degraded' }];
    assert.equal(nodeStatus(comps, []), 'degraded');
  });

  it('returns outage when any component outage', () => {
    const comps = [{ name: 'A', status: 'outage' }];
    assert.equal(nodeStatus(comps, []), 'outage');
  });

  it('returns outage for major active incident', () => {
    const comps = [{ name: 'A', status: 'operational' }];
    const incidents = [{ status: 'active', severity: 'major' }];
    assert.equal(nodeStatus(comps, incidents), 'outage');
  });

  it('returns unknown for empty components', () => {
    assert.equal(nodeStatus([], []), 'unknown');
  });

  it('returns unknown for null components', () => {
    assert.equal(nodeStatus(null, []), 'unknown');
  });
});

describe('mapExternalToInternal', () => {
  it('maps operational', () => assert.equal(mapExternalToInternal('operational'), 'operational'));
  it('maps degraded_performance', () => assert.equal(mapExternalToInternal('degraded_performance'), 'degraded'));
  it('maps partial_outage', () => assert.equal(mapExternalToInternal('partial_outage'), 'degraded'));
  it('maps major_outage', () => assert.equal(mapExternalToInternal('major_outage'), 'outage'));
  it('maps unknown string', () => assert.equal(mapExternalToInternal('xyz'), 'unknown'));
});

describe('normalizeComponent', () => {
  it('lowercases', () => assert.equal(normalizeComponent('CHAT'), 'chat'));
  it('trims', () => assert.equal(normalizeComponent('  chat  '), 'chat'));
  it('normalizes spaces', () => assert.equal(normalizeComponent('chat  completions'), 'chat completions'));
});
