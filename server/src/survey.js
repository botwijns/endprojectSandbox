import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlainObject } from './merge.js';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_PATH = process.env.SURVEY_TEMPLATE_PATH || join(serverRoot, 'survey-template.json');

const VALID_TYPES = new Set(['single', 'multi', 'scale', 'boolean', 'text']);

let cached = null;

// Loaded once at startup and validated so a broken template fails fast.
export function loadTemplate() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(TEMPLATE_PATH, 'utf8'));
  if (!raw || typeof raw.version !== 'string' || !Array.isArray(raw.questions)) {
    throw new Error('survey template must have a string "version" and a "questions" array');
  }
  const seen = new Set();
  for (const q of raw.questions) {
    if (!q || typeof q.id !== 'string' || !/^[a-z0-9_]+$/i.test(q.id)) {
      throw new Error(`survey question needs an alphanumeric "id": ${JSON.stringify(q)}`);
    }
    if (seen.has(q.id)) throw new Error(`duplicate survey question id: ${q.id}`);
    seen.add(q.id);
    if (!VALID_TYPES.has(q.type)) {
      throw new Error(`survey question "${q.id}" has unknown type "${q.type}"`);
    }
    if ((q.type === 'single' || q.type === 'multi')) {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        throw new Error(`survey question "${q.id}" needs a non-empty "options" array`);
      }
    }
    if (q.type === 'scale') {
      if (!Number.isInteger(q.min) || !Number.isInteger(q.max) || q.min >= q.max) {
        throw new Error(`survey question "${q.id}" needs integer "min" < "max"`);
      }
    }
  }
  cached = raw;
  return cached;
}

// Validate a submitted answers object against the template.
// Returns { ok, errors, clean } — `clean` holds only recognised, well-typed values.
export function validateAnswers(template, answers) {
  const errors = [];
  const clean = {};

  if (!isPlainObject(answers)) {
    return { ok: false, errors: ['"answers" must be an object'], clean };
  }

  const byId = new Map(template.questions.map((q) => [q.id, q]));
  for (const key of Object.keys(answers)) {
    if (!byId.has(key)) errors.push(`unknown question: "${key}"`);
  }

  for (const q of template.questions) {
    const raw = answers[q.id];
    const empty =
      raw === undefined ||
      raw === null ||
      raw === '' ||
      (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (q.required) errors.push(`missing required answer: "${q.id}"`);
      continue;
    }

    switch (q.type) {
      case 'single': {
        if (!q.options.includes(raw)) errors.push(`"${q.id}": "${raw}" is not an allowed option`);
        else clean[q.id] = raw;
        break;
      }
      case 'multi': {
        if (!Array.isArray(raw)) {
          errors.push(`"${q.id}": expected an array`);
          break;
        }
        const bad = raw.filter((x) => !q.options.includes(x));
        if (bad.length) errors.push(`"${q.id}": invalid options: ${bad.join(', ')}`);
        else clean[q.id] = [...new Set(raw)];
        break;
      }
      case 'scale': {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < q.min || n > q.max) {
          errors.push(`"${q.id}": must be an integer between ${q.min} and ${q.max}`);
        } else {
          clean[q.id] = n;
        }
        break;
      }
      case 'boolean': {
        if (typeof raw !== 'boolean') errors.push(`"${q.id}": must be true or false`);
        else clean[q.id] = raw;
        break;
      }
      case 'text': {
        const s = String(raw);
        const max = Number.isInteger(q.maxLength) ? q.maxLength : 2000;
        if (s.length > max) errors.push(`"${q.id}": too long (max ${max} characters)`);
        else clean[q.id] = s;
        break;
      }
      default:
        errors.push(`"${q.id}": unsupported question type`);
    }
  }

  return { ok: errors.length === 0, errors, clean };
}
