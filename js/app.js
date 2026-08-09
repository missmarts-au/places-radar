import {
  haversineMeters,
  walkingMinutes,
  radiusMetersForMinutes,
  isOpenNow,
  parseGmapsQuery,
  isSamePlace,
} from './geo.js';

// ---------- state ----------

const CITY_CENTERS = {
  cdmx: { lat: 19.4204, lng: -99.1755, zoom: 13, label: 'Mexico City', tz: 'America/Mexico_City' },
  nyc: { lat: 40.7405, lng: -73.985, zoom: 13, label: 'New York', tz: 'America/New_York' },
};

const TAG_COLORS = { eat: '#e8590c', see: '#1971c2', walk: '#2f9e44', key: '#9c36b5' };
const TAG_EMOJI = { eat: '🍽', see: '👀', walk: '🚶', key: '⭐' };

const state = {
  places: [],
  city: localStorage.getItem('city') || 'cdmx',
  tag: localStorage.getItem('tag') || 'all',
  radiusMin: Number(localStorage.getItem('radiusMin') || 15),
  visited: new Set(JSON.parse(localStorage.getItem('visited') || '[]')),
  position: null, // {lat, lng, accuracy}
  alertedIds: new Set(),
  markers: new Map(), // id -> Leaflet marker
  sim: false,
  pending: JSON.parse(localStorage.getItem('pendingAdds') || '[]'),
};

// ---------- map ----------

const map = L.map('map', { zoomControl: false });
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let meDot = null;
let meAccuracy = null;
let radiusCircle = null;

function setCityView() {
  const c = CITY_CENTERS[state.city];
  map.setView([c.lat, c.lng], c.zoom);
}

function updateSelfLayers() {
  if (!state.position) return;
  const { lat, lng, accuracy } = state.position;
  if (!meDot) {
    meDot = L.circleMarker([lat, lng], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#1c7ed6',
      fillOpacity: 1,
    }).addTo(map);
    meAccuracy = L.circle([lat, lng], {
      radius: accuracy || 0,
      color: '#1c7ed6',
      weight: 1,
      opacity: 0.4,
      fillOpacity: 0.08,
    }).addTo(map);
    radiusCircle = L.circle([lat, lng], {
      radius: radiusMetersForMinutes(state.radiusMin),
      color: '#0b7285',
      weight: 1.5,
      dashArray: '6 6',
      fillOpacity: 0.04,
    }).addTo(map);
  } else {
    meDot.setLatLng([lat, lng]);
    meAccuracy.setLatLng([lat, lng]).setRadius(accuracy || 0);
    radiusCircle
      .setLatLng([lat, lng])
      .setRadius(radiusMetersForMinutes(state.radiusMin));
  }
}

// ---------- data ----------

async function loadPlaces() {
  try {
    const res = await fetch('places.json', { cache: 'no-cache' });
    const data = await res.json();
    state.places = data.places;
  } catch {
    state.places = []; // offline before first cache — quick-adds still work
  }
}

function activePlaces() {
  return [...state.places, ...state.pending].filter(
    (p) =>
      p.list === state.city && (state.tag === 'all' || p.tag === state.tag)
  );
}

function minutesTo(p) {
  if (!state.position || p.lat == null) return null;
  return walkingMinutes(
    haversineMeters(state.position.lat, state.position.lng, p.lat, p.lng)
  );
}

// ---------- markers ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function popupHtml(p) {
  const mins = minutesTo(p);
  const minsLine = mins === null ? '' : `<br>🚶 ${mins} min walk`;
  return `<strong>${esc(p.name)}</strong><br>${esc(p.note)}${minsLine}<br>
    <a href="${esc(p.gmaps)}" target="_blank" rel="noopener">Open in Google Maps</a>`;
}

function renderMarkers() {
  for (const m of state.markers.values()) m.remove();
  state.markers.clear();
  for (const p of activePlaces()) {
    if (p.lat == null) continue; // unresolved pending adds have no pin yet
    const visited = state.visited.has(p.id);
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 9,
      color: '#fff',
      weight: 2,
      fillColor: visited ? '#adb5bd' : TAG_COLORS[p.tag] || '#495057',
      fillOpacity: 0.95,
      dashArray: p.pending ? '3 3' : null,
    })
      .addTo(map)
      .bindPopup(() => popupHtml(p));
    state.markers.set(p.id, marker);
  }
}

// ---------- list ----------

const placeList = document.getElementById('placeList');
const sheetTitle = document.getElementById('sheetTitle');

function openBadge(p) {
  const open = isOpenNow(p.hours, p.tz);
  if (open === true) return '<span class="open">Open</span>';
  if (open === false) return '<span class="closed">Closed</span>';
  return '<span>Hours unknown</span>';
}

function renderList() {
  const places = activePlaces()
    .map((p) => ({ p, mins: minutesTo(p) }))
    .sort((a, b) => (a.mins ?? 9e9) - (b.mins ?? 9e9));

  sheetTitle.textContent = state.position
    ? `Nearby places — ${places.length}`
    : `Places — ${places.length} (no GPS)`;

  placeList.innerHTML = '';
  for (const { p, mins } of places) {
    const visited = state.visited.has(p.id);
    const card = document.createElement('div');
    card.className = 'card' + (visited ? ' visited' : '');
    card.innerHTML = `
      <span class="dot${p.pending ? ' pending' : ''}"
        style="${p.pending ? '' : `background:${visited ? '#adb5bd' : TAG_COLORS[p.tag]}`}"></span>
      <div class="body">
        <div class="name">${TAG_EMOJI[p.tag] || ''} ${esc(p.name)}${
          p.pending ? ' <em>(pending)</em>' : ''
        }</div>
        <div class="meta">${openBadge(p)}${
          p.pending ? ' · added on the go' : ''
        }</div>
        ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
      </div>
      <div class="actions">
        <span class="dist">${mins === null ? '—' : `${mins} min`}</span>
        <a href="${esc(p.gmaps)}" target="_blank" rel="noopener">Maps ↗</a>
        <label><input type="checkbox" data-visited="${p.id}" ${
          visited ? 'checked' : ''
        }> visited</label>
      </div>`;
    card.querySelector('.name').addEventListener('click', () => {
      if (p.lat == null) return;
      map.setView([p.lat, p.lng], 16);
      state.markers.get(p.id)?.openPopup();
    });
    placeList.appendChild(card);
  }
}

placeList.addEventListener('change', (e) => {
  const id = e.target.dataset?.visited;
  if (!id) return;
  if (e.target.checked) state.visited.add(id);
  else state.visited.delete(id);
  localStorage.setItem('visited', JSON.stringify([...state.visited]));
  renderAll();
});

// ---------- alerts ----------

const alertBanner = document.getElementById('alertBanner');
const alertText = document.getElementById('alertText');
let alertTimer = null;
let alertTarget = null;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (freq, t0, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'triangle'; // punchier than sine at the same volume
      gain.gain.setValueAtTime(0.9, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + dur);
    };
    // two rising chimes, repeated — hard to miss on the street
    for (const round of [0, 0.9]) {
      play(880, round, 0.18);
      play(1175, round + 0.2, 0.18);
      play(1568, round + 0.4, 0.35);
    }
  } catch {
    /* audio may be blocked before first user gesture — fine */
  }
}

window.__alertLog = []; // inspected by pre-trip sim tests

function showAlert(p, mins) {
  window.__alertLog.push({ id: p.id, name: p.name, mins });
  console.log(`[ALERT] ${p.name} — ${mins} min`);
  alertText.innerHTML = `${state.sim ? '<span class="sim-chip">SIM</span>' : ''}📍 <strong>${esc(p.name)}</strong> is ${mins} min walk away!`;
  alertBanner.hidden = false;
  alertTarget = p;
  beep();
  navigator.vibrate?.(200);
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => (alertBanner.hidden = true), 12000);
}

alertBanner.addEventListener('click', (e) => {
  if (e.target.id === 'alertClose') {
    alertBanner.hidden = true;
    return;
  }
  if (alertTarget) {
    map.setView([alertTarget.lat, alertTarget.lng], 16);
    state.markers.get(alertTarget.id)?.openPopup();
    alertBanner.hidden = true;
  }
});

function checkAlerts() {
  if (!state.position) return;
  for (const p of activePlaces()) {
    if (p.lat == null) continue;
    if (state.visited.has(p.id)) continue;
    if (state.alertedIds.has(p.id)) continue;
    const mins = minutesTo(p);
    if (mins !== null && mins <= state.radiusMin) {
      state.alertedIds.add(p.id);
      showAlert(p, mins);
      break; // one banner at a time; others alert on next tick
    }
  }
}

// ---------- position handling ----------

const gpsHint = document.getElementById('gpsHint');
document.getElementById('gpsHintClose').addEventListener('click', () => {
  gpsHint.hidden = true;
});

function onPosition(lat, lng, accuracy) {
  const firstFix = state.position === null;
  state.position = { lat, lng, accuracy };
  gpsHint.hidden = true;
  updateSelfLayers();
  if (firstFix) {
    const c = CITY_CENTERS[state.city];
    // Only recenter on Martha if she's actually in/near the selected city (<80 km)
    if (haversineMeters(lat, lng, c.lat, c.lng) < 80000) {
      map.setView([lat, lng], 15);
    }
  }
  renderList();
  checkAlerts();
}

function startGeolocation() {
  if (!('geolocation' in navigator)) {
    gpsHint.hidden = false;
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) =>
      onPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    () => {
      if (!state.position) gpsHint.hidden = false;
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

// ---------- controls ----------

const citySelect = document.getElementById('citySelect');
citySelect.value = state.city;
citySelect.addEventListener('change', () => {
  state.city = citySelect.value;
  localStorage.setItem('city', state.city);
  state.alertedIds.clear();
  setCityView();
  renderAll();
});

document.getElementById('tagChips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.tag = btn.dataset.tag;
  localStorage.setItem('tag', state.tag);
  document
    .querySelectorAll('.chip')
    .forEach((c) => c.classList.toggle('active', c === btn));
  renderAll();
});

const radiusSlider = document.getElementById('radiusSlider');
const radiusLabel = document.getElementById('radiusLabel');
radiusSlider.value = state.radiusMin;
radiusLabel.textContent = `${state.radiusMin} min`;
radiusSlider.addEventListener('input', () => {
  state.radiusMin = Number(radiusSlider.value);
  radiusLabel.textContent = `${state.radiusMin} min`;
  localStorage.setItem('radiusMin', String(state.radiusMin));
  if (radiusCircle) radiusCircle.setRadius(radiusMetersForMinutes(state.radiusMin));
  checkAlerts();
});

// Keep-screen-awake toggle — the practical answer to "alerts while walking":
// screen stays on, the app keeps watching GPS, alerts keep firing.
let wakeLock = null;
const wakeBtn = document.getElementById('wakeBtn');
let wakeWanted = false;

async function applyWake() {
  try {
    if (wakeWanted && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (!wakeWanted && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeWanted = false; // not supported / denied — button just stays off
  }
  wakeBtn.classList.toggle('on', wakeWanted);
}

wakeBtn.addEventListener('click', () => {
  wakeWanted = !wakeWanted;
  applyWake();
});
document.addEventListener('visibilitychange', applyWake); // reacquire after tab switch

const sheet = document.getElementById('sheet');
document.getElementById('sheetHandle').addEventListener('click', () => {
  sheet.classList.toggle('collapsed');
});

// reflect persisted tag in chips (without re-triggering render)
document.querySelectorAll('.chip').forEach((c) => {
  c.classList.toggle('active', c.dataset.tag === state.tag);
});

function renderAll() {
  renderMarkers();
  renderList();
  checkAlerts();
}

// ---------- quick add ----------

const addModal = document.getElementById('addModal');
const addInput = document.getElementById('addInput');
const addTag = document.getElementById('addTag');
const addCity = document.getElementById('addCity');
const addResults = document.getElementById('addResults');
const pendingFooter = document.getElementById('pendingFooter');

function persistPending() {
  localStorage.setItem('pendingAdds', JSON.stringify(state.pending));
  pendingFooter.hidden = state.pending.length === 0;
}

function savePendingPlace(place) {
  const all = [...state.places, ...state.pending].filter((x) => x.lat != null);
  if (place.lat != null && all.some((x) => isSamePlace(x, place))) {
    addResults.innerHTML = '<p class="tiny">Already on your list 👍</p>';
    return false;
  }
  state.pending.push(place);
  persistPending();
  renderAll();
  return true;
}

function newPendingPlace({ name, lat, lng, note }) {
  const city = addCity.value;
  return {
    id: `pending-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    name,
    list: city,
    tag: addTag.value,
    lat: lat ?? null,
    lng: lng ?? null,
    note: note || '',
    source: 'quick-add',
    gmaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
    hours: null,
    tz: CITY_CENTERS[city].tz,
    visited: false,
    pending: true,
  };
}

let lastNominatim = 0;

async function nominatimSearch(query, city) {
  // be a polite Nominatim citizen: >=1 s between requests
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatim));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const q = `${query}, ${CITY_CENTERS[city].label}`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

async function runAddSearch() {
  const raw = addInput.value.trim();
  if (!raw) return;
  addResults.innerHTML = '<p class="tiny">Searching…</p>';

  let query = raw;
  if (/^https?:\/\//i.test(raw)) {
    const extracted = parseGmapsQuery(raw);
    if (extracted === null) {
      // Short/opaque link — can't resolve in the browser. Save for Claude.
      savePendingPlace(
        newPendingPlace({
          name: 'Unresolved link',
          note: raw,
        })
      );
      addResults.innerHTML =
        '<p class="tiny">Saved as pending — Claude will resolve this link next sync. Nothing lost 👍</p>';
      addInput.value = '';
      return;
    }
    query = extracted;
  }

  let results;
  try {
    results = await nominatimSearch(query, addCity.value);
  } catch {
    addResults.innerHTML =
      '<p class="tiny">Search failed (offline?). Tap below to save it as pending anyway.</p>';
    results = [];
  }

  addResults.querySelectorAll('.result').forEach((b) => b.remove());
  for (const r of results) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result';
    btn.textContent = r.display_name;
    btn.addEventListener('click', () => {
      const saved = savePendingPlace(
        newPendingPlace({
          name: r.name || r.display_name.split(',')[0],
          lat: Number(r.lat),
          lng: Number(r.lon),
        })
      );
      if (saved) {
        addModal.close();
        map.setView([Number(r.lat), Number(r.lon)], 16);
      }
    });
    addResults.appendChild(btn);
  }

  // always offer save-as-unresolved fallback
  const fallback = document.createElement('button');
  fallback.type = 'button';
  fallback.className = 'result';
  fallback.textContent = `➕ Save "${query}" as pending (no pin yet — Claude resolves it later)`;
  fallback.addEventListener('click', () => {
    savePendingPlace(newPendingPlace({ name: query, note: raw !== query ? raw : '' }));
    addModal.close();
  });
  addResults.appendChild(fallback);
}

document.getElementById('addFab').addEventListener('click', () => {
  addCity.value = state.city;
  addResults.innerHTML = '';
  addInput.value = '';
  addModal.showModal();
});
document.getElementById('addSearch').addEventListener('click', runAddSearch);
document.getElementById('addCancel').addEventListener('click', () => addModal.close());
document.getElementById('addForm').addEventListener('submit', (e) => e.preventDefault());
addInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runAddSearch();
  }
});

document.getElementById('copyPending').addEventListener('click', async () => {
  const payload = JSON.stringify(state.pending, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    document.getElementById('copyPending').textContent = '✅ Copied — paste to Claude';
  } catch {
    prompt('Copy this and paste it to Claude:', payload);
  }
});

document.getElementById('clearPending').addEventListener('click', () => {
  if (!confirm('Clear pending places? Only do this AFTER Claude confirmed they are in the master list.')) return;
  state.pending = [];
  persistPending();
  document.getElementById('copyPending').textContent = '📋 Copy pending for Claude';
  renderAll();
});

// ---------- simulated walk (?sim=cdmx | ?sim=nyc) ----------
// Fakes GPS: walks in a straight line toward the city's seed cluster at 8x
// real walking speed so alerts can be tested before the trip. Never runs
// unless explicitly requested via the URL.

const SIM_ROUTES = {
  // start ~25 walking minutes out, walk through the cluster
  cdmx: { from: { lat: 19.4438, lng: -99.2015 }, to: { lat: 19.4155, lng: -99.178 } },
  nyc: { from: { lat: 40.7484, lng: -73.9857 }, to: { lat: 40.7794, lng: -73.9632 } },
};

function startSimWalk(cityKey) {
  const route = SIM_ROUTES[cityKey];
  if (!route) return false;
  state.sim = true;
  state.city = cityKey;
  citySelect.value = cityKey;
  setCityView();
  const SPEED = (80 / 60) * 8; // 8x walking speed, m/s
  const TICK_MS = 1000;
  const total = haversineMeters(route.from.lat, route.from.lng, route.to.lat, route.to.lng);
  let travelled = 0;
  console.log(`[SIM] walking ${Math.round(total)} m at 8x speed`);
  const timer = setInterval(() => {
    travelled += SPEED * (TICK_MS / 1000);
    const f = Math.min(travelled / total, 1);
    const lat = route.from.lat + (route.to.lat - route.from.lat) * f;
    const lng = route.from.lng + (route.to.lng - route.from.lng) * f;
    onPosition(lat, lng, 10);
    if (f >= 1) {
      clearInterval(timer);
      console.log('[SIM] arrived');
      const pre = document.createElement('pre');
      pre.id = 'simResult';
      pre.hidden = true;
      pre.textContent = JSON.stringify(window.__alertLog);
      document.body.appendChild(pre);
    }
  }, TICK_MS);
  return true;
}

// ---------- boot ----------

async function boot() {
  setCityView();
  await loadPlaces();
  persistPending(); // shows the footer if quick-adds are waiting
  renderAll();
  const simCity = new URLSearchParams(location.search).get('sim');
  if (simCity && startSimWalk(simCity)) return;
  startGeolocation();
}

boot();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* offline caching is a nice-to-have; the app works without it */
  });
}
