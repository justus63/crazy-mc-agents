#!/usr/bin/env node
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.DASHBOARD_PORT ?? 4321);

const MODEL_BY_AGENT = {
    Stalin: 'azure/gpt-6.1-terra',
    Justus: 'azure/gpt-6.1-terra',
    Reinecke: 'fhms/Qwen3.5-27B',
    FlorianHomm: 'fhms/Qwen3.5-27B',
    Zappel: 'fhms/Qwen3.8-27B',
    Trump: 'fhms/Qwen3.8-27B',
    Marcant: 'oski/mistral-small-4-119b',
    Simon: 'oski/mistral-small-4-119b',
    Lange: 'oski/gpt-oss-120b',
    Fohrmann: 'oski/gpt-oss-120b',
};

const SOCIETIES = [
    {
        key: 'collective',
        label: 'Collective',
        leader: 'Stalin',
        members: ['Reinecke', 'Zappel', 'Stalin', 'Marcant', 'Lange'],
        stateDir: '.agent-state/societies-collective',
    },
    {
        key: 'market',
        label: 'Market',
        leader: 'Justus',
        members: ['FlorianHomm', 'Trump', 'Justus', 'Simon', 'Fohrmann'],
        stateDir: '.agent-state/societies-market',
    },
];

function readDms(society) {
    const dbPath = path.join(society.stateDir, 'shared', 'mailbox.sqlite');
    if (!existsSync(dbPath)) return [];
    try {
        const con = new DatabaseSync(dbPath, { open: true });
        const rows = con
            .prepare('SELECT id, sender, recipient, body, created_at FROM mailbox_dm ORDER BY id DESC LIMIT 120')
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

function readJsonLinesTail(filePath, maxLines = 150) {
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
    const events = readJsonLinesTail('.agent-state/societies/events.jsonl', 200);
    const messages = readJsonLinesTail('.agent-state/societies/messages.jsonl', 100);
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
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    const pick = sentences.slice(0, 2).join(' ');
    return pick.length > 220 ? pick.slice(0, 217) + '...' : pick;
}

function readAgentState(society, name) {
    const dir = path.join(society.stateDir, name);
    const telemetry = readJsonLinesTail(path.join(dir, 'telemetry.jsonl'), 60);
    let health = null;
    let food = null;
    let position = null;
    let inventory = [];
    let lastTool = null;

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
            lastTool = {
                tool: entry.tool,
                args: entry.args,
                success: entry.success,
                time: Date.parse(entry.time) || Date.now(),
            };
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
                const entries = readJsonLinesTail(path.join(sessionsDir, files[0].f), 80);
                for (const item of entries) {
                    const msg = item.message;
                    if (msg?.role !== 'assistant' || !Array.isArray(msg.content)) continue;
                    const t = Date.parse(item.timestamp ?? msg.timestamp) || files[0].mtime;
                    for (const block of msg.content) {
                        if (block.type === 'thinking' || block.type === 'text') {
                            const raw = (block.thinking || block.text || '').trim();
                            if (raw) {
                                thoughts.push({
                                    type: block.type,
                                    summary: summarizeThought(raw),
                                    full: raw,
                                    time: t,
                                });
                            }
                        }
                    }
                }
            }
        } catch {
            // ignore
        }
    }

    let workspaceNotes = [];
    const wsDir = path.join(dir, 'workspace-unshared');
    if (existsSync(wsDir)) {
        try {
            workspaceNotes = readdirSync(wsDir).slice(0, 8);
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
        inventory: inventory.slice(0, 8),
        lastTool,
        latestThought: thoughts.at(-1) ?? null,
        recentThoughts: thoughts.slice(-4).reverse(),
        workspaceNotes,
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
    --panel: #131a26;
    --panel-2: #192233;
    --border: #263248;
    --text: #e6edf7;
    --muted: #8b9bb4;
    --collective: #22d3ee;
    --collective-bg: rgba(34, 211, 238, 0.10);
    --market: #facc15;
    --market-bg: rgba(250, 204, 21, 0.10);
    --diplomacy: #c084fc;
    --trade: #34d399;
    --combat: #f87171;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 22px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .title-wrap { display: flex; align-items: center; gap: 12px; }
  h1 { font-size: 18px; margin: 0; font-weight: 700; letter-spacing: 0.2px; }
  .live-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; padding: 4px 10px; border-radius: 999px;
    background: rgba(52, 211, 153, 0.14); color: var(--trade); font-weight: 600;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--trade); animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .filter-btn {
    background: var(--panel-2); color: var(--muted);
    border: 1px solid var(--border); padding: 6px 12px;
    border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
  }
  .filter-btn.active { color: var(--text); border-color: #60a5fa; background: rgba(96, 165, 250, 0.16); }
  main {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 18px;
    padding: 18px 22px;
    max-width: 1720px;
    margin: 0 auto;
  }
  @media (max-width: 1120px) { main { grid-template-columns: 1fr; } }
  .section-title {
    font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--muted); margin: 0 0 10px 0; display: flex; justify-content: space-between;
  }
  .societies-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 720px) { .societies-grid { grid-template-columns: 1fr; } }
  .society-col {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 12px;
  }
  .society-col.collective { border-top: 3px solid var(--collective); }
  .society-col.market { border-top: 3px solid var(--market); }
  .society-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .society-name { font-weight: 700; font-size: 15px; }
  .society-name.collective { color: var(--collective); }
  .society-name.market { color: var(--market); }
  .agent-card {
    background: var(--panel-2); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
  }
  .agent-card.leader { border-color: rgba(250, 204, 21, 0.55); box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.18); }
  .agent-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
  .agent-name { font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
  .badge {
    font-size: 10px; padding: 2px 6px; border-radius: 5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  .badge.leader { background: rgba(250, 204, 21, 0.2); color: #fde047; }
  .badge.model { background: rgba(148, 163, 184, 0.14); color: var(--muted); font-weight: 500; }
  .stats { font-size: 11px; color: var(--muted); display: flex; gap: 10px; margin-top: 4px; flex-wrap: wrap; }
  .thought-box {
    margin-top: 8px; padding: 8px 10px; border-radius: 8px;
    background: rgba(15, 23, 42, 0.65); border-left: 3px solid #60a5fa;
    font-size: 12.5px; line-height: 1.45; color: #dbeafe;
  }
  .thought-label { font-size: 10px; text-transform: uppercase; color: #93c5fd; font-weight: 700; margin-bottom: 3px; display: flex; justify-content: space-between; }
  details { margin-top: 5px; font-size: 11.5px; color: var(--muted); }
  details summary { cursor: pointer; color: #93c5fd; }
  .tool-line {
    margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .inv-pills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .inv-pill {
    font-size: 10.5px; background: rgba(255,255,255,0.05);
    padding: 2px 6px; border-radius: 4px; color: #cbd5e1;
  }
  .feed-panel {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px; display: flex; flex-direction: column;
    max-height: calc(100vh - 96px); position: sticky; top: 76px;
  }
  .feed-list { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
  .msg-card {
    padding: 10px 12px; border-radius: 9px; background: var(--panel-2);
    border-left: 4px solid var(--border); font-size: 13px; line-height: 1.45;
  }
  .msg-card.collective { border-left-color: var(--collective); background: var(--collective-bg); }
  .msg-card.market { border-left-color: var(--market); background: var(--market-bg); }
  .msg-card.diplomacy, .msg-card.pact { border-left-color: var(--diplomacy); background: rgba(192, 132, 252, 0.10); }
  .msg-card.trade { border-left-color: var(--trade); background: rgba(52, 211, 153, 0.10); }
  .msg-card.combat { border-left-color: var(--combat); background: rgba(248, 113, 113, 0.12); }
  .msg-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11.5px; }
  .msg-route { font-weight: 700; }
  .tag {
    font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
    text-transform: uppercase;
  }
  .tag.collective { background: rgba(34,211,238,0.2); color: var(--collective); }
  .tag.market { background: rgba(250,204,21,0.2); color: var(--market); }
  .tag.diplomacy, .tag.pact { background: rgba(192,132,252,0.22); color: var(--diplomacy); }
  .tag.trade { background: rgba(52,211,153,0.22); color: var(--trade); }
  .tag.combat { background: rgba(248,113,113,0.25); color: var(--combat); }
  .time { color: var(--muted); font-size: 11px; }
</style>
</head>
<body>
<header>
  <div class="title-wrap">
    <h1>Minecraft Agents — Live Mission Control</h1>
    <span class="live-pill"><span class="dot"></span><span id="status-text">LIVE</span></span>
  </div>
  <div class="filters" id="filters">
    <button class="filter-btn active" data-filter="all">Alle Events</button>
    <button class="filter-btn" data-filter="collective">Collective DMs</button>
    <button class="filter-btn" data-filter="market">Market DMs</button>
    <button class="filter-btn" data-filter="diplomacy">Diplomatie & Pakte</button>
    <button class="filter-btn" data-filter="trade">Trades</button>
    <button class="filter-btn" data-filter="combat">Kampf / Tod</button>
  </div>
</header>
<main>
  <section>
    <div class="section-title">
      <span>Agenten-Status & Zusammengefasste Gedanken (Live)</span>
      <span id="updated-at"></span>
    </div>
    <div class="societies-grid">
      <div class="society-col collective">
        <div class="society-header">
          <span class="society-name collective">Collective (Gemeineigentum)</span>
          <span class="badge model">Chef: Stalin (GPT-6.1 Terra)</span>
        </div>
        <div id="agents-collective"></div>
      </div>
      <div class="society-col market">
        <div class="society-header">
          <span class="society-name market">Market (Privateigentum)</span>
          <span class="badge model">Chef: Justus (GPT-6.1 Terra)</span>
        </div>
        <div id="agents-market"></div>
      </div>
    </div>
  </section>
  <section class="feed-panel">
    <div class="section-title">
      <span>Live-Kommunikation (DMs, Diplomatie, Handel)</span>
      <span id="feed-count">0 Einträge</span>
    </div>
    <div class="feed-list" id="feed-list"></div>
  </section>
</main>
<script>
  let activeFilter = 'all';
  let lastData = null;

  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    if (lastData) renderFeed(lastData.feed);
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

  function renderAgents(agents) {
    for (const soc of ['collective', 'market']) {
      const container = document.getElementById('agents-' + soc);
      const list = agents.filter(a => a.society === soc);
      container.innerHTML = list.map(a => {
        const pos = a.position ? \`(\${a.position.x}, \${a.position.y}, \${a.position.z})\` : '–';
        const thought = a.latestThought;
        const toolStr = a.lastTool ? \`⚡ \${a.lastTool.tool} \${a.lastTool.args || ''}\` : '⏳ wartet...';
        const inv = (a.inventory || []).map(i => \`<span class="inv-pill">\${esc(i.count)}× \${esc(i.name)}</span>\`).join('');
        return \`
          <div class="agent-card \${a.isLeader ? 'leader' : ''}">
            <div class="agent-top">
              <span class="agent-name">
                \${esc(a.name)}
                \${a.isLeader ? '<span class="badge leader">★ Anführer</span>' : ''}
              </span>
              <span class="badge model">\${esc(a.model)}</span>
            </div>
            <div class="stats">
              <span>❤️ \${a.health ?? '–'}/20</span>
              <span>🍖 \${a.food ?? '–'}/20</span>
              <span>📍 \${pos}</span>
            </div>
            <div class="thought-box">
              <div class="thought-label">
                <span>💭 Aktueller Gedanke (Zusammenfassung)</span>
                <span>\${thought ? fmtTime(thought.time) : ''}</span>
              </div>
              <div>\${thought ? esc(thought.summary) : 'Noch keine Gedanken aufgezeichnet.'}</div>
              \${thought && thought.full && thought.full.length > thought.summary.length ? \`
                <details>
                  <summary>Kompletten Gedankengang aufklappen</summary>
                  <div style="margin-top:4px;white-space:pre-wrap;">\${esc(thought.full)}</div>
                </details>
              \` : ''}
            </div>
            <div class="tool-line" title="\${esc(toolStr)}">\${esc(toolStr)}</div>
            \${inv ? \`<div class="inv-pills">\${inv}</div>\` : ''}
          </div>
        \`;
      }).join('');
    }
  }

  function renderFeed(feed) {
    const filtered = feed.filter(item => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'collective') return item.kind === 'dm' && item.society === 'collective';
      if (activeFilter === 'market') return item.kind === 'dm' && item.society === 'market';
      if (activeFilter === 'diplomacy') return item.kind === 'diplomacy' || item.kind === 'pact';
      return item.kind === activeFilter;
    });
    document.getElementById('feed-count').textContent = filtered.length + ' Einträge';
    const el = document.getElementById('feed-list');
    el.innerHTML = filtered.map(item => {
      let cls = item.kind;
      let tagLabel = item.kind.toUpperCase();
      if (item.kind === 'dm') {
        cls = item.society;
        tagLabel = item.society === 'collective' ? 'COLLECTIVE DM' : 'MARKET DM';
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
      document.getElementById('updated-at').textContent = 'Aktualisiert: ' + fmtTime(data.now);
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
