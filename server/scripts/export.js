// CLI export — writes the full anonymous dataset to stdout or a file.
//
//   npm run export                 # JSON to stdout
//   npm run export -- --format csv  # CSV to stdout
//   npm run export -- --out data.json
//   npm run export -- --format csv --out responses.csv

import { writeFileSync } from 'node:fs';
import { exportAll, toCsv } from '../src/exporter.js';
import { loadTemplate } from '../src/survey.js';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const format = flag('format', 'json');
const out = flag('out', null);

const data = exportAll();
const rendered = format === 'csv' ? toCsv(data, loadTemplate()) : JSON.stringify(data, null, 2);

if (out) {
  writeFileSync(out, rendered);
  console.error(`wrote ${data.sessionCount} sessions to ${out}`);
} else {
  process.stdout.write(rendered);
}
