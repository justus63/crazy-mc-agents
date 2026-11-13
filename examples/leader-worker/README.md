# Leader / worker team on the FH Münster LiteLLM

One strong model plans (leader), cheap models act (workers). Everything goes through the university LiteLLM proxy
(models listed at https://litellm-models.fh-muenster.de/), so `team.json` only sets `baseUrl`, `model` and `thinking` per agent.

| Role                      | Model (`litellm/<id>`)         | Price in/out per 1M | Why                                                     |
| ------------------------- | ------------------------------ | ------------------- | ------------------------------------------------------- |
| Workers                   | `azure/gpt-5.6-luna`           | $0.20 / $1.20       | cheapest paid model, OpenAI-native (Responses API)      |
| Leader                    | `azure/gpt-6.1-sol`            | $2.00 / $10.00      | strong, OpenAI-native; Claude via LiteLLM is a fallback |
| Leader alternative        | `vertex/claude-sonnet-5-5`     | $2.00 / $10.00      | good planner, but bridged to Responses API by LiteLLM   |
| Worker alternative        | `vertex/gemini-3.1-flash-lite` | $0.25 / $1.50       | similar price, other provider                           |
| Free fallback for workers | `fhms/Qwen3.8-27B`             | local, free         | hosted at FH Münster; check capacity before using       |

Avoid for the agent loop: `gwdg/*` (free, but see below), `advanced_ai/claude-fable-5` ($10/$50) and Opus models.

## Run

```sh
export MODEL_API_KEY=<your LiteLLM key>   # never commit it
npm run server                            # local Minecraft server (needs Java)
npx minecraft-agent team examples/leader-worker/team.json
```

Check the base URL first (the models page names https://litellm.fh-muenster.de as its data source):
`curl $BASE/v1/models -H "Authorization: Bearer $MODEL_API_KEY"` and
`curl $BASE/v1/responses -H "Authorization: Bearer $MODEL_API_KEY" -H "Content-Type: application/json" -d '{"model":"azure/gpt-5.6-luna","input":"hi"}'`.

## Budget and access (from the FH Münster self-service portal, project `LiteLLM`)

- The key is requested via the catalog item `LiteLLM` and has a **budget in USD**. Day-2 actions on the deployment:
  `Budgetabfrage` (check remaining budget), `Budget erweitern` (amount + justification, needs admin approval),
  access requests for `advanced_ai/*` and `NOT-EU-*` models (off by default, with a GDPR acknowledgement).
- Base endpoint: `https://litellm.fh-muenster.de/`.
- Rate limits and per-model limits are not shown in the portal or on the models page.

## About the DeepSeek aborts

Two plausible causes, neither confirmed:

1. **Budget used up**: paid models (Azure, Vertex) stop with an error once the key budget is spent. Check with `Budgetabfrage`.
   This cannot explain it for `gwdg/deepseek-*`, which are listed at \$0.
2. **Request rate limits** on the free GWDG-hosted models (`gwdg/*`). A web search suggested roughly 10 requests/min for basic
   GWDG accounts; this is not confirmed for this proxy. A Minecraft agent calls the model every few seconds.

Look for HTTP 429 (rate limit) or budget errors in the logs to tell them apart. Per-agent retry/backoff is not built in yet.
