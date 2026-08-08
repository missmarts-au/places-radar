import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineMeters,
  walkingMinutes,
  isOpenNow,
  parseGmapsQuery,
  isSamePlace,
} from '../js/geo.js';

// --- haversineMeters ---

test('haversine: Zocalo to Bellas Artes is roughly 900 m', () => {
  const d = haversineMeters(19.4326, -99.1332, 19.4352, -99.1413);
  assert.ok(d > 800 && d < 1000, `got ${d}`);
});

test('haversine: zero distance', () => {
  assert.equal(haversineMeters(40.7, -74.0, 40.7, -74.0), 0);
});

// --- walkingMinutes ---

test('walkingMinutes: 1000 m -> 17 min (x1.3 grid factor, 80 m/min, ceil)', () => {
  assert.equal(walkingMinutes(1000), 17);
});

test('walkingMinutes: 0 m -> 0 min', () => {
  assert.equal(walkingMinutes(0), 0);
});

// --- isOpenNow ---
// 2026-08-10 is a Monday. CDMX is UTC-6 year-round (no DST since 2022).
const tacoHours = { mon: [['19:30', '03:00']] }; // opens Mon night, closes 3am Tue

test('isOpenNow: null hours -> null (unknown)', () => {
  assert.equal(isOpenNow(null, 'America/Mexico_City', new Date()), null);
});

test('isOpenNow: open during evening span', () => {
  // Mon 20:00 CDMX == Tue 02:00 UTC
  const now = new Date('2026-08-11T02:00:00Z');
  assert.equal(isOpenNow(tacoHours, 'America/Mexico_City', now), true);
});

test('isOpenNow: overnight spill — 01:00 Tue still open from Mon span', () => {
  // Tue 01:00 CDMX == Tue 07:00 UTC
  const now = new Date('2026-08-11T07:00:00Z');
  assert.equal(isOpenNow(tacoHours, 'America/Mexico_City', now), true);
});

test('isOpenNow: closed Monday morning', () => {
  // Mon 10:00 CDMX == Mon 16:00 UTC
  const now = new Date('2026-08-10T16:00:00Z');
  assert.equal(isOpenNow(tacoHours, 'America/Mexico_City', now), false);
});

test('isOpenNow: closed after overnight span ends (Tue 04:00)', () => {
  // Tue 04:00 CDMX == Tue 10:00 UTC
  const now = new Date('2026-08-11T10:00:00Z');
  assert.equal(isOpenNow(tacoHours, 'America/Mexico_City', now), false);
});

test('isOpenNow: respects the place timezone, not the phone one', () => {
  // Same instant: Mon 20:00 in CDMX but Mon 22:00 in New York.
  // A NYC place open mon 19:00-21:00 would be CLOSED at this instant,
  // while the CDMX span 19:30-03:00 is OPEN.
  const now = new Date('2026-08-11T02:00:00Z');
  const nycHours = { mon: [['19:00', '21:00']] };
  assert.equal(isOpenNow(nycHours, 'America/New_York', now), false);
  assert.equal(isOpenNow(tacoHours, 'America/Mexico_City', now), true);
});

test('isOpenNow: day with no entry is closed', () => {
  // Wed 20:00 CDMX == Thu 02:00 UTC
  const now = new Date('2026-08-13T02:00:00Z');
  assert.equal(isOpenNow(tacoHours, 'America/Mexico_City', now), false);
});

// --- parseGmapsQuery ---

test('parseGmapsQuery: /maps/place/ URL', () => {
  const u = 'https://www.google.com/maps/place/El+Vilsito/@19.3861,-99.1723,17z/data=abc';
  assert.equal(parseGmapsQuery(u), 'El Vilsito');
});

test('parseGmapsQuery: query param with encoding', () => {
  const u = "https://www.google.com/maps/search/?api=1&query=Katz's%20Delicatessen";
  assert.equal(parseGmapsQuery(u), "Katz's Delicatessen");
});

test('parseGmapsQuery: short links cannot be resolved client-side -> null', () => {
  assert.equal(parseGmapsQuery('https://maps.app.goo.gl/AbC123xyz'), null);
  assert.equal(parseGmapsQuery('https://goo.gl/maps/AbC123'), null);
});

test('parseGmapsQuery: garbage -> null', () => {
  assert.equal(parseGmapsQuery('not a url at all'), null);
  assert.equal(parseGmapsQuery('https://example.com/nothing'), null);
});

// --- isSamePlace ---

test('isSamePlace: same name ignoring case/diacritics, 50 m apart -> true', () => {
  const a = { name: 'Café Nin', lat: 19.427, lng: -99.1601 };
  const b = { name: 'cafe nin', lat: 19.4274, lng: -99.1603 };
  assert.equal(isSamePlace(a, b), true);
});

test('isSamePlace: same name but 500 m apart -> false', () => {
  const a = { name: 'Starbucks', lat: 19.427, lng: -99.1601 };
  const b = { name: 'Starbucks', lat: 19.4315, lng: -99.1601 };
  assert.equal(isSamePlace(a, b), false);
});

test('isSamePlace: different names nearby -> false', () => {
  const a = { name: 'Café Nin', lat: 19.427, lng: -99.1601 };
  const b = { name: 'Panadería Rosetta', lat: 19.4271, lng: -99.1602 };
  assert.equal(isSamePlace(a, b), false);
});
