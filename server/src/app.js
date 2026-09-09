import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';

import { db, nowIso } from './db.js';
import { generateSessionId, isValidSessionId } from './ids.js';
import { deepMerge, isPlainObject } from './merge.js';
import { loadTemplate, validateAnswers } from './survey.js';
import { createRateLimiter } from './rateLimit.js';

const MAX_METADATA_BYTES = 4_000;
const MAX_EVENTS_PER_REQUEST = 50;
const MAX_MERGE_BYTES = 16_000;

// ── Prepared statements ──────────────────────────────────────────────────────
const q = {
  getSession: db.prepare('SELECT id, created_at, updated_at, metadata FROM game_sessions WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO game_sessions (id, created_at, updated_at, metadata) VALUES (?, ?, ?, ?)'),
  touchSession: db.prepare('UPDATE game_sessions SET updated_at = ? WHERE id = ?'),
  getState: db.prepare('SELECT state FROM progress_state WHERE session_id = ?'),
  upsertState: db.prepare(`
    INSERT INTO progress_state (session_id, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `),
  insertEvent: db.prepare(
    'INSERT INTO progress_events (session_id, prototype, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
  ),
  getSurvey: db.prepare('SELECT id, template_version, answers, created_at, updated_at FROM survey_responses WHERE session_id = ?'),
  upsertSurvey: db.prepare(`
    INSERT INTO survey_responses (session_id, template_version, answers, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      template_version = excluded.template_version,
      answers = excluded.answers,
      updated_at = excluded.updated_at
  `),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function loadSession(req, res, next) {
  const { id } = req.params;
  if (!isValidSessionId(id)) {
    return res.status(400).json({ error: 'bad_session_id', message: 'Malformed session id.' });
  }
  const row = q.getSession.get(id);
  if (!row) {
    return res.status(404).json({ error: 'unknown_session', message: 'Start a session first (POST /api/sessions).' });
  }
  req.session = row;
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ── App factory ──────────────────────────────────────────────────────────────
export function createApp() {
  const template = loadTemplate();

  const app = express();
  app.disable('x-powered-by');
  // We deliberately do NOT trust proxy headers: req.ip stays the direct socket
  // address, used only in-memory for rate limiting.
  app.set('trust proxy', false);

  const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin: allowed.includes('*') ? true : allowed,
      methods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.use(express.json({ limit: '64kb' }));

  // Minimal request log: method, path, status, duration. No IP, no query string.
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - started}ms)`);
    });
    next();
  });

  const writeLimiter = createRateLimiter(Number(process.env.RATE_LIMIT_PER_MIN));

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: nowIso() });
  });

  // ── Survey template ───────────────────────────────────────────────────────
  app.get('/api/survey/template', (_req, res) => {
    res.json(template);
  });

  // ── Create a session (server-generated id) ────────────────────────────────
  app.post('/api/sessions', (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    let metadata = body.metadata ?? {};
    if (!isPlainObject(metadata)) {
      return res.status(400).json({ error: 'bad_metadata', message: '"metadata" must be an object.' });
    }
    if (byteLength(metadata) > MAX_METADATA_BYTES) {
      return res.status(413).json({ error: 'metadata_too_large', message: `metadata exceeds ${MAX_METADATA_BYTES} bytes.` });
    }

    const id = generateSessionId();
    const ts = nowIso();
    q.insertSession.run(id, ts, ts, JSON.stringify(metadata));

    res.status(201).json({ id, createdAt: ts });
  });

  // ── Read a session (used to resume / validate a stored id) ─────────────────
  app.get('/api/sessions/:id', loadSession, (req, res) => {
    const stateRow = q.getState.get(req.session.id);
    const survey = q.getSurvey.get(req.session.id);
    res.json({
      id: req.session.id,
      createdAt: req.session.created_at,
      updatedAt: req.session.updated_at,
      metadata: JSON.parse(req.session.metadata),
      progress: stateRow ? JSON.parse(stateRow.state) : {},
      surveySubmitted: Boolean(survey),
    });
  });

  // ── Record progress — links onto whatever is already stored ────────────────
  app.post('/api/sessions/:id/progress', writeLimiter, loadSession, (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const merge = body.merge;
    const events = body.events;

    if (merge !== undefined && !isPlainObject(merge)) {
      return res.status(400).json({ error: 'bad_merge', message: '"merge" must be an object.' });
    }
    if (merge !== undefined && byteLength(merge) > MAX_MERGE_BYTES) {
      return res.status(413).json({ error: 'merge_too_large', message: `"merge" exceeds ${MAX_MERGE_BYTES} bytes.` });
    }
    if (events !== undefined) {
      if (!Array.isArray(events)) {
        return res.status(400).json({ error: 'bad_events', message: '"events" must be an array.' });
      }
      if (events.length > MAX_EVENTS_PER_REQUEST) {
        return res.status(400).json({ error: 'too_many_events', message: `max ${MAX_EVENTS_PER_REQUEST} events per request.` });
      }
      for (const ev of events) {
        if (!isPlainObject(ev) || typeof ev.type !== 'string' || !ev.type) {
          return res.status(400).json({ error: 'bad_event', message: 'each event needs a non-empty string "type".' });
        }
        if (ev.prototype !== undefined && typeof ev.prototype !== 'string') {
          return res.status(400).json({ error: 'bad_event', message: 'event "prototype" must be a string.' });
        }
        if (ev.payload !== undefined && !isPlainObject(ev.payload)) {
          return res.status(400).json({ error: 'bad_event', message: 'event "payload" must be an object.' });
        }
      }
    }

    const ts = nowIso();
    let nextState;
    db.exec('BEGIN');
    try {
      const current = q.getState.get(req.session.id);
      const currentState = current ? JSON.parse(current.state) : {};
      nextState = merge !== undefined ? deepMerge(currentState, merge) : currentState;

      if (merge !== undefined) {
        q.upsertState.run(req.session.id, JSON.stringify(nextState), ts);
      }
      for (const ev of events ?? []) {
        q.insertEvent.run(
          req.session.id,
          ev.prototype ?? null,
          ev.type,
          JSON.stringify(ev.payload ?? {}),
          ts,
        );
      }
      q.touchSession.run(ts, req.session.id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    res.json({
      ok: true,
      progress: nextState,
      eventsRecorded: events?.length ?? 0,
      updatedAt: ts,
    });
  });

  // ── Submit the end-of-game survey — linked to the session ──────────────────
  app.post('/api/sessions/:id/survey', writeLimiter, loadSession, (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const { ok, errors, clean } = validateAnswers(template, body.answers);
    if (!ok) {
      return res.status(422).json({ error: 'invalid_answers', errors });
    }

    const existing = q.getSurvey.get(req.session.id);
    const ts = nowIso();
    q.upsertSurvey.run(
      req.session.id,
      template.version,
      JSON.stringify(clean),
      existing ? existing.created_at : ts,
      ts,
    );
    q.touchSession.run(ts, req.session.id);

    res.status(existing ? 200 : 201).json({
      ok: true,
      replaced: Boolean(existing),
      templateVersion: template.version,
    });
  });

  // ── Data export (opt-in, token-protected) ─────────────────────────────────
  app.get('/api/export', asyncHandler(async (req, res) => {
    const token = process.env.EXPORT_TOKEN;
    if (!token) {
      return res.status(404).json({ error: 'export_disabled', message: 'Set EXPORT_TOKEN to enable this endpoint.' });
    }
    if (req.get('authorization') !== `Bearer ${token}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { exportAll, toCsv } = await import('./exporter.js');
    const data = exportAll();
    if ((req.query.format || 'json') === 'csv') {
      res.type('text/csv').send(toCsv(data, template));
    } else {
      res.json(data);
    }
  }));

  // ── Static: client library + hosted example survey page ───────────────────
  // Served with the same permissive CORS as the API so a prototype on another
  // origin (e.g. GitHub Pages) can <script src>-include the client library.
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  app.use(express.static(publicDir, { extensions: ['html'] }));
  app.get('/', (_req, res) => res.sendFile(join(publicDir, 'survey.html')));

  // ── Fallbacks ─────────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'bad_json', message: 'Request body is not valid JSON.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    console.error('unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
