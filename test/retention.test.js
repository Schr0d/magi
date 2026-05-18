import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRoutePosture } from '../src/domain/route-posture.js';
import { applyStaleSince } from '../src/domain/nodes.js';

describe('getRoutePosture', () => {
  it('standby when all operational', () => {
    const nodes = [
      { id: 'melchior', status: 'operational' },
      { id: 'balthasar', status: 'operational' },
      { id: 'casper', status: 'operational' },
    ];
    assert.equal(getRoutePosture(nodes).status, 'standby');
  });

  it('caution when one degraded', () => {
    const nodes = [
      { id: 'melchior', status: 'operational' },
      { id: 'balthasar', status: 'degraded' },
      { id: 'casper', status: 'operational' },
    ];
    const r = getRoutePosture(nodes);
    assert.equal(r.status, 'caution');
    assert.equal(r.preferred_node_id, 'melchior');
  });

  it('reroute when one outage', () => {
    const nodes = [
      { id: 'melchior', status: 'operational' },
      { id: 'balthasar', status: 'outage' },
      { id: 'casper', status: 'degraded' },
    ];
    const r = getRoutePosture(nodes);
    assert.equal(r.status, 'reroute');
    assert.equal(r.preferred_node_id, 'melchior');
  });

  it('locked when two or more outage', () => {
    const nodes = [
      { id: 'melchior', status: 'outage' },
      { id: 'balthasar', status: 'outage' },
      { id: 'casper', status: 'operational' },
    ];
    assert.equal(getRoutePosture(nodes).status, 'locked');
  });

  it('standby for empty nodes', () => {
    assert.equal(getRoutePosture([]).status, 'standby');
  });

  it('standby for null input', () => {
    assert.equal(getRoutePosture(null).status, 'standby');
  });

  it('never returns executed routing claims', () => {
    const nodes = [
      { id: 'melchior', status: 'outage' },
      { id: 'balthasar', status: 'outage' },
      { id: 'casper', status: 'outage' },
    ];
    const r = getRoutePosture(nodes);
    const valid = ['standby', 'caution', 'reroute', 'locked'];
    assert.equal(valid.includes(r.status), true, `Unexpected status: ${r.status}`);
  });
});

describe('applyStaleSince', () => {
  it('preserves node without stale_since', () => {
    const node = { id: 'melchior', status: 'operational', stale_since: null };
    assert.equal(applyStaleSince(node, 30 * 60 * 1000).status, 'operational');
  });

  it('marks as unknown after threshold', () => {
    const node = {
      id: 'melchior',
      status: 'operational',
      stale_since: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    };
    assert.equal(applyStaleSince(node, 30 * 60 * 1000).status, 'unknown');
  });

  it('keeps status within threshold', () => {
    const node = {
      id: 'melchior',
      status: 'operational',
      stale_since: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };
    assert.equal(applyStaleSince(node, 30 * 60 * 1000).status, 'operational');
  });
});
