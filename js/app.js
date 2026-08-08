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
  cdmx: { lat: 19.4204, lng: -99.1755, zoom: 13, label: 'Mexico City' },
  nyc: { lat: 40.7405, lng: -73.985, zoom: 13, label: 'New York' },
};

const TAG_COLORS = { eat: '#e8590c', see: '#1971c2', walk: '#2f9e44' };
const TAG_EMOJI = { eat: '🍽', see: '👀', walk: '🚶' };

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
  const res = await fetch('places.json', { cache: 'no-cache' });
  const data = await res.json();
  state.places = data.places;
}

function activePlaces() {
  return state.places.filter(
    (p) =>
      p.list === state.city && (state.tag === 'all' || p.tag === state.tag)
  );
}

function minutesTo(p) {
  if (!state.position) return null;
  return walkingMinutes(
    haversineMeters(state.position.lat, state.position.lng, p.lat, p.lng)
  );
}

// ---------- markers ----------

function popupHtml(p) {
  const mins = minutesTo(p);
  const minsLine = mins === null ? '' : `<br>🚶 ${mins} min walk`;
  return `<strong>${p.name}</strong><br>${p.note || ''}${minsLine}<br>
    <a href="${p.gmaps}" target="_blank" rel="noopener">Open in Google Maps</a>`;
}

function renderMarkers() {
  for (const m of state.markers.values()) m.remove();
  state.markers.clear();
  for (const p of activePlaces()) {
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
        <div class="name">${TAG_EMOJI[p.tag] || ''} ${p.name}${
          p.pending ? ' <em>(pending)</em>' : ''
        }</div>
        <div class="meta">${openBadge(p)}${
          p.pending ? ' · added on the go' : ''
        }</div>
        ${p.note ? `<div class="note">${p.note}</div>` : ''}
      </div>
      <div class="actions">
        <span class="dist">${mins === null ? '—' : `${mins} min`}</span>
        <a href="${p.gmaps}" target="_blank" rel="noopener">Maps ↗</a>
        <label><input type="checkbox" data-visited="${p.id}" ${
          visited ? 'checked' : ''
        }> visited</label>
      </div>`;
    card.querySelector('.name').addEventListener('click', () => {
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
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t0);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t0);
      osc.stop(ctx.currentTime + t0 + dur);
    };
    play(880, 0, 0.18);
    play(1175, 0.2, 0.28);
  } catch {
    /* audio may be blocked before first user gesture — fine */
  }
}

function showAlert(p, mins) {
  alertText.innerHTML = `${state.sim ? '<span class="sim-chip">SIM</span>' : ''}📍 <strong>${p.name}</strong> is ${mins} min walk away!`;
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

// ---------- boot ----------

async function boot() {
  setCityView();
  await loadPlaces();
  renderAll();
  startGeolocation();
}

boot();
