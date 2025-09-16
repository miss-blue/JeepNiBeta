// public/js/map-tracker.js
// Driver live tracking + route-aware icons with robust geolocation

// -------- Imports --------
import { auth, db, ref, get, onValue } from "./authentication.js";
import { query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { startTrip, updateLocation, endTrip } from "./trip-tracking.js";

// -------- Small helpers --------
function domReady() {
  if (document.readyState === "complete" || document.readyState === "interactive") return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

async function ensureLeaflet() {
  if (window.L) return;
  await new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.async = true;
    js.onload = resolve;
    js.onerror = reject;
    document.head.appendChild(js);
  });
}

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function norm(route) {
  if (!route || typeof route !== "string") return "Gueset";
  return route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();
}

// -------- Icons (with preload + fallback) --------
let DEFAULT_ICON = null;
function makeDefaultIcon() {
  // Create once after Leaflet exists
  if (DEFAULT_ICON) return DEFAULT_ICON;
  DEFAULT_ICON = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  return DEFAULT_ICON;
}

function routeIconUrl(route, jeepneyType) {
  const r = norm(route);
  const prefix = (jeepneyType === "traditional") ? "old" : "";
  return `/icons/${prefix}${r}.png`;
}

function preloadIcon(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(L.icon({ 
      iconUrl: url, 
      iconSize: [40, 40], 
      iconAnchor: [20, 40], 
      popupAnchor: [0, -40] 
    }));
    img.onerror = () => resolve(makeDefaultIcon());
    img.src = url;
  });
}

async function getJeepIcon(route, type) {
  const url = routeIconUrl(route, type);
  try { 
    return await preloadIcon(url); 
  } catch { 
    return makeDefaultIcon(); 
  }
}

// -------- Resolve route & type for current driver --------
let metaCache = { route: "Gueset", type: "modern", _ts: 0 };

async function resolveRouteAndType(uid) {
  const now = Date.now();
  if (now - metaCache._ts < 60_000) return metaCache;

  // Prefer today's assignment
  try {
    const day = todayKey();
    const q = query(ref(db, `schedules/${day}`), orderByChild("driver_uid"), equalTo(uid));
    const snap = await get(q);
    if (snap.exists()) {
      const rows = Object.values(snap.val() || {});
      const active = rows.find(r => ["assigned", "accepted", "enroute"].includes(r?.status) && r?.driver_uid === uid) || rows[0];
      if (active) {
        metaCache = { 
          route: norm(active.route || "Gueset"), 
          type: (active.jeepney_type || "modern").toLowerCase(), 
          _ts: now 
        };
        return metaCache;
      }
    }
  } catch (e) { 
    console.warn("Failed to get schedule assignment:", e);
  }

  // Fallback to driver profile
  try {
    const prof = await get(ref(db, `drivers/${uid}`));
    if (prof.exists()) {
      const d = prof.val();
      metaCache = { 
        route: norm(d.route || "Gueset"), 
        type: (d.type || "modern").toLowerCase(), 
        _ts: now 
      };
      return metaCache;
    }
  } catch (e) { 
    console.warn("Failed to get driver profile:", e);
  }

  metaCache = { route: "Gueset", type: "modern", _ts: now };
  return metaCache;
}

// -------- Active trip bookkeeping (localStorage) --------
function getActiveTripId() { 
  return localStorage.getItem("active_trip_id"); 
}

function setActiveTripId(id) { 
  if (id) {
    localStorage.setItem("active_trip_id", id);
  } else {
    localStorage.removeItem("active_trip_id"); 
  }
}

// -------- Geolocation (robust) --------
const GEO_OPTS = {
  enableHighAccuracy: true,    // Use GPS when available
  timeout: 60000,              // give it up to 60s for first fix
  maximumAge: 300000           // accept cache up to 5 minutes old
};

let watchId = null;
let lastPoint = null;

function startWatch(onPoint) {
  if (!("geolocation" in navigator)) {
    console.warn("Geolocation not supported");
    return;
  }
  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      lastPoint = pos;
      onPoint(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => {
      console.warn("watchPosition error:", err);
      if (err.code === 3) { // timeout → retry with backoff
        stopWatch();
        setTimeout(() => startWatch(onPoint), 5000);
      }
    },
    GEO_OPTS
  );
}

function stopWatch() {
  if (watchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function getFirstFixOrFallback(map) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      return resolve({ 
        coords: { 
          latitude: map.getCenter().lat, 
          longitude: map.getCenter().lng 
        } 
      });
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve({ 
        coords: { 
          latitude: map.getCenter().lat, 
          longitude: map.getCenter().lng 
        } 
      }),
      GEO_OPTS
    );
  });
}

// -------- Map boot --------
await domReady();
await ensureLeaflet();
// Ensure CSS for FULL badge exists
(() => {
  if (document.getElementById('full-badge-style')) return;
  const css = document.createElement('style');
  css.id = 'full-badge-style';
  css.textContent = `.leaflet-tooltip.full-badge{background:#dc3545;color:#fff;border:none;border-radius:12px;padding:2px 6px;font-weight:700;letter-spacing:.5px;box-shadow:0 1px 3px rgba(0,0,0,.2)}`;
  document.head.appendChild(css);
})();
// Ensure CSS for FULL badge exists
if (!document.getElementById('full-badge-style')) {
  const css = document.createElement('style');
  css.id = 'full-badge-style';
  css.textContent = `.leaflet-tooltip.full-badge{background:#dc3545;color:#fff;border:none;border-radius:12px;padding:2px 6px;font-weight:700;letter-spacing:0.5px;box-shadow:0 1px 3px rgba(0,0,0,.2)}`;
  document.head.appendChild(css);
}

const mapEl = document.getElementById("map");
let map = null;
let meMarker = null;
let myFullBadge = false;
let myFull = false;
let myRole = 'norole';

// Smooth animation helpers
const _lastPos = new WeakMap();
const _anim = new WeakMap();
function _stopAnim(m){ const r = _anim.get(m); if (r) cancelAnimationFrame(r); }
function smoothMove(marker, toLat, toLng, duration = 500){
  try {
    const from = _lastPos.get(marker) || marker.getLatLng();
    const start = performance.now();
    const to = { lat: toLat, lng: toLng };
    _stopAnim(marker);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      marker.setLatLng([lat, lng]);
      if (t < 1) {
        _anim.set(marker, requestAnimationFrame(step));
      } else {
        _lastPos.set(marker, to);
      }
    };
    _anim.set(marker, requestAnimationFrame(step));
  } catch {
    marker.setLatLng([toLat, toLng]);
  }
}

// Resilient tile layer loader to avoid ERR_CONNECTION_CLOSED
function addResilientTiles(m){
  const providers = [
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 20, attribution: '&copy; OpenStreetMap'} },
    { url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', opts: { maxZoom: 20, attribution: '&copy; OpenStreetMap, HOT' } },
    { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', opts: { maxZoom: 20, attribution: '&copy; OpenStreetMap & Carto' } }
  ];
  let idx = 0; let layer = null; let errors = 0;
  const use = (i) => {
    if (layer) { try { m.removeLayer(layer); } catch {}
    }
    const p = providers[i];
    layer = L.tileLayer(p.url, p.opts).addTo(m);
    layer.on('tileerror', () => {
      errors++; if (errors > 6 && i < providers.length-1){ errors = 0; use(i+1); }
    });
    return layer;
  };
  return use(idx);
}

if (mapEl) {
  map = L.map(mapEl).setView([16.0431, 120.3331], 14);

  addResilientTiles(map);

  meMarker = L.marker([16.0431, 120.3331], { 
    icon: makeDefaultIcon(), 
    zIndexOffset: 1000 
  })
    .addTo(map)
    .bindPopup("Locating…");

  // center to first fix (or fallback)
  const first = await getFirstFixOrFallback(map);
  meMarker.setLatLng([first.coords.latitude, first.coords.longitude]);
  map.setView([first.coords.latitude, first.coords.longitude], 15);
  meMarker.setPopupContent("Ready");
}

// -------- Stream location + update icon + write presence/points --------
async function onGeoPoint(lat, lng) {
  if (!meMarker) return;
  
  smoothMove(meMarker, lat, lng, 500);
  if (map) {
    const b = map.getBounds();
    if (!b.contains([lat, lng])) map.panTo([lat, lng]);
  }

  // Update marker icon to current route/type or passenger icon based on role
  try {
    const u = auth.currentUser || await new Promise((res) => {
      const off = auth.onAuthStateChanged((x) => { off(); res(x); });
    });
    if (!u) return;

    // Resolve and cache role once
    if (myRole === 'norole') {
      try {
        const rs = await get(ref(db, `all_users/${u.uid}/role`));
        if (rs.exists()) myRole = String(rs.val() || 'norole').toLowerCase();
      } catch {}
      // If role still unknown, infer by presence of driver profile; default to passenger
      if (myRole === 'norole') {
        try {
          const d = await get(ref(db, `drivers/${u.uid}`));
          myRole = d.exists() ? 'driver' : 'passenger';
        } catch { myRole = 'passenger'; }
      }
    }

    if (myRole === 'passenger') {
      // Always use passenger icon for passenger users
      const PASSENGER_ICON = L.icon({ iconUrl: '/icons/passenger.png', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -24] });
      meMarker.setIcon(PASSENGER_ICON);
      meMarker.setZIndexOffset(1000);
      meMarker.bindPopup('Passenger');
    } else {
      const meta = await resolveRouteAndType(u.uid);
      const icon = await getJeepIcon(meta.route, meta.type);
      meMarker.setIcon(icon);
      meMarker.setZIndexOffset(1000);
      meMarker.bindPopup(`${meta.route} - ${meta.type === "traditional" ? "Traditional" : "Modern"}`);
    }
    // Apply current FULL badge state only for drivers
    if (myFullBadge) {
      if (myRole !== 'passenger') {
        meMarker.bindTooltip('FULL', { permanent: true, direction: 'top', className: 'full-badge' });
      }
    } else {
      try { meMarker.unbindTooltip(); } catch {}
    }

  // Stream to DB if a trip is active (drivers only)
  if (getActiveTripId() && myRole !== 'passenger') {
    await updateLocation(lat, lng, meta.route);
  }
  } catch (e) {
    console.warn("tracking update failed:", e);
  }
}

// Begin watching as soon as we can
startWatch(onGeoPoint);

// ===== Also show all drivers and passengers =====
const otherDriverMarkers = new Map();
const passengerMarkers = new Map();

function computeOnline(rec){
  const now = Date.now();
  const last = typeof rec?.last_update === 'number' ? rec.last_update : (rec?.last_update?._serverTimestamp || 0);
  return !!rec?.online && (now - last < 150000);
}

const driverMetaCache = new Map();
async function getDriverMeta(uid){
  if (driverMetaCache.has(uid)) return driverMetaCache.get(uid);
  try {
    const snap = await get(ref(db, `drivers/${uid}`));
    const v = snap.exists() ? snap.val() : {};
    const meta = { name: v.name || v.email || uid.slice(0,8), type: (v.type || 'modern').toLowerCase() };
    driverMetaCache.set(uid, meta);
    return meta;
  } catch {
    const meta = { name: uid.slice(0,8), type: 'modern' };
    driverMetaCache.set(uid, meta);
    return meta;
  }
}

async function upsertOtherDriver(uid, rec){
  if (!map || !rec || typeof rec.lat !== 'number' || typeof rec.lng !== 'number') return;
  const cur = auth.currentUser;
  if (cur && uid === cur.uid) return; // skip myself
  const meta = await getDriverMeta(uid);
  const icon = await getJeepIcon(rec.route, meta.type);
  const online = computeOnline(rec);
  let m = otherDriverMarkers.get(uid);
  if (!m){
    m = L.marker([rec.lat, rec.lng], { icon, zIndexOffset: online ? 700 : 200 }).addTo(map);
    otherDriverMarkers.set(uid, m);
    _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
  } else {
    smoothMove(m, rec.lat, rec.lng, 500);
    m.setIcon(icon);
    m.setZIndexOffset(online ? 700 : 200);
  }
  m.setOpacity(online ? 1 : 0.55);
  m.bindPopup(`<strong>${meta.name}</strong><br>Route: ${norm(rec.route)}<br>Status: ${online ? 'Online' : 'Offline'}`);
}

function removeOtherDriver(uid){
  const m = otherDriverMarkers.get(uid);
  if (!m) return;
  map.removeLayer(m);
  otherDriverMarkers.delete(uid);
}

const PASSENGER_ICON = L.icon({ iconUrl: '/icons/passenger.png', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -24] });
function upsertPassenger(uid, rec){
  if (!map || !rec || typeof rec.lat !== 'number' || typeof rec.lng !== 'number') return;
  let m = passengerMarkers.get(uid);
  if (!m){
    m = L.marker([rec.lat, rec.lng], { icon: PASSENGER_ICON, zIndexOffset: 300 }).addTo(map);
    passengerMarkers.set(uid, m);
    _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
  } else {
    smoothMove(m, rec.lat, rec.lng, 500);
  }
  m.bindPopup(`<strong>${rec.name || uid.slice(0,8)}</strong><br>Passenger`);
}

function removePassenger(uid){
  const m = passengerMarkers.get(uid);
  if (!m) return;
  map.removeLayer(m);
  passengerMarkers.delete(uid);
}

onValue(ref(db, 'drivers_location'), async (snap) => {
  const all = snap.exists() ? snap.val() : {};
  const seen = new Set(Object.keys(all));
  for (const uid of Object.keys(all)) await upsertOtherDriver(uid, all[uid] || {});
  for (const [uid] of otherDriverMarkers) if (!seen.has(uid)) removeOtherDriver(uid);
});

onValue(ref(db, 'passengers_location'), (snap) => {
  if (!snap.exists()) return;
  const all = snap.val() || {};
  const seen = new Set(Object.keys(all));
  for (const uid of Object.keys(all)) upsertPassenger(uid, all[uid] || {});
  for (const [uid] of passengerMarkers) if (!seen.has(uid)) removePassenger(uid);
});

// -------- Public API for pages (driver dashboard) --------
/**
 * Programmatic start of a trip (used when driver taps "Start (En-route)").
 * Infers route/type, creates trip meta, then keeps streaming.
 */
export async function beginSharing() {
  const user = auth.currentUser || await new Promise((res) => {
    const off = auth.onAuthStateChanged((x) => { off(); res(x); });
  });
  if (!user) throw new Error("Not signed in");

  const meta = await resolveRouteAndType(user.uid);
  const center = map ? map.getCenter() : { lat: 16.0431, lng: 120.3331 };

  const tripId = await startTrip({
    route: meta.route,
    startLat: center.lat,
    startLng: center.lng,
    jeep: meta.type,
    notes: ""
  });
  
  setActiveTripId(tripId);
  return tripId;
}

/**
 * Programmatic end of a trip (used when driver taps "Complete").
 */
export async function stopSharing({ completed = true } = {}) {
  const c = map ? map.getCenter() : { lat: null, lng: null };
  try {
    await endTrip({ 
      endLat: c.lat, 
      endLng: c.lng, 
      completed 
    });
  } finally {
    setActiveTripId(null);
  }
}

/**
 * Check if currently sharing location
 */
export function isSharing() {
  return !!getActiveTripId();
}

/**
 * Get current location if available
 */
export function getCurrentLocation() {
  return lastPoint ? {
    lat: lastPoint.coords.latitude,
    lng: lastPoint.coords.longitude,
    accuracy: lastPoint.coords.accuracy,
    timestamp: lastPoint.timestamp
  } : null;
}

/**
 * Optionally expose to window for quick manual testing
 * (remove if you don't want globals).
 */
if (typeof window !== 'undefined') {
  window.JeepNiTracker = {
    beginSharing,
    stopSharing,
    isSharing,
    getCurrentLocation,
    startWatch: () => startWatch(onGeoPoint),
    stopWatch,
    getActiveTripId,
    setActiveTripId,
    // Allow pages to toggle FULL badge on my own marker
    setMyFull: (flag) => {
      myFullBadge = !!flag;
      if (!meMarker) return myFullBadge;
      if (myFullBadge) {
        meMarker.bindTooltip('FULL', { permanent: true, direction: 'top', className: 'full-badge' });
      } else {
        try { meMarker.unbindTooltip(); } catch {}
      }
      return myFullBadge;
    }
  };
}






