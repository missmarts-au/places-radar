# Places Radar — Claude Instructions

This repo is Martha's personal travel app: a PWA showing her saved places on a
map with walking-distance alerts. Live at https://missmarts-au.github.io/places-radar/
(GitHub Pages, `main` branch, root). The app reloads `places.json` every time
it opens — **pushing to `main` IS the deployment.**

## Your most common job: add places to `places.json`

Martha will paste screenshots (IG/TikTok posts, listicles), Google Maps links
(short links included — resolve them), or plain names. For each place:

1. Identify the real-world place (city context: `cdmx` or `nyc` — ask only if truly ambiguous)
2. Find its coordinates (verified knowledge or Nominatim; if geocoding is uncertain, still add it with your best coords and say so)
3. Append an entry to `places.json` following this schema exactly:

```json
{
  "id": "cdmx-el-vilsito",
  "name": "El Vilsito",
  "list": "cdmx",
  "tag": "eat",
  "lat": 19.3861,
  "lng": -99.1723,
  "note": "Al pastor institution — from IG reel @tacoscdmx",
  "source": "ig-screenshot",
  "gmaps": "https://www.google.com/maps/search/?api=1&query=El+Vilsito+Mexico+City",
  "hours": { "mon": [["19:30", "02:00"]] },
  "tz": "America/Mexico_City",
  "visited": false
}
```

## Rules

- `id` = `<list>-<kebab-name>`, unique across the file
- `tag` ∈ `eat` | `sweet` | `drink` | `see` | `walk` | `key` — eat 🍽 = meals, sweet 🍰 = desserts/coffee/bakeries, drink 🍸 = bars/rooftops/happy hours, see 👀 = sights, walk 🚶 = parks/strolls, key ⭐ = orientation landmarks / home bases. Cuisine type and price ($/$$/$$$) go in `note`.
- Optional `"links": {"ig": "https://instagram.com/...", "tiktok": "https://tiktok.com/@..."}` — rendered as IG ↗ / TikTok ↗ on the card. Only add links Martha/Vicky provide or that you have verified; never guess handles.
- **Privacy rule for `key` entries:** this repo is PUBLIC. Personal bases (Airbnbs, friends'/family homes) get NEUTRAL names ("Base Fairview"), generic notes ("Punto clave"), and NEVER a street address in name/note. Public hotels may use their real name.
- `note` = why it was saved + where it came from — this shows on the card, make it useful
- `hours`: per-weekday `[["HH:MM","HH:MM"], ...]` 24 h local; close < open means past midnight; use `null` when unknown (never guess hours)
- `tz`: `America/Mexico_City` for cdmx, `America/New_York` for nyc
- **Dedupe rule:** same name (case/diacritic-insensitive) within 150 m = same place → skip it and tell Martha
- Bump the top-level `"updated"` date
- If Martha pastes a JSON array of pending quick-adds from the app, fold them in with the same rules; entries named `"Unresolved link"` carry the original URL in `note` — resolve those into real places
- After editing, validate: `node --test tests/geo.test.mjs` must pass and `places.json` must parse
- Commit (`feat: add N places to <list>`) and push to `main`
- Tell Martha what was added, what was skipped as duplicate, and anything you couldn't resolve

## Adding a new city

New `list` value in places.json + add the city to `CITY_CENTERS` in `js/app.js`
(lat/lng/zoom/label/tz) + add an `<option>` to both city `<select>`s in `index.html`.

## Don't

- Don't touch the service worker cache name unless shipping app-code changes (`sw.js` `CACHE` constant must be bumped only together with code edits — place-list updates never need it)
- Don't reformat or reorder existing entries — append and edit surgically
- Don't add places Martha didn't ask for
