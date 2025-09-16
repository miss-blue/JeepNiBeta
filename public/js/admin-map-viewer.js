// public/js/admin-map-viewer.js
// Admin Live Map: shows all drivers (and passengers if available) with status

import { db, ref, onValue, get } from "./authentication.js";

async function domReady() {
  if (document.readyState === "complete" || document.readyState === "interactive") return;
  await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
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

// Inject minimal CSS for a red FULL badge tooltip
function ensureFullBadgeStyle() {
  if (document.getElementById('full-badge-style')) return;
  const css = document.createElement('style');
  css.id = 'full-badge-style';
  css.textContent = `
    .leaflet-tooltip.full-badge{background:#dc3545;color:#fff;border:none;border-radius:12px;padding:2px 6px;font-weight:700;letter-spacing:0.5px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
  `;
  document.head.appendChild(css);
}

function normRoute(route) {
  if (!route || typeof route !== 'string') return 'Gueset';
  return route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();
}

// Icon helpers
function makeDefaultIcon() {
  return L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
}

function routeIconPath(route, type) {
  const r = normRoute(route);
  const prefix = (type === 'traditional') ? 'old' : '';
  // Use absolute path for Firebase Hosting safety
  return `/icons/${prefix}${r}.png`;
}

function loadIcon(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(L.icon({ iconUrl: url, iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40] }));
    img.onerror = () => resolve(makeDefaultIcon());
    img.src = url;
  });
}

const driverMetaCache = new Map(); // uid -> {name, type}
async function getDriverMeta(uid) {
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

function fmtTime(ts) {
  if (!ts) return '-';
  try {
    // serverTimestamp renders as object until resolved; accept numbers
    const d = new Date(typeof ts === 'number' ? ts : (ts._serverTimestamp || Date.now()));
    return d.toLocaleString();
  } catch { return '-'; }
}

// --- Smooth marker animation helpers ---
const _lastPos = new WeakMap();
const _anim = new WeakMap();

function _stopAnim(marker){
  const r = _anim.get(marker);
  if (r) cancelAnimationFrame(r);
}

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

await domReady();
await ensureLeaflet();
ensureFullBadgeStyle();

const mapEl = document.getElementById('map');
// Guard: modules can't use top-level return; just no-op if missing
if (!mapEl) {
  console.warn('admin-map-viewer: #map not found on page');
} else {
  const map = L.map(mapEl).setView([16.0431, 120.3331], 13);
  // Use single-host OSM endpoint to avoid subdomain blocks on some networks
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors',
    crossOrigin: true,
    // Show a neutral tile if a request fails, so the map stays usable
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAIUlEQVR4AWNQYGD4z0AEYFQwMDAwQJgYGBhG0B8R6gQbQwAAGr1B3k3WcQMAAAAASUVORK5CYII='
  });
  tiles.on('tileerror', (e)=>{
    // Quiet noisy network errors; map remains interactive
    console.warn('OSM tile failed:', e.coords || e);
  });
  tiles.addTo(map);

  // Marker registries
  const driverMarkers = new Map(); // uid -> marker
  const passengerMarkers = new Map(); // uid -> marker (if data available)

function setMarkerOpacityByStatus(marker, online) {
  const op = online ? 1 : 0.55;
  marker.setOpacity(op);
}

function computeOnlineFlag(rec) {
  const now = Date.now();
  const last = typeof rec.last_update === 'number' ? rec.last_update : (rec.last_update?._serverTimestamp || 0);
  // Consider online only if flag is true and last update within 2.5 minutes
  return !!rec.online && (now - last < 150000);
}

async function upsertDriverMarker(uid, rec) {
  if (!rec || typeof rec.lat !== 'number' || typeof rec.lng !== 'number') return;
  const meta = await getDriverMeta(uid);
  const icon = await loadIcon(routeIconPath(rec.route, meta.type));
  const online = computeOnlineFlag(rec);

  let m = driverMarkers.get(uid);
  if (!m) {
    m = L.marker([rec.lat, rec.lng], { icon, zIndexOffset: online ? 800 : 200 }).addTo(map);
    driverMarkers.set(uid, m);
    _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
  } else {
    smoothMove(m, rec.lat, rec.lng, 500);
    m.setIcon(icon);
    m.setZIndexOffset(online ? 800 : 200);
  }

  const route = normRoute(rec.route);
  const statusText = online ? 'Online' : 'Offline';
  const last = fmtTime(rec.last_update);
  const cap = rec.full ? 'Full' : 'Available';
  m.bindPopup(`<strong>${meta.name}</strong><br>Route: ${route}<br>Status: ${statusText}<br>Capacity: <span class="badge ${rec.full ? 'bg-danger' : 'bg-success'}">${cap}</span><br><small>Last: ${last}</small>`);
  // Show a permanent FULL badge above the marker when full
  if (rec.full) {
    m.bindTooltip('FULL', { permanent: true, direction: 'top', className: 'full-badge' });
  } else {
    try { m.unbindTooltip(); } catch {}
  }
  setMarkerOpacityByStatus(m, online);
}

function removeDriverMarker(uid) {
  const m = driverMarkers.get(uid);
  if (!m) return;
  map.removeLayer(m);
  driverMarkers.delete(uid);
}

// Live subscribe to drivers_location
  onValue(ref(db, 'drivers_location'), async (snap) => {
    const all = snap.exists() ? snap.val() : {};
    const seen = new Set(Object.keys(all));
    // Upsert current
    for (const uid of Object.keys(all)) {
      await upsertDriverMarker(uid, all[uid] || {});
    }
    // Remove any no longer present
    for (const [uid] of driverMarkers) {
      if (!seen.has(uid)) removeDriverMarker(uid);
    }
  });

// Optional: passengers live locations if your DB has it
const PASSENGER_ICON = L.icon({ iconUrl: '/icons/passenger.png', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -24] });

function upsertPassengerMarker(uid, rec) {
  if (!rec || typeof rec.lat !== 'number' || typeof rec.lng !== 'number') return;
  let m = passengerMarkers.get(uid);
  if (!m) {
    m = L.marker([rec.lat, rec.lng], { icon: PASSENGER_ICON, zIndexOffset: 300 }).addTo(map);
    passengerMarkers.set(uid, m);
    _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
  } else {
    smoothMove(m, rec.lat, rec.lng, 500);
  }
  const name = rec.name || uid.slice(0,8);
  const last = fmtTime(rec.last_update);
  m.bindPopup(`<strong>${name}</strong><br>Passenger<br><small>Last: ${last}</small>`);
}

function removePassengerMarker(uid) {
  const m = passengerMarkers.get(uid);
  if (!m) return;
  map.removeLayer(m);
  passengerMarkers.delete(uid);
}

// Try subscribe; if path doesn't exist, ignore
  onValue(ref(db, 'passengers_location'), (snap) => {
    if (!snap.exists()) return; // silently ignore when not used
    const all = snap.val() || {};
    const seen = new Set(Object.keys(all));
    for (const uid of Object.keys(all)) upsertPassengerMarker(uid, all[uid] || {});
    for (const [uid] of passengerMarkers) if (!seen.has(uid)) removePassengerMarker(uid);
  });

// Small legend control
const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function() {
  const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar p-2 bg-white');
  div.style.fontSize = '12px';
  div.innerHTML = `
    <div class="d-flex align-items-center mb-1">
      <img src="/icons/Gueset.png" width="18" height="18" class="me-1"> Driver (online)
    </div>
    <div class="d-flex align-items-center mb-1" style="opacity:.6">
      <img src="/icons/Gueset.png" width="18" height="18" class="me-1"> Driver (offline)
    </div>
    <div class="d-flex align-items-center">
      <img src="/icons/passenger.png" width="18" height="18" class="me-1"> Passenger
    </div>
  `;
  return div;
};
  legend.addTo(map);
}
