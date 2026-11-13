import { readFileSync } from 'node:fs';
import { CONTAINERS } from './rules.mjs';

const world = JSON.parse(readFileSync(new URL('./world.json', import.meta.url), 'utf8'));
const factionOf = Object.fromEntries(Object.entries(world.factions).flatMap(([f, d]) => d.players.map(p => [p, f])));
const FIGHT_RANGE = 24;
const at = p => [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];

// Chest bookkeeping: tells the referee which container this bot opens, closes, places or breaks. The referee reads the
// contents itself over RCON when the chest opens and closes, so the agent cannot misreport what was taken or put in.
export function installChestTracking(bot, post) {
    if (!bot || bot.pi_chestTracking) return;
    bot.pi_chestTracking = true;
    const quiet = promise => Promise.resolve(promise).catch(() => {});
    const within = (promise, ms) => Promise.race([promise, new Promise(r => setTimeout(r, ms).unref?.())]);
    let pending = null,
        opened = null;
    const remember = block => {
        if (block?.position && CONTAINERS.has(block.name))
            pending = { pos: at(block.position), block: block.name, at: Date.now() };
    };
    bot.on?.('windowOpen', window => {
        const src = pending && Date.now() - pending.at < 5000 ? pending : null;
        pending = null;
        if (!src) return;
        const snapshot = quiet(post('/chest/open', { pos: src.pos, block: src.block }));
        opened = snapshot;
        let done = false;
        const onBotClose = w => {
            if (w && w !== window) return;
            close();
        };
        const close = () => {
            if (done) return;
            done = true;
            bot.removeListener?.('windowClose', onBotClose);
            // The open snapshot has to land before the close is read.
            void snapshot.then(() => quiet(post('/chest/close', { pos: src.pos })));
        };
        window?.once?.('close', close);
        bot.on?.('windowClose', onBotClose);
    });
    for (const key of ['openContainer', 'openChest', 'openBlock', 'activateBlock']) {
        const original = bot[key];
        if (typeof original !== 'function') continue;
        bot[key] = async function (block, ...rest) {
            remember(block);
            opened = null;
            const result = await original.call(this, block, ...rest);
            // Hold the caller until the referee has read the contents, so nothing is clicked before the snapshot.
            if (opened) await within(opened, 3000);
            return result;
        };
    }
    const place = bot.placeBlock;
    if (typeof place === 'function')
        bot.placeBlock = async function (reference, face, ...rest) {
            const held = bot.heldItem?.name;
            const result = await place.call(this, reference, face, ...rest);
            if (CONTAINERS.has(held) && reference?.position?.plus && face)
                void quiet(post('/chest/placed', { pos: at(reference.position.plus(face)), block: held }));
            return result;
        };
    const dig = bot.dig;
    if (typeof dig === 'function')
        bot.dig = async function (block, ...rest) {
            const pos = block?.position && CONTAINERS.has(block.name) ? at(block.position) : null;
            const result = await dig.call(this, block, ...rest);
            if (pos) void quiet(post('/chest/broken', { pos }));
            return result;
        };
}

export default function createTools({ bot, name, schema, options = {}, wake }) {
    const referee = options.referee ?? process.env.SOCIETY_REFEREE ?? `http://127.0.0.1:${world.refereePort}`;
    const me = () => bot.username ?? name;
    const call = async (path, body) => {
        const res = await fetch(`${referee}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { 'content-type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(20000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Referee answered ${res.status}`);
        return data;
    };
    const q = path => `${path}?player=${encodeURIComponent(me())}`;

    // Referee events (offers, diplomacy, pacts, deaths, rations) wake the agent like a DM would.
    if (wake && options.poll !== false) {
        let busy = false;
        const timer = setInterval(
            async () => {
                if (busy) return;
                busy = true;
                try {
                    const { events } = await call(q('/inbox'));
                    for (const e of events) {
                        const { urgent = false, id, ...rest } = e;
                        wake({ kind: 'society', ...rest }, { key: `society:${id}`, urgent });
                    }
                } catch {
                    // Referee not up yet or restarting; try again next tick.
                } finally {
                    busy = false;
                }
            },
            (options.pollSeconds ?? 3) * 1000,
        );
        timer.unref?.();
    }

    if (options.trackChests !== false) installChestTracking(bot, (path, body) => call(path, { player: me(), ...body }));

    const items = {
        type: 'array',
        minItems: 0,
        maxItems: 8,
        items: schema.object({ item: schema.text(64), count: schema.integer(1, 2304) }),
    };
    const society = world.factions[factionOf[me()]]?.label ?? 'your society';

    const playersInReach = () =>
        Object.values(bot.entities ?? {})
            .filter(
                e =>
                    e?.type === 'player' &&
                    e.username &&
                    e.username !== me() &&
                    e.isValid !== false &&
                    e.position &&
                    bot.entity?.position,
            )
            .map(e => ({ e, d: e.position.distanceTo(bot.entity.position) }))
            .filter(x => x.d <= FIGHT_RANGE)
            .sort((a, b) => a.d - b.d);

    return [
        {
            name: 'fight',
            description: `Attack a player. Without target: picks the nearest player from another society within ${FIGHT_RANGE} blocks and fights them with the attack tool (chase, aim, swing) until they die, flee out of sight or seconds run out. With target: attacks that named player, including members of ${society}. If a non_aggression, alliance or peace pact protects them it refuses unless break_pact=true, which breaks the pact publicly. Fighting is one choice among many: deaths drop items, and every attack is logged and seen by everyone. Equip your best weapon first.`,
            properties: {
                target: { ...schema.text(16), pattern: '^[A-Za-z0-9_]+$' },
                seconds: schema.number(1, 60),
                break_pact: { type: 'boolean' },
            },
            required: [],
            body: true,
            run: async (args, { builtin }) => {
                const near = playersInReach();
                let pick;
                if (args.target) {
                    pick = near.find(x => x.e.username.toLowerCase() === args.target.toLowerCase());
                    if (!pick)
                        throw new Error(
                            `${args.target} is not within ${FIGHT_RANGE} blocks. Nearby: ${near.map(x => `${x.e.username} (${Math.round(x.d)})`).join(', ') || 'nobody'}.`,
                        );
                } else {
                    const mine = factionOf[me()];
                    pick = near.find(x => factionOf[x.e.username] && factionOf[x.e.username] !== mine);
                    if (!pick)
                        throw new Error(
                            `No player from another society within ${FIGHT_RANGE} blocks. Nearby: ${near.map(x => `${x.e.username} (${Math.round(x.d)})`).join(', ') || 'nobody'}. Name a target to attack someone else.`,
                        );
                }
                const target = pick.e.username;
                let note;
                try {
                    const verdict = await call('/combat', {
                        attacker: me(),
                        target,
                        breakPact: args.break_pact === true,
                    });
                    if (!verdict.allowed)
                        return { attacked: false, target, reason: verdict.reason, pact: verdict.pact };
                } catch (error) {
                    note = `referee unreachable, attack not logged: ${error.message}`;
                }
                const result = await builtin('attack', {
                    id: pick.e.id,
                    ...(args.seconds ? { seconds: args.seconds } : {}),
                });
                return {
                    attacked: true,
                    target,
                    targetSociety: world.factions[factionOf[target]]?.label ?? 'none',
                    ...result,
                    ...(note ? { note } : {}),
                };
            },
        },
        {
            name: 'trade_offer',
            description: `Offer a trade that the server carries out. give = items you hand over, want = items you get back (leave want empty for a gift, give empty to ask for something). Without to: goes to the nearest online member of ${society}. With to: any player, including the other society. The other player is woken and decides with trade_respond; items only move if they accept while you are both within ${world.trade.rangeBlocks} blocks and both still hold the items. Only plain stackable items (no tools, armor or other items with durability or data; use drop_item for those). Gold (gold_ingot; nuggets and blocks count 1/9 and 9) is the usual currency, but any exchange works. Offers expire after ${world.trade.offerMinutes} minutes.`,
            properties: {
                to: { ...schema.text(16), pattern: '^[A-Za-z0-9_]+$' },
                give: items,
                want: items,
                note: schema.text(300),
            },
            required: ['give', 'want'],
            run: args => call('/trade/offer', { from: me(), ...args }),
        },
        {
            name: 'trade_respond',
            description:
                'Answer a trade offer by id. accept=true executes it on the server (both players within range, both holding the items); accept=false declines. Calling it on your own open offer cancels it.',
            properties: {
                id: schema.integer(1, Number.MAX_SAFE_INTEGER),
                accept: { type: 'boolean' },
                reason: schema.text(300),
            },
            required: ['id', 'accept'],
            run: args => call('/trade/respond', { player: me(), ...args }),
        },
        {
            name: 'trades',
            description:
                'Your open trade offers (sent and received), your recent finished ones, the latest completed trades in the world and current gold prices per item (from trades paid in gold).',
            properties: {},
            run: () => call(q('/trades')),
        },
        {
            name: 'diplomacy_send',
            description: `Send a message to the other society (to = a society name or one of its players). For messages inside ${society} use send_dm. Rate-limited and anti-repeat; every message is logged and shown in public chat. Optionally propose a pact (non_aggression, alliance, peace, trade_agreement, other) with terms and a duration in minutes; the other side answers with pact_respond. Pacts are recorded, not enforced.`,
            properties: {
                to: schema.text(32),
                text: schema.text(world.diplomacy.maxChars),
                pact: schema.choice(['non_aggression', 'alliance', 'peace', 'trade_agreement', 'other']),
                pact_terms: schema.text(600),
                pact_minutes: schema.integer(5, 100000),
            },
            required: ['to', 'text'],
            run: args =>
                call('/message', {
                    from: me(),
                    to: args.to,
                    text: args.text,
                    pact: args.pact,
                    pactTerms: args.pact_terms,
                    pactMinutes: args.pact_minutes,
                }),
        },
        {
            name: 'pact_respond',
            description:
                'Accept or decline a pact proposed to your society, by id. accept=false on an active pact ends it (announced to everyone).',
            properties: {
                id: schema.integer(1, Number.MAX_SAFE_INTEGER),
                accept: { type: 'boolean' },
                reason: schema.text(300),
            },
            required: ['id', 'accept'],
            run: args => call('/pact/respond', { player: me(), ...args }),
        },
        {
            name: 'society_status',
            description:
                'Your society, its members, base and storage chests (and who owns which), the other society, the world border, the neutral iron deposit, rations, rules for trades, diplomacy and pacts, current pacts, open trades and recent public events (trades, fights, deaths).',
            properties: {},
            run: () => call(q('/status')),
        },
    ];
}
