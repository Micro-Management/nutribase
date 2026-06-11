// Parse an approved submission issue and append it to the community database file.
// Self-routing: a submission with `is_supplement: 1` in its machine block goes to
// community-supplements.json with a `sup:N` id; everything else to community-foods.json
// with `com:N`. Run by .github/workflows/approve-food.yml; reads the issue body from
// ISSUE_BODY. Writes outputs (food_id / action / file / error) to GITHUB_OUTPUT.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const OPEN = '<!-- NAERING_DATA';
const CLOSE = 'NAERING_DATA -->';
const REQUIRED = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'];

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function fail(msg) { out('error', msg); console.error(msg); process.exit(1); }

const body = process.env.ISSUE_BODY ?? '';
// SECURITY: parse the LAST machine block (the real one is written after all user free-text),
// and refuse outright if more than one block is present — that only happens when someone tried
// to smuggle a forged `<!-- NAERING_DATA … -->` block ahead of the genuine one. The Worker now
// also strips the delimiter from free-text, so a clean submission always has exactly one.
const blockCount = (body.match(/<!-- NAERING_DATA/g) || []).length;
if (blockCount > 1) fail('Flere NAERING_DATA-blokker funnet – mulig manipulert innsending, håndteres manuelt.');
const i = body.lastIndexOf(OPEN);
const j = body.indexOf(CLOSE, i + 1);
if (i < 0 || j < 0) fail('Fant ikke NAERING_DATA-blokken i issue-teksten.');

let data;
try { data = JSON.parse(body.slice(i + OPEN.length, j).trim()); }
catch (e) { fail('Ugyldig JSON i NAERING_DATA: ' + e.message); }

if (!data.name || typeof data.name !== 'string') fail('Mangler gyldig navn.');

// Supplements declare per-dose values (macros rarely apply); foods require the four macros.
const isSupplement = data.is_supplement === 1 || data.is_supplement === true;
if (isSupplement) {
  if (!data.values || !Object.values(data.values).some(v => typeof v === 'number')) {
    fail('Tilskuddet mangler næringsverdier.');
  }
} else {
  for (const r of REQUIRED) {
    if (typeof data.values?.[r] !== 'number') fail(`Mangler makro: ${r}.`);
  }
}

const FILE = isSupplement ? 'community-supplements.json' : 'community-foods.json';
const ID_PREFIX = isSupplement ? 'sup:' : 'com:';

let db = { version: 1, updated_at: 0, foods: [] };
if (existsSync(FILE)) {
  const raw = readFileSync(FILE, 'utf8').trim();
  if (raw) {                                   // empty/whitespace file → keep the fresh default
    try { db = JSON.parse(raw); }
    catch (e) { fail(`${FILE} er ugyldig JSON: ` + e.message); }
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
  ingredients: data.ingredients ?? null,
  origin_country: data.origin_country ?? null,
  organic: data.organic ?? null,
  composition_note: typeof data.composition_note === 'string' ? data.composition_note : null,
  is_supplement: isSupplement ? 1 : null,
  nutrient_forms: data.nutrient_forms && typeof data.nutrient_forms === 'object' && !Array.isArray(data.nutrient_forms)
    ? Object.fromEntries(Object.entries(data.nutrient_forms).filter(([, v]) => typeof v === 'string' && v.trim()))
    : null,
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
    const n = parseInt(String(f.id ?? '').replace(new RegExp(`^${ID_PREFIX}`), ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  record.id = `${ID_PREFIX}${maxN + 1}`;
  db.foods.push(record);
}
db.updated_at = now;

writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');
out('food_id', record.id);
out('action', existingIdx >= 0 ? 'oppdatert' : 'lagt til');
out('file', FILE);
console.log(`${existingIdx >= 0 ? 'Updated' : 'Added'} ${record.id}: ${record.name} (${FILE})`);
