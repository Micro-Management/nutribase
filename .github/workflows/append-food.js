// Parse an approved submission issue and append it to community-foods.json.
// Run by .github/workflows/approve-food.yml; reads the issue body from ISSUE_BODY.
// Writes outputs (food_id / action / error) to GITHUB_OUTPUT for the workflow.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const FILE = 'community-foods.json';
const OPEN = '<!-- NAERING_DATA';
const CLOSE = 'NAERING_DATA -->';
const REQUIRED = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'];

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function fail(msg) { out('error', msg); console.error(msg); process.exit(1); }

const body = process.env.ISSUE_BODY ?? '';
const i = body.indexOf(OPEN);
const j = body.indexOf(CLOSE, i + 1);
if (i < 0 || j < 0) fail('Fant ikke NAERING_DATA-blokken i issue-teksten.');

let data;
try { data = JSON.parse(body.slice(i + OPEN.length, j).trim()); }
catch (e) { fail('Ugyldig JSON i NAERING_DATA: ' + e.message); }

if (!data.name || typeof data.name !== 'string') fail('Mangler gyldig navn.');
for (const r of REQUIRED) {
  if (typeof data.values?.[r] !== 'number') fail(`Mangler makro: ${r}.`);
}

let db = { version: 1, updated_at: 0, foods: [] };
if (existsSync(FILE)) {
  const raw = readFileSync(FILE, 'utf8').trim();
  if (raw) {                                   // empty/whitespace file → keep the fresh default
    try { db = JSON.parse(raw); }
    catch (e) { fail('community-foods.json er ugyldig JSON: ' + e.message); }
  }
}
if (typeof db !== 'object' || db === null) db = { version: 1, updated_at: 0, foods: [] };
if (!Array.isArray(db.foods)) db.foods = [];
if (typeof db.version !== 'number') db.version = 1;

const now = Math.floor(Date.now() / 1000);
const ean = String(data.ean ?? '').replace(/\D+/g, '') || null;

const record = {
  id: '',
  name: data.name.trim(),
  brand: data.brand ?? null,
  ean,
  values: data.values,
  serving_size_g: data.serving_size_g ?? null,
  serving_label: data.serving_label ?? null,
  allergens: data.allergens ?? null,
  contributor: data.contributor ?? null,
  sources: Array.isArray(data.sources) ? data.sources : [],
  verified_at: now,
};

// Dedupe by barcode: replace an existing entry (keeping its id) instead of duplicating.
const existingIdx = ean ? db.foods.findIndex(f => String(f.ean ?? '') === ean) : -1;
if (existingIdx >= 0) {
  record.id = db.foods[existingIdx].id;
  db.foods[existingIdx] = record;
} else {
  const maxN = db.foods.reduce((m, f) => {
    const n = parseInt(String(f.id ?? '').replace(/^com:/, ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  record.id = `com:${maxN + 1}`;
  db.foods.push(record);
}
db.updated_at = now;

writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');
out('food_id', record.id);
out('action', existingIdx >= 0 ? 'oppdatert' : 'lagt til');
console.log(`${existingIdx >= 0 ? 'Updated' : 'Added'} ${record.id}: ${record.name}`);
