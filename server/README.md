# endproject game server

A small, self-hosted backend for the game prototypes in this repo. It does two
things:

1. **Game progress** — at the start of a play session the server generates a
   secure random id, hands it to the browser, and stores it. Every later
   progress `POST` from that browser is deep-merged onto the same row, so a
   returning player's data links onto what was already there instead of being
   duplicated.
2. **End-of-game survey** — a survey defined by a single JSON template
   (`survey-template.json`). The frontend renders it, the server validates
   submissions against it, and each response is linked to its game session.

**Anonymous by design.** The only identifier stored is the random session id.
No IP address, no user agent, no cookies. IPs are touched only in memory for
rate-limiting and are never written to disk or logged.

Stack: Node.js (built-in `node:sqlite`) + Express. No native modules, no
external database — the whole dataset is one SQLite file under `data/`.

---

## Requirements

- Node.js **≥ 22.5** (uses the built-in `node:sqlite`). Tested on Node 25.
  Node 24+ is recommended so `node:sqlite` no longer prints an experimental
  warning.

## Run it

```bash
cd server
npm install
cp .env.example .env      # optional — every setting has a default
npm start                 # http://localhost:3000
```

`npm run dev` does the same with `--watch` (auto-restart on file changes).

### Configuration (`.env`)

| Variable             | Default            | Meaning |
|----------------------|--------------------|---------|
| `PORT`               | `3000`             | TCP port |
| `DB_PATH`            | `./data/game.db`   | SQLite file location |
| `ALLOWED_ORIGINS`    | `*`                | Comma-separated browser origins allowed to call the API. Set this to your GitHub Pages origin in production, e.g. `https://botwijns.github.io` |
| `EXPORT_TOKEN`       | *(empty)*          | If set, `GET /api/export` requires `Authorization: Bearer <token>`. If empty, the export endpoint is disabled. |
| `RATE_LIMIT_PER_MIN` | `120`              | Max write requests per IP per minute |
| `SURVEY_TEMPLATE_PATH` | `./survey-template.json` | Alternate template file |

---

## HTTP API

Base path: `/api`. All request and response bodies are JSON.

### `GET /api/health`
Liveness check → `{ "ok": true, "time": "..." }`.

### `POST /api/sessions`
Create a session. **The id is generated server-side** (192 bits of entropy,
32-char base64url) — clients cannot choose their own.

```jsonc
// request (body optional)
{ "metadata": { "lang": "nl", "viewport": "390x844", "touch": true } }
// response 201
{ "id": "xXHlIucG2PWfU5gQTdzKQM1rhXyy54hv", "createdAt": "2026-09-07T12:10:45.698Z" }
```

`metadata` must be a small (≤ 4 KB) plain object of non-identifying context.

### `GET /api/sessions/:id`
Read a session — used by the client to validate/resume a stored id.

```jsonc
// response 200
{
  "id": "...", "createdAt": "...", "updatedAt": "...",
  "metadata": { ... },
  "progress": { "prototype_5": { "completed": true, "bestScore": 9 } },
  "surveySubmitted": false
}
```
`404` if the id is unknown (client then starts a fresh session).

### `POST /api/sessions/:id/progress`
Attach progress to an existing session. `404` if the session id is unknown.

```jsonc
// request — both fields optional
{
  // deep-merged onto the stored progress object:
  //  - objects merge recursively
  //  - arrays / primitives replace
  //  - an explicit null deletes that key
  "merge": { "prototype_5": { "bestScore": 9 } },

  // appended to an immutable event log (max 50 per request):
  "events": [
    { "prototype": "prototype_5", "type": "complete", "payload": { "score": 9 } }
  ]
}
// response 200
{ "ok": true, "progress": { ...merged... }, "eventsRecorded": 1, "updatedAt": "..." }
```

### `GET /api/survey/template`
Returns `survey-template.json` as-is.

### `POST /api/sessions/:id/survey`
Submit the end-of-game survey, linked to the session. Validated against the
template server-side. Re-submitting replaces the previous answers (one response
per session). `404` for an unknown session, `422` with an `errors` array for
answers that don't match the template.

```jsonc
// request
{ "answers": { "age_range": "18–24", "enjoyment": 4, "would_recommend": true, ... } }
// response 201 (or 200 when replacing)
{ "ok": true, "replaced": false, "templateVersion": "2026-09-07" }
```

### `GET /api/export?format=json|csv`
Full anonymous dataset. Disabled unless `EXPORT_TOKEN` is set; then requires
`Authorization: Bearer <EXPORT_TOKEN>`. `csv` gives one row per session with a
column per survey question. See also the offline CLI:

```bash
npm run export -- --format csv --out responses.csv
npm run export -- --out full-dump.json
```

---

## Survey template format

`survey-template.json`:

```jsonc
{
  "version": "2026-09-07",         // bump when you change questions
  "title": "…", "intro": "…",
  "submitLabel": "Versturen", "thankYou": "…",
  "questions": [
    { "id": "age_range", "type": "single", "required": true,
      "options": ["Jonger dan 18", "18–24", "25–34"] },
    { "id": "played", "type": "multi", "required": true, "options": ["…"] },
    { "id": "enjoyment", "type": "scale", "required": true,
      "min": 1, "max": 5, "minLabel": "Niet leuk", "maxLabel": "Heel leuk" },
    { "id": "would_recommend", "type": "boolean", "required": true },
    { "id": "comments", "type": "text", "required": false,
      "maxLength": 2000, "placeholder": "…" }
  ]
}
```

`id` must be unique and alphanumeric/underscore. The server validates the
template at startup and refuses to boot on a malformed one. Changing questions
is a data-only edit — no code changes, no redeploy of the frontend.

---

## Frontend integration

See [`INTEGRATION.md`](./INTEGRATION.md) for copy-paste snippets.

- **GitHub Pages survey page** — `survey/` in the repo root (built by
  `vite.survey.config.ts`, deployed to `/endprojectSandbox/survey/`). It bundles
  `survey-template.json` at build time, so it renders the exact same questions
  the server validates against. This is the recommended place to send players
  when the game ends.
- `GET /client/game-telemetry.js` — `GameTelemetry.session()`, `.recordProgress()`, `.submitSurvey()`
- `GET /client/game-survey.js` + `/client/game-survey.css` — `GameSurvey.mount('#el', { template? })`
- `GET /survey` — the server's own copy of the survey page (fetches the template
  over HTTP); a fallback for the Pages page

The renderer (`public/client/game-survey.js`) and the template
(`survey-template.json`) each live in exactly one place; both the Pages page and
this server consume them.

---

## Data model

| table              | purpose |
|--------------------|---------|
| `game_sessions`    | one row per session: `id`, timestamps, small `metadata` JSON |
| `progress_state`   | current deep-merged progress snapshot per session |
| `progress_events`  | append-only event log per session |
| `survey_responses` | one survey response per session (`UNIQUE(session_id)`) |

Back up by copying `data/game.db` (stop the server first, or copy all three
`game.db*` files). To wipe all data, delete `data/game.db*` and restart.

## Deploying later

It's a plain Node HTTP server, so anything that runs Node works: a VPS behind
nginx, a systemd service, or a container. Point `DB_PATH` at persistent storage,
set `ALLOWED_ORIGINS` to your Pages origin, set a strong `EXPORT_TOKEN`, and put
it behind HTTPS.

Note: behind a reverse proxy every request arrives from the proxy's IP, so the
rate limiter effectively becomes global. Raise `RATE_LIMIT_PER_MIN` accordingly,
or terminate TLS on the Node process directly.
