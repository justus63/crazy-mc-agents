#!/usr/bin/env node
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.DASHBOARD_PORT ?? 4321);

const MODEL_BY_AGENT = {
    Stalin: 'azure/gpt-6.1-terra (medium)',
    Justus: 'azure/gpt-6.1-terra (medium)',
    Reinecke: 'azure/gpt-5.6-luna (low)',
    FlorianHomm: 'azure/gpt-5.6-luna (low)',
    Zappel: 'azure/gpt-5.6-luna (low)',
    Trump: 'azure/gpt-5.6-luna (low)',
    Marcant: 'azure/gpt-5.6-luna (low)',
    Simon: 'azure/gpt-5.6-luna (low)',
    Lange: 'azure/gpt-5.6-luna (low)',
    Fohrmann: 'azure/gpt-5.6-luna (low)',
};

const SOCIETIES = [
    {
        key: 'collective',
        label: 'Collective (Kollektiv)',
        leader: 'Stalin',
        members: ['Stalin', 'Reinecke', 'Zappel', 'Marcant', 'Lange'],
        stateDir: '.agent-state/societies-collective',
    },
    {
        key: 'market',
        label: 'Market (Kapitalisten)',
        leader: 'Justus',
        members: ['Justus', 'FlorianHomm', 'Trump', 'Simon', 'Fohrmann'],
        stateDir: '.agent-state/societies-market',
    },
];

function readDms(society) {
    const dbPath = path.join(society.stateDir, 'shared', 'mailbox.sqlite');
    if (!existsSync(dbPath)) return [];
    try {
        const con = new DatabaseSync(dbPath, { open: true });
        const rows = con
            .prepare('SELECT id, sender, recipient, body, created_at FROM mailbox_dm ORDER BY id DESC LIMIT 150')
            .all();
        con.close();
        return rows.map(r => ({
            id: `${society.key}-dm-${r.id}`,
            kind: 'dm',
            society: society.key,
            from: r.sender,
            to: r.recipient,
            text: r.body,
            time: Number(r.created_at),
        }));
    } catch {
        return [];
    }
}

function readJsonLinesTail(filePath, maxLines = 180) {
    if (!existsSync(filePath)) return [];
    try {
        const raw = readFileSync(filePath, 'utf8').trim();
        if (!raw) return [];
        const lines = raw.split('\n');
        const out = [];
        for (const line of lines.slice(-maxLines)) {
            try {
                out.push(JSON.parse(line));
            } catch {
                // ignore partial line
            }
        }
        return out;
    } catch {
        return [];
    }
}

function readWorldEvents() {
    const events = readJsonLinesTail('.agent-state/societies/events.jsonl', 220);
    const messages = readJsonLinesTail('.agent-state/societies/messages.jsonl', 120);
    const out = [];
    for (const m of messages) {
        out.push({
            id: `dip-${m.id ?? m.t}`,
            kind: 'diplomacy',
            society: m.fromFaction,
            from: m.from,
            to: m.to,
            text: m.text,
            pactProposal: m.pactProposal ?? null,
            time: Date.parse(m.t) || Date.now(),
        });
    }
    for (const ev of events) {
        const time = Date.parse(ev.t) || Date.now();
        if (ev.event?.startsWith('trade_')) {
            out.push({
                id: `trade-${ev.event}-${ev.id}-${ev.t}`,
                kind: 'trade',
                subtype: ev.event,
                tradeId: ev.id,
                society: ev.fromFaction ?? null,
                from: ev.from ?? ev.by ?? '?',
                to: ev.to ?? '',
                give: ev.give ?? [],
                want: ev.want ?? [],
                note: ev.note ?? ev.reason ?? '',
                time,
            });
        } else if (ev.event?.startsWith('pact_')) {
            out.push({
                id: `pact-${ev.event}-${ev.id}-${ev.t}`,
                kind: 'pact',
                subtype: ev.event,
                pactId: ev.id,
                pactType: ev.type ?? '',
                from: ev.from ?? ev.by ?? '',
                to: ev.to ?? '',
                text: ev.terms ?? ev.status ?? '',
                time,
            });
        } else if (ev.event === 'fight' || ev.event === 'death') {
            out.push({
                id: `combat-${ev.event}-${ev.t}`,
                kind: 'combat',
                subtype: ev.event,
                from: ev.attacker ?? ev.player ?? '?',
                to: ev.target ?? '',
                text:
                    ev.message ??
                    `${ev.event}: ${ev.attacker ?? ev.player ?? ''} ${ev.target ? '-> ' + ev.target : ''}`,
                time,
            });
        }
    }
    return out;
}

function summarizeThought(raw) {
    if (!raw) return '';
    const cleaned = raw
        .replace(/^(We need to|Let me|Current (situation|state):?)\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    const pick = sentences.slice(0, 2).join(' ');
    return pick.length > 160 ? pick.slice(0, 157) + '...' : pick;
}

function summarizeAction(tool, argsStr, resultStr, success) {
    let args = {};
    try {
        args = JSON.parse(argsStr || '{}');
    } catch {
        // ignore
    }
    const status = success ? '✓' : '✗';
    switch (tool) {
        case 'go_to':
            return `${status} Gehe zu (${args.x}, ${args.y}, ${args.z})`;
        case 'gather':
            return `${status} Sammle ${args.count ?? 1}× ${args.block}`;
        case 'break_block':
            return `${status} Baue Block ab (${args.x}, ${args.y}, ${args.z})`;
        case 'place':
            return `${status} Platziere ${args.block} bei (${args.x}, ${args.y}, ${args.z})`;
        case 'craft':
            return `${status} Crafte ${args.count ?? 1}× ${args.item}`;
        case 'send_dm':
            return `${status} DM an ${args.to}: "${String(args.text ?? '').slice(0, 60)}"`;
        case 'read_dms':
            return `${status} Liest DMs${args.peer ? ' von ' + args.peer : ''}`;
        case 'diplomacy_send':
            return `${status} Diplomatie an ${args.to}: "${String(args.text ?? '').slice(0, 60)}"`;
        case 'trade_offer':
            return `${status} Handelsangebot an ${args.to ?? 'Team'}`;
        case 'trade_respond':
            return `${status} Handel #${args.id} ${args.accept ? 'angenommen' : 'abgelehnt'}`;
        case 'deposit':
            return `${status} Legt ${args.count ?? ''}× ${args.item} in Kiste`;
        case 'withdraw':
            return `${status} Nimmt ${args.count ?? ''}× ${args.item} aus Kiste`;
        case 'furnace':
        case 'smelt':
            return `${status} Ofen/Schmelzen (${args.operation ?? args.item ?? ''})`;
        case 'fight':
        case 'attack':
            return `${status} Greift ${args.target ?? 'Gegner'} an!`;
        default:
            return `${status} ${tool} ${String(argsStr || '').slice(0, 50)}`;
    }
}

function synthesizeToolPlanThought(toolCalls, modelLabel = 'azure/gpt-5.6-luna') {
    if (!toolCalls.length) return null;
    const parts = [];
    const details = [];
    for (const tc of toolCalls) {
        const a = tc.arguments || {};
        switch (tc.name) {
            case 'send_dm':
                parts.push(`Befehl/Nachricht an ${a.to}: "${String(a.text ?? '').slice(0, 80)}"`);
                details.push(`• send_dm an ${a.to}: "${a.text ?? ''}"`);
                break;
            case 'diplomacy_send':
                parts.push(`Diplomatie an ${a.to}: "${String(a.text ?? '').slice(0, 80)}"`);
                details.push(`• diplomacy_send an ${a.to}: "${a.text ?? ''}"`);
                break;
            case 'go_to':
                parts.push(`Bewegt sich zu (${a.x}, ${a.y}, ${a.z})`);
                details.push(`• go_to: Ziel (${a.x}, ${a.y}, ${a.z}) [Distanz-Toleranz: ${a.range ?? 2}]`);
                break;
            case 'gather':
                parts.push(`Plant Abbau von ${a.count ?? 1}× ${a.block}`);
                details.push(`• gather: Sammle ${a.count ?? 1}× ${a.block} (Radius ${a.maxDistance ?? 32})`);
                break;
            case 'break_block':
                parts.push(`Baut Block bei (${a.x}, ${a.y}, ${a.z}) ab`);
                details.push(`• break_block bei (${a.x}, ${a.y}, ${a.z})`);
                break;
            case 'break_area':
                parts.push(
                    `Hebt Bereich (${a.x1 ?? a.from?.x},${a.y1 ?? a.from?.y},${a.z1 ?? a.from?.z})→(${a.x2 ?? a.to?.x},${a.y2 ?? a.to?.y},${a.z2 ?? a.to?.z}) aus`,
                );
                details.push(
                    `• break_area: (${a.x1 ?? a.from?.x},${a.y1 ?? a.from?.y},${a.z1 ?? a.from?.z}) bis (${a.x2 ?? a.to?.x},${a.y2 ?? a.to?.y},${a.z2 ?? a.to?.z})`,
                );
                break;
            case 'observe_world':
                parts.push(`Scannt Umgebung (Radius ${a.distance ?? 32} Blöcke)`);
                details.push(`• observe_world: Radius ${a.distance ?? 32}`);
                break;
            case 'place':
                parts.push(`Platziert ${a.block} bei (${a.x}, ${a.y}, ${a.z})`);
                details.push(`• place: ${a.block} bei (${a.x}, ${a.y}, ${a.z})`);
                break;
            case 'craft':
                parts.push(`Fertigt ${a.count ?? 1}× ${a.item} an`);
                details.push(`• craft: ${a.count ?? 1}× ${a.item}`);
                break;
            case 'smelt':
            case 'furnace':
                parts.push(`Schmilzt ${a.count ?? ''}× ${a.input ?? a.item ?? 'Erz/Nahrung'} im Ofen`);
                details.push(`• ${tc.name}: ${JSON.stringify(a)}`);
                break;
            case 'deposit':
                parts.push(`Lagert ${a.count ?? 'alle'}× ${a.item} in die Team-Truhe ein`);
                details.push(
                    `• deposit: ${a.count ?? 'alle'}× ${a.item} in Kiste (${a.x ?? ''}, ${a.y ?? ''}, ${a.z ?? ''})`,
                );
                break;
            case 'withdraw':
                parts.push(`Entnimmt ${a.count ?? ''}× ${a.item} aus der Truhe`);
                details.push(`• withdraw: ${a.count ?? ''}× ${a.item}`);
                break;
            case 'return_to_surface':
                parts.push('Kehrt an die Oberfläche zurück');
                details.push('• return_to_surface: Aus Höhle/Schacht nach oben graben/laufen');
                break;
            case 'eat':
                parts.push(`Isst ${a.item ?? 'Nahrung'} zur Heilung/Sättigung`);
                details.push(`• eat: ${a.item ?? 'automatisch'}`);
                break;
            case 'equip':
                parts.push(`Rüstet ${a.item} (${a.destination ?? 'hand'}) aus`);
                details.push(`• equip: ${a.item} -> ${a.destination ?? 'hand'}`);
                break;
            case 'workspace_write':
            case 'write_file':
                parts.push(`Aktualisiert Notiz/Plan (${a.path ?? 'Notizen'})`);
                details.push(`• ${tc.name} (${a.path ?? ''}):\n${String(a.content ?? '').slice(0, 400)}`);
                break;
            case 'read_dms':
                parts.push(`Prüft Postfach${a.peer ? ' (' + a.peer + ')' : ''}`);
                details.push(`• read_dms${a.peer ? ' von ' + a.peer : ''}`);
                break;
            default:
                parts.push(`Entscheidung: ${tc.name}(${Object.values(a).slice(0, 2).join(', ')})`);
                details.push(`• ${tc.name}: ${JSON.stringify(a)}`);
                break;
        }
    }
    const summaryText = parts.join(' → ');
    return {
        type: 'thinking',
        synthetic: true,
        summary: summaryText.length > 160 ? summaryText.slice(0, 157) + '...' : summaryText,
        full: `[Kein Klartext-Reasoning vom Modell (${modelLabel}) — OpenAI/Azure liefert internen CoT teils nur verschlüsselt; abgeleiteter Aktionsplan]\n${details.join('\n')}`,
    };
}

function readAgentState(society, name) {
    const dir = path.join(society.stateDir, name);
    const telemetry = readJsonLinesTail(path.join(dir, 'telemetry.jsonl'), 120);
    let health = null;
    let food = null;
    let position = null;
    let inventory = [];
    const actions = [];

    for (const entry of telemetry) {
        if (entry.event === 'observation') {
            health = entry.health ?? health;
            food = entry.food ?? food;
            if (entry.position) {
                position = {
                    x: Math.round(entry.position.x),
                    y: Math.round(entry.position.y),
                    z: Math.round(entry.position.z),
                };
            }
            if (Array.isArray(entry.inventory)) inventory = entry.inventory;
        } else if (entry.event === 'tool') {
            actions.push({
                tool: entry.tool,
                args: entry.args,
                result: String(entry.result ?? '').slice(0, 180),
                success: entry.success,
                summary: summarizeAction(entry.tool, entry.args, entry.result, entry.success),
                time: Date.parse(entry.time) || Date.now(),
            });
        }
    }

    const sessionsDir = path.join(dir, 'pi-sessions', name);
    const thoughts = [];
    if (existsSync(sessionsDir)) {
        try {
            const files = readdirSync(sessionsDir)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => ({ f, mtime: statSync(path.join(sessionsDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
            if (files.length) {
                const entries = readJsonLinesTail(path.join(sessionsDir, files[0].f), 180);
                for (const item of entries) {
                    const msg = item.message;
                    if (msg?.role !== 'assistant' || !Array.isArray(msg.content)) continue;
                    const t = Date.parse(item.timestamp ?? msg.timestamp) || files[0].mtime;
                    const entryKey = item.id ?? `${files[0].f}:${t}`;
                    let addedExplicitThought = false;
                    const toolCalls = [];
                    for (let blockIdx = 0; blockIdx < msg.content.length; blockIdx++) {
                        const block = msg.content[blockIdx];
                        if (block.type === 'thinking' || block.type === 'text') {
                            const raw = (block.thinking || block.text || '').trim();
                            if (raw) {
                                thoughts.push({
                                    id: `${name}:${entryKey}:${blockIdx}`,
                                    type: block.type,
                                    synthetic: false,
                                    summary: summarizeThought(raw),
                                    full: raw,
                                    time: t,
                                });
                                addedExplicitThought = true;
                            }
                        } else if (block.type === 'toolCall') {
                            toolCalls.push(block);
                        }
                    }
                    if (!addedExplicitThought && toolCalls.length) {
                        const synth = synthesizeToolPlanThought(toolCalls, MODEL_BY_AGENT[name] ?? 'azure/gpt-5.6-luna');
                        if (synth) {
                            thoughts.push({ id: `${name}:${entryKey}:plan`, ...synth, time: t });
                        }
                    }
                }
            }
        } catch {
            // ignore
        }
    }

    return {
        name,
        society: society.key,
        societyLabel: society.label,
        isLeader: society.leader === name,
        model: MODEL_BY_AGENT[name] ?? 'oski/mistral-small-4-119b',
        health,
        food,
        position,
        inventory,
        lastAction: actions.at(-1) ?? null,
        recentActions: actions.slice(-25).reverse(),
        latestThought: thoughts.at(-1) ?? null,
        recentThoughts: thoughts.slice(-30).reverse(),
    };
}

function buildSnapshot() {
    const dms = SOCIETIES.flatMap(readDms);
    const worldEvents = readWorldEvents();
    const feed = [...dms, ...worldEvents].sort((a, b) => b.time - a.time).slice(0, 200);
    const agents = SOCIETIES.flatMap(s => s.members.map(m => readAgentState(s, m)));
    return { now: Date.now(), societies: SOCIETIES, agents, feed };
}

const HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Minecraft Agents — Live Mission Control</title>
<style>
  :root {
    --bg: #0b0f17;
    --panel: #121926;
    --panel-2: #182234;
    --panel-hover: #1f2d44;
    --border: #26344d;
    --text: #e6edf7;
    --muted: #8b9bb4;
    --collective: #22d3ee;
    --collective-bg: rgba(34, 211, 238, 0.09);
    --market: #facc15;
    --market-bg: rgba(250, 204, 21, 0.09);
    --diplomacy: #c084fc;
    --trade: #34d399;
    --combat: #f87171;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    height: 100vh; width: 100vw;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--text);
  }
  .app {
    display: grid;
    grid-template-rows: 52px 1fr;
    height: 100vh;
    width: 100vw;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 18px; background: var(--panel); border-bottom: 1px solid var(--border);
  }
  .title-wrap { display: flex; align-items: center; gap: 10px; }
  h1 { font-size: 16px; margin: 0; font-weight: 700; }
  .live-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; padding: 3px 9px; border-radius: 999px;
    background: rgba(52, 211, 153, 0.14); color: var(--trade); font-weight: 700;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--trade); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .filters { display: flex; gap: 5px; }
  .filter-btn {
    background: var(--panel-2); color: var(--muted);
    border: 1px solid var(--border); padding: 5px 10px;
    border-radius: 7px; cursor: pointer; font-size: 11.5px; font-weight: 600;
  }
  .filter-btn.active { color: var(--text); border-color: #60a5fa; background: rgba(96, 165, 250, 0.18); }

  /* 3-Column Equal Fullscreen Workspace */
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.15fr);
    gap: 12px;
    padding: 12px;
    height: calc(100vh - 52px);
    overflow: hidden;
  }
  .col {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .col.collective { border-top: 3px solid var(--collective); }
  .col.market { border-top: 3px solid var(--market); }
  .col.feed { border-top: 3px solid #60a5fa; }

  .col-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0;
  }
  .col-title { font-weight: 700; font-size: 14px; }
  .col-title.collective { color: var(--collective); }
  .col-title.market { color: var(--market); }
  .col-sub { font-size: 11px; color: var(--muted); }

  /* Uniform 5-row grid for the 5 agents in each society */
  .agents-list {
    display: grid;
    grid-template-rows: repeat(5, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
    flex: 1;
    overflow: hidden;
  }
  .agent-card {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 8px 11px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, transform 0.08s;
    overflow: hidden;
  }
  .agent-card:hover { background: var(--panel-hover); border-color: #60a5fa; }
  .agent-card.selected { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.28); }
  .agent-card.leader { border-color: rgba(250, 204, 21, 0.55); background: linear-gradient(180deg, rgba(250,204,21,0.07), var(--panel-2)); }

  .row-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .agent-name { font-weight: 700; font-size: 13.5px; display: inline-flex; align-items: center; gap: 6px; }
  .badge { font-size: 9.5px; padding: 2px 5px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }
  .badge.leader { background: rgba(250, 204, 21, 0.22); color: #fde047; }
  .badge.model { background: rgba(148, 163, 184, 0.14); color: var(--muted); font-weight: 500; text-transform: none; }
  .vitals { font-size: 11px; color: var(--muted); display: flex; gap: 8px; align-items: center; }

  .thought-preview {
    font-size: 11.5px; color: #dbeafe; line-height: 1.35;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; text-overflow: ellipsis;
    background: rgba(15, 23, 42, 0.55); border-left: 2.5px solid #60a5fa;
    padding: 4px 8px; border-radius: 5px;
  }
  .row-bottom {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
    font-size: 11px; color: var(--muted);
  }
  .action-preview {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: #93c5fd; flex: 1;
  }
  .click-hint { font-size: 10px; color: #60a5fa; flex-shrink: 0; font-weight: 600; }

  /* Feed column */
  .feed-list {
    padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; flex: 1;
  }
  .msg-card {
    padding: 8px 10px; border-radius: 8px; background: var(--panel-2);
    border-left: 3.5px solid var(--border); font-size: 12px; line-height: 1.4;
  }
  .msg-card.collective { border-left-color: var(--collective); background: var(--collective-bg); }
  .msg-card.market { border-left-color: var(--market); background: var(--market-bg); }
  .msg-card.diplomacy, .msg-card.pact { border-left-color: var(--diplomacy); background: rgba(192, 132, 252, 0.10); }
  .msg-card.trade { border-left-color: var(--trade); background: rgba(52, 211, 153, 0.10); }
  .msg-card.combat { border-left-color: var(--combat); background: rgba(248, 113, 113, 0.12); }
  .msg-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 3px; font-size: 11px; }
  .msg-route { font-weight: 700; }
  .tag { font-size: 9.5px; font-weight: 700; padding: 1.5px 5px; border-radius: 4px; text-transform: uppercase; margin-right: 4px; }
  .tag.collective { background: rgba(34,211,238,0.2); color: var(--collective); }
  .tag.market { background: rgba(250,204,21,0.2); color: var(--market); }
  .tag.diplomacy, .tag.pact { background: rgba(192,132,252,0.22); color: var(--diplomacy); }
  .tag.trade { background: rgba(52,211,153,0.22); color: var(--trade); }
  .tag.combat { background: rgba(248,113,113,0.25); color: var(--combat); }
  .time { color: var(--muted); font-size: 10.5px; }

  /* Agent Inspector Drawer / Modal */
  .drawer-backdrop {
    position: fixed; inset: 0; background: rgba(3, 7, 18, 0.68);
    display: none; align-items: center; justify-content: center; z-index: 50;
    padding: 24px;
  }
  .drawer-backdrop.open { display: flex; }
  .drawer {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 14px; width: min(1050px, 95vw); height: min(84vh, 820px);
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 25px 60px rgba(0,0,0,0.65);
  }
  .drawer-header {
    padding: 14px 18px; border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    background: var(--panel-2);
  }
  .close-btn {
    background: transparent; border: 1px solid var(--border); color: var(--text);
    padding: 6px 12px; border-radius: 7px; cursor: pointer; font-weight: 600;
  }
  .close-btn:hover { background: rgba(255,255,255,0.08); }
  .drawer-body {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
    padding: 14px 18px; flex: 1; overflow: hidden;
  }
  .drawer-col {
    background: var(--panel-2); border: 1px solid var(--border);
    border-radius: 10px; display: flex; flex-direction: column; overflow: hidden;
  }
  .drawer-col-head {
    padding: 9px 12px; border-bottom: 1px solid var(--border);
    font-size: 12px; font-weight: 700; text-transform: uppercase; color: #93c5fd;
  }
  .drawer-scroll { padding: 10px 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .thought-item, .action-item {
    background: rgba(15, 23, 42, 0.65); border: 1px solid var(--border);
    border-radius: 8px; padding: 9px 11px; font-size: 12.5px; line-height: 1.45;
  }
  .thought-item { border-left: 3px solid #60a5fa; }
  .action-item.ok { border-left: 3px solid var(--trade); }
  .action-item.fail { border-left: 3px solid var(--combat); }
  .inv-bar {
    padding: 8px 18px; border-top: 1px solid var(--border);
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px;
    background: var(--panel-2);
  }
  .inv-pill {
    font-size: 11px; background: rgba(255,255,255,0.07);
    padding: 3px 8px; border-radius: 5px; color: #e2e8f0;
  }
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="title-wrap">
      <h1>Minecraft Agents — Live Mission Control</h1>
      <span class="live-pill"><span class="dot"></span><span id="status-text">LIVE</span></span>
      <span class="col-sub" id="updated-at"></span>
    </div>
    <div class="filters" id="filters">
      <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">Alle (<span id="cnt-all">0</span>)</button>
      <button class="filter-btn" data-filter="collective" onclick="setFilter('collective')">Collective DMs (<span id="cnt-collective">0</span>)</button>
      <button class="filter-btn" data-filter="market" onclick="setFilter('market')">Market DMs (<span id="cnt-market">0</span>)</button>
      <button class="filter-btn" data-filter="diplomacy" onclick="setFilter('diplomacy')">Diplomatie & Pakte (<span id="cnt-diplomacy">0</span>)</button>
      <button class="filter-btn" data-filter="trade" onclick="setFilter('trade')">Trades (<span id="cnt-trade">0</span>)</button>
      <button class="filter-btn" data-filter="combat" onclick="setFilter('combat')">Kampf (<span id="cnt-combat">0</span>)</button>
    </div>
  </header>

  <div class="workspace">
    <section class="col collective">
      <div class="col-header">
        <span class="col-title collective">Collective (Kollektiv)</span>
        <span class="col-sub">Klicke auf einen Bot für Details</span>
      </div>
      <div class="agents-list" id="agents-collective"></div>
    </section>

    <section class="col market">
      <div class="col-header">
        <span class="col-title market">Market (Kapitalisten)</span>
        <span class="col-sub">Klicke auf einen Bot für Details</span>
      </div>
      <div class="agents-list" id="agents-market"></div>
    </section>

    <section class="col feed">
      <div class="col-header">
        <span class="col-title">Live-Kommunikation & Ereignisse</span>
        <span class="col-sub" id="feed-count">0 Einträge</span>
      </div>
      <div class="feed-list" id="feed-list"></div>
    </section>
  </div>
</div>

<!-- Detail Modal on Bot Click -->
<div class="drawer-backdrop" id="drawer-backdrop">
  <div class="drawer">
    <div class="drawer-header">
      <div id="drawer-title" style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;"></div>
      <button class="close-btn" id="drawer-close">Schließen (ESC)</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-col">
        <div class="drawer-col-head">💭 Gedanken & Entscheidungen (Chronologisch)</div>
        <div class="drawer-scroll" id="drawer-thoughts"></div>
      </div>
      <div class="drawer-col">
        <div class="drawer-col-head">⚡ Ausgeführte Handlungen & Nachrichten</div>
        <div class="drawer-scroll" id="drawer-actions"></div>
      </div>
    </div>
    <div class="inv-bar" id="drawer-inv"></div>
  </div>
</div>

<script>
  let activeFilter = 'all';
  let selectedAgentName = null;
  let lastData = null;
  const openThoughtKeys = new Set();
  let lastFeedHash = '';
  let lastDrawerAgent = null;
  let lastHeaderHash = '';
  let lastThoughtsHash = '';
  let lastActionsHash = '';
  let lastInvHash = '';

  function resetDrawerCache() {
    lastDrawerAgent = null;
    lastHeaderHash = '';
    lastThoughtsHash = '';
    lastActionsHash = '';
    lastInvHash = '';
    const tEl = document.getElementById('drawer-thoughts');
    const aEl = document.getElementById('drawer-actions');
    if (tEl) tEl.innerHTML = '';
    if (aEl) aEl.innerHTML = '';
  }

  window.setFilter = function(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
    lastFeedHash = '';
    if (lastData) renderFeed(lastData.feed, true);
  };

  document.getElementById('drawer-close').addEventListener('click', () => {
    selectedAgentName = null;
    resetDrawerCache();
    document.getElementById('drawer-backdrop').classList.remove('open');
    if (lastData) renderAgents(lastData.agents);
  });
  document.getElementById('drawer-backdrop').addEventListener('click', e => {
    if (e.target.id === 'drawer-backdrop') document.getElementById('drawer-close').click();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && selectedAgentName) document.getElementById('drawer-close').click();
  });

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function fmtTime(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString('de-DE');
  }
  function fmtItems(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list.map(i => \`\${i.count}× \${i.item || i.name}\`).join(', ');
  }

  window.selectAgent = function(name) {
    if (selectedAgentName !== name) resetDrawerCache();
    selectedAgentName = name;
    if (lastData) {
      renderAgents(lastData.agents);
      renderDrawer();
    }
  };

  function createThoughtElement(t, key) {
    const item = document.createElement('div');
    item.className = 'thought-item';
    item.dataset.key = key;
    const badge = t.synthetic
      ? '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(250,204,21,0.14);color:#fde047;margin-right:6px;">Aktionsplan</span>'
      : '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(52,211,153,0.14);color:#6ee7b7;margin-right:6px;">Klartext</span>';
    item.innerHTML = \`
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#93c5fd;margin-bottom:4px;font-weight:700;">
        <span>\${badge}Zusammenfassung: \${esc(t.summary)}</span>
        <span style="white-space:nowrap;">\${fmtTime(t.time)}</span>
      </div>
      <details>
        <summary style="cursor:pointer;font-size:11px;color:var(--muted);">Kompletten Gedankengang anzeigen</summary>
        <div style="margin-top:6px;white-space:pre-wrap;color:#cbd5e1;font-size:12px;">\${esc(t.full)}</div>
      </details>
    \`;
    const details = item.querySelector('details');
    if (openThoughtKeys.has(key)) details.open = true;
    details.addEventListener('toggle', () => {
      if (details.open) openThoughtKeys.add(key);
      else openThoughtKeys.delete(key);
    });
    return item;
  }

  function renderAgents(agents) {
    for (const soc of ['collective', 'market']) {
      const container = document.getElementById('agents-' + soc);
      const prevTop = container.scrollTop;
      const list = agents.filter(a => a.society === soc);
      container.innerHTML = list.map(a => {
        const pos = a.position ? \`\${a.position.x}, \${a.position.y}, \${a.position.z}\` : '–';
        const thought = a.latestThought ? a.latestThought.summary : 'Wartet auf ersten Gedanken...';
        const action = a.lastAction ? a.lastAction.summary : '⏳ Wartet...';
        const isSel = selectedAgentName === a.name;
        return \`
          <div class="agent-card \${a.isLeader ? 'leader' : ''} \${isSel ? 'selected' : ''}" onclick="selectAgent('\${esc(a.name)}')">
            <div class="row-top">
              <span class="agent-name">
                \${esc(a.name)}
                \${a.isLeader ? '<span class="badge leader">★ Chef</span>' : ''}
                <span class="badge model">\${esc(a.model)}</span>
              </span>
              <div class="vitals">
                <span>❤️ \${a.health ?? '–'}</span>
                <span>🍖 \${a.food ?? '–'}</span>
                <span>📍 \${pos}</span>
              </div>
            </div>
            <div class="thought-preview">💭 \${esc(thought)}</div>
            <div class="row-bottom">
              <div class="action-preview">\${esc(action)}</div>
              <span class="click-hint">Details ↗</span>
            </div>
          </div>
        \`;
      }).join('');
      container.scrollTop = prevTop;
    }
  }

  function renderDrawer() {
    const backdrop = document.getElementById('drawer-backdrop');
    if (!selectedAgentName || !lastData) {
      backdrop.classList.remove('open');
      return;
    }
    const a = lastData.agents.find(x => x.name === selectedAgentName);
    if (!a) return;
    backdrop.classList.add('open');
    if (lastDrawerAgent !== a.name) {
      resetDrawerCache();
      lastDrawerAgent = a.name;
    }

    const headerHash = JSON.stringify({ h: a.health, f: a.food, p: a.position, m: a.model });
    if (headerHash !== lastHeaderHash) {
      lastHeaderHash = headerHash;
      const pos = a.position ? \`(\${a.position.x}, \${a.position.y}, \${a.position.z})\` : '–';
      document.getElementById('drawer-title').innerHTML = \`
        <span>\${esc(a.name)}</span>
        \${a.isLeader ? '<span class="badge leader">★ Anführer</span>' : ''}
        <span class="badge model">\${esc(a.societyLabel)} · \${esc(a.model)}</span>
        <span style="font-size:12px;color:var(--muted);font-weight:500;">❤️ \${a.health ?? '–'}/20 · 🍖 \${a.food ?? '–'}/20 · 📍 \${pos}</span>
      \`;
    }

    const thoughts = a.recentThoughts || [];
    const thoughtsHash = thoughts.map((t, i) => t.id || \`\${t.time}:\${i}\`).join('|');
    if (thoughtsHash !== lastThoughtsHash) {
      lastThoughtsHash = thoughtsHash;
      const thoughtsEl = document.getElementById('drawer-thoughts');
      const prevTop = thoughtsEl.scrollTop;
      const prevHeight = thoughtsEl.scrollHeight;

      if (!thoughts.length) {
        thoughtsEl.innerHTML = '<div data-empty="1" style="color:var(--muted);">Noch keine Gedanken aufgezeichnet.</div>';
      } else {
        const emptyNode = thoughtsEl.querySelector('[data-empty]');
        if (emptyNode) emptyNode.remove();

        const existingByKey = new Map();
        for (const child of Array.from(thoughtsEl.children)) {
          const k = child.dataset.key;
          if (k) existingByKey.set(k, child);
        }

        const desiredKeys = new Set();
        for (let i = 0; i < thoughts.length; i++) {
          const t = thoughts[i];
          const key = t.id || \`\${a.name}-\${t.time}-\${t.summary}\`;
          desiredKeys.add(key);
          const el = existingByKey.get(key) || createThoughtElement(t, key);
          const refNode = thoughtsEl.children[i] || null;
          if (refNode !== el) {
            thoughtsEl.insertBefore(el, refNode);
          }
        }

        for (const [k, el] of existingByKey.entries()) {
          if (!desiredKeys.has(k)) {
            const det = el.querySelector('details');
            if (!det || !det.open) el.remove();
          }
        }

        if (prevTop > 0) {
          thoughtsEl.scrollTop = prevTop + Math.max(0, thoughtsEl.scrollHeight - prevHeight);
        }
      }
    }

    const actions = a.recentActions || [];
    const actionsHash = actions.map(x => x.time + ':' + x.tool + ':' + x.success).join('|');
    if (actionsHash !== lastActionsHash) {
      lastActionsHash = actionsHash;
      const actionsEl = document.getElementById('drawer-actions');
      const prevActionsTop = actionsEl.scrollTop;
      actionsEl.innerHTML = actions.map(act => \`
        <div class="action-item \${act.success ? 'ok' : 'fail'}">
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:12px;">
            <span>\${esc(act.summary)}</span>
            <span class="time">\${fmtTime(act.time)}</span>
          </div>
          <div style="font-family:monospace;font-size:11px;color:var(--muted);margin-top:3px;word-break:break-all;">
            Args: \${esc(act.args)}<br/>Result: \${esc(act.result)}
          </div>
        </div>
      \`).join('') || '<div style="color:var(--muted);">Noch keine Handlungen.</div>';
      actionsEl.scrollTop = prevActionsTop;
    }

    const invHash = JSON.stringify(a.inventory || []);
    if (invHash !== lastInvHash) {
      lastInvHash = invHash;
      const inv = (a.inventory || []).map(i => \`<span class="inv-pill">\${esc(i.count)}× \${esc(i.name)}</span>\`).join('');
      document.getElementById('drawer-inv').innerHTML = \`<b>Inventar (\${(a.inventory || []).length} Slots):</b> \${inv || '<span style="color:var(--muted);">Leer</span>'}\`;
    }
  }

  function matchFilter(item, f) {
    if (f === 'all') return true;
    if (f === 'collective') return item.kind === 'dm' && item.society === 'collective';
    if (f === 'market') return item.kind === 'dm' && item.society === 'market';
    if (f === 'diplomacy') return item.kind === 'diplomacy' || item.kind === 'pact';
    return item.kind === f;
  }

  function renderFeed(feed, force = false) {
    for (const f of ['all', 'collective', 'market', 'diplomacy', 'trade', 'combat']) {
      const el = document.getElementById('cnt-' + f);
      if (el) el.textContent = feed.filter(i => matchFilter(i, f)).length;
    }
    const filtered = feed.filter(item => matchFilter(item, activeFilter));
    const hash = activeFilter + ':' + filtered.map(i => i.id).join(',');
    if (!force && hash === lastFeedHash) return;
    lastFeedHash = hash;
    document.getElementById('feed-count').textContent = filtered.length + ' Einträge (' + activeFilter.toUpperCase() + ')';
    const el = document.getElementById('feed-list');
    if (!filtered.length) {
      el.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted);font-size:12.5px;">Keine Einträge in dieser Kategorie vorhanden.</div>';
      return;
    }
    el.innerHTML = filtered.map(item => {
      let cls = item.kind;
      let tagLabel = item.kind.toUpperCase();
      if (item.kind === 'dm') {
        cls = item.society;
        tagLabel = item.society === 'collective' ? 'COLLECTIVE' : 'MARKET';
      } else if (item.kind === 'trade') {
        tagLabel = \`TRADE #\${item.tradeId} (\${item.subtype.replace('trade_','')})\`;
      } else if (item.kind === 'pact') {
        tagLabel = \`PAKT #\${item.pactId || ''}\`;
      }
      let body = esc(item.text || '');
      if (item.kind === 'trade') {
        const give = fmtItems(item.give);
        const want = fmtItems(item.want);
        body = \`\${give ? '<b>Bietet:</b> ' + esc(give) : ''} \${want ? ' → <b>Will:</b> ' + esc(want) : ''}<br/>\${esc(item.note || '')}\`;
      }
      return \`
        <div class="msg-card \${cls}">
          <div class="msg-head">
            <div>
              <span class="tag \${cls}">\${esc(tagLabel)}</span>
              <span class="msg-route">\${esc(item.from)} \${item.to ? '→ ' + esc(item.to) : ''}</span>
            </div>
            <span class="time">\${fmtTime(item.time)}</span>
          </div>
          <div>\${body}</div>
        </div>
      \`;
    }).join('');
  }

  async function refresh() {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      lastData = data;
      renderAgents(data.agents);
      renderFeed(data.feed);
      if (selectedAgentName) renderDrawer();
      document.getElementById('updated-at').textContent = 'Stand: ' + fmtTime(data.now);
      document.getElementById('status-text').textContent = 'LIVE';
    } catch (e) {
      document.getElementById('status-text').textContent = 'VERBINDUNG...';
    }
  }
  refresh();
  setInterval(refresh, 1500);
</script>
</body>
</html>`;

const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/api/state') {
        const body = JSON.stringify(buildSnapshot());
        res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        });
        res.end(body);
        return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Live-Dashboard läuft auf http://localhost:${PORT} (im WLAN: http://192.168.178.174:${PORT})`);
});
