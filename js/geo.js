// Pure logic — no DOM, no network. Unit-tested in tests/geo.test.mjs.

const EARTH_RADIUS_M = 6371000;
const GRID_FACTOR = 1.3; // straight-line -> street-grid correction
const WALK_SPEED_M_PER_MIN = 80;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function walkingMinutes(meters) {
  return Math.ceil((meters * GRID_FACTOR) / WALK_SPEED_M_PER_MIN);
}

export function radiusMetersForMinutes(minutes) {
  return (minutes * WALK_SPEED_M_PER_MIN) / GRID_FACTOR;
}

function localDayAndMinutes(tz, now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { dayIdx, minutes };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * hours: {mon:[["19:30","03:00"], ...], ...} or null.
 * A span whose close <= open runs past midnight and belongs to the day it OPENS.
 * Returns true/false, or null when hours are unknown.
 */
export function isOpenNow(hours, tz, now = new Date()) {
  if (!hours) return null;
  const { dayIdx, minutes } = localDayAndMinutes(tz, now);
  const today = DAY_KEYS[dayIdx];
  const yesterday = DAY_KEYS[(dayIdx + 6) % 7];

  for (const [open, close] of hours[today] ?? []) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (c > o) {
      if (minutes >= o && minutes < c) return true;
    } else if (minutes >= o) {
      return true; // overnight span, pre-midnight portion
    }
  }
  for (const [open, close] of hours[yesterday] ?? []) {
    const o = toMinutes(open);
    const c = toMinutes(close);
    if (c <= o && minutes < c) return true; // overnight spill past midnight
  }
  return false;
}

/**
 * Extract a searchable place name from a Google Maps URL.
 * Short links (maps.app.goo.gl, goo.gl) need a redirect we can't follow
 * client-side -> null. Unrecognized URLs -> null.
 */
export function parseGmapsQuery(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (/(^|\.)goo\.gl$/.test(u.hostname)) return null;
  const placeMatch = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch) {
    return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
  }
  const q = u.searchParams.get('query') || u.searchParams.get('q');
  if (q && u.hostname.includes('google.')) return q;
  return null;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Same normalized name AND within 150 m = the same place (dedupe rule). */
export function isSamePlace(a, b) {
  if (normalizeName(a.name) !== normalizeName(b.name)) return false;
  return haversineMeters(a.lat, a.lng, b.lat, b.lng) <= 150;
}
