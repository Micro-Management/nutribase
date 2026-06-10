// Parse an approved CORRECTION issue (label "correction") and apply its field changes to an
// existing community food in community-foods.json. Run by .github/workflows/approve-food.yml.
// Unlike append-food.mjs (new foods), a correction has no full macro set — it carries a
// `changes` diff [{ key, label, from, to }] against an existing food (`food_id`).
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const FILE = 'community-foods.json';
const OPEN = '<!-- NAERING_DATA';
const CLOSE = 'NAERING_DATA -->';

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function fail(msg) { out('error', msg); console.error(msg); process.exit(1); }

// Top-level fields on a community record; anything else is a nutrient in record.values.
const TOP_LEVEL = new Set(['name', 'brand', 'ean', 'serving_size_g', 'serving_label', 'allergens', 'ingredients', 'origin_country', 'organic']);
// Fallback for legacy issues whose changes carry only a human label, no machine key.
const LABEL_TO_KEY = {
  'Navn': 'name', 'Merke': 'brand', 'Porsjonsstørrelse (g)': 'serving_size_g', 'Porsjonsnavn': 'serving_label',
  'Allergener': 'allergens', 'Ingredienser': 'ingredients', 'Opprinnelsesland': 'origin_country', 'Økologisk': 'organic',
  'Energi (kcal)': 'energy_kcal', 'Protein': 'protein_g', 'Karbohydrat': 'carbs_g', 'Fett': 'fat_g',
  'Mettet fett': 'saturated_fat_g', 'Kostfiber': 'fiber_g',
};

const EMPTY = '(tomt)';
function toNum(s) { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; }

const body = process.env.ISSUE_BODY ?? '';
// SECURITY: parse the LAST machine block and refuse if more than one is present (a forged
// block smuggled via free-text). See append-food.mjs / the Worker's clampStr for the full note.
const blockCount = (body.match(/<!-- NAERING_DATA/g) || []).length;
if (blockCount > 1) fail('Flere NAERING_DATA-blokker funnet – mulig manipulert innsending, håndteres manuelt.');
const i = body.lastIndexOf(OPEN);
const j = body.indexOf(CLOSE, i + 1);
if (i < 0 || j < 0) fail('Fant ikke NAERING_DATA-blokken i issue-teksten.');

let data;
try { data = JSON.parse(body.slice(i + OPEN.length, j).trim()); }
catch (e) { fail('Ugyldig JSON i NAERING_DATA: ' + e.message); }

const foodId = String(data.food_id ?? '').trim();
if (!foodId) fail('Rettelsen mangler food_id, kan ikke vite hvilken matvare den gjelder.');
if (!foodId.startsWith('com:')) {
  fail(`Rettelsen gjelder «${foodId}», som ikke er en fellesskapsmatvare (com:N) — må håndteres manuelt.`);
}
const changes = Array.isArray(data.changes) ? data.changes : [];
if (!changes.length) fail('Rettelsen har ingen feltendringer å bruke (kun beskrivelse) — håndteres manuelt.');

if (!existsSync(FILE)) fail('community-foods.json finnes ikke.');
let db;
try { db = JSON.parse(readFileSync(FILE, 'utf8')); }
catch (e) { fail('community-foods.json er ugyldig JSON: ' + e.message); }
if (!db || !Array.isArray(db.foods)) fail('community-foods.json mangler foods-listen.');

const food = db.foods.find(f => String(f.id) === foodId);
if (!food) fail(`Fant ikke matvaren ${foodId} i community-foods.json.`);
if (!food.values || typeof food.values !== 'object') food.values = {};

const applied = [];
const skipped = [];
for (const ch of changes) {
  const key = (ch.key && String(ch.key)) || LABEL_TO_KEY[ch.label];
  if (!key) { skipped.push(ch.label ?? '?'); continue; }
  const to = ch.to;
  if (TOP_LEVEL.has(key)) {
    if (key === 'organic') {
      food.organic = to === 'Ja' ? 1 : to === 'Nei' ? 0 : null;
    } else if (key === 'serving_size_g') {
      food.serving_size_g = to === EMPTY ? null : toNum(to);
    } else {
      food[key] = to === EMPTY ? null : String(to);   // name/brand/ean/serving_label/allergens/ingredients/origin_country
    }
  } else {
    // Nutrient value lives in record.values.
    if (to === EMPTY) { food.values[key] = null; }
    else { const n = toNum(to); if (n === null) { skipped.push(ch.label ?? key); continue; } food.values[key] = n; }
  }
  applied.push(ch.label ?? key);
}

if (!applied.length) {
  fail('Ingen anvendbare endringer' + (skipped.length ? ` (uklare felt: ${skipped.join(', ')})` : '') + '.');
}

const now = Math.floor(Date.now() / 1000);
food.verified_at = now;
db.updated_at = now;
writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n');

out('food_id', food.id);
out('action', 'rettet (' + applied.join(', ') + ')');
console.log(`Corrected ${food.id}: applied ${applied.join(', ')}${skipped.length ? `; skipped ${skipped.join(', ')}` : ''}`);
