#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const dbs = [
    { label: 'COLLECTIVE DM', color: '\x1b[36m', path: '.agent-state/societies-collective/shared/mailbox.sqlite' },
    { label: 'MARKET DM    ', color: '\x1b[33m', path: '.agent-state/societies-market/shared/mailbox.sqlite' },
];
const eventsPath = '.agent-state/societies/events.jsonl';
const lastId = new Map();
let lastEventLines = 0;

function ts(ms) {
    return new Date(typeof ms === 'number' ? ms : Date.parse(ms)).toLocaleTimeString('de-DE');
}

function poll() {
    for (const db of dbs) {
        if (!existsSync(db.path)) continue;
        try {
            const con = new DatabaseSync(db.path, { open: true });
            const prev = lastId.get(db.path) ?? 0;
            const rows = con
                .prepare('SELECT id, sender, recipient, body, created_at FROM mailbox_dm WHERE id > ? ORDER BY id ASC')
                .all(prev);
            con.close();
            for (const r of rows) {
                console.log(
                    `${db.color}[${ts(r.created_at)}] [${db.label}] ${r.sender} -> ${r.recipient}:\x1b[0m ${r.body}`,
                );
                lastId.set(db.path, r.id);
            }
        } catch {
            // ignore transient sqlite lock
        }
    }
    if (existsSync(eventsPath)) {
        try {
            const lines = readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
            for (const line of lines.slice(lastEventLines)) {
                const ev = JSON.parse(line);
                if (ev.event === 'diplomacy') {
                    console.log(
                        `\x1b[35m[${ts(ev.t)}] [DIPLOMACY    ] ${ev.from} (${ev.fromFaction}) -> ${ev.to}:\x1b[0m ${ev.text}`,
                    );
                } else if (ev.event === 'pact_proposed' || ev.event === 'pact_responded') {
                    console.log(
                        `\x1b[35m[${ts(ev.t)}] [PACT         ] ${ev.event}: ${ev.type ?? ''} (${ev.from ?? ''} -> ${ev.to ?? ''}) ${ev.terms ?? ev.status ?? ''}\x1b[0m`,
                    );
                } else if (ev.event?.startsWith('trade_')) {
                    console.log(
                        `\x1b[32m[${ts(ev.t)}] [TRADE #${ev.id}     ] ${ev.event}: ${ev.from ?? ev.by ?? ''} -> ${ev.to ?? ''} ${ev.note ?? ''}\x1b[0m`,
                    );
                } else if (ev.event === 'fight' || ev.event === 'death') {
                    console.log(`\x1b[31m[${ts(ev.t)}] [COMBAT       ] ${JSON.stringify(ev)}\x1b[0m`);
                }
            }
            lastEventLines = lines.length;
        } catch {
            // ignore partial line
        }
    }
}

console.log('=== Live-Ticker: Agenten-Kommunikation (DMs, Diplomatie, Handel, Kampf) ===');
poll();
setInterval(poll, 1000);
