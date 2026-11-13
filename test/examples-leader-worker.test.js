import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveConfig } from '../src/config.js';

test('leader/worker example resolves: strong leader, cheap workers, shared LiteLLM endpoint', () => {
    const { agents, ...common } = JSON.parse(readFileSync('examples/leader-worker/team.json', 'utf8'));
    const { staggerSeconds, sharedMachine, ...shared } = common;
    assert.ok(staggerSeconds && sharedMachine);
    const cfgs = agents.map(a =>
        resolveConfig([shared, a, { team: true }], {
            env: { MODEL_API_KEY: 'k' },
            probeDocker: () => false,
        }),
    );
    assert.equal(cfgs[0].model.id, 'azure/gpt-6.1-sol');
    assert.equal(cfgs[0].thinking, 'high');
    for (const w of cfgs.slice(1)) {
        assert.equal(w.model.id, 'azure/gpt-5.6-luna');
        assert.equal(w.thinking, 'off');
    }
    for (const c of cfgs) {
        assert.equal(c.model.baseUrl, 'https://litellm.fh-muenster.de/v1');
        assert.equal(c.apiKey, 'k');
    }
});
