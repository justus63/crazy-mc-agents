import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyze, toCsv, toMarkdown } from './analysis.mjs';

const { values } = parseArgs({
    options: {
        run: { type: 'string', default: '.agent-state/societies' },
        world: { type: 'string', default: new URL('./world.json', import.meta.url).pathname },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
    },
});
if (values.help) {
    console.log(
        'Usage: node examples/societies/analyze.mjs [--run .agent-state/societies] [--world world.json] [--out <run>/report]\n' +
            'Reads the referee logs in --run and each agent’s telemetry in <run>-<society>/<name>/, writes report.md, report.json and timeseries.csv.',
    );
    process.exit(0);
}

const world = JSON.parse(readFileSync(values.world, 'utf8'));
const run = path.resolve(values.run);
const jsonl = file =>
    existsSync(file)
        ? readFileSync(file, 'utf8')
              .split('\n')
              .filter(Boolean)
              .flatMap(l => {
                  try {
                      return [JSON.parse(l)];
                  } catch {
                      return [];
                  }
              })
        : [];
const telemetry = {};
for (const [f, d] of Object.entries(world.factions))
    for (const p of d.players) telemetry[p] = jsonl(path.join(`${run}-${f}`, p, 'telemetry.jsonl'));

const report = analyze({
    world,
    events: jsonl(path.join(run, 'events.jsonl')),
    ledger: jsonl(path.join(run, 'ledger.jsonl')),
    messages: jsonl(path.join(run, 'messages.jsonl')),
    chests: jsonl(path.join(run, 'chests.jsonl')),
    snapshots: jsonl(path.join(run, 'snapshots.jsonl')),
    telemetry,
});
const out = path.resolve(values.out ?? path.join(run, 'report'));
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
writeFileSync(path.join(out, 'report.md'), toMarkdown(report));
writeFileSync(path.join(out, 'timeseries.csv'), toCsv(report.timeseries));
console.log(`Report written to ${out}/report.md (also report.json and timeseries.csv)`);
