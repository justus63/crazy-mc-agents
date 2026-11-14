# LiteLLM Modell-Übersicht & Praxis-Benchmark (FH Münster Proxy)

> **Datenbasis:** Auswertung des offiziellen Modellkatalogs (`https://litellm-models.fh-muenster.de/`, Proxy-Endpunkt `https://litellm.fh-muenster.de/v1`), des VMware Self-Service-Portals der FH Münster sowie echte Live-Benchmarks und Dauerlast-Messungen mit 10 parallelen autonomen Agenten über die OpenAI Responses API (`/v1/responses`) und Chat Completions API (`/v1/chat/completions`).

---

## 1. Executive Summary: Die wichtigsten Erkenntnisse für LiteLLM-Projekte

1. **Warum `gwdg/*` (inkl. DeepSeek) bei Agenten/Multi-Turn-Projekten abbricht:**
   Alle 14 kostenlosen Modelle mit dem Präfix `gwdg/*` (u. a. `gwdg/deepseek-v4-flash`, `gwdg/deepseek-v4.1-flash-1017`, `gwdg/qwen3.8-27b`, `gwdg/mistral-large-4-1t-a52b`) laufen über die AcademicCloud der GWDG in Göttingen. Dort gilt ein **hartes, geteiltes Tageslimit von exakt 800 Requests pro 24 Stunden pro Account über alle `gwdg/*`-Modelle zusammen**. Sobald der 800. Request erreicht ist, blockiert der Proxy für den Rest des Tages mit:
   `RateLimitError (429): Rate limit exceeded: user daily request limit reached (800 of 800)`.
2. **Beste kostenlose Modelle (ohne 800er-Tageslimit):**
   - **Mit tiefem Reasoning (`<think>`):** `fhms/Qwen3.8-27B` (\$0.00, lokal FH Münster, 0,53 s Basis-Latenz, ~15–25 s inkl. langem Thinking-Monolog, verkraftet bis zu 6 parallele Bots stabil).
   - **Schnell & groß ohne Zwangs-Thinking:** `oski/inferenz-mistral-small-4-119b` (\$0.00, 119B Parameter, 0,59 s Einzel-Latenz / 0,84 s unter Last) und `fhms/Qwen3.5-27B` (\$0.00, 27B Dense, 0,22 s Einzel-Latenz / 0,46 s unter Last).
   - **Starkes kostenloses Reasoning auf EU-Cluster:** `oski/inferenz-gpt-oss-120b` (\$0.00, 120B Parameter, 0,95 s Einzel-Latenz / 1,83 s unter Last).
3. **Bester kostenpflichtiger Preis-Leistungs-Sieger:**
   - **`azure/gpt-5.6-luna` (\$0.20 Input / \$1.20 Output pro 1M Tokens):** Antwortet in ~0,8–1,3 s, beherrscht parallele Tool-Calls perfekt (3 Tools in einem Zug) und kostet dank **automatischem Prompt-Caching auf Azure (90 % Rabatt auf gecachte Input-Tokens → effektiv \$0.02 / 1M)** im Dauerbetrieb nur ca. **\$0.45–\$0.90 pro Bot und Stunde** (rund 10× höherer Aktions-Durchsatz als kostenlose Thinking-Modelle).
   - **`azure/gpt-6.1-terra` (\$1.00 Input / \$5.00 Output pro 1M Tokens):** Noch etwas stärker bei komplexer Langzeit-Strategie und Führung, 95 % Cache-Rabatt (effektiv \$0.05 / 1M für gecachte Tokens), ca. **\$4.20 pro Anführer-Bot und Stunde**.

---

## 2. Live-Benchmarks der getesteten Modelle (Latenz, Intelligenz, Kosten & Bremsen)

### 2.1 Kostenlose Modelle (`$0.00`) im direkten Vergleich

| Modell-ID | Hosting / Region | Parameter / Typ | Latenz (Einzel) | Latenz (unter Last) | Reasoning / Thinking | Zuverlässigkeit & Tool-Calling | Harte Bremsen / Beschränkungen |
|---|---|---|---:|---:|---|---|---|
| **`fhms/Qwen3.8-27B`** | Lokal FH Münster (`LOCAL`) | 27B Dense | **0,53 s** *(TTFT)* | **15–25 s** *(inkl. `<think>`)* | **Ja** (intensives `<think>`) | **Sehr hoch (Bestes Gratis-Modell für komplexe Logik):** Erkennt Sackgassen selbstständig, plant 5–7 Schritte voraus, sehr sauberes Tool-Calling. | Kein Tageslimit. Ab **>6 Bots gleichzeitig** bildet sich eine lokale GPU-Warteschlange; durch lange Thinking-Blöcke nur ~0,6–2,3 Aktionen/Min. |
| **`fhms/Qwen3.5-27B`** | Lokal FH Münster (`LOCAL`) | 27B Dense | **0,22 s** | **0,46 s** | Nein (direkte Antwort) | **Hoch (Schnellstes lokales Modell):** Sehr reaktionsschnell, gutes Basis-Tool-Calling, neigt aber ohne Thinking bei Fehlern gelegentlich zu Text-Wiederholungen. | Kein Tageslimit. Teilt sich die lokale FH-GPU mit den anderen `fhms/*`-Modellen. |
| **`oski/inferenz-mistral-small-4-119b`** | OSKI Cluster (`EU`) | 119B Dense | **0,59 s** | **0,84 s** | Nein (direkte Antwort) | **Sehr hoch (Sweetspot Tempo + Größe):** Versteht große Prompts und Schemata sofort, kein unnötiger Reasoning-Overhead. | **Concurrency-Limit:** Erlaubt nur **max. 2–3 gleichzeitige Requests** (`429: Too many concurrent requests`). Bei Non-Thinking gelegentlich Markdown-Antwort statt Tool-Call. |
| **`oski/inferenz-gpt-oss-120b`** | OSKI Cluster (`EU`) | 120B Reasoning | **0,95 s** | **1,83 s** | **Ja** (internes Reasoning) | **Sehr hoch:** Extrem starkes Sprach- und Strategie-Verständnis, sehr sicheres Tool-Calling. | **Concurrency-Limit:** Max. **2–3 gleichzeitige Requests** pro Modell (`429: Too many concurrent requests`). |
| **`fhms/Qwen3-Coder-30B-A3B-Instruct`** | Lokal FH Münster (`LOCAL`) | 30B MoE *(nur 3B aktiv!)* | **0,25–0,34 s** | **18,56 s (!)** | Nein | **Schwach bei Logik:** Durch nur 3B aktive Parameter nimmt es Fehlermeldungen blind wörtlich und läuft in Endlosschleifen. | **Bricht unter Parallellast ein:** Bei 8 gleichzeitigen Bots steigt die Latenz von 0,25 s auf **18,56 s**; feuert ohne Pacing zu viele Requests/Sek. ab. |
| **`fhms/gemma-4-31b-it`** | Lokal FH Münster (`LOCAL`) | 31B Dense | **0,69 s** | **>12,2 s (Timeout)** | Nein | Solides Modell bei Einzelanfragen, aber instabil unter Mehr-Agenten-Last. | **GPU-Queue-Timeout:** Läuft bei parallelen Agenten-Requests schnell in Timeouts (>12 s). |
| **`gwdg/deepseek-v4-flash`** | GWDG Göttingen (`EU`) | Flash / MoE | ~5,07 s *(429)* | Blockiert | Ja / Hybrid | Nicht dauerhaft nutzbar für Agenten oder hochfrequente Pipelines. | **Hartes 800-Requests/Tag-Limit** (geteilt über alle 14 `gwdg/*`-Modelle!). |
| **`gwdg/deepseek-v4.1-flash-1017`** | GWDG Göttingen (`EU`) | Flash / MoE | ~5,48 s *(429)* | Blockiert | Ja / Hybrid | Wie `deepseek-v4-flash`: für Einzel-Chats gut, für Loops ungeeignet. | **Hartes 800-Requests/Tag-Limit** (danach ~8–24 h Sperre mit HTTP 429). |
| **Alle weiteren 12 `gwdg/*`-Modelle** *(Qwen 397B, Mistral Large 1T, GLM 5.3, Llama 3.1, EuroLLM)* | GWDG Göttingen (`EU`) | 8B bis 1000B | 4,7–6,0 s *(429)* | Blockiert | Modellabhängig | Auf dem Papier sehr große Modelle (`mistral-large-4-1t-a52b`, `qwen3.5-397b-a17b`), aber durch das Tageslimit für Agenten gesperrt. | **Teilen sich alle denselben 800-Requests/24h-Zähler** bei der GWDG. |
| **`oski/inferenz-e5-mistral-7b-instruct`** | OSKI Cluster (`EU`) | 7B Embedding | 0,34 s | – | Nein | **Kein Chat-Modell!** Wirft bei `/v1/chat/completions` und `/v1/responses` sofort `BadRequestError`. | Nur für `/v1/embeddings` nutzbar (trotz `-instruct` im Namen). |

---

### 2.2 Kostenpflichtige Modelle im direkten Vergleich (Latenz, Tool-Benchmark & Kosten)

Für die Entscheidungsträger/Anführer wurde ein standardisierter **Multi-Tool-Reasoning-Benchmark** über `/v1/responses` (mit 53 registrierten Tools und `reasoning: low/medium`) durchgeführt (*Aufgabe: Waffe für unbewaffnetes Teammitglied craften + zwei verschiedene Teammitglieder koordinieren*):

| Modell-ID | Preis Input / Output (pro 1M) | Effektiver Cache-Input-Preis | Latenz (einfach) | Latenz (Multi-Tool + Reasoning) | Parallele Tool-Calls pro Zug | Leistungsfähigkeit & Bewertung | Bremsen / Rate-Limits |
|---|---:|---:|---:|---:|---:|---|---|
| **`azure/gpt-5.6-luna`** | **\$0.20 / \$1.20** | **~\$0.02 / 1M** *(90 % Rabatt)* | **0,84 s** | **2,01 s** | **3 Tools parallel** | **Preis-Leistungs-Sieger:** Nahezu gleichauf mit `Terra` (~95 % der Qualität bei 20 % der Kosten). Schafft 8,6–30 Aktionen/Min. Kosten: **ca. \$0.45–\$0.90 / Bot / Std.** | **Azure TPM-Limit (`germanywestcentral`):** Pro API-Key/Deployment laufen **4–5 Bots gleichzeitig** stabil (bei kurzem Kontext & ~2–3 s Pacing). Ohne Kontext-Kürzung ab 6 Bots `429 exceeded token rate limit`. |
| **`azure/gpt-6.1-terra`** | **\$1.00 / \$5.00** | **~\$0.05 / 1M** *(95 % Rabatt)* | **1,27 s** | **2,63 s** | **3 Tools parallel** | **Bester Stratege / Commander:** Herausragende Übersicht, perfektes Multi-Tool-Calling und Rollenspiel. Kosten: **ca. \$4.20 / Bot / Std.** | **Azure TPM-Limit:** Bei `thinking: medium` und großem Kontext ab 2–3 parallelen Bots kurzzeitige 60s-Rate-Limits möglich; läuft mit Kontext-Pruning (16–20 Msgs) absolut stabil. |
| **`azure/gpt-6.1-sol`** | \$2.00 / \$10.00 | ~\$0.10 / 1M | ~1,5 s | **3,60 s** | **3 Tools parallel** | Sehr hohe Qualität (wie `Terra`), aber doppelt so teuer und etwas langsamer (3,60 s vs. 2,63 s). | Gleiches Azure-EU-Hosting; für die meisten Zwecke bietet `Terra` oder `Luna` das bessere Preis-Leistungs-Verhältnis. |
| **`vertex/claude-sonnet-5-5`** | \$2.00 / \$10.00 | Vertex-abhängig | **1,07 s** | ~2,8 s | 2–3 Tools | Extrem stark in Textqualität, Planung, Code und Rollenspiel; sehr schnelle Basis-Latenz (1,07 s). | Läuft über Google Vertex AI (EU); Übersetzung der OpenAI `/v1/responses`-API durch LiteLLM gelegentlich weniger nativ als bei `azure/*`. |
| **`vertex/claude-haiku-4-5`** | \$1.00 / \$5.00 | Vertex-abhängig | ~1,8 s | **5,52 s** | **2 Tools parallel** | Ordentlich, ließ im Benchmark aber den zweiten Koordinations-Schritt weg und war mit 5,52 s langsamer als `Terra` zum selben Preis (\$1/\$5). | Kein Vorteil gegenüber `azure/gpt-6.1-terra` (gleicher Preis, aber langsamer und unvollständigeres Multi-Tool-Calling). |
| **`vertex/gemini-3.1-flash-lite`** | \$0.25 / \$1.50 | Vertex-abhängig | 0,84 s | **2,81 s** | **Nur 1 Tool** | **Enttäuschend bei komplexen Agenten-Aufgaben:** Rief im Test nur `craft` auf und ignorierte alle Team-Koordinationsaufgaben komplett. | Für einfache Klassifikation/Extraktion günstig, aber bei gleichem Preis (\$0.25/\$1.50) ist **`azure/gpt-5.6-luna` (\$0.20/\$1.20) haushoch überlegen**. |
| **`vertex/gemini-3.5-flash`** | \$1.50 / \$9.00 | Vertex-abhängig | ~1,4 s | **4,33 s** | **Nur 1 Tool** | Trotz hohem Preis (\$1.50/\$9.00) im `/v1/responses`-Test nur 1 Tool-Call ohne Team-DMs und deutlich langsamer als `Luna`/`Terra`. | Über `/v1/responses` nicht optimal für paralleles Tool-Calling. |

---

## 3. Technische Bremsen, Fallstricke & Best Practices für dein anderes LiteLLM-Projekt

Wenn du den FH-Münster-LiteLLM-Proxy (`https://litellm.fh-muenster.de/v1`) in einem anderen Projekt einsetzt, solltest du diese **6 zentralen Mechanismen** kennen:

### 3.1 Die 4 verschiedenen Rate-Limit-Typen hinter dem Proxy
Auf der Webseite `litellm-models.fh-muenster.de` sind keinerlei Rate-Limits dokumentiert. In der Praxis gibt es jedoch vier völlig unterschiedliche Drosselungen je nach Präfix:
1. **`gwdg/*` (Göttingen AcademicCloud) → Hartes 24h-Kontingent:**
   - **Limit:** **800 Requests pro Tag (24h)** über alle `gwdg/*`-Modelle zusammen pro Account.
   - **Folge:** Für Chatbot-UI mit einzelnen Nutzerfragen okay; für Agenten, Batch-Verarbeitung oder Evaluations-Skripte sofort tödlich (`Retry after ~27400 seconds`).
2. **`oski/*` (OSKI Inferenz-Cluster) → Hartes Concurrency-Limit:**
   - **Limit:** Kein Tageslimit, aber nur **ca. 2–3 gleichzeitige (parallele) Requests pro Modell**.
   - **Folge:** Schickt dein Projekt 5 oder 8 Requests im selben Moment an `oski/inferenz-mistral-small-4-119b`, kommen sofort `429: Too many concurrent requests`.
   - **Lösung (Modell-Pooling / Semaphore):** Begrenze parallele Requests im Code per Semaphore auf `maxConcurrency = 2` pro `oski`-Modell oder verteile Worker symmetrisch auf `oski/inferenz-mistral-small-4-119b` + `oski/inferenz-gpt-oss-120b`.
3. **`fhms/*` (Lokale GPU-Server der FH Münster) → Physische Queue-Latenz:**
   - **Limit:** Kein künstliches 429-Limit, aber begrenzte lokale VRAM-/Compute-Kapazität.
   - **Folge:** Bis **6 parallele Requests** auf `fhms/Qwen3.8-27B` oder `fhms/Qwen3.5-27B` laufen flüssig. Ab 8–10 gleichzeitigen Requests staut sich die GPU-Queue auf 15–40 Sekunden pro Antwort auf (`fhms/gemma-4-31b-it` läuft dann in Timeouts).
4. **`azure/*` (Microsoft Azure EU `germanywestcentral`) → Tokens-Per-Minute (TPM) Limit:**
   - **Limit:** Azure deckelt die **Tokens pro Minute (TPM)** pro Modell-Deployment.
   - **Folge:** Wenn der Gesprächskontext ungekürzt auf >50.000 Tokens pro Request anwächst oder >5 Bots im 2-Sekunden-Takt feuern, meldet Azure:
     `429: Your requests to gpt-5.6-luna in germanywestcentral have exceeded token rate limit`.

### 3.2 Exponentielles Kontext-Wachstum verhindern (Der wichtigste Hebel!)
In Multi-Turn- oder Agenten-Systemen wächst die Nachrichtenliste (`messages`) schnell auf hunderte Tool-Calls an. Selbst wenn ein Bot nur `assistant` + `tool`-Schritte ohne neue `user`-Nachricht ausführt, wird bei jedem Schritt der gesamte Verlauf erneut geschickt.
- **Lösung:** Schneide den Kontext vor jedem API-Call auf ein **Sliding Window** (z. B. die letzten **16–20 Nachrichten** bzw. die letzten **10–15 Minuten**) zu, während das System-Prompt + die Tool-Definitionen am Anfang konstant bleiben.
- **Doppelter Effekt bei `azure/*`:**
  1. Das konstante Präfix (System-Prompt + Tools) landet zu **~70 % im automatischen Azure Prompt-Cache (`cacheRead`)** und kostet nur noch **5–10 % des regulären Input-Preises** (\$0.02 statt \$0.20 pro 1M bei `Luna`).
  2. Der TPM-Verbrauch sinkt um über 80 %, sodass **4–5 `Luna`-Instanzen pro API-Key** komplett ohne 429-Fehler durchlaufen.

### 3.3 Kurzes Pacing (2–3 Sekunden) bei schnellen Modellen
Schnelle Modelle wie `azure/gpt-5.6-luna` oder `fhms/Qwen3.5-27B` antworten oft in `<0,8 Sekunden`. Wenn eine Schleife sofort den nächsten Request abfeuert, erzeugt ein einziger Worker 30–60 Requests pro Minute.
- **Best Practice:** Ein Mindestabstand (`minTurnIntervalMs = 2500–3000 ms`) zwischen zwei Modell-Aufrufen halbiert die API-Last sofort, ohne dass der Nutzer eine Verzögerung spürt.

### 3.4 Multi-Key-Sharding (`MODEL_API_KEY` + `MODEL_API_KEY_2`)
Im Self-Service-Portal der FH Münster (`https://vra02.vmware.fh-muenster.de/`) hat jeder erzeugte API-Key:
- Ein eigenes **USD-Budget** (Standard-Kontingent z. B. \$60, erweiterbar über die Aktion *„Budget erweitern“* mit kurzer Begründung; Abfrage über *„Budgetabfrage“*).
- Eigene Key-/User-basierte Kontingente. Wenn ihr im Team zwei API-Keys nutzt und eure Services/Worker auf beide Keys aufteilt, **verdoppeln sich Budget und Key-basierte Rate-Limits sofort**.

### 3.5 Thinking vs. Non-Thinking gezielt steuern
- **Modelle ohne Thinking (`reasoning=False`, z. B. `mistral-small-4-119b`, `Qwen3.5-27B`)** neigen in langen Agenten-Loops manchmal dazu, statt eines Tool-Calls einen langen Markdown-Bericht zu schreiben (*Text-Loop*).
- **Modelle mit Thinking (`fhms/Qwen3.8-27B`, `oski/inferenz-gpt-oss-120b`, `azure/gpt-5.6-luna` mit `thinking: low/medium`, `azure/gpt-6.1-terra`)** erkennen eigene Schleifen im `<think>`-Block fast immer selbst und wählen zuverlässig das nächste Tool.
- **Tipp für `Luna` & `Terra`:** Nutze für Standard-Worker `thinking: "off"` oder `"low"` (spart Output-Tokens und Zeit) und für Planer/Orchestratoren `thinking: "medium"`.

---

## 4. Vollständiger Katalog aller 54 Modelle an der FH Münster

> Preise gelten jeweils **pro 1 Million Tokens** (Stand: `https://litellm-models.fh-muenster.de/`).

### 4.1 EU-Modelle — Kostenpflichtig (DSGVO-konform, sofort freigeschaltet)

| Modell-ID | Input-Preis / 1M | Output-Preis / 1M | Anbieter / Familie | Empfehlung / Hinweis |
|---|---:|---:|---|---|
| **`azure/gpt-5.6-luna`** | **\$0.20** | **\$1.20** | Azure OpenAI (EU) | **Top-Empfehlung (Allrounder & schnelle Worker/Leader)** |
| **`vertex/gemini-3.1-flash-lite`** | \$0.25 | \$1.50 | Google Vertex (EU) | Günstig für einfache Einzel-Prompts, schwach bei Multi-Tool-Calls |
| **`azure/gpt-6.1-terra`** | **\$1.00** | **\$5.00** | Azure OpenAI (EU) | **Top-Empfehlung für komplexe Planung, Strategie & Orchestrierung** |
| **`vertex/claude-haiku-4-5`** | \$1.00 | \$5.00 | Google Vertex (EU) | Schnelles Claude-Modell, bei Tool-Calling langsamer als `Terra` |
| **`azure/gpt-5`** | \$1.17 | \$9.35 | Azure OpenAI (EU) | Ältere Generation, durch `gpt-6.1-terra` überholt |
| **`vertex/gemini-3.5-flash`** | \$1.50 | \$9.00 | Google Vertex (EU) | Relativ teuer für ein Flash-Modell |
| **`azure/gpt-5.6-terra`** | \$2.00 | \$12.00 | Azure OpenAI (EU) | Durch das günstigere & neuere `azure/gpt-6.1-terra` (\$1/\$5) abgelöst |
| **`azure/gpt-6.1-sol`** | \$2.00 | \$10.00 | Azure OpenAI (EU) | Starkes Flaggschiff-Modell, doppelt so teuer wie `gpt-6.1-terra` |
| **`vertex/claude-sonnet-5`** | \$2.00 | \$10.00 | Google Vertex (EU) | Vorgänger von `claude-sonnet-5-5` zum selben Preis |
| **`vertex/claude-sonnet-5-5`** | **\$2.00** | **\$10.00** | Google Vertex (EU) | **Beste Wahl für Coding, komplexe Textanalyse & lange Kontexte** |
| **`azure/gpt-5.4`** | \$2.50 | \$15.00 | Azure OpenAI (EU) | Veraltet im Preis-Leistungs-Verhältnis |
| **`vertex/claude-sonnet-4-5`** | \$3.00 | \$15.00 | Google Vertex (EU) | Teurer als das neuere `claude-sonnet-5-5` (\$2/\$10) |
| **`vertex/claude-sonnet-4-6`** | \$3.00 | \$15.00 | Google Vertex (EU) | Teurer als das neuere `claude-sonnet-5-5` (\$2/\$10) |
| **`azure/gpt-5.6-sol`** | \$4.00 | \$20.00 | Azure OpenAI (EU) | Durch `azure/gpt-6.1-sol` (\$2/\$10) abgelöst |
| **`vertex/claude-opus-5-5`** | \$4.00 | \$20.00 | Google Vertex (EU) | Schwergewicht für schwierigste Einzelaufgaben |
| **`vertex/claude-opus-4-7`** | \$5.00 | \$25.00 | Google Vertex (EU) | Teurer als `claude-opus-5-5` |
| **`vertex/claude-opus-4-8`** | \$5.00 | \$25.00 | Google Vertex (EU) | Teurer als `claude-opus-5-5` |
| **`vertex/claude-opus-5`** | \$5.00 | \$25.00 | Google Vertex (EU) | Teurer als `claude-opus-5-5` |
| `default_router` | N/A | N/A | LiteLLM Router (EU) | Automatischer Proxy-Router |

### 4.2 Lokale FH-Münster-Modelle (`LOCAL` — \$0.00, kein Tageslimit!)

| Modell-ID | Kosten | Typ | Empfehlung / Hinweis |
|---|---:|---|---|
| **`fhms/Qwen3.8-27B`** | **\$0.00** | Chat + `<think>` (27B Dense) | **Platz 1 kostenloses Thinking-Modell** (0,53 s TTFT, extrem stark bei Logik) |
| **`fhms/Qwen3.5-27B`** | **\$0.00** | Chat ohne Thinking (27B Dense) | **Platz 1 kostenloses Speed-Modell lokal** (0,22 s – 0,46 s Latenz) |
| **`fhms/Qwen3-Coder-30B-A3B-Instruct`** | \$0.00 | Chat/Code MoE (3B aktiv) | Extrem schnell bei 1–2 Clients (0,25 s), bricht aber ab 8 Clients auf 18 s ein |
| **`fhms/gemma-4-31b-it`** | \$0.00 | Chat (31B Dense) | Bei Einzelnutzung gut (0,69 s), unter Parallellast Timeouts (>12 s) |
| **`fhms/qwen3-embedding-8b`** | \$0.00 | **Embedding** (`/v1/embeddings`) | Kostenloses lokales Embedding-Modell für RAG / Vektorsuche |
| **`fhms/cohere-transcribe`** | \$0.00 | **Audio/STT** (Transcription) | Lokale Spracherkennung (Speech-to-Text) |

### 4.3 EU-Cluster-Modelle von OSKI (`EU` — \$0.00, kein Tageslimit, max. 2–3 parallel!)

| Modell-ID | Kosten | Typ | Empfehlung / Hinweis |
|---|---:|---|---|
| **`oski/inferenz-mistral-small-4-119b`** | **\$0.00** | Chat (119B Dense) | **Bester kostenloser Allrounder ohne Thinking** (0,59 s – 0,84 s; max. 2–3 parallel) |
| **`oski/inferenz-gpt-oss-120b`** | **\$0.00** | Chat + Reasoning (120B) | **Großes kostenloses Reasoning-Modell** (0,95 s – 1,83 s; max. 2–3 parallel) |
| **`oski/inferenz-qwen3-embedding-8b`** | \$0.00 | **Embedding** (`/v1/embeddings`) | Kostenloses EU-Embedding-Modell |
| **`oski/inferenz-e5-mistral-7b-instruct`** | \$0.00 | **Embedding** (`/v1/embeddings`) | **Achtung:** Trotz `-instruct` im Namen nur für Embeddings, wirft bei Chat `400 BadRequest`! |

### 4.4 GWDG-Modelle (`EU` — \$0.00, **Achtung: 800 Requests/Tag Gesamtlimit!**)

Alle 14 `gwdg/*`-Modelle teilen sich das **800-Anfragen/24h-Kontingent** pro Account. Gut für einzelne manuelle Prompts, ungeeignet für Dauerbetrieb/Loops:
- `gwdg/deepseek-v4-flash` (\$0.00)
- `gwdg/deepseek-v4.1-flash-1017` (\$0.00)
- `gwdg/eurollm-22b-instruct-2512` (\$0.00)
- `gwdg/gemma-4-31b-it` (\$0.00)
- `gwdg/glm-5.3` (\$0.00)
- `gwdg/glm-5.3-flash` (\$0.00)
- `gwdg/meta-llama-3.1-8b-instruct` (\$0.00)
- `gwdg/mistral-large-4-1t-a52b` (\$0.00)
- `gwdg/qwen3-30b-a3b-instruct-2507` (\$0.00)
- `gwdg/qwen3-coder-next` (\$0.00)
- `gwdg/qwen3-omni-30b-a3b-instruct` (\$0.00)
- `gwdg/qwen3.5-397b-a17b` (\$0.00)
- `gwdg/qwen3.6-35b-a3b` (\$0.00)
- `gwdg/qwen3.8-27b` (\$0.00)

### 4.5 Sondermodelle (`ADVANCED AI` & `NOT-EU` — standardmäßig gesperrt, Freischaltung im Portal nötig)

> Im VMware Self-Service-Portal standardmäßig deaktiviert (und bei `NOT-EU` nicht DSGVO-konform).

| Modell-ID | Input / Output pro 1M | Region | Hinweis |
|---|---:|---|---|
| `advanced_ai/claude-fable-5` | \$10.00 / \$50.00 | `ADVANCED AI` | Extrem teuer (\$50/1M Output!), separate Freischaltung nötig |
| `NOT-EU-azure/gpt-5.1-codex` | \$1.25 / \$10.00 | `NOT-EU` | Spezialisiertes Coding-Modell (US-Hosting) |
| `NOT-EU-azure/gpt-5.2` | \$1.75 / \$14.00 | `NOT-EU` | Durch EU-Modelle (`gpt-5.6-luna` / `gpt-6.1-terra`) unnötig |
| `NOT-EU-vertex/gemini-3-pro-preview` | \$2.00 / \$12.00 | `NOT-EU` | US-Preview |
| `NOT-EU-vertex/gemini-3.1-pro-preview` | \$2.00 / \$12.00 | `NOT-EU` | US-Preview |
| `NOT-EU-azure/gpt-4o-transcribe` | \$2.50 / \$10.00 | `NOT-EU` | Audio-Transkription (`fhms/cohere-transcribe` ist lokal & kostenlos) |
| `NOT-EU-azure/gpt-4o-transcribe-diarize` | \$2.50 / \$10.00 | `NOT-EU` | Audio-Transkription mit Sprechererkennung |
| `NOT-EU-vertex/veo-3.1-fast-generate-001` | N/A | `NOT-EU` | Video-Generierung (Veo 3.1 Fast) |
| `NOT-EU-vertex/veo-3.1-fast-generate-preview` | N/A | `NOT-EU` | Video-Generierung (Veo 3.1 Fast Preview) |
| `NOT-EU-vertex/veo-3.1-generate-001` | N/A | `NOT-EU` | Video-Generierung (Veo 3.1 Standard) |
| `NOT-EU-vertex/veo-3.1-generate-preview` | N/A | `NOT-EU` | Video-Generierung (Veo 3.1 Preview) |

---

## 5. Konkrete Architektur-Empfehlung für dein nächstes LiteLLM-Projekt

1. **Wenn es 100 % kostenlos sein soll:**
   - Nutze **niemals `gwdg/*`** für automatisierte Pipelines oder Agenten (wegen des 800-Requests/Tag-Limits).
   - Kombiniere stattdessen einen **Pool aus `fhms/*` und `oski/*`**:
     - Für Aufgaben, die nachdenken müssen (Planung, Fehlerkorrektur, komplexe Entscheidungen): **`fhms/Qwen3.8-27B`** (bis zu 6 parallele Worker) oder **`oski/inferenz-gpt-oss-120b`** (max. 2 parallele Worker).
     - Für schnelle Standard-Aufgaben ohne Reasoning-Wartezeit: **`oski/inferenz-mistral-small-4-119b`** (max. 2–3 parallele Worker) und **`fhms/Qwen3.5-27B`**.
     - Für Embeddings/RAG: **`fhms/qwen3-embedding-8b`** oder **`oski/inferenz-qwen3-embedding-8b`**.
2. **Wenn ein kleines Budget vorhanden ist (z. B. \$60 Startguthaben im FH-Portal):**
   - Setze auf **`azure/gpt-5.6-luna` (\$0.20 / \$1.20)** als Standard-Arbeitspferd. Durch das 90-%-Prompt-Caching auf Azure bekommst du für wenige Cent pro Stunde 10× höheren Durchsatz und wesentlich zuverlässigeres Multi-Tool-Calling als mit jedem kostenlosen Modell.
   - Nutze **`azure/gpt-6.1-terra` (\$1.00 / \$5.00)** oder **`vertex/claude-sonnet-5-5` (\$2.00 / \$10.00)** gezielt nur für den obersten Orchestrator/Planer oder besonders anspruchsvolle Einzel-Schritte.
3. **Unverzichtbare Schutzmechanismen im Client-Code:**
   - **Sliding-Window-Kontextkürzung** (max. 16–20 Nachrichten behalten, System-Prompt konstant am Anfang lassen für 90 % Cache-Hit-Rate).
   - **Concurrency-Begrenzung** (max. 2 parallele Requests auf `oski/*`, max. 4–5 parallele Bots pro Key auf `azure/gpt-5.6-luna`).
   - **Exponential Backoff bei HTTP 429** + optionales **Fallback-Routing** (z. B. primär `azure/gpt-5.6-luna`, bei 429 automatischer Fallback auf `fhms/Qwen3.8-27B` oder `oski/inferenz-mistral-small-4-119b`).
