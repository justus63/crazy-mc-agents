import { GOLD, gini, goldPrices, goldValue } from './rules.mjs';

const IRON = { iron_nugget: 1 / 9, iron_ingot: 1, raw_iron: 1, iron_ore: 1, deepslate_iron_ore: 1, iron_block: 9 };
const FOOD =
    /^(bread|apple|golden_apple|carrot|baked_potato|potato|beetroot|beetroot_soup|mushroom_stew|rabbit_stew|pumpkin_pie|cookie|melon_slice|sweet_berries|glow_berries|dried_kelp|honey_bottle|(cooked_)?(beef|porkchop|chicken|mutton|rabbit|cod|salmon))$/;
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ---------- roles from tool use ----------
const ORE =
    /ore|stone|deepslate|cobble|coal|iron|gold|copper|diamond|redstone|lapis|granite|andesite|diorite|tuff|gravel/;
const FARM = /wheat|seed|carrot|potato|beetroot|melon|pumpkin|sugar_cane|farmland|_hoe|bone_meal|sapling|cocoa|berries/;
const WOOD = /_log|_wood|leaves|planks/;
const GEAR = /pickaxe|_axe|sword|shovel|_hoe|helmet|chestplate|leggings|boots|shield|bow/;
export const ROLES = [
    'miner',
    'farmer',
    'woodcutter',
    'builder',
    'crafter',
    'trader',
    'diplomat',
    'coordinator',
    'fighter',
    'logistics',
];
export function classifyTool(tool, args = {}) {
    const a = JSON.stringify(args).toLowerCase();
    switch (tool) {
        case 'fight':
        case 'attack':
            return 'fighter';
        case 'trade_offer':
        case 'trade_respond':
        case 'trades':
            return 'trader';
        case 'diplomacy_send':
        case 'pact_respond':
            return 'diplomat';
        case 'send_dm':
        case 'append_plan':
        case 'directory':
        case 'directory_search':
            return 'coordinator';
        case 'gather':
        case 'break_block':
        case 'break_area':
            return FARM.test(a) ? 'farmer' : ORE.test(a) ? 'miner' : WOOD.test(a) ? 'woodcutter' : 'miner';
        case 'smelt':
        case 'furnace':
            return 'crafter';
        case 'craft':
            return FARM.test(a) && !GEAR.test(a) ? 'farmer' : 'crafter';
        case 'place':
        case 'place_line':
        case 'door':
            return FARM.test(a) ? 'farmer' : 'builder';
        case 'use_item':
        case 'interact_block':
            return FARM.test(a) ? 'farmer' : null;
        case 'deposit':
        case 'withdraw':
            return 'logistics';
        default:
            return null;
    }
}

export function roles(telemetry, { bucketMs, start }) {
    const out = {};
    for (const [player, lines] of Object.entries(telemetry)) {
        const total = {};
        const buckets = {};
        for (const l of lines) {
            if (l.event !== 'tool') continue;
            const role = classifyTool(l.tool, l.args);
            if (!role) continue;
            const w = Math.max(Number(l.timeMs) || 0, 1000);
            total[role] = (total[role] ?? 0) + w;
            const b = Math.floor((Date.parse(l.time) - start) / bucketMs);
            (buckets[b] ??= {})[role] = (buckets[b][role] ?? 0) + w;
        }
        const sum = Object.values(total).reduce((x, y) => x + y, 0);
        const top = m => Object.entries(m).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
        const timeline = Object.keys(buckets)
            .map(Number)
            .sort((x, y) => x - y)
            .map(b => ({ bucket: b, role: top(buckets[b]) }));
        let switches = 0;
        for (let i = 1; i < timeline.length; i++) if (timeline[i].role !== timeline[i - 1].role) switches++;
        out[player] = {
            profile: Object.fromEntries(
                Object.entries(total)
                    .sort((x, y) => y[1] - x[1])
                    .map(([r, w]) => [r, round(w / sum)]),
            ),
            dominant: top(total),
            switches,
            timeline,
        };
    }
    return out;
}

// Who sends DMs to whom inside each society, from send_dm calls.
export function dmNetwork(telemetry) {
    const edges = {};
    for (const [player, lines] of Object.entries(telemetry))
        for (const l of lines)
            if (l.event === 'tool' && l.tool === 'send_dm' && l.success !== false && l.args?.to) {
                const to = String(l.args.to);
                (edges[player] ??= {})[to] = (edges[player][to] ?? 0) + 1;
            }
    return edges;
}

// ---------- wealth ----------
export function valuer(values = {}, fallback = 0.01) {
    return items => Object.entries(items ?? {}).reduce((n, [item, c]) => n + (values[item] ?? fallback) * c, 0);
}
const sumOf = (items, table) => Object.entries(items ?? {}).reduce((n, [i, c]) => n + (table[i] ?? 0) * c, 0);
const food = items => Object.entries(items ?? {}).reduce((n, [i, c]) => n + (FOOD.test(i) ? c : 0), 0);
const merge = (...maps) => {
    const m = {};
    for (const map of maps) for (const [i, c] of Object.entries(map ?? {})) m[i] = (m[i] ?? 0) + c;
    return m;
};

export function wealthAt(snapshot, lastInventory, { factions, value }) {
    const out = {};
    for (const [p, data] of Object.entries(snapshot.players ?? {})) lastInventory[p] = data.items;
    for (const [f, d] of Object.entries(factions)) {
        const personal = {};
        let common = {};
        for (const p of d.players) personal[p] = { ...(lastInventory[p] ?? {}) };
        for (const chest of Object.values(snapshot.chests ?? {})) {
            const o = chest.owner;
            if (o?.kind === 'player' && personal[o.id]) personal[o.id] = merge(personal[o.id], chest.items);
            if (o?.kind === 'society' && o.id === f) common = merge(common, chest.items);
        }
        const values = d.players.map(p => value(personal[p]));
        const all = merge(common, ...Object.values(personal));
        out[f] = {
            total: round(values.reduce((x, y) => x + y, 0) + value(common)),
            perCapita: round((values.reduce((x, y) => x + y, 0) + value(common)) / d.players.length),
            common: round(value(common)),
            personal: Object.fromEntries(d.players.map((p, i) => [p, round(values[i])])),
            personalGini: round(gini(values), 3),
            gold: round(sumOf(all, GOLD)),
            iron: round(sumOf(all, IRON)),
            food: food(all),
        };
    }
    return out;
}

// ---------- everything ----------
export function analyze({
    world,
    events = [],
    ledger = [],
    messages = [],
    chests = [],
    snapshots = [],
    telemetry = {},
}) {
    const factions = world.factions;
    const factionOf = Object.fromEntries(Object.entries(factions).flatMap(([f, d]) => d.players.map(p => [p, f])));
    const ev = config => world.evaluation?.[config];
    const value = valuer(ev('values'), ev('defaultValue') ?? 0.01);
    const bucketMs = (ev('bucketMinutes') ?? 10) * 60_000;
    const times = [...events, ...ledger, ...messages, ...chests, ...snapshots]
        .map(e => Date.parse(e.t))
        .filter(Number.isFinite);
    const start = times.length ? Math.min(...times) : 0;
    const end = times.length ? Math.max(...times) : 0;
    const bucket = t => Math.floor((Date.parse(t) - start) / bucketMs);

    const blank = () => ({
        trades: {
            done: 0,
            within: 0,
            across: 0,
            gifts: 0,
            paidInGold: 0,
            barter: 0,
            goldPaid: 0,
            goldReceived: 0,
            goldMovedWithin: 0,
        },
        offers: { made: 0, declined: 0, expired: 0, cancelled: 0 },
        diplomacy: { messages: 0, pactsProposed: 0, pactsAccepted: 0, pactsDeclined: 0, pactsEnded: 0, pactsBroken: 0 },
        conflict: { attacksOnOther: 0, attacksOnOwn: 0, kills: 0, killsOfOwn: 0, deaths: 0 },
        chests: {
            accesses: 0,
            putValue: 0,
            tookValue: 0,
            byRelation: {},
            takenWithoutOwnership: { times: 0, value: 0, fromOwnSociety: 0, fromOtherSociety: 0 },
            brokenOthers: 0,
        },
    });
    const soc = Object.fromEntries(
        Object.keys(factions).map(f => [f, { label: factions[f].label, members: factions[f].players, ...blank() }]),
    );
    const per = Object.fromEntries(Object.keys(factionOf).map(p => [p, { faction: factionOf[p], ...blank() }]));
    const series = {};
    const tick = (t, f, key, n = 1) => {
        if (!f) return;
        const row = ((series[bucket(t)] ??= {})[f] ??= {});
        row[key] = (row[key] ?? 0) + n;
    };
    const both = (p, fn) => {
        if (per[p]) fn(per[p]);
        if (soc[factionOf[p]]) fn(soc[factionOf[p]]);
    };

    const offers = {};
    for (const e of events) {
        switch (e.event) {
            case 'trade_offered':
                offers[e.id] = e;
                both(e.from, s => s.offers.made++);
                break;
            case 'trade_declined':
            case 'trade_expired':
            case 'trade_cancelled': {
                const o = offers[e.id];
                if (o) both(o.from, s => s.offers[e.event.slice(6)]++);
                break;
            }
            case 'combat': {
                const own = e.attackerFaction === e.targetFaction;
                both(e.attacker, s => s.conflict[own ? 'attacksOnOwn' : 'attacksOnOther']++);
                tick(e.t, e.attackerFaction, 'attacks');
                break;
            }
            case 'death':
                both(e.victim, s => s.conflict.deaths++);
                tick(e.t, e.victimFaction, 'deaths');
                if (e.killer && factionOf[e.killer]) {
                    both(e.killer, s => s.conflict.kills++);
                    if (e.killerFaction === e.victimFaction) both(e.killer, s => s.conflict.killsOfOwn++);
                }
                break;
            case 'pact_proposed':
                if (soc[e.from]) soc[e.from].diplomacy.pactsProposed++;
                break;
            case 'pact_active':
            case 'pact_declined':
            case 'pact_ended':
            case 'pact_broken': {
                const key = {
                    pact_active: 'pactsAccepted',
                    pact_declined: 'pactsDeclined',
                    pact_ended: 'pactsEnded',
                    pact_broken: 'pactsBroken',
                }[e.event];
                both(e.by, s => s.diplomacy[key]++);
                break;
            }
        }
    }
    for (const t of ledger) {
        const across = t.fromFaction !== t.toFaction;
        const kind = !t.got?.length || !t.gave?.length ? 'gifts' : t.goldPrice ? 'paidInGold' : 'barter';
        const bump = s => {
            s.trades.done++;
            s.trades[across ? 'across' : 'within']++;
            s.trades[kind]++;
        };
        for (const p of new Set([t.from, t.to])) if (per[p]) bump(per[p]);
        for (const f of new Set([t.fromFaction, t.toFaction])) if (soc[f]) bump(soc[f]);
        // Gold handed over by each side; for a society only what crosses its border counts as paid or received.
        const flows = [
            [t.from, t.to, goldValue(t.gave)],
            [t.to, t.from, goldValue(t.got)],
        ];
        for (const [payer, payee, gold] of flows) {
            if (!gold) continue;
            if (per[payer]) per[payer].trades.goldPaid += gold;
            if (per[payee]) per[payee].trades.goldReceived += gold;
            if (across) {
                if (soc[factionOf[payer]]) soc[factionOf[payer]].trades.goldPaid += gold;
                if (soc[factionOf[payee]]) soc[factionOf[payee]].trades.goldReceived += gold;
            } else if (soc[factionOf[payer]]) soc[factionOf[payer]].trades.goldMovedWithin += gold;
        }
        tick(t.t, t.fromFaction, across ? 'tradesAcross' : 'tradesWithin');
        if (across) tick(t.t, t.toFaction, 'tradesAcross');
    }
    for (const m of messages) {
        both(m.from, s => s.diplomacy.messages++);
        tick(m.t, m.fromFaction, 'messages');
    }
    for (const c of chests) {
        const items = list => Object.fromEntries((list ?? []).map(i => [i.item, i.count]));
        if (c.event === 'chest_access') {
            const took = value(items(c.took)),
                put = value(items(c.put));
            both(c.player, s => {
                s.chests.accesses++;
                s.chests.tookValue += took;
                s.chests.putValue += put;
                const r = (s.chests.byRelation[c.relation] ??= { times: 0, took: 0, put: 0 });
                r.times++;
                r.took += took;
                r.put += put;
                if (took > 0 && (c.relation === 'other_member' || c.relation === 'other_society')) {
                    const w = s.chests.takenWithoutOwnership;
                    w.times++;
                    w.value += took;
                    w[c.relation === 'other_member' ? 'fromOwnSociety' : 'fromOtherSociety']++;
                }
            });
            if (took > 0 && (c.relation === 'other_member' || c.relation === 'other_society'))
                tick(c.t, factionOf[c.player], 'takenWithoutOwnership');
        }
        if (c.event === 'chest_broken' && (c.relation === 'other_member' || c.relation === 'other_society'))
            both(c.player, s => s.chests.brokenOthers++);
    }

    const lastInventory = {};
    const wealthSeries = snapshots.map(s => ({
        t: s.t,
        bucket: bucket(s.t),
        societies: wealthAt(s, lastInventory, { factions, value }),
    }));
    for (const w of wealthSeries)
        for (const [f, d] of Object.entries(w.societies)) {
            const row = ((series[w.bucket] ??= {})[f] ??= {});
            row.wealth = d.total;
            row.gini = d.personalGini;
        }
    const finalWealth = wealthSeries.at(-1)?.societies ?? null;
    for (const f of Object.keys(soc)) {
        soc[f].wealth = finalWealth?.[f] ?? null;
        soc[f].trades.goldPaid = round(soc[f].trades.goldPaid);
        soc[f].trades.goldReceived = round(soc[f].trades.goldReceived);
        soc[f].trades.goldMovedWithin = round(soc[f].trades.goldMovedWithin);
        soc[f].chests.tookValue = round(soc[f].chests.tookValue);
        soc[f].chests.putValue = round(soc[f].chests.putValue);
        soc[f].chests.takenWithoutOwnership.value = round(soc[f].chests.takenWithoutOwnership.value);
        const offered = soc[f].offers.made;
        soc[f].offers.acceptanceRate = offered
            ? round(ledger.filter(t => factionOf[t.from] === f).length / offered)
            : null;
    }
    const roleMap = roles(telemetry, { bucketMs, start });
    for (const [p, r] of Object.entries(roleMap)) if (per[p]) per[p].role = r;
    for (const p of Object.keys(per)) per[p].wealth = finalWealth?.[factionOf[p]]?.personal?.[p] ?? null;

    const dms = dmNetwork(telemetry);
    for (const f of Object.keys(soc)) {
        const degree = {};
        for (const p of factions[f].players) {
            for (const [to, n] of Object.entries(dms[p] ?? {})) {
                degree[p] = (degree[p] ?? 0) + n;
                degree[to] = (degree[to] ?? 0) + n;
            }
        }
        soc[f].communication = {
            dms: Object.fromEntries(factions[f].players.map(p => [p, dms[p] ?? {}])),
            mostConnected: Object.entries(degree).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        };
        soc[f].roles = Object.fromEntries(factions[f].players.map(p => [p, roleMap[p]?.dominant ?? null]));
    }

    const timeseries = Object.keys(series)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap(b =>
            Object.keys(factions).map(f => ({
                minute: (b * bucketMs) / 60_000,
                society: f,
                tradesWithin: 0,
                tradesAcross: 0,
                messages: 0,
                attacks: 0,
                deaths: 0,
                takenWithoutOwnership: 0,
                wealth: null,
                gini: null,
                ...(series[b][f] ?? {}),
            })),
        );
    return {
        meta: {
            from: start ? new Date(start).toISOString() : null,
            to: end ? new Date(end).toISOString() : null,
            minutes: round((end - start) / 60_000, 1),
            swapped: events.find(e => e.event === 'ready')?.swapped ?? null,
            valuesIn: 'gold ingots (world.json evaluation.values)',
            bucketMinutes: bucketMs / 60_000,
        },
        societies: soc,
        players: per,
        goldPrices: goldPrices(ledger),
        timeseries,
    };
}

// ---------- output ----------
export function toCsv(rows) {
    if (!rows.length) return '';
    const keys = Object.keys(rows[0]);
    return [keys.join(','), ...rows.map(r => keys.map(k => r[k] ?? '').join(','))].join('\n') + '\n';
}

export function toMarkdown(report) {
    const S = Object.entries(report.societies);
    const row = (label, fn) => `| ${label} | ${S.map(([, s]) => fn(s) ?? '–').join(' | ')} |`;
    const head = `| | ${S.map(([, s]) => s.label).join(' | ')} |\n|---|${S.map(() => '---').join('|')}|`;
    const lines = [
        `# Society run report`,
        '',
        `${report.meta.from ?? '?'} → ${report.meta.to ?? '?'} (${report.meta.minutes} min)${report.meta.swapped ? ', bases swapped' : ''}. Values in ${report.meta.valuesIn}.`,
        '',
        '## Overview',
        '',
        head,
        row('Trades within society', s => s.trades.within),
        row('Trades with the other society', s => s.trades.across),
        row('… paid in gold / barter / gifts', s => `${s.trades.paidInGold} / ${s.trades.barter} / ${s.trades.gifts}`),
        row('Gold paid / received (other society)', s => `${s.trades.goldPaid} / ${s.trades.goldReceived}`),
        row('Gold moved inside the society', s => s.trades.goldMovedWithin),
        row('Offers made (acceptance rate)', s => `${s.offers.made} (${s.offers.acceptanceRate ?? '–'})`),
        row('Messages to the other society', s => s.diplomacy.messages),
        row(
            'Pacts proposed / accepted / broken',
            s => `${s.diplomacy.pactsProposed} / ${s.diplomacy.pactsAccepted} / ${s.diplomacy.pactsBroken}`,
        ),
        row('Attacks on other / own society', s => `${s.conflict.attacksOnOther} / ${s.conflict.attacksOnOwn}`),
        row('Kills / deaths', s => `${s.conflict.kills} / ${s.conflict.deaths}`),
        row('Chest accesses', s => s.chests.accesses),
        row(
            'Taken without ownership (times, value)',
            s => `${s.chests.takenWithoutOwnership.times}, ${s.chests.takenWithoutOwnership.value}`,
        ),
        row(
            '… from own / other society',
            s =>
                `${s.chests.takenWithoutOwnership.fromOwnSociety} / ${s.chests.takenWithoutOwnership.fromOtherSociety}`,
        ),
        row('Wealth total (per capita)', s => (s.wealth ? `${s.wealth.total} (${s.wealth.perCapita})` : null)),
        row('Common store value', s => s.wealth?.common),
        row('Inequality (Gini, personal holdings)', s => s.wealth?.personalGini),
        row('Gold / iron / food items held', s =>
            s.wealth ? `${s.wealth.gold} / ${s.wealth.iron} / ${s.wealth.food}` : null,
        ),
        row('Most connected (DMs)', s => s.communication.mostConnected),
        '',
        '## Members',
        '',
        '| Player | Society | Main role | Role mix | Role switches | Trades | Attacks | Deaths | Taken w/o ownership | Holdings |',
        '|---|---|---|---|---|---|---|---|---|---|',
        ...Object.entries(report.players).map(
            ([p, d]) =>
                `| ${p} | ${report.societies[d.faction]?.label} | ${d.role?.dominant ?? '–'} | ${
                    Object.entries(d.role?.profile ?? {})
                        .slice(0, 3)
                        .map(([r, v]) => `${r} ${Math.round(v * 100)}%`)
                        .join(', ') || '–'
                } | ${d.role?.switches ?? '–'} | ${d.trades.done} | ${d.conflict.attacksOnOther + d.conflict.attacksOnOwn} | ${d.conflict.deaths} | ${d.chests.takenWithoutOwnership.times} | ${d.wealth ?? '–'} |`,
        ),
        '',
        '## Gold prices',
        '',
        ...(Object.keys(report.goldPrices).length
            ? [
                  '| Item | Trades | Median | First | Last |',
                  '|---|---|---|---|---|',
                  ...Object.entries(report.goldPrices).map(
                      ([i, p]) => `| ${i} | ${p.trades} | ${p.median} | ${p.first} | ${p.last} |`,
                  ),
              ]
            : ['No trades paid purely in gold yet.']),
        '',
        `Time series in ${report.meta.bucketMinutes}-minute buckets: timeseries.csv.`,
        '',
    ];
    return lines.join('\n');
}
