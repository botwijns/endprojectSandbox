import { db } from './db.js';

// Full anonymous dump: every session with its merged progress, event log and
// survey answers. There is no PII to redact — only the random id is stored.
export function exportAll() {
  const sessions = db
    .prepare('SELECT id, created_at, updated_at, metadata FROM game_sessions ORDER BY created_at')
    .all();

  const stateBySession = new Map(
    db.prepare('SELECT session_id, state, updated_at FROM progress_state').all().map((r) => [r.session_id, r]),
  );
  const surveyBySession = new Map(
    db
      .prepare('SELECT session_id, template_version, answers, created_at, updated_at FROM survey_responses')
      .all()
      .map((r) => [r.session_id, r]),
  );
  const eventsBySession = new Map();
  for (const ev of db
    .prepare('SELECT session_id, prototype, type, payload, created_at FROM progress_events ORDER BY id')
    .all()) {
    if (!eventsBySession.has(ev.session_id)) eventsBySession.set(ev.session_id, []);
    eventsBySession.get(ev.session_id).push({
      prototype: ev.prototype,
      type: ev.type,
      payload: JSON.parse(ev.payload),
      at: ev.created_at,
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    sessions: sessions.map((s) => {
      const state = stateBySession.get(s.id);
      const survey = surveyBySession.get(s.id);
      return {
        id: s.id,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        metadata: JSON.parse(s.metadata),
        progress: state ? JSON.parse(state.state) : {},
        events: eventsBySession.get(s.id) ?? [],
        survey: survey
          ? {
              templateVersion: survey.template_version,
              answers: JSON.parse(survey.answers),
              submittedAt: survey.created_at,
              updatedAt: survey.updated_at,
            }
          : null,
      };
    }),
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// One row per session; one column per survey question id (unanswered -> blank).
export function toCsv(data, template) {
  const questionIds = template.questions.map((q) => q.id);
  const header = ['session_id', 'session_created_at', 'survey_submitted_at', 'template_version', ...questionIds];
  const lines = [header.join(',')];

  for (const s of data.sessions) {
    const answers = s.survey?.answers ?? {};
    const row = [
      s.id,
      s.createdAt,
      s.survey?.submittedAt ?? '',
      s.survey?.templateVersion ?? '',
      ...questionIds.map((id) => answers[id]),
    ];
    lines.push(row.map(csvCell).join(','));
  }

  return lines.join('\n') + '\n';
}
