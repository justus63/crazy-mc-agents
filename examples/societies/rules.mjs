import minecraftData from 'minecraft-data';

export const PACT_TYPES = ['non_aggression', 'alliance', 'peace', 'trade_agreement', 'other'];
// Pacts that make an attack on the other side a breach.
export const PROTECTIVE = new Set(['non_aggression', 'alliance', 'peace']);

// Items whose identity lives in data components (contents, enchantments, patterns, durability...). `clear` + `give`
// would strip or duplicate that data, so the referee refuses them; hand them over with drop_item instead.
const COMPONENT_ITEMS =
    /^(potion|splash_potion|lingering_potion|tipped_arrow|enchanted_book|written_book|writable_book|filled_map|firework_rocket|firework_star|suspicious_stew|player_head|goat_horn|ominous_bottle|decorated_pot|bundle|.+_bundle|.+_banner|.*shulker_box)$/;

export function tradeableItems(version) {
    const data = minecraftData(version);
    if (!data) throw new Error(`minecraft-data has no data for ${version}`);
    return name => {
        const item = data.itemsByName[name];
        if (!item) return `${name} is not a Minecraft item`;
        if (item.maxDurability || item.stackSize <= 1 || COMPONENT_ITEMS.test(name))
            return `${name} carries durability or other item data and cannot go through the referee; hand it over with drop_item`;
        return null;
    };
}

export const MAX_STACKS = 8;
export function normalizeItems(list, check) {
    if (list == null) return [];
    if (!Array.isArray(list)) throw new Error('items must be a list of {item, count}');
    const merged = new Map();
    for (const entry of list) {
        const item = String(entry?.item ?? '')
            .trim()
            .toLowerCase()
            .replace(/^minecraft:/, '');
        const count = Number(entry?.count ?? 1);
        if (!/^[a-z0-9_]{1,64}$/.test(item)) throw new Error(`bad item name "${entry?.item}"`);
        if (!Number.isInteger(count) || count < 1 || count > 2304) throw new Error(`bad count for ${item}`);
        const problem = check?.(item);
        if (problem) throw new Error(problem);
        merged.set(item, (merged.get(item) ?? 0) + count);
    }
    if (merged.size > MAX_STACKS) throw new Error(`at most ${MAX_STACKS} different items per side`);
    return [...merged].map(([item, count]) => ({ item, count }));
}
export const describeItems = list => (list.length ? list.map(i => `${i.count} ${i.item}`).join(', ') : 'nothing');

// Vanilla command replies, as RCON returns them.
export function parseFound(text) {
    const m = /Found (\d+) matching item/.exec(text);
    if (m) return Number(m[1]);
    if (/No items were found/.test(text)) return 0;
    return null;
}
export const parseRemoved = text => Number(/Removed (\d+) item/.exec(text)?.[1] ?? 0);
export function parsePos(text) {
    const m = /\[(-?[\d.E-]+)d, (-?[\d.E-]+)d, (-?[\d.E-]+)d\]/.exec(text);
    return m ? m.slice(1, 4).map(Number) : null;
}
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Closest candidate to `from`, by position map {name: [x,y,z]}.
export function nearest(from, positions, candidates) {
    let best = null;
    for (const name of candidates) {
        const p = positions[name];
        if (!p || name === from || !positions[from]) continue;
        const d = distance(positions[from], p);
        if (!best || d < best.distance) best = { name, distance: d };
    }
    return best;
}

const squash = text =>
    String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

// Rate limits and anti-loop rules for messages between societies. Pure: callers pass the clock.
export class MessageLimiter {
    constructor({ minSecondsBetween = 20, maxPerHour = 30, maxPerPairPer10Min = 8, maxRepeats = 1 } = {}) {
        Object.assign(this, { minSecondsBetween, maxPerHour, maxPerPairPer10Min, maxRepeats });
        this.sent = new Map(); // sender -> [{t, pair, text}]
    }
    check(sender, pair, text, now) {
        const mine = (this.sent.get(sender) ?? []).filter(m => now - m.t < 3600_000);
        const last = mine.at(-1);
        if (last && now - last.t < this.minSecondsBetween * 1000)
            return `wait ${Math.ceil(this.minSecondsBetween - (now - last.t) / 1000)}s before your next message to the other society`;
        if (mine.length >= this.maxPerHour) return `limit of ${this.maxPerHour} messages per hour reached`;
        if (mine.filter(m => m.pair === pair && now - m.t < 600_000).length >= this.maxPerPairPer10Min)
            return `limit of ${this.maxPerPairPer10Min} messages to the same recipient per 10 minutes reached; act in the world before writing again`;
        const s = squash(text);
        if (mine.filter(m => m.text === s).length >= this.maxRepeats)
            return 'you already sent this message; say something new or act instead';
        return null;
    }
    record(sender, pair, text, now) {
        const mine = (this.sent.get(sender) ?? []).filter(m => now - m.t < 3600_000);
        mine.push({ t: now, pair, text: squash(text) });
        this.sent.set(sender, mine);
    }
}

// The protective pact in force between two factions, if any.
export function protectivePact(pacts, a, b, now) {
    if (a === b) return null;
    return (
        Object.values(pacts).find(
            p =>
                p.status === 'active' &&
                PROTECTIVE.has(p.type) &&
                (!p.until || Date.parse(p.until) > now) &&
                ((p.from === a && p.to === b) || (p.from === b && p.to === a)),
        ) ?? null
    );
}

// ---------- containers and ownership ----------
export const CONTAINERS = new Set(['chest', 'trapped_chest', 'barrel']);
export const posKey = p => p.map(Math.floor).join(',');

// Items from an SNBT list as `data get entity <p> Inventory` or `data get block <x y z> Items` prints it:
// `... has the following entity data: [{Slot: 0b, id: "minecraft:bread", count: 3}, ...]`.
// Only id and count at the top level of each entry are read, so nested item data cannot confuse it.
export function parseItemList(text) {
    const s = String(text);
    if (/Found no elements matching/.test(s)) return [];
    const start = s.indexOf('[', s.indexOf('data:'));
    if (start < 0) return null;
    const items = [];
    let depth = 0,
        inString = null,
        top = '';
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (depth === 2) top += ch;
            if (ch === '\\') {
                if (depth === 2) top += s[i + 1] ?? '';
                i++;
            } else if (ch === inString) inString = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = ch;
            if (depth === 2) top += ch;
            continue;
        }
        if (ch === '[' || ch === '{') {
            depth++;
            if (depth === 2) top = '';
            continue;
        }
        if (ch === ']' || ch === '}') {
            if (depth === 2) {
                const id = /\bid: ?"(?:minecraft:)?([a-z0-9_]+)"/.exec(top)?.[1];
                const count = Number(/\bcount: ?(\d+)/.exec(top)?.[1] ?? 1);
                if (id) items.push({ item: id, count });
            }
            depth--;
            if (depth === 0) break;
            continue;
        }
        if (depth === 2) top += ch;
    }
    return items;
}
export function tally(items) {
    const m = {};
    for (const { item, count } of items ?? []) m[item] = (m[item] ?? 0) + count;
    return m;
}
export function diffCounts(before, after) {
    const took = [],
        put = [];
    for (const item of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const d = (after[item] ?? 0) - (before[item] ?? 0);
        if (d > 0) put.push({ item, count: d });
        if (d < 0) took.push({ item, count: -d });
    }
    return { took, put };
}
// How a player stands to a container's owner: own, own_society_common, other_member, other_society or unowned.
export function relation(owner, player, factionOf) {
    if (!owner) return 'unowned';
    const mine = factionOf[player];
    if (owner.kind === 'player') {
        if (owner.id === player) return 'own';
        return factionOf[owner.id] === mine ? 'other_member' : 'other_society';
    }
    return owner.id === mine ? 'own_society_common' : 'other_society';
}

// ---------- gold as money ----------
export const GOLD = { gold_nugget: 1 / 9, gold_ingot: 1, gold_block: 9 };
export const isMoney = items => items.length > 0 && items.every(i => GOLD[i.item]);
export const goldValue = items => items.reduce((n, i) => n + (GOLD[i.item] ?? 0) * i.count, 0);
// Unit prices in gold ingots from trades where one side is only gold and the other one kind of item.
export function goldPrice(trade) {
    const [money, goods] = isMoney(trade.gave)
        ? [trade.gave, trade.got]
        : isMoney(trade.got)
          ? [trade.got, trade.gave]
          : [];
    if (!money || goods.length !== 1 || GOLD[goods[0].item]) return null;
    return {
        item: goods[0].item,
        count: goods[0].count,
        gold: goldValue(money),
        unit: goldValue(money) / goods[0].count,
    };
}
export function goldPrices(trades) {
    const by = {};
    for (const t of trades) {
        const p = goldPrice(t);
        if (p) (by[p.item] ??= []).push({ t: t.t, unit: p.unit });
    }
    return Object.fromEntries(
        Object.entries(by).map(([item, list]) => {
            const units = list.map(x => x.unit).sort((a, b) => a - b);
            const mid = units.length >> 1;
            const median = units.length % 2 ? units[mid] : (units[mid - 1] + units[mid]) / 2;
            const r = v => Math.round(v * 1000) / 1000;
            return [
                item,
                { trades: list.length, median: r(median), last: r(list.at(-1).unit), first: r(list[0].unit) },
            ];
        }),
    );
}

// ---------- evaluation helpers ----------
export function gini(values) {
    const v = values.filter(Number.isFinite).sort((a, b) => a - b);
    const n = v.length,
        sum = v.reduce((a, b) => a + b, 0);
    if (!n || !sum) return 0;
    let acc = 0;
    v.forEach((x, i) => (acc += (2 * (i + 1) - n - 1) * x));
    return acc / (n * sum);
}
