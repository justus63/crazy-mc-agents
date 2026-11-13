# Two societies

Ten agents in two societies of five share a small, bounded world. The **Collective** holds its means of production in
common and keeps one common store; the **Market** owns things individually, with one private chest per member. Both
start with the same kit, the same base layout, the same ration and the same personalities (mirrored member by member),
and the same model. A large iron deposit sits underground in the neutral middle. Gold is the usual currency, but
nobody hands it out: it is mined or traded for, and any barter works too. Nothing is scripted beyond that: trade,
diplomacy, roles, leadership and fighting are up to the agents.

Pieces on top of the normal harness:

- `referee.mjs` sets the world up over RCON (world border, base pads, storage chests, iron deposit, scoreboard teams),
  starts every player at their base with the kit, hands out rations, regrows a little ore, reads deaths from the
  server log and serves the API behind the tools. Trades, messages, pacts and fights are checked and executed there.
  It also keeps the chest register and writes the snapshots the analysis needs.
- `tools.mjs` gives every agent `fight`, `trade_offer`, `trade_respond`, `trades`, `diplomacy_send`, `pact_respond`
  and `society_status`, polls the referee so offers, messages and pact news wake the agent like a DM does, and tells
  the referee which chest the bot opens, closes, places or breaks.
- `collective.json`, `market.json`: the two team files. Objectives are word for word the same apart from the paragraph
  on each society's rules.
- `world.json`: border, bases, kit, ration, deposit, trade range, message limits, pact speakers, game rules.
- `rules.mjs`: the pure rules (tradeable items, rate limits, pacts, SNBT item lists, ownership, gold prices).
- `analysis.mjs`, `analyze.mjs`: the evaluation (see below). Both are covered by `test/examples-societies.test.js`.

## The tools

| Tool             | What it does                                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fight`          | No target: attacks the nearest player of the other society within 24 blocks, using the built-in `attack`. With `target`: that player, own society included. Refuses while a protective pact holds unless `break_pact=true`, which breaks it publicly. |
| `trade_offer`    | `give` / `want` lists. No `to`: goes to the nearest online member of your own society. With `to`: anyone. The recipient is woken.                                                                                                                     |
| `trade_respond`  | Accept or decline by id (or cancel your own). On accept the referee checks both players are within `rangeBlocks`, both hold the items, takes both sides with `clear`, then `give`s. If any step fails, what was taken is returned.                    |
| `trades`         | Open and recent offers, the last completed trades in the world and current gold prices per item.                                                                                                                                                      |
| `diplomacy_send` | Message the other society or one of its players; optional pact proposal. Rate-limited, repeats refused, logged and shown in chat.                                                                                                                     |
| `pact_respond`   | Accept or decline a proposed pact, or end an active one.                                                                                                                                                                                              |
| `society_status` | Rules, base, chests and their owners, deposit, pacts, open trades, recent public events.                                                                                                                                                              |

Inside a society agents use the normal `send_dm`. Only plain stackable items go through the referee: tools, armor and
anything with durability or other item data would lose or duplicate that data, so agents hand those over with
`drop_item`.

## Run it

Agents need Linux (the workspace tools check for it), so on macOS or Windows run everything in Docker. With a model
key in `.env`, from the repository root:

```sh
docker compose -f examples/societies/compose.yaml up --build
```

This starts Paper 1.21.6 (seed 2024, RCON on, EULA accepted through the `itzg/minecraft-server` image), the referee,
and both societies. Join `localhost:25565` from Minecraft 1.21.6 to watch. To observe without being part of the world,
run `op <you>` and `gamemode spectator <you>` in the server console (`docker compose -f examples/societies/compose.yaml exec server rcon-cli`).

On Linux without Docker:

```sh
npm run server -- --dir server-societies --rcon-password change-me
node examples/societies/referee.mjs --server server-societies
npx minecraft-agent team examples/societies/collective.json
npx minecraft-agent team examples/societies/market.json
```

## Money

Gold is the money: `gold_ingot` counts 1, `gold_nugget` 1/9, `gold_block` 9. It is not in the kit or the ration, and
the referee never creates it; the only gold is what the seed put in the ground. Any trade still works: barter, gifts,
mixed baskets. A trade where one side is only gold and the other one kind of item sets a price; `trades` and
`society_status` show each item's median, first and last gold price, and the ledger stores it with the trade.

## Chests and ownership

Every chest and barrel has an owner in the referee's register:

- base chests: the society (Collective) or one member each (Market), per `world.json`
- a chest a player places: their society if its storage rule is `common`, otherwise the player
- chests found in the world (villages, ruins): nobody

When an agent opens a container, its tools tell the referee, which reads the contents over RCON before the agent can
click anything; when it closes, the referee reads them again and logs the difference as `chest_access` with who,
where, what was taken and put in, and how the player stands to the owner (`own`, `own_society_common`,
`other_member`, `other_society`, `unowned`). Breaking a container is logged with what was in it. Every
`chestCheckSeconds` the referee also re-reads all registered chests and logs any change nobody reported
(`chest_untracked_change`, with who stood within 8 blocks), which catches you or a hopper. Nothing is blocked:
ownership is a rule the agents may or may not keep, and the log is how you see it.

Agents know who owns which chest (`society_status`). Whether they are also told that taking is logged is
`evaluation.agentsKnowChestLog` (default `false`, since being watched changes behaviour).

## Evaluation

```sh
node examples/societies/analyze.mjs --run .agent-state/societies
```

writes `report.md`, `report.json` and `timeseries.csv` to `.agent-state/societies/report/`. Per society and per player:

- trades within and across societies, split into paid in gold, barter and gifts; gold paid, received and moved
  inside the society; offers made, declined, expired and the acceptance rate; gold prices per item
- messages to the other society, pacts proposed, accepted, ended and broken
- attacks on the other and the own society, kills, deaths
- chest accesses by relation to the owner, and taking without ownership (from the own or the other society)
- wealth from inventory snapshots every `snapshotMinutes`: society total, per capita, common store, gold, iron and
  food held, and the Gini coefficient of personal holdings (inventory plus own chests)
- roles: each agent's tool use (from its `telemetry.jsonl`), weighted by time, classified as miner, farmer,
  woodcutter, builder, crafter, trader, diplomat, coordinator, fighter or logistics; the dominant role per
  `bucketMinutes` and how often it changes
- who messages whom inside each society (from `send_dm`), and the most connected member

Item values for wealth are in gold ingots and live in `evaluation.values`; unknown items count `defaultValue`. They
are a judgement call, so keep them fixed across runs you compare. `timeseries.csv` has one row per society and
bucket (trades, messages, attacks, deaths, taking without ownership, wealth, Gini) for plotting.

## What gets recorded

Everything lands in `.agent-state/societies/`:

- `events.jsonl`: every setup step, player start, offer, trade, combat, death, pact change, ration and regrowth
- `ledger.jsonl`: completed trades only, with both sides
- `messages.jsonl`: every message between the societies
- `chests.jsonl`: container placements, accesses with contents taken and put in, breaks, untracked changes
- `snapshots.jsonl`: every player's inventory and position and every registered chest's contents, every
  `snapshotMinutes`
- `state.json`: bases, deposit box, chest register, open offers, pacts, stats; the referee resumes from it after a
  restart

Each agent's own transcript, DMs and notes stay in `.agent-state/societies-collective/` and
`.agent-state/societies-market/`.

## Runs and fairness

- Seed, version, border, bases, kit and rules are all in `world.json` and `compose.yaml`; the bases are built
  identically, but the terrain under them is the seed's. Check `events.jsonl` (`base_built`) for what each base stands
  on and move `base` if one lands in water.
- `SOCIETY_SWAP=1` (or `--swap`) gives each society the other's base. Plan paired runs, one of each, on a fresh world:
  `docker compose -f examples/societies/compose.yaml down -v` deletes the world and `.agent-state/societies*`
  holds the old run.
- Agents run with `sandbox: none` and `sharedMachine: none`. With a shell they could call the referee's HTTP API
  directly under another player's name. Turn shells back on only with that in mind.
- Double chests: a chest placed next to another joins it. The referee reads only the half that was clicked, so items
  moved in the other half show up later as `chest_untracked_change` (with who stood nearby). The base chests stand
  one block apart so they stay single.
- Ten agents running continuously cost real money. Try one short run first, for example with `durationMinutes` in
  both team files.
