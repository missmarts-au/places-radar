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
  position: null, // {lat, lng}
  alertedIds: new Set(),
  markers: new Map(), // id -> Leaflet marker
};

// ---------- map ----------

const map = L.map('map', { zoomControl: false });
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

function setCityView() {
  const c = CITY_CENTERS[state.city];
  map.setView([c.lat, c.lng], c.zoom);
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

// ---------- markers ----------

function popupHtml(p) {
  const mins =
    state.position === null
      ? ''
      : `<br>🚶 ${walkingMinutes(
          haversineMeters(state.position.lat, state.position.lng, p.lat, p.lng)
        )} min walk`;
  return `<strong>${p.name}</strong><br>${p.note || ''}${mins}<br>
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

document.querySelector(`.chip[data-tag="${state.tag}"]`)?.click();

function renderAll() {
  renderMarkers();
}

// ---------- boot ----------

async function boot() {
  setCityView();
  await loadPlaces();
  renderAll();
}

boot();
