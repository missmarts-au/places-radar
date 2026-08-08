# Places Radar 📍

Personal travel companion PWA: shows saved places on a map with walking-minute
distances and alerts (while the app is open) when one comes within a chosen
radius. Built for CDMX + NYC trips; works for any city list in `places.json`.

## How it works

- **Map & pins** — Leaflet + OpenStreetMap tiles, no API keys. Pins colored by
  tag (🍽 eat / 👀 see / 🚶 walk). Blue dot = you; dashed circle = your alert radius.
- **Walking minutes** — straight-line distance × 1.3 grid factor ÷ 80 m/min.
- **Alerts** — while the app is open, a banner + sound fires once per outing
  when a place crosses into the radius (slider, 5–20 min, default 15).
- **Open/Closed** — computed from opening hours stored in `places.json`, in the
  place's own timezone. Busy-ness isn't available to any third-party app —
  tap "Maps ↗" to see it in Google Maps.
- **Quick add** — the ＋ button geocodes a name or Google Maps link via
  Nominatim and saves it locally as *pending* until Claude folds it into
  `places.json`.
- **Offline** — service worker caches the app shell and the last place list.
- **Privacy** — GPS position never leaves the browser.

## Local development

```bash
python -m http.server 8765   # then open http://localhost:8765
node --test tests/geo.test.mjs
```

Test the alert engine without leaving your chair:
`http://localhost:8765/?sim=cdmx` (or `?sim=nyc`) fakes a walk at 8× speed —
banners show a red SIM chip.

## Adding places

The master list is `places.json`. The ingestion workflow (screenshots,
IG/TikTok links, Google Maps links → Claude → this file) is documented in the
Obsidian vault: `02 Projects/Places Radar/[C] How to Add Places.md`.

## Deploy

Hosting decision pending (GitHub Pages requires the repo to be public;
alternative is Netlify from a private repo). Everything is static — any static
host works.
