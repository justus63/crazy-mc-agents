import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGameTools } from '../src/tools/game-tools.js';
import { schema } from '../src/tools/extra-tools.js';
import {
    MessageLimiter,
    nearest,
    normalizeItems,
    parseFound,
    parsePos,
    parseRemoved,
    protectivePact,
    tradeableItems,
} from '../examples/societies/rules.mjs';

const read = f => JSON.parse(readFileSync(new URL(`../examples/societies/${f}`, import.meta.url), 'utf8'));

test('only plain stackable items can be traded through the referee', () => {
    const check = tradeableItems('1.21.6');
    assert.equal(check('iron_ingot'), null);
    assert.equal(check('bread'), null);
    assert.match(check('iron_pickaxe'), /durability/);
    assert.match(check('potion'), /durability or other item data/);
    assert.match(check('white_banner'), /item data/);
    assert.match(check('not_a_thing'), /not a Minecraft item/);
    assert.deepEqual(
        normalizeItems(
            [
                { item: 'minecraft:Iron_Ingot', count: 2 },
                { item: 'iron_ingot', count: 3 },
            ],
            check,
        ),
        [{ item: 'iron_ingot', count: 5 }],
    );
    assert.throws(() => normalizeItems([{ item: 'iron_ingot', count: 0 }], check), /bad count/);
    assert.throws(() => normalizeItems([{ item: 'diamond_sword', count: 1 }], check), /drop_item/);
});

test('RCON replies are parsed without picking up digits from player names', () => {
    assert.equal(parseFound('Found 12 matching item(s) on player Red1'), 12);
    assert.equal(parseFound('No items were found on player Red1'), 0);
    assert.equal(parseFound('No player was found'), null);
    assert.equal(parseRemoved('Removed 4 item(s) from player Ivo2'), 4);
    assert.equal(parseRemoved('No items were found on player Ivo2'), 0);
    assert.deepEqual(parsePos('Reinecke has the following entity data: [-99.5d, 71.0d, 0.3d]'), [-99.5, 71, 0.3]);
    assert.equal(parsePos('No entity was found'), null);
});

test('nearest picks the closest candidate other than yourself', () => {
    const pos = { A: [0, 64, 0], B: [10, 64, 0], C: [3, 64, 4], D: [1, 64, 0] };
    assert.deepEqual(nearest('A', pos, ['A', 'B', 'C']), { name: 'C', distance: 5 });
    assert.equal(nearest('A', pos, ['A']), null);
    assert.equal(nearest('Z', pos, ['B']), null);
});

test('diplomacy limiter enforces spacing, hourly caps, per-pair caps and refuses repeats', () => {
    const l = new MessageLimiter({ minSecondsBetween: 20, maxPerHour: 3, maxPerPairPer10Min: 2, maxRepeats: 1 });
    let t = 0;
    assert.equal(l.check('Reinecke', 'Market', 'Hello', t), null);
    l.record('Reinecke', 'Market', 'Hello', t);
    assert.match(l.check('Reinecke', 'Market', 'Again', (t += 5_000)), /wait 15s/);
    assert.match(l.check('Reinecke', 'FlorianHomm', 'hello!', (t += 30_000)), /already sent/);
    l.record('Reinecke', 'Market', 'Second', t);
    assert.match(l.check('Reinecke', 'Market', 'Third', (t += 30_000)), /same recipient/);
    l.record('Reinecke', 'FlorianHomm', 'Third', t);
    assert.match(l.check('Reinecke', 'Trump', 'Fourth', (t += 30_000)), /3 messages per hour/);
    assert.equal(l.check('Zappel', 'Market', 'Hello', t), null);
});

test('only active, unexpired protective pacts protect', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const pacts = {
        1: { status: 'active', type: 'trade_agreement', from: 'a', to: 'b' },
        2: { status: 'declined', type: 'non_aggression', from: 'a', to: 'b' },
        3: { status: 'active', type: 'peace', from: 'b', to: 'a', until: '2025-12-31T00:00:00Z' },
    };
    assert.equal(protectivePact(pacts, 'a', 'b', now), null);
    pacts[4] = { status: 'active', type: 'non_aggression', from: 'b', to: 'a' };
    assert.equal(protectivePact(pacts, 'a', 'b', now).type, 'non_aggression');
    assert.equal(protectivePact(pacts, 'a', 'a', now), null);
});

function fakeBot(entities = {}) {
    const at = (x, z) => ({ x, y: 64, z, distanceTo: o => Math.hypot(x - o.x, z - o.z) });
    return {
        username: 'Reinecke',
        game: { gameMode: 'survival' },
        entity: { id: 0, position: at(0, 0), yaw: 0, pitch: 0 },
        entities: Object.fromEntries(
            Object.entries(entities).map(([id, [username, x, z]]) => [
                id,
                { id: Number(id), type: 'player', username, position: at(x, z) },
            ]),
        ),
        inventory: { items: () => [], slots: new Array(46).fill(null) },
        pathfinder: { setMovements: () => {}, setGoal: () => {}, stop: () => {} },
        clearControlStates: () => {},
        pi_no_flight: true,
    };
}

test('extra tools can call built-in tools through builtin(), body tools only from body tools', async () => {
    const seen = [];
    const tools = createGameTools({
        bot: fakeBot(),
        observe: async () => ({ state: {} }),
        extraTools: [
            { name: 'peek', description: '', properties: {}, run: (_, { builtin }) => builtin('inventory') },
            { name: 'swing', description: '', properties: {}, run: (_, { builtin }) => builtin('attack', { id: 9 }) },
            {
                name: 'nested',
                description: '',
                properties: {},
                run: async (_, { builtin }) => {
                    await builtin('peek').catch(e => seen.push(e.message));
                    return builtin('attack', { id: 1, bogus: 1 }).catch(e => seen.push(e.message));
                },
                body: true,
            },
        ],
    });
    const peek = await tools.find(t => t.name === 'peek').execute('id', {});
    assert.ok(!peek.isError, peek.content?.[0]?.text);
    const swing = await tools.find(t => t.name === 'swing').execute('id', {});
    assert.equal(swing.isError, true);
    assert.match(swing.content[0].text, /needs body: true/);
    await tools.find(t => t.name === 'nested').execute('id', {});
    assert.deepEqual(seen, ['peek is not a built-in tool', 'Unknown argument bogus']);
});

async function fakeReferee(handler) {
    const calls = [];
    const server = createServer(async (req, res) => {
        let raw = '';
        for await (const c of req) raw += c;
        const call = { method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null };
        calls.push(call);
        const [code, data] = handler(call);
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() };
}

test('society tools: fight picks the nearest player of the other society and respects pacts', async t => {
    const { default: create } = await import('../examples/societies/tools.mjs');
    let allowed = false;
    const ref = await fakeReferee(c =>
        c.url === '/combat'
            ? [200, allowed ? { allowed: true } : { allowed: false, reason: 'pact in force', pact: { id: 3 } }]
            : [200, {}],
    );
    t.after(() => ref.close());
    // Zappel (own society) is closest, Trump (other society) next, FlorianHomm farther, Justus out of range.
    const bot = fakeBot({ 1: ['Zappel', 2, 0], 2: ['Trump', 6, 0], 3: ['FlorianHomm', 10, 0], 4: ['Justus', 40, 0] });
    const specs = create({ bot, name: 'Reinecke', schema, options: { referee: ref.url, poll: false } });
    assert.deepEqual(
        specs.map(s => s.name),
        ['fight', 'trade_offer', 'trade_respond', 'trades', 'diplomacy_send', 'pact_respond', 'society_status'],
    );
    const fight = specs[0];
    const attacks = [];
    const builtin = async (n, a) => {
        attacks.push([n, a]);
        return { targetDied: true };
    };
    const refused = await fight.run({}, { builtin });
    assert.deepEqual(refused, { attacked: false, target: 'Trump', reason: 'pact in force', pact: { id: 3 } });
    assert.equal(attacks.length, 0);
    allowed = true;
    const done = await fight.run({ break_pact: true }, { builtin });
    assert.equal(done.target, 'Trump');
    assert.equal(done.targetSociety, 'Market');
    assert.deepEqual(attacks, [['attack', { id: 2 }]]);
    assert.deepEqual(ref.calls.at(-1).body, { attacker: 'Reinecke', target: 'Trump', breakPact: true });
    const own = await fight.run({ target: 'zappel' }, { builtin });
    assert.equal(own.target, 'Zappel');
    await assert.rejects(fight.run({ target: 'Justus' }, { builtin }), /not within 24 blocks/);
});

test('society tools: trades and diplomacy are sent as the agent, inbox events wake it', async t => {
    const { default: create } = await import('../examples/societies/tools.mjs');
    let inbox = [{ id: 7, type: 'trade_offer', urgent: true, offer: 5, from: 'FlorianHomm' }];
    const ref = await fakeReferee(c => {
        if (c.url.startsWith('/inbox')) {
            const events = inbox;
            inbox = [];
            return [200, { events }];
        }
        if (c.url === '/trade/offer') return [400, { error: 'You do not have 3 bread (has 1).' }];
        return [200, { ok: true }];
    });
    t.after(() => ref.close());
    const woken = [];
    const specs = create({
        bot: fakeBot(),
        name: 'Reinecke',
        schema,
        options: { referee: ref.url, pollSeconds: 0.05 },
        wake: (event, opts) => woken.push([event, opts]),
    });
    const byName = Object.fromEntries(specs.map(s => [s.name, s]));
    await assert.rejects(byName.trade_offer.run({ give: [{ item: 'bread', count: 3 }], want: [] }), /has 1/);
    assert.deepEqual(ref.calls.find(c => c.url === '/trade/offer').body, {
        from: 'Reinecke',
        give: [{ item: 'bread', count: 3 }],
        want: [],
    });
    await byName.diplomacy_send.run({ to: 'Market', text: 'Hello', pact: 'peace', pact_minutes: 60 });
    assert.deepEqual(ref.calls.find(c => c.url === '/message').body, {
        from: 'Reinecke',
        to: 'Market',
        text: 'Hello',
        pact: 'peace',
        pactMinutes: 60,
    });
    for (let i = 0; i < 40 && !woken.length; i++) await new Promise(r => setTimeout(r, 25));
    assert.deepEqual(woken[0], [
        { kind: 'society', type: 'trade_offer', offer: 5, from: 'FlorianHomm' },
        { key: 'society:7', urgent: true },
    ]);
});

test('society team files are mirrored: same objective shape, same personalities, separate state', () => {
    const world = read('world.json');
    const [a, b] = ['collective', 'market'].map(k => read(`${k}.json`));
    for (const [cfg, key] of [
        [a, 'collective'],
        [b, 'market'],
    ]) {
        assert.equal(cfg.toolsModule, 'examples/societies/tools.mjs');
        assert.equal(cfg.stateDir, `.agent-state/societies-${key}`);
        assert.equal(cfg.sandbox, 'none');
        assert.deepEqual(
            cfg.agents.map(x => x.name),
            world.factions[key].players,
        );
    }
    assert.equal(a.model, b.model);
    assert.deepEqual(
        a.agents.map(x => x.personality),
        b.agents.map(x => x.personality),
    );
    const strip = s => s.replace(/Your society's rules.*?up to you\./s, '').replace(/Collective|Market|\([^)]*\)/g, '');
    assert.equal(strip(a.objective), strip(b.objective));
});

test('item lists are read from SNBT without being fooled by nested data or strings', async () => {
    const { parseItemList, tally, diffCounts, relation } = await import('../examples/societies/rules.mjs');
    const inv =
        'Reinecke has the following entity data: [{Slot: 0b, id: "minecraft:bread", count: 3}, {count: 1, Slot: 1b, id: "minecraft:iron_pickaxe", components: {"minecraft:damage": 4, "minecraft:custom_name": "{\\"id\\": \\"minecraft:diamond\\", count: 64}"}}, {Slot: 2b, id: "minecraft:bundle", count: 1, components: {"minecraft:bundle_contents": [{id: "minecraft:gold_ingot", count: 9}]}}]';
    assert.deepEqual(parseItemList(inv), [
        { item: 'bread', count: 3 },
        { item: 'iron_pickaxe', count: 1 },
        { item: 'bundle', count: 1 },
    ]);
    assert.deepEqual(parseItemList('Reinecke has the following entity data: []'), []);
    assert.deepEqual(parseItemList('Found no elements matching Items'), []);
    assert.equal(parseItemList('That position is not loaded'), null);
    const before = tally([
        { item: 'bread', count: 3 },
        { item: 'gold_ingot', count: 2 },
    ]);
    const after = tally([
        { item: 'bread', count: 1 },
        { item: 'coal', count: 4 },
    ]);
    assert.deepEqual(diffCounts(before, after), {
        took: [
            { item: 'bread', count: 2 },
            { item: 'gold_ingot', count: 2 },
        ],
        put: [{ item: 'coal', count: 4 }],
    });
    const factionOf = { Reinecke: 'collective', Zappel: 'collective', FlorianHomm: 'market', Trump: 'market' };
    assert.equal(relation({ kind: 'society', id: 'collective' }, 'Zappel', factionOf), 'own_society_common');
    assert.equal(relation({ kind: 'society', id: 'collective' }, 'FlorianHomm', factionOf), 'other_society');
    assert.equal(relation({ kind: 'player', id: 'FlorianHomm' }, 'FlorianHomm', factionOf), 'own');
    assert.equal(relation({ kind: 'player', id: 'FlorianHomm' }, 'Trump', factionOf), 'other_member');
    assert.equal(relation({ kind: 'player', id: 'FlorianHomm' }, 'Reinecke', factionOf), 'other_society');
    assert.equal(relation(null, 'Reinecke', factionOf), 'unowned');
});

test('gold prices come only from trades paid purely in gold for one kind of item', async () => {
    const { goldPrice, goldPrices, gini } = await import('../examples/societies/rules.mjs');
    const t = (gave, got) => ({ t: '2026-01-01T00:00:00Z', gave, got });
    assert.deepEqual(goldPrice(t([{ item: 'gold_ingot', count: 2 }], [{ item: 'bread', count: 8 }])), {
        item: 'bread',
        count: 8,
        gold: 2,
        unit: 0.25,
    });
    assert.equal(goldPrice(t([{ item: 'gold_nugget', count: 9 }], [{ item: 'iron_ingot', count: 1 }])).unit, 1);
    assert.equal(goldPrice(t([{ item: 'coal', count: 2 }], [{ item: 'bread', count: 8 }])), null);
    assert.equal(goldPrice(t([{ item: 'gold_ingot', count: 1 }], [])), null);
    assert.equal(goldPrice(t([{ item: 'gold_ingot', count: 9 }], [{ item: 'gold_block', count: 1 }])), null);
    assert.deepEqual(
        goldPrices([
            t([{ item: 'gold_ingot', count: 1 }], [{ item: 'iron_ingot', count: 2 }]),
            t([{ item: 'iron_ingot', count: 1 }], [{ item: 'gold_ingot', count: 1 }]),
            t([{ item: 'gold_ingot', count: 3 }], [{ item: 'iron_ingot', count: 2 }]),
        ]),
        { iron_ingot: { trades: 3, median: 1, last: 1.5, first: 0.5 } },
    );
    assert.equal(gini([1, 1, 1, 1]), 0);
    assert.equal(Math.round(gini([0, 0, 0, 10]) * 100) / 100, 0.75);
    assert.equal(gini([]), 0);
});

test('chest tracking reports opens before the caller continues, closes, placements and breaks', async () => {
    const { EventEmitter } = await import('node:events');
    const { installChestTracking } = await import('../examples/societies/tools.mjs');
    const bot = new EventEmitter();
    const posts = [];
    let release;
    const post = (path, body) => {
        posts.push([path, body]);
        return path === '/chest/open' ? new Promise(r => (release = r)) : Promise.resolve();
    };
    const vec = (x, y, z) => ({ x, y, z, plus: o => vec(x + o.x, y + o.y, z + o.z) });
    const window = new EventEmitter();
    bot.openContainer = async () => {
        bot.emit('windowOpen', window);
        return window;
    };
    bot.placeBlock = async () => {};
    bot.dig = async () => {};
    bot.heldItem = { name: 'chest' };
    installChestTracking(bot, post);
    installChestTracking(bot, post); // idempotent
    let opened = false;
    const opening = bot.openContainer({ name: 'chest', position: vec(-96.2, 64, 3.9) }).then(() => (opened = true));
    await new Promise(r => setImmediate(r));
    assert.deepEqual(posts, [['/chest/open', { pos: [-97, 64, 3], block: 'chest' }]]);
    assert.equal(opened, false, 'caller waits for the referee snapshot');
    release();
    await opening;
    window.emit('close');
    bot.emit('windowClose', window);
    await new Promise(r => setImmediate(r));
    assert.deepEqual(posts.at(-1), ['/chest/close', { pos: [-97, 64, 3] }]);
    assert.equal(posts.filter(p => p[0] === '/chest/close').length, 1);
    await bot.openContainer({ name: 'furnace', position: vec(1, 2, 3) });
    assert.equal(posts.filter(p => p[0] === '/chest/open').length, 1, 'furnaces are not tracked');
    await bot.placeBlock({ position: vec(10, 64, 10) }, vec(0, 1, 0));
    assert.deepEqual(posts.at(-1), ['/chest/placed', { pos: [10, 65, 10], block: 'chest' }]);
    await bot.dig({ name: 'barrel', position: vec(5, 64, 5) });
    assert.deepEqual(posts.at(-1), ['/chest/broken', { pos: [5, 64, 5] }]);
});

test('analysis counts trades, gold, chest taking, wealth, inequality and roles per society', async () => {
    const { analyze, toMarkdown, toCsv, classifyTool } = await import('../examples/societies/analysis.mjs');
    const world = read('world.json');
    const T = m => new Date(Date.parse('2026-01-01T00:00:00Z') + m * 60_000).toISOString();
    const items = (...l) => l.map(([item, count]) => ({ item, count }));
    const ledger = [
        {
            t: T(1),
            from: 'FlorianHomm',
            to: 'Reinecke',
            fromFaction: 'market',
            toFaction: 'collective',
            gave: items(['iron_ingot', 2]),
            got: items(['gold_ingot', 3]),
            goldPrice: { item: 'iron_ingot', unit: 1.5 },
        },
        {
            t: T(2),
            from: 'FlorianHomm',
            to: 'Trump',
            fromFaction: 'market',
            toFaction: 'market',
            gave: items(['bread', 4]),
            got: items(['gold_ingot', 1]),
            goldPrice: { item: 'bread', unit: 0.25 },
        },
        {
            t: T(3),
            from: 'Reinecke',
            to: 'Zappel',
            fromFaction: 'collective',
            toFaction: 'collective',
            gave: items(['bread', 2]),
            got: [],
        },
        {
            t: T(4),
            from: 'Stalin',
            to: 'Justus',
            fromFaction: 'collective',
            toFaction: 'market',
            gave: items(['coal', 4]),
            got: items(['bread', 2]),
        },
    ];
    const events = [
        { t: T(0), event: 'ready', swapped: false },
        { t: T(0.5), event: 'trade_offered', id: 1, from: 'FlorianHomm' },
        { t: T(1.5), event: 'trade_offered', id: 2, from: 'FlorianHomm' },
        { t: T(1.6), event: 'trade_offered', id: 9, from: 'FlorianHomm' },
        { t: T(1.7), event: 'trade_declined', id: 9 },
        {
            t: T(5),
            event: 'combat',
            attacker: 'Justus',
            target: 'Marcant',
            attackerFaction: 'market',
            targetFaction: 'collective',
        },
        {
            t: T(6),
            event: 'death',
            victim: 'Marcant',
            killer: 'Justus',
            victimFaction: 'collective',
            killerFaction: 'market',
        },
    ];
    const chests = [
        {
            t: T(7),
            event: 'chest_access',
            player: 'Trump',
            relation: 'other_member',
            took: items(['gold_ingot', 2]),
            put: [],
        },
        {
            t: T(8),
            event: 'chest_access',
            player: 'Zappel',
            relation: 'own_society_common',
            took: items(['bread', 1]),
            put: [],
        },
        {
            t: T(9),
            event: 'chest_access',
            player: 'Reinecke',
            relation: 'other_society',
            took: items(['iron_ingot', 1]),
            put: [],
        },
    ];
    const snapshots = [
        {
            t: T(10),
            players: {
                Reinecke: { faction: 'collective', items: { gold_ingot: 3 } },
                FlorianHomm: { faction: 'market', items: { gold_ingot: 4 } },
                Trump: { faction: 'market', items: {} },
            },
            chests: {
                a: { owner: { kind: 'society', id: 'collective' }, items: { iron_ingot: 5, bread: 10 } },
                b: { owner: { kind: 'player', id: 'Trump' }, items: { gold_ingot: 4 } },
            },
        },
    ];
    const telemetry = {
        Reinecke: [
            { time: T(1), event: 'tool', tool: 'gather', args: { block: 'iron_ore' }, timeMs: 60000 },
            { time: T(2), event: 'tool', tool: 'send_dm', args: { to: 'Zappel', text: 'hi' }, timeMs: 100 },
            { time: T(12), event: 'tool', tool: 'place', args: { item: 'wheat_seeds' }, timeMs: 30000 },
        ],
    };
    const r = analyze({ world, events, ledger, chests, snapshots, telemetry });
    const c = r.societies.collective,
        m = r.societies.market;
    assert.deepEqual(
        [c.trades.done, c.trades.within, c.trades.across, c.trades.gifts, c.trades.paidInGold, c.trades.barter],
        [3, 1, 2, 1, 1, 1],
    );
    assert.deepEqual([m.trades.done, m.trades.within, m.trades.across], [3, 1, 2]);
    assert.equal(c.trades.goldPaid, 3);
    assert.equal(m.trades.goldReceived, 3);
    assert.equal(m.trades.goldMovedWithin, 1);
    assert.equal(r.players.FlorianHomm.trades.goldReceived, 4);
    assert.deepEqual([m.offers.made, m.offers.declined], [3, 1]);
    assert.equal(m.offers.acceptanceRate, 0.67);
    assert.deepEqual([m.conflict.attacksOnOther, m.conflict.kills, c.conflict.deaths], [1, 1, 1]);
    assert.deepEqual(m.chests.takenWithoutOwnership, { times: 1, value: 2, fromOwnSociety: 1, fromOtherSociety: 0 });
    assert.deepEqual(c.chests.takenWithoutOwnership, { times: 1, value: 1, fromOwnSociety: 0, fromOtherSociety: 1 });
    assert.equal(c.chests.byRelation.own_society_common.times, 1);
    assert.equal(c.wealth.common, 8);
    assert.equal(c.wealth.total, 11);
    assert.equal(c.wealth.iron, 5);
    assert.equal(c.wealth.food, 10);
    assert.deepEqual(m.wealth.personal, { FlorianHomm: 4, Trump: 4, Justus: 0, Simon: 0, Fohrmann: 0 });
    assert.equal(m.wealth.personalGini, 0.6);
    assert.equal(r.goldPrices.iron_ingot.median, 1.5);
    assert.equal(r.players.Reinecke.role.dominant, 'miner');
    assert.equal(r.players.Reinecke.role.switches, 1);
    assert.equal(c.communication.mostConnected, 'Reinecke');
    assert.equal(classifyTool('gather', { block: 'wheat' }), 'farmer');
    assert.equal(classifyTool('fight', {}), 'fighter');
    assert.equal(classifyTool('observe_world', {}), null);
    const md = toMarkdown(r);
    assert.match(md, /\| Trades with the other society \| 2 \| 2 \|/);
    assert.match(md, /\| iron_ingot \| 1 \| 1\.5 \|/);
    const csv = toCsv(r.timeseries);
    assert.match(csv.split('\n')[0], /^minute,society,tradesWithin,tradesAcross/);
    assert.ok(csv.includes('0,market,1,2,0,1,0,1'));
});
