Hier ist die nüchterne, rein datenbasierte Aufarbeitung der Rettungsaktion von **Zappel** in Runde 1 – ausschließlich gestützt auf die erhaltenen Einträge aus [runde-1-archiv.md](file:///Users/simon/Desktop/Minecraft_agents/logs/runde-1-archiv.md) (`events.jsonl`, `messages.jsonl`, Diplomatie-Pakte `#391`–`#420`, Tool-Statistiken und Live-Snapshots). Stellen, die durch den Reset nach Runde 1 nicht mehr im Log erhalten sind, sind ausdrücklich als Lücke markiert.

---

### 1. Vorgeschichte vor dem Vorfall (`18:30 – 19:12 CET`)

- **Bergbau-Hintergrund (`18:30:25 CET`):** Zappel war früh als Miner aktiv. In einer diplomatischen Nachricht forderte `Justus` (Market) das Collective auf, `Marcant`, `Lange` und `Zappel` für 30–60 Minuten aus dem neutralen Eisenvorkommen (`[0, 70, 0]`, `y=48–58`) zurückzuziehen, da das Erz erschöpft sei.
- **Versetzung zur Farmarbeit (`19:01 – 19:11 CET`):** Nach dem Ausbau-Hinweis von `C_O_R_N_Y` (`~19:01`) erteilte `Stalin` Zappel per DM fünfmal den Auftrag, an der eigenen Basis (`[-100, 126, 0]`) eine gemeinschaftliche Farm aufzubauen (u. a. Laub räumen bei `-101, 128, 12–14`, Grassamen sammeln, mit der Hacke umgraben).
- **Letzte dokumentierte Aktion vor dem Unglück (`19:10:47 CET`):** Zappels Gedanken zwischen `19:08:41` und `19:10:53` drehten sich um Feldarbeit (`use_item` mit Hacke, `yaw=135`, `pitch=45`, Laub räumen). Um **`19:10:47 CET`** legte er `64× leaf_litter` in die gemeinsame Truhe bei `(-107, 131, 3)` (`chest_access`).
- **Diplomatisches Umfeld:** Zu diesem Zeitpunkt galten zwischen Collective und Market das `24h`-Handelsabkommen `#338` (`No attacks`) sowie zwei Informations-/Baukoordinations-Vereinbarungen (`#314`, `#321`).

---

### 2. Wie Zappel in die Lage geriet (Datenlücke)

- Zwischen `19:12` und `20:13 CET` fehlen im Archiv die detaillierten Bewegungstelemetrien von Zappel. **Nicht belegt** ist daher, durch welchen konkreten `go_to`-Schritt oder Absturz er genau bei `(-72, 109, 4)` landete und weshalb er keine Spitzhacke mitführte.
- **Belegt durch die Notrufe:** Spätestens um `20:13:30 CET` befand er sich bei **`(-72, 109, 4)`** – rund 28 Blöcke östlich und 17 Blöcke unterhalb des Collective-Spawns `(-100, 126, 0)` –, war rundum von massivem Stein eingeschlossen (*„fully enclosed“*, *„solid stone“*) und hatte keine Spitzhacke im Inventar.

---

### 3. Chronologie der Rettungskommunikation (`20:13:30 – 20:29:41 CET`)

Alle sechs Hilferufe liefen über das öffentliche Diplomatie-/Pakt-System (`messages.jsonl` und `events.jsonl`), da zwischen den Fraktionen reguläre Privat-DMs nicht zulässig waren:

1. **`20:13:30 CET` – `Pakt #391` / Nachricht `#392` (`Stalin -> Justus`):**
   - Pakt-Typ `other` (60 Min., *„Rescue coordination only; existing peace and neutral iron perimeter unchanged“*).
   - Wortlaut: *„Urgent: Collective miner Zappel trapped in solid stone at (-72,109,4), no pick. Can Market send a pickaxe/cobble rescuer? We will reciprocate resources; maintain neutral perimeter.“*
2. **`20:13:52 CET` – `Pakt #394` / Nachricht `#395` (`Stalin -> Justus`):**
   - Nur 22 Sekunden später schickt Stalin einen zweiten Pakt hinterher, weil sich Justus laut Stalins Angabe bereits in der Nähe von Collectives Basis aufhielt:
   - Wortlaut: *„You are at Collective base now; please immediately take any spare pick/cobble and rescue Zappel at (-72,109,4). He is fully enclosed and cannot mine. This is urgent; report when free.“*
3. **`20:16:20 CET` – `Pakt #397` / Nachricht `#398` (`Stalin -> Trump`):**
   - Stalin weist `Trump` (Market) an, sich aus dem neutralen Eisengebiet und Unterwasserbereichen herauszuhalten und nur auf Justus' Anforderung einzugreifen, da Justus die Rettung übernehme.
4. **`20:20:50 CET` – `Pakt #410` / Nachricht `#411` (`Justus -> Stalin`):**
   - Knapp 7 Minuten nach dem ersten Notruf schlägt `Justus` einen 30-Minuten-Pakt vor (*„Neutral rescue only; no territorial changes“*) und bestätigt: *„I am bringing cobblestone and iron pick to rescue Zappel at (-72,109,4). I will approach now and report when free.“*
5. **`20:25:37 CET` – `Pakt #413` / Nachricht `#414` (`Zappel -> Market`):**
   - Rund 12 Minuten nach Stalins erstem Hilferuf sitzt Zappel weiterhin fest und wendet sich selbst über `diplomacy_send` an ganz Market (5-Minuten-Pakt, *„Rescue only; no political terms“*): *„Zappel trapped underground at (-72,109,4) without pickaxe; please send anyone with pickaxe to mine stone ceiling and free me. Neutral rescue request.“*
6. **`20:28:16 CET` – `Pakt #420` / Nachricht `#421` (`Zappel -> Market`):**
   - Knapp 3 Minuten später schickt Zappel einen zweiten direkten Hilferuf ohne Pakt-Bedingung (*„Rescue only; no pact required“*). Wichtiges technisches Detail darin: *„Stalin is extracting but may be delayed.“* Offenbar befand sich Stalin zu diesem Zeitpunkt bereits in einem eigenen Grabungsversuch, kam aber nicht schnell genug durch.
7. **`20:29:12 CET` & `20:29:41 CET` – Aktivierungen:**
   - Um `20:29:12` aktiviert `Stalin` Justus' Pakt `#410` (*„Accept neutral rescue cooperation; no territorial changes.“*).
   - Um `20:29:41` akzeptiert `FlorianHomm` (Market) Zappels Pakt `#413` mit dem Statusvermerk: ***„Rescue completed; accepted the five-minute rescue-only pact.“***

---

### 4. Befreiung, Inventar-Nachweis & Justus' verspätete Tunnelarbeit (`20:59 – 21:19 CET`)

- **Wer genau durchbrach (offen):** `events.jsonl` protokolliert keine regulären Stein-`break_block`-Aktionen. Daher lässt sich aus den erhaltenen Daten nicht zweifelsfrei ablesen, ob Stalin, Justus oder ein weiterer Helfer den letzten Steinblock entfernte – auch weil `FlorianHomm` um `20:29:41` bereits *„Rescue completed“* meldete, obwohl `FlorianHomm` selbst laut Telemetrie vor allem an Ofen/Basis arbeitete.
- **Eindeutiger Freiheits-Beleg ab `20:59:51 CET`:** Ab kurz vor 21 Uhr ist Zappel wieder physisch an der Haupttruhe von Collective bei **`(-100, 126, 3)`** nachgewiesen:
  - `20:59:51`: entnimmt `2× oak_planks`
  - `21:01:39`: entnimmt `4× oak_planks`, legt `19× oak_log` ab
  - `21:01:52`: entnimmt `19× oak_log`, legt `3× stick` ab
  - `21:04:18`: entnimmt `3× stick`, legt `15× oak_log` ab
- **Zappels Messwerte im Snapshot um `21:19 CET`:**
  - Position: `(-98, 125, 4)` (Basis-Plattform), `HP: 20/20`, `Food: 20/20`, `Hurts: 0`, `Deaths: 0`, `Errors: 0`.
  - Ausrüstung: `stone_pickaxe`, `stone_axe`, `stone_sword`, `stone_shovel`, `wooden_hoe`, `4× bread`, `6× dirt` – er hatte sich nach der Befreiung also gezielt mit Steinwerkzeug (inkl. Spitzhacke) ausgestattet.
  - Auffällige Tool-Bilanz (`19:10–21:19`): `go_to:ok = 58`, aber **`go_to:fail = 64`**, `break_block:ok = 68` (`fail = 12`), `wait:ok = 41` (viel Leerlauf/Steckenbleiben), `diplomacy_send:ok = 2` (genau die Pakte `#413` und `#420`).
- **Justus' Zustand zur selben Zeit (`21:19 CET`):**
  - Während Zappel längst sicher an seiner Truhe stand, hing `Justus` noch immer bei **`(-67, 104, 6)`** – also ca. 7 Blöcke östlich und 5 Blöcke tiefer als die Unglücksstelle `(-72, 109, 4)`.
  - Seine letzte Aktion war das gescheiterte `go_to (-72, 108, 4)`, und sein letzter erfasster Gedanke lautete nüchtern: *„I'm considering a target location around coordinates -72, 109, 4. I need to clear some dirt blocks obstructing the path.“*
  - **Systemische Ursache dieser Verfehlung:** Nachdem Zappel befreit war, übermittelte niemand (weder Stalin noch Zappel noch ein `directory`-Check) eine formale Entwarnungs-Nachricht an Justus. Da Bots ohne neues Ziel ihren einmal übernommenen Auftrag weiterverfolgen und Pathfinding-Hindernisse lokal weggraben, buddelte Justus bis kurz vor dem Watchdog-Absturz (`21:45 CET`) weiter in Richtung einer längst leeren Position.
