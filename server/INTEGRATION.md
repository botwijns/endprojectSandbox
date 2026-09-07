# Wiring a prototype to the game server

The prototypes are static pages (Vite → GitHub Pages). The server is separate.
You connect them with two `<script>` tags — no build changes.

Assume the server runs at `http://localhost:3000` during development and, say,
`https://games-api.example.org` in production.

---

## 1. Load the client on a game page

Add to the prototype's `index.html` `<head>` (or just before `</body>`):

```html
<!-- point at your server; omit during local dev if the game is also on :3000 -->
<meta name="game-api-base" content="http://localhost:3000">
<script src="http://localhost:3000/client/game-telemetry.js"></script>
```

`game-telemetry.js` resolves the API base from, in order: `GameTelemetry.setApiBase(...)`,
the `<meta>` tag, then the origin the script itself was loaded from.

## 2. Start a session when the game starts

```js
// Safe to call as often as you like — it creates the session once, caches the
// id in localStorage, and resumes it on the next visit.
await GameTelemetry.session();
```

## 3. Record progress

```js
// merge: deep-merged onto the stored progress object for this session
// events: appended to an immutable log
GameTelemetry.recordProgress({
  prototype: 'prototype_5',                 // convenience: stamped on each event
  merge: { prototype_5: { completed: true, bestScore: 9, drumsMissed: 2 } },
  events: [
    { type: 'start' },
    { type: 'catch', payload: { instrument: 'guitar' } },
    { type: 'complete', payload: { score: 9 } },
  ],
});
```

`recordProgress` returns a promise; a rejected promise just means the beacon
didn't land (offline, server down). Games should treat telemetry as best-effort
and never block gameplay on it:

```js
GameTelemetry.recordProgress({ ... }).catch(() => {});
```

### Example: `src/main.ts` (prototype 5), minimal touch

```ts
// after the existing imports — telemetry is a global from the <script> tag
declare const GameTelemetry: any;

// in startGame():
GameTelemetry?.recordProgress({
  prototype: 'prototype_5',
  events: [{ type: 'start' }],
}).catch(() => {});

// in the win / lose handler:
GameTelemetry?.recordProgress({
  prototype: 'prototype_5',
  merge: { prototype_5: { completed: outcome === 'win', bestScore: state.score } },
  events: [{ type: outcome === 'win' ? 'complete' : 'fail', payload: { score: state.score } }],
}).catch(() => {});
```

---

## 4. Show the survey at the end of the game

### Option A — redirect to the hosted page (simplest)

When the whole session is over, send the player to the server's own survey page.
Because they carry the same `localStorage` session id, the response links to
their game data automatically.

```js
location.href = 'http://localhost:3000/survey?next=' +
  encodeURIComponent('https://botwijns.github.io/endprojectSandbox/');
```

`?next=` is optional (where to send the player after "Bedankt"). `?api=` lets you
override the API base if you host `survey.html` somewhere else.

### Option B — embed the survey in your own page

```html
<link rel="stylesheet" href="http://localhost:3000/client/game-survey.css">
<script src="http://localhost:3000/client/game-telemetry.js"></script>
<script src="http://localhost:3000/client/game-survey.js"></script>

<div id="survey"></div>
<script>
  GameSurvey.mount('#survey', {
    onComplete(result, answers) {
      // e.g. show a "thanks" screen, unlock a link, etc.
    },
  });
</script>
```

`GameSurvey.mount`:
- fetches `/api/survey/template`
- renders the questions (radio / checkbox / 1–n scale / yes-no / textarea)
- checks required fields client-side, then `POST`s to
  `/api/sessions/:id/survey` via the current `GameTelemetry` session
- on success replaces the form with the template's `thankYou` text and calls
  `onComplete`

To change the questions, edit `server/survey-template.json` and bump its
`version`. Nothing else needs to change.

---

## CORS / production checklist

- Set `ALLOWED_ORIGINS` on the server to your Pages origin
  (`https://botwijns.github.io`) instead of `*`.
- Serve the API over HTTPS (mixed-content: an `https://` game page cannot call an
  `http://` API).
- Set a strong `EXPORT_TOKEN` and keep it out of the frontend.
- Update the `<meta name="game-api-base">` in each prototype to the production URL.
