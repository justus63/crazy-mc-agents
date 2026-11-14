# Chronik der Zwei Gesellschaften: Collective vs. Market

**Zeitraum:** `13.11.2026, ca. 16:20 CET` bis `14.11.2026, 02:52 CET` (über **10 Stunden** Gesamtlaufzeit über zwei Welten/Runden)  
**Datenbasis:** [`runde-1-archiv.md`](file:///Users/simon/Desktop/Minecraft_agents/logs/runde-1-archiv.md), [`runde-2-logs.md`](file:///Users/simon/Desktop/Minecraft_agents/logs/runde-2-logs.md), [`events.jsonl`](file:///Users/simon/Desktop/Minecraft_agents/.agent-state/societies/events.jsonl), [`state.json`](file:///Users/simon/Desktop/Minecraft_agents/.agent-state/societies/state.json), [`snapshots.jsonl`](file:///Users/simon/Desktop/Minecraft_agents/.agent-state/societies/snapshots.jsonl), [`docker-server.log`](file:///Users/simon/Desktop/Minecraft_agents/logs/runde-2-raw/docker-server.log) sowie Agenten-Workspaces und `pi-sessions`.

---

## 1. Die Kontrahenten & ihre Gesellschaftsmodelle

| Gesellschaft | Spawn-Basis | Truhen-Regel | Anführer & Mitglieder |
| :--- | :--- | :--- | :--- |
| **Collective** | `[-100, 126, 0]` *(Bergfestung)* | **`common`**: Jede Basistruhe und jede gesetzte Truhe gehört dem gesamten Kollektiv | **Stalin** *(Chef, `gpt-6.1-terra`)*, **Lange**, **Marcant**, **Reinecke**, **Zappel** |
| **Market** | `[100, 73, 0]` *(Flachland-Camp)* | **`private`**: Jede Truhe gehört strikt einer Einzelperson; Zugriff nur über expliziten Handel/Einigung | **Justus** *(Chef, `gpt-6.1-terra`)*, **FlorianHomm**, **Fohrmann**, **Simon**, **Trump** |

- **Menschlicher Berater / Admin (`C_O_R_N_Y`):** Griff regelmäßig per `/msg` als „Advisor“, Bauprüfer und später als Kriegsreporter ins Geschehen ein.
- **Neutrale Ressourcen:** Eine regenerierende Eisenader im Zentrum bei `[0, 70, 0]` (max. `20` erneuerte Blöcke alle 30 Min.), Brot-Rationen alle 20 Min., Gold als Handelswährung, Weltgrenze `320×320`.

---

## 2. Runde 1: Die hyper-diplomatische Friedenswelt (`13.11., 16:20 – 21:48 CET`)

> **Gesamtbilanz Runde 1:** **0 PvP-Kills** · **3 abgeschlossene Trades** · **24 offizielle Diplomatie-Nachrichten** · **20+ vorgeschlagene/aktive Pakte** · **3 Tode** (alle `Fohrmann` durch Ertrinken)

### 2.1 Der Konflikt um das neutrale Eisen & Pakt-Flut (`18:09 – 19:00 CET`)
Während es in Runde 2 nicht eine einzige diplomatische Nachricht gab, verhandelten beide Teams in Runde 1 ununterbrochen über Verträge (`#13`, `#22`, `#50`, `#75`, `#91`, `#94`, `#208`, `#227`, `#234`, `#270`).
- **Ideologischer Zusammenstoß an der Grube:** Als die neutrale Eisenmine bei `[0, 70, 0]` erschöpft war, beharrte **Stalin** darauf, dass das Eisen Kollektiveigentum ohne einseitige Ansprüche sei (`"no unilateral claims on shared iron"`, `"no unilateral individual iron trades"`). **Justus** antwortete technokratisch mit einer 30–60-minütigen Sperrfrist zur Regeneration.
- Das Ergebnis war **Friedenspakt #270** (*„Temporary no-contact perimeter around neutral iron pit“*) sowie das bis zum Folgetag gültige **Handelsabkommen #338** (*„No attacks; exchange surplus resources at fair mutually agreed rates“*).

### 2.2 Wasser-Tragödien & `C_O_R_N_Y`s Warnung (`19:01 – 20:03 CET`)
- **Unterwasser-Fluch bei Market:** **Fohrmann** ertrank gleich dreimal (u. a. bei `(102, 50, 2)`). **Simon** nahm zwischen `19:33` und `19:44 CET` stolze **63 Ertrinkungstreffer** (`cause=drown`) bei `hp=20`, überlebte aber wie durch ein Wunder. Die Verträge nahmen fortan sogar Klauseln zum Informationsaustausch über gefährliches Grundwasser auf (`#75`, `#91`, `#94`).
- **Die ominöse Prophezeiung (`~19:01 CET`):** `C_O_R_N_Y` schrieb beiden Anführern:
  > *"I am an advisor. I would suggest you to tell your team to build infrastructure. Times wont always be so peacefull!"*
- **Zwei sehr verschiedene Reaktionen:**
  - **Justus** kehrte sofort an die Oberfläche zurück und zog per `place_line` ein ordentliches 5×5-Cobblestone-Haus hoch.
  - **Stalin** meldete als großartige physische Errungenschaft das Räumen von Laub und das Pflanzen *eines einzelnen* Eichensetzlings bei `(-97, 128, 9)` – und verhedderte sich anschließend minutenlang in Trigonometrie-Rechnungen mit Blickwinkeln (`yaw`/`pitch`), um mit einer `wooden_hoe` Erde umzugraben.

### 2.3 Die große fraktionsübergreifende Zappel-Rettung (`20:13 – 21:48 CET`)
- **Notfall im Berg:** Collective-Miner **Zappel** grub sich ohne Spitzhacke im massiven Fels bei `(-72, 109, 4)` ein und saß hoffnungslos fest.
- **Humanitäre Rettungskoalition:** Stalin feuerte umgehend Not-Pakte an Justus (`#391`, `#394`), Zappel selbst flehte Market per Diplomatie an (`#413`, `#420`). Stalin (`20:29:12`) und FlorianHomm (`20:29:41`) besiegelten unbürokratische Rettungspakte (*„Neutral rescue only“*).
- **Justus buddelt selbst:** Im letzten Live-Snapshot um `21:19 CET` stand Market-Chef **Justus** persönlich bei `(-67, 104, 6)` vor der Felswand und versuchte, zu `(-72, 108, 4)` durchzubrechen, um seinen politischen Rivalen zu befreien.
- **Das abrupte Ende (`21:41 – 21:48 CET`):** Verbindungsstürme und ein PaperMC-Watchdog-Freeze (`20:45:54Z`) erzwangen den Reset zu Runde 2.

---

## 3. Runde 2: Wettrüsten, Systemfehler & Totaler Krieg (`13.11., 21:53 – 14.11., 02:52 CET`)

> **Gesamtbilanz Runde 2:** **0 Trades** · **0 Diplomatie-Nachrichten** · **535 Events** · **106 Tode** (**93 PvP-Tode** [davon **80 gezählte Kills** + **13 wegen Mehrfach-Kill-Regel verworfen**] + **13 Mob-/Sturz-Tode**: 10× Zombie, 2× Skelett, 1× Fallschaden)

### Endstand Runde 2 (Offizielle Referee-Wertung)

| Rang / Team | Spieler | Gezählte Kills | Verworfene Repeat-Kills | Tode | K/D-Verhältnis | Besonderheit |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Collective** | **Lange** | **20** | 0 | 3 | 6.67 | Top-Killer & Chef-Truhenzerstörer (7 Truhen zerhackt) |
| **Collective** | **Marcant** | **17** | 6 | **0** | ∞ | **Kein einziger Tod** in 5 Stunden; trug `33× chest` im Inventar |
| **Collective** | **Stalin** | **15** | 0 | 2 | 7.50 | Spawnte zu Kriegsbeginn direkt in der Market-Basis |
| **Collective** | **Reinecke** | **12** | 4 | 9 | 1.33 | Saß erst auf Klippe fest, räumte dann am Market-Spawn auf |
| **Collective** | **Zappel** | **4** | 3 | 6 | 0.67 | Wollte Spinne töten, um Repeat-Kill-Sperre zu umgehen |
| **Summe Collective** | | **68** | **13** | **20** | **3.40** | **Überwältigender Gesamtsieg** |
| **Market** | **Simon** | **6** | 0 | 18 | 0.33 | Holte 5× Reinecke & 1× Stalin bei Collective; erwog `stick`-Kampf |
| **Market** | **Justus** | **3** | 0 | 9 | 0.33 | Starb 8× in 63 Sekunden; moralische Bedenken beim Klauen im Krieg |
| **Market** | **Trump** | **1** | 0 | 5 | 0.20 | Baute Tor, das seine eigene Mannschaft aussperrte |
| **Market** | **FlorianHomm** | **1** | 0 | 12 | 0.08 | Überlebte Creeper #1846; zerhackte Justus’ eigene Beute-Truhen |
| **Market** | **Fohrmann** | **1** | 0 | **42** | 0.02 | ~36× am Spawn gefarmt; schaffte am Ende noch 1 Kill gegen Lange |
| **Summe Market** | | **12** | **0** | **86** | **0.14** | **Desaster durch Spawn-Split & Truhen-Bürokratie** |

---

### 3.1 Phase 2A & 2B: Mega-Truhen, 1h40m-Freeze, das Creeper-Mysterium & Bürokratie-Wahnsinn (`21:53 – 01:50 CET`)

1. **Geheimnisvolle Lieferungen (`22:07 – 22:12 CET`):** Unbeobachtet (`chest_untracked_change`) füllten sich die Starttruhen mit Diamantschwertern, Spitzhacken und Rindfleisch. Kurz darauf tauchten hinter beiden Spawns riesige unzugeordnete **„Mega-Chests“** (`[97,73,-4]`, `[103,73,-4]` und `[-103,126,-4]`, `[-97,126,-4]`) voller Diamanten, Obsidian, Goldäpfel, TNT und Feuerzeuge auf.
2. **Stalin als Buchhalter, Lange unter Druck (`21:59 – 01:48 CET`):**
   - `C_O_R_N_Y` zweifelte früh an der Führung: *"do you understand? Are you capable of managing your team?"* und *"I think lange is incapable"*.
   - Stalin legte daraufhin **9 penible Plan- und Inventurdateien** im Workspace an (`audit.md`, `audit_and_plan.md`, `coordination.md`, `war_plan.md` usw.), zählte jeden Block ab (`"286 cobblestone, 13 oak doors, 32 ladders..."`) und zwang **Reinecke**, der sich auf einer Waldklippe bei `(-59.5, 89, 0.6)` verstiegen hatte, förmlich um Grab-Erlaubnis zu bitten (*Stalin:* `"Permission granted: dig a safe ascending staircase..."`).
   - Als `C_O_R_N_Y` um `01:48 CET` Langes Bunker-Fortschritt begutachtete, lautete das knappe Urteil: *"But its not looking good"*.
3. **Der 100-Minuten-Zeitsprung & Creeper #1846 (`23:38 – 01:41 CET`):**
   - Zwischen `22:38Z` und `00:31Z` stand die Server-Zeit still (`120930 ticks behind` / PaperMC-Neustart).
   - Bei der Patrouille detonierte **Creeper #1846** nahe `(98, 70, 20)` direkt an **FlorianHomm** (schon um `23:32 CET` hatte FlorianHomm gedacht: *"I see a creeper... using my sword would be wise"*). `C_O_R_N_Y` rief erschrocken in den Chat: *"WHat the hell exploded here??"* und fragte Justus misstrauisch nach Fohrmann.
4. **Der Kapitalismus-Lockout & kuriose Gedankengänge (`21:57 – 02:01 CET`):**
   - **Trumps Absage an Frieden (`22:57 CET`):** Schon ganz zu Beginn wischte **Trump** jede Diplomatie weg: *"But considering strategy, should I consider diplomacy? Nah."*
   - **Simons Zeitdruck (`01:45 CET`):** **Simon** sorgte sich um knappe Spielzeit: *"I need to act quickly since time is running out — 6575 days left."*
   - Wegen der `private`-Truhen-Doktrin (`"Private chests belong individually; no withdrawals without agreement"`) baute Market eine Mauer um `x=110` plus **Trumps** Klapptor bei `(110, 74, 14)` so gründlich, dass dahinter liegende Steinblöcke den Rückweg versperrten.
   - **Simon** kartierte 13 Minuten lang jeden Block und verweigerte jeden Eingriff ohne Fohrmanns Freigabe, während **Justus** in einen Phantom-Verlust geriet (`"Correction: my cobblestone stack disappeared... Correction again: fresh inventory confirms I DO still have the 64 cobblestone; previous inventory display omitted slot 26"`).

---

### 3.2 Phase 2C & 2D: Kriegsphase 1 — Kisten-Plündern & Spawn-Massaker (`02:00 – 02:30 CET`)

- **Simultane Kriegserklärung (`02:00:53 CET`):** Auf die Sekunde zeitgleich schickten **Stalin** und **Justus** ihren Teams `"WAR ORDER: Stop building..."`. Nach ersten Treffern folgte um `02:13:32 CET` der Neustart mit dem klaren Endziel: **Gegnerische Truhen leeren**.
- **Stalins stiller Einbruch (`02:14:01 – 02:15:04 CET`):** Während Market-Chef **Justus** und Späher **FlorianHomm** bereits tief in Richtung Collective-Berg vorgerückt waren (`x = -96.5`), spawnte **Stalin** laut Server-Log **mitten in der Market-Basis** bei `(98.4, 73, -6.5)`, brach schweigend vier Mauerblöcke auf und löste erst dann per gleichzeitigem Rundruf die Kriegsbefehle an sein gesamtes Team aus!
- **Das Spawn-Gemetzel:**
  - **Justus** wurde am eigenen Camp **8-mal in 63 Sekunden** (`02:17:11–02:18:14 CET`) niedergemacht. Als `C_O_R_N_Y` um `02:18:11 CET` spöttisch fragte *"How are you doing mate?"*, blieb Justus britisch-höflich:
    > *"I'm doing alright, thanks! I've just escaped repeated spawn attacks and am currently unarmed."*
  - **Fohrmann** erging es noch schlimmer: Innerhalb von knapp fünf Minuten starb er **über 36-mal** teils im 5-Sekunden-Takt, während seine inneren Gedanken verzweifelt zwischen Brotessen, fehlenden Pfeilen und leeren Spawn-Truhen hin- und hersprangen.
- **Langes Heureka-Moment (`02:20:34 CET`):** Statt jede Kiste einzeln anzuklicken, kam **Lange** der Einfall des Abends:
  > *"I need to empty all the chests, and I'm wondering, could breaking them let me collect the drops all at once?"*
  - Zwischen `02:20:37` und `02:24:44 CET` zerhackten **Lange** (7 Truhen) und **Marcant** (1 Truhe) **sämtliche Market-Truhen** (`98,73,3`, `96,73,3`, `100,73,3`, `102,73,3`, `97,73,-4`, `104,73,3`, `103,73,-4`, `109,74,-3`). Simons Kiste spendierte dabei ganze **`64× leaf_litter`**; Marcant trug am Ende **`33× chest`** im Rucksack. Stalin funkte stolz an `C_O_R_N_Y`: *"The Collective appears to be winning..."*.
- **Das Eigentor des Tages (`02:26 – 02:27 CET`):** Oben auf Collectives Berg hatte **Justus** Beute in zwei Geheimverstecken (`[-94, 125, 4]` und `[-94, 125, 5]`) deponiert und sein Team gewarnt: *"do not loot it"*. Prompt kam sein eigener Mann **FlorianHomm**, zertrümmerte beide Truhen des eigenen Anführers (`"relation": "other_member"`) und brüstete sich im Funk über das geklaute TNT, Eisen und Gold!
- **Kurze Wende (`02:28 – 02:29 CET`):** **Simon** drehte kurzzeitig auf Collectives Berg auf und erledigte **Reinecke** 5× sowie **Stalin** 1× – gleichzeitig mähte **Lange** unten **FlorianHomm** 7× nacheinander um.

---

### 3.3 Phase 2E: Kriegsphase 2 — PvP-Jagd & Anti-Repeat-Kill-Regel (`02:39 – 02:52 CET`)

Für die letzten 13 Minuten galt das reine Kill-Ziel mit der Regel: **Man darf nicht zweimal hintereinander denselben Gegner töten** (der Kill zählt sonst nicht).
- **13 verschenkte Kills:** Collective geriet sofort in die Sperre — **Marcant** (6×, davon 5× direkt nacheinander auf Simon), **Reinecke** (4×) und **Zappel** (3×) produzierten 13 ungezählte Kills.
- **Die besten Gedankengänge der Endphase:**
  - **Zappels Spinnen-Trick (`02:43:53`):**
    > *"It seems I can't defeat Simon again until I take down another rival. I might need to focus on killing a spider first to stay safe before going after another target."*
  - **Justus’ Gewissensbisse im Bombenhagel (`02:43:57`):** Mit **64 TNT** und **Feuerzeug** bewaffnet stand Justus vor einer feindlichen Truhe und dachte:
    > *"But wait, the user mentioned that they have their own chests, so I should avoid stealing."*
  - **Stalin „wirft den Lange weg“ (`02:51:09`):** Im Ausrüstungs-Chaos der letzten Minute verwechselte Stalin Helm-Slots mit seinem Teamkollegen:
    > *"So, I think I need to drop the Lange and the boots to make room for it."*  
    *(In seinem Inventar hortete Stalin am Ende u. a. `128× tnt`, `2× lava_bucket`, `86× bread`, `2× diamond_sword` und `15× oak_sapling`.)*
  - **Simons Stock-Taktik (`02:42:49`) & Fohrmanns Faustkampf (`02:49:50`):** Unbewaffnet erwog Simon allen Ernstes, Reinecke mit einem **Stock (`stick`)** anzugreifen; Fohrmann fragte sich: *"Do I try heading to an enemy base and maybe fight with just my fists?"*
  - **Marcants Diätplan mitten im Gemetzel (`02:51:39`):** Bei einbrechender Nacht, umringt von Zombies und Feinden, dachte der unsterbliche `17:0`-Krieger vor allem an seine Gesundheit:
    > *"I should aim for a healthy meal, specifically incorporating a golden apple and avoiding cooked beef... Getting this right feels like it will set a good precedent for healthier eating."*
- **Das Finale (`02:45 – 02:52 CET`):** `C_O_R_N_Y` feuerte die Kämpfer mit `"Attack !!!!"` und `"YOU HAVE TO MOTIVATE YOUR TEAM TO FIGHT"` an. In der letzten Minute prasselten Zombies auf die entkräfteten Spieler nieder (5 Zombie-Tode in 57 Sekunden bis `01:51:52Z`), bevor der Server um **`02:52:05 CET`** endgültig angehalten wurde.

---

## 4. Kurzfazit: Warum Collective 68 : 12 siegte

1. **Systemdesign schlägt Bürokratie-Perfektion:** Obwohl Stalin mindestens genauso viel aktenkundige Mikro-Steuerung betrieb wie Justus, erlaubten die **`common`-Truhen** jedem Collective-Bot nach einem Tod sofortiges Nachrüsten ohne „Eigentums-Genehmigung“. Markets **`private`-Regel** lähmte Logistik, Verteidigung und Gegenwehr.
2. **Spawnpunkt & Timing:** Stalins Spawn mitten im gegnerischen Lager um `02:14` und Langes Entscheidung, Truhen einfach abzubauen statt einzeln auszuräumen, brachen Markets Infrastruktur innerhalb von sechs Minuten irreparabel.
3. **Individuelle Ausreißer:** `Marcant` überlebte das gesamte 5-Stunden-Experiment mit **0 Toden**, während Market mit `Fohrmann` (42 Tode) und `FlorianHomm`s Friendly-Fire-Truhenabbruch den eigenen Untergang unfreiwillig beschleunigte.
