#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const OUT_MD = path.resolve('logs/runde-2-logs.md');
const OUT_RAW = path.resolve('logs/runde-2-raw');
mkdirSync(path.dirname(OUT_MD), { recursive: true });
mkdirSync(OUT_RAW, { recursive: true });

// 1. Copy raw .agent-state directories cleanly (excluding sockets/locks if any)
for (const dir of ['societies', 'societies-collective', 'societies-market']) {
    const src = path.join('.agent-state', dir);
    const dst = path.join(OUT_RAW, dir);
    if (existsSync(src)) {
        try {
            rmSync(dst, { recursive: true, force: true });
            cpSync(src, dst, { recursive: true, force: true });
        } catch {
            // Retry once if a live SQLite/session file rotated mid-copy
            rmSync(dst, { recursive: true, force: true });
            cpSync(src, dst, { recursive: true, force: true });
        }
    }
}

// 2. Capture Docker Compose logs for all 4 containers
for (const svc of ['server', 'referee', 'collective', 'market']) {
    try {
        const out = execSync(`docker compose --env-file .env -f examples/societies/compose.yaml logs --no-color ${svc}`, {
            encoding: 'utf8',
            maxBuffer: 50 * 1024 * 1024,
        });
        writeFileSync(path.join(OUT_RAW, `docker-${svc}.log`), out);
    } catch {
        // ignore if unavailable
    }
}

const readJsonLines = filePath => {
    if (!existsSync(filePath)) return [];
    const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    const out = [];
    for (const l of lines) {
        try {
            out.push(JSON.parse(l));
        } catch {
            // ignore partial line
        }
    }
    return out;
};

const fmtTime = ts => {
    const ms = typeof ts === 'number' ? ts : Date.parse(ts);
    return Number.isFinite(ms) ? new Date(ms).toLocaleString('de-DE') : String(ts ?? '?');
};

// 3. Build Markdown report
const md = [];
md.push(`# Minecraft Agents — Runde 2 Log-Export`);
md.push(`Exportiert am: **${new Date().toLocaleString('de-DE')}**`);
md.push(`Rohdaten-Archiv: \`logs/runde-2-raw/\`\n`);

// Referee state & world events
const stateFile = '.agent-state/societies/state.json';
if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    md.push(`## 1. Gesamtstatistik (Referee)`);
    md.push(`- **Gestartet:** ${fmtTime(state.createdAt)}`);
    md.push(`- **Trades abgeschlossen:** ${state.stats?.trades ?? 0}`);
    md.push(`- **Diplomatie-Nachrichten:** ${state.stats?.messages ?? 0}`);
    md.push(`- **Tode:** \`${JSON.stringify(state.stats?.deaths ?? {})}\``);
    md.push(`- **Kills:** \`${JSON.stringify(state.stats?.kills ?? {})}\``);
    const pacts = Object.values(state.pacts ?? {});
    if (pacts.length) {
        md.push(`\n### Pakte (${pacts.length})`);
        for (const p of pacts) {
            md.push(`- **#${p.id}** [${p.status}] ${p.from} ↔ ${p.to} (${p.type}): ${p.terms}`);
        }
    }
    md.push('');
}

const messages = readJsonLines('.agent-state/societies/messages.jsonl');
md.push(`## 2. Diplomatie-Verlauf (${messages.length} Nachrichten)`);
if (messages.length) {
    for (const m of messages) {
        md.push(`- **${fmtTime(m.t)}** \`${m.from} (${m.fromFaction})\` → \`${m.to}\`${m.pact ? ` [Pakt #${m.pact}]` : ''}: ${m.text}`);
    }
} else {
    md.push(`*(Bisher keine Diplomatie-Nachrichten)*`);
}
md.push('');

const events = readJsonLines('.agent-state/societies/events.jsonl');
const interestingEvents = events.filter(e => e.event !== 'chest_access');
md.push(`## 3. Wichtige Welt-Ereignisse (${interestingEvents.length} ohne Truhen-Logs, ${events.length} gesamt)`);
for (const ev of interestingEvents) {
    md.push(`- **${fmtTime(ev.t)}** \`${ev.event}\`: \`${JSON.stringify(ev)}\``);
}
md.push('');

// Internal DMs per society
md.push(`## 4. Team-interne Kommunikation (Direct Messages)`);
for (const [label, dir] of [
    ['Collective', '.agent-state/societies-collective'],
    ['Market', '.agent-state/societies-market'],
]) {
    const dbPath = path.join(dir, 'shared', 'mailbox.sqlite');
    md.push(`\n### ${label}`);
    if (!existsSync(dbPath)) {
        md.push(`*(Keine Mailbox-DB gefunden)*`);
        continue;
    }
    try {
        const con = new DatabaseSync(dbPath, { open: true });
        const rows = con.prepare('SELECT * FROM mailbox_dm ORDER BY id ASC').all();
        con.close();
        if (!rows.length) md.push(`*(Noch keine internen DMs)*`);
        for (const r of rows) {
            md.push(`- **${fmtTime(Number(r.created_at))}** \`${r.sender}\` → \`${r.recipient}\`: ${r.text ?? r.body ?? ''}`);
        }
    } catch (e) {
        md.push(`*(Fehler beim Lesen der Mailbox: ${e.message})*`);
    }
}
md.push('');

// Per-Agent summary: tool counts, errors, deaths, recent thoughts
md.push(`## 5. Bot-Telemetrie, Werkzeuge & Gedankengänge`);
for (const [label, dir] of [
    ['Collective', '.agent-state/societies-collective'],
    ['Market', '.agent-state/societies-market'],
]) {
    if (!existsSync(dir)) continue;
    md.push(`\n### Team ${label}`);
    for (const agent of readdirSync(dir).sort()) {
        if (agent === 'shared') continue;
        const tPath = path.join(dir, agent, 'telemetry.jsonl');
        if (!existsSync(tPath)) continue;
        const entries = readJsonLines(tPath);
        const toolCounts = {};
        const errors = [];
        const deaths = [];
        let lastObs = null;
        for (const o of entries) {
            if (o.event === 'observation') lastObs = o;
            else if (o.event === 'tool') {
                const k = `${o.tool}:${o.success ? 'ok' : 'fail'}`;
                toolCounts[k] = (toolCounts[k] || 0) + 1;
            } else if (o.event === 'model_error' || o.event === 'cycle_error' || o.event === 'death_log') {
                if (o.event === 'death_log') deaths.push(o.line);
                else errors.push(`${fmtTime(o.time)} ${o.event}: ${JSON.stringify(o).slice(0, 160)}`);
            }
        }
        const pos = lastObs?.position
            ? `${Math.round(lastObs.position.x)}, ${Math.round(lastObs.position.y)}, ${Math.round(lastObs.position.z)}`
            : '?';
        md.push(`\n#### ${agent} (Pos: ${pos} | HP: ${lastObs?.health ?? '?'}/20 | Food: ${lastObs?.food ?? '?'}/20)`);
        const inv = (lastObs?.inventory || []).map(i => `${i.count}× ${i.name}`).join(', ');
        md.push(`- **Inventar:** ${inv || 'leer'}`);
        md.push(`- **Tool-Bilanz:** \`${JSON.stringify(toolCounts)}\``);
        if (deaths.length) md.push(`- **Tode (${deaths.length}):** ${deaths.join(' | ')}`);
        if (errors.length) md.push(`- **Modell-/Systemfehler (${errors.length}):** ${errors.slice(-5).join(' | ')}`);

        // Extract reasoning/thoughts from pi-sessions
        const sessDir = path.join(dir, agent, 'pi-sessions', agent);
        if (existsSync(sessDir)) {
            const files = readdirSync(sessDir)
                .filter(f => f.endsWith('.jsonl'))
                .sort((a, b) => statSync(path.join(sessDir, a)).mtimeMs - statSync(path.join(sessDir, b)).mtimeMs);
            const allThoughts = [];
            for (const f of files) {
                for (const item of readJsonLines(path.join(sessDir, f))) {
                    const m = item.message;
                    if (m?.role !== 'assistant' || !Array.isArray(m.content)) continue;
                    const t = fmtTime(item.timestamp ?? m.timestamp);
                    for (const b of m.content) {
                        if ((b.type === 'thinking' || b.type === 'text') && (b.thinking || b.text || '').trim()) {
                            allThoughts.push(`  - [${t}] ${(b.thinking || b.text).replace(/\s+/g, ' ').trim()}`);
                        }
                    }
                }
            }
            if (allThoughts.length) {
                md.push(`- **Gedankengänge (letzte 25 von ${allThoughts.length}):**`);
                md.push(...allThoughts.slice(-25));
            }
        }
    }
}

writeFileSync(OUT_MD, md.join('\n') + '\n');
console.log(`Export abgeschlossen: ${OUT_MD} (${md.length} Zeilen) + Roharchiv in ${OUT_RAW}`);
