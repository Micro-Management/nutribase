# Editorial content (news, recommendations, updates)

These files power the **"Nytt og anbefalinger"** page in the app. They are plain JSON served
straight from GitHub — no backend. The app reads them from `EXPO_PUBLIC_CONTENT_BASE`, which
is set in `app/.env` to:

```
https://raw.githubusercontent.com/Micro-Management/nutribase/main/content
```

## Where to put them

Copy this whole `content/` folder to the **root of the `Micro-Management/nutribase` repo** and
commit to `main`:

```
nutribase/
  community-foods.json
  content/
    recommendations.json
    updates.json
    news/
      index.json
      <slug>.json        ← one file per article
```

`raw.githubusercontent.com` caches for ~5 minutes, so changes appear shortly after you push.
Every file is optional: if one is missing the app just hides that section. If none exist, the
page shows a friendly "Ingenting her ennå" and the feature can be toggled off in Profil.

## Formats

### `recommendations.json` — one maintained list
```json
{
  "items": [
    { "title": "…", "description": "…", "url": "https://…", "tag": "Anbefalt" }
  ]
}
```
`description`, `url`, `tag` are optional. A card with a `url` becomes tappable ("Les mer").

### `updates.json` — simple changelog
```json
{
  "items": [
    { "version": "1.4", "date": "2026-06-08", "title": "…", "notes": ["…", "…"] }
  ]
}
```
All fields optional except it should have either a `title` or `version`.

### `news/index.json` — article headlines (the app loads only this + the newest article)
```json
{
  "articles": [
    { "slug": "min-artikkel", "title": "…", "date": "2026-06-08", "summary": "…" }
  ]
}
```
`slug` must match the article filename (`news/min-artikkel.json`). The app sorts by `date`
(newest first) and shows the newest article inline; older ones load on demand when tapped.

### `news/<slug>.json` — a single article
```json
{
  "slug": "min-artikkel",
  "title": "…",
  "date": "2026-06-08",
  "author": "Henrik",
  "body": "Avsnitt 1.\n\nAvsnitt 2."
}
```
`body` is plain text; a blank line (`\n\n`) starts a new paragraph.
