// public/js/map-tracker.js
// Enhanced driver & passenger tracking with all requested features
// FIXED: Instant precise location and companion count display

// -------- Imports --------
import { auth, db, ref, get, set, update, onValue } from "./authentication.js";
import {
  query,
  orderByChild,
  equalTo
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// -------- Map bootstrap (resilient, with CSS) --------
(function addGlobalCss() {
  const css = document.createElement("style");
  css.textContent = `
    .leaflet-tooltip.full-badge    {background:#dc3545;color:#fff;border:none;border-radius:6px;padding:2px 8px;font-weight:700;letter-spacing:.5px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .leaflet-tooltip.available-badge{background:#28a745;color:#fff;border:none;border-radius:6px;padding:2px 8px;font-weight:700;letter-spacing:.5px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
  `;
  document.head.appendChild(css);
})();

const mapEl = document.getElementById("map");
let map = null;
let meMarker = null;
let myDirectionArrow = null;
let myCapacityBubble = null;
let myGeofenceCircle = null;
let myDestinationMarker = null;
let myFullBadge = false;
let myRole = "norole";
let passengerTrackingActive = false;
let companionCount = 0;
let _lastBearing = 0;
let _lastAccuracy = null; // Add this line

let _manualMode = false;
let _manualClickHandler = null;


// Smooth animation helpers
const _lastPos = new WeakMap();
const _anim = new WeakMap();
function _stopAnim(m) { const r = _anim.get(m); if (r) cancelAnimationFrame(r); }
function smoothMove(marker, toLat, toLng, duration = 500) {
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
      if (t < 1) _anim.set(marker, requestAnimationFrame(step));
      else _lastPos.set(marker, to);
    };
    _anim.set(marker, requestAnimationFrame(step));
  } catch {
    marker.setLatLng([toLat, toLng]);
  }
}

// Resilient tile layer
function addResilientTiles(m) {
  const providers = [
    { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", opts: { maxZoom: 20, attribution: "&copy; OpenStreetMap" } },
    { url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", opts: { maxZoom: 20, attribution: "&copy; OpenStreetMap, HOT" } },
    { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", opts: { maxZoom: 20, attribution: "&copy; OpenStreetMap & Carto" } }
  ];
  let idx = 0; let layer = null; let errors = 0;
  const use = (i) => {
    if (layer) { try { m.removeLayer(layer); } catch {} }
    const p = providers[i];
    layer = L.tileLayer(p.url, p.opts);
    layer.on("tileerror", () => {
      errors++;
      if (errors >= 3 && idx < providers.length - 1) {
        idx++; errors = 0; use(idx);
      }
    });
    layer.addTo(m);
  };
  use(0);
}

// Map init
(function initMap() {
  if (!mapEl) return;
  map = L.map(mapEl, { zoomControl: true });
  addResilientTiles(map);
  map.setView([16.043, 120.333], 14);
})();

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Human-readable route name
function normRouteName(route) {
  if (!route || typeof route !== "string") return "Gueset";
  const s = route.trim().toLowerCase();
  if (s.startsWith("gue") || s === "gueset" || s === "guest") return "Gueset";
  if (s.startsWith("boq")) return "Boquig";
  if (s.startsWith("lon")) return "Longos";
  if (s.startsWith("bin")) return "Binloc";
  if (s.startsWith("ton")) return "Tondaligan";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Map the route to the icon base file actually present under /icons
function routeAssetBase(route) {
  const n = normRouteName(route);
  if (n === "Gueset") return "Gueset";
  if (n === "Boquig") return "Boquig";
  if (n === "Longos") return "Longos";
  if (n === "Binloc") return "Binloc";
  if (n === "Tondaligan") return "Tondaligan";
  return "Gueset";
}

// Calculate bearing between two points (for direction arrow)
function calcBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// FIXED: Proper bearing state management
function updateBearingState(oldLat, oldLng, newLat, newLng) {
  if (oldLat === newLat && oldLng === newLng) return _lastBearing;
  _lastBearing = calcBearing(oldLat, oldLng, newLat, newLng);
  return _lastBearing;
}

function getLastBearing() {
  return _lastBearing || 0;
}

// -------- Icons (with preload + fallback) --------
let DEFAULT_ICON = null;
function makeDefaultIcon() {
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

function routeIconUrl(route) {
  return `/icons/${routeAssetBase(route)}.png`;
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

async function getJeepIcon(route) {
  try { return await preloadIcon(routeIconUrl(route || "Gueset")); }
  catch { return makeDefaultIcon(); }
}

// Icon placeholders (initialized after Leaflet loads)
let PASSENGER_ICON = null;
let DESTINATION_ICON = null;

// -------- Resolve route for current driver (assignment-first, then profile) --------
let metaCache = { route: "Gueset", _ts: 0 };

async function resolveRoute(uid) {
  const now = Date.now();
  if (now - metaCache._ts < 60_000) return metaCache;

  try {
    const assign = await get(ref(db, `assignments/${uid}`));
    if (assign.exists()) {
      const a = assign.val();
      if (a && a.route) {
        metaCache = { route: normRouteName(a.route), _ts: now };
        return metaCache;
      }
    }
  } catch {}

  try {
    const prof = await get(ref(db, `drivers/${uid}`));
    if (prof.exists()) {
      const d = prof.val();
      metaCache = { route: normRouteName(d.route), _ts: now };
      return metaCache;
    }
  } catch {}

  metaCache = { route: "Gueset", _ts: now };
  return metaCache;
}

// Driver meta for popups
async function getDriverMeta(uid) {
  try {
    const s = await get(ref(db, `drivers/${uid}`));
    if (s.exists()) {
      const d = s.val();
      return {
        name: d.name || `Driver ${uid.slice(0,6)}`,
        plate: d.plate || "N/A"
      };
    }
  } catch {}
  return { name: `Driver ${uid.slice(0,6)}`, plate: "N/A" };
}

// -------- Destination icon (pin) --------
(async function initIcons() {
  try {
    PASSENGER_ICON = await preloadIcon("/icons/passenger.png");
  } catch { PASSENGER_ICON = makeDefaultIcon(); }
  try {
    DESTINATION_ICON = await preloadIcon("/icons/destination.png");
  } catch { DESTINATION_ICON = makeDefaultIcon(); }
})();

// -------- Online window helper --------
function computeOnline(record, windowMs = 30_000) {
  const last = Number(record?.last_update || 0);
  return Date.now() - last <= windowMs;
}

// -------- Geolocation watch --------
let _watchId = null;
let _geoBlocked = false;
let _geoNoticeShown = false;

async function _queryGeoPermission() {
  try {
    if (!('permissions' in navigator)) return null;
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || null;
  } catch { return null; }
}

export async function isGeolocationBlocked() {
  if (_geoBlocked) return true;
  const state = await _queryGeoPermission();
  return state === 'denied';
}

function startWatch(onPoint) {
  if (_watchId != null || _geoBlocked) return;

  _watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      _lastAccuracy = accuracy; // Store accuracy
      console.log(`Geolocation update: ${latitude}, ${longitude} (accuracy: ${accuracy}m)`);
      onPoint(latitude, longitude);
    },
    (err) => {
      if (err?.code === 1) {
        _geoBlocked = true;
        if (!_geoNoticeShown) {
          console.info("Geolocation permission is blocked. Reset it via the site info (lock/tune icon) next to the URL.");
          _geoNoticeShown = true;
        }
        document.dispatchEvent(new CustomEvent('jeepni:geo-denied'));
      } else {
        console.warn('watchPosition error', err);
      }
    },
    { 
      enableHighAccuracy: true, 
      maximumAge: 10000, // Allow slightly cached locations for better performance
      timeout: 15000 // Longer timeout for continuous tracking
    }
  );
}

function stopWatch() {
  if (_watchId != null) {
    try { 
      navigator.geolocation.clearWatch(_watchId); 
      console.log('GPS watch cleared:', _watchId);
    } catch(e) {
      console.warn('Failed to clear watch:', e);
    }
    _watchId = null;
  }
}

// -------- DB writes (privacy for passengers) --------
async function updateLocation(lat, lng, route) {
  const u = auth.currentUser;
  if (!u) return;

  const timestamp = Date.now();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  if (myRole === "passenger") {
    // Keep existing real-time location update
    await update(ref(db, `passengers_location/${u.uid}`), {
      lat, lng,
      companions: companionCount,
      online: true,
      last_update: timestamp
    });

    // Add trip logging - only if actively tracking
    if (passengerTrackingActive) {
      const tripLogRef = ref(db, `passenger_trips/${u.uid}/${today}/${timestamp}`);
      await set(tripLogRef, {
        lat, lng,
        companions: companionCount,
        timestamp: timestamp,
        accuracy: _lastAccuracy || null,
        bearing: getLastBearing()
      });
    }
  }

  if (myRole === "driver") {
    // Keep existing driver location update
    await update(ref(db, `drivers_location/${u.uid}`), {
      lat, lng,
      route: normRouteName(route || "Gueset"),
      bearing: getLastBearing(),
      status: myFullBadge ? "full" : "available",
      online: true,
      last_update: timestamp
    });
  }
}

async function clearPassengerPresence() {
  const u = auth.currentUser;
  if (!u) return;
  await set(ref(db, `passengers_location/${u.uid}`), null);
  await set(ref(db, `passenger_driver_links/${u.uid}`), null);
}

async function clearDriverPresence() {
  const u = auth.currentUser;
  if (!u) return;
  await set(ref(db, `drivers_location/${u.uid}`), null);

  try {
    const links = await get(ref(db, "passenger_driver_links"));
    if (links.exists()) {
      const all = links.val() || {};
      const updates = {};
      for (const [puid, obj] of Object.entries(all)) {
        if (obj && obj.driver_uid === u.uid) updates[puid] = null;
      }
      if (Object.keys(updates).length) {
        await update(ref(db, "passenger_driver_links"), updates);
      }
    }
  } catch {}
}

// -------- Direction Arrow for driver --------
function updateDirectionArrow(lat, lng, bearingDeg) {
  if (!map) return;

  if (myDirectionArrow) map.removeLayer(myDirectionArrow);

  const distMeters = 50;
  const rad = Math.PI / 180;
  const R = 6371000;
  const φ1 = lat * rad;
  const λ1 = lng * rad;
  const brng = (Number(bearingDeg) || 0) * rad;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(distMeters / R) + Math.cos(φ1) * Math.sin(distMeters / R) * Math.cos(brng));
  const λ2 = λ1 + Math.atan2(Math.sin(brng) * Math.sin(distMeters / R) * Math.cos(φ1), Math.cos(distMeters / R) - Math.sin(φ1) * Math.sin(φ2));
  const endLat = φ2 / rad;
  const endLng = λ2 / rad;

  myDirectionArrow = L.polyline(
    [[lat, lng], [endLat, endLng]],
    { color: "#007bff", weight: 4, opacity: 0.8 }
  ).addTo(map);
}

// -------- Capacity Bubble for Drivers --------
function updateCapacityBubble(lat, lng) {
  if (!map || myRole !== "driver") return;
  if (myCapacityBubble) map.removeLayer(myCapacityBubble);

  // Calculate rectangle corners (3m length, 2.35m width)
  const lengthMeters = 3;
  const widthMeters = 2.35;
  
  // Convert meters to degrees (approximate)
  const latOffset = (lengthMeters / 2) / 111320; // 1 degree latitude ≈ 111.32 km
  const lngOffset = (widthMeters / 2) / (111320 * Math.cos(lat * Math.PI / 180));

  const bounds = [
    [lat - latOffset, lng - lngOffset], // Southwest
    [lat + latOffset, lng + lngOffset]  // Northeast
  ];

  myCapacityBubble = L.rectangle(bounds, {
    color: "#ffc107",
    fillColor: "#ffc107",
    fillOpacity: 0.15,
    weight: 2,
    opacity: 0.5
  }).addTo(map);
}

// -------- Geofence Circle for Passengers --------
function updateGeofenceCircle(lat, lng) {
  if (!map || myRole !== "passenger") return;

  if (myGeofenceCircle) map.removeLayer(myGeofenceCircle);

  myGeofenceCircle = L.circle([lat, lng], {
    radius: 30,
    color: "#28a745",
    fillColor: "#28a745",
    fillOpacity: 0.1,
    weight: 2,
    opacity: 0.5
  }).addTo(map);

  checkGeofenceOverlap(lat, lng);
}

function checkGeofenceOverlap(lat, lng) {
  if (!myDestinationMarker) return;
  const destLatLng = myDestinationMarker.getLatLng();
  const distance = map.distance([lat, lng], [destLatLng.lat, destLatLng.lng]);
  if (distance <= 30) {
    window.dispatchEvent(new CustomEvent('jeepni:passenger-arrived'));
    stopPassengerTracking({ reason: 'arrival' });
  }
}

// -------- Stream location + update marker --------
let _roleResolving = false;

async function onGeoPoint(lat, lng) {
  // Resolve role lazily with race condition protection
  if (myRole === "norole" && !_roleResolving) {
    _roleResolving = true;
    try {
      const u = auth.currentUser || await new Promise((res) => {
        const off = auth.onAuthStateChanged((cur) => { off(); res(cur); });
      });
      if (!u) {
        _roleResolving = false;
        return;
      }

      try {
        const roleSnap = await get(ref(db, `all_users/${u.uid}/role`));
        if (roleSnap.exists()) myRole = roleSnap.val();
      } catch {}
      if (myRole === "norole") myRole = "passenger";
    } finally {
      _roleResolving = false;
    }
  }

  // PASSENGER: only if tracking is active
  if (myRole === "passenger") {
    if (!passengerTrackingActive) return;

    // Always ensure marker exists and is updated
    if (!meMarker) {
      // Create marker with badge if it doesn't exist
      const iconWithBadge = createPassengerIcon();
      
      meMarker = L.marker([lat, lng], {
        icon: iconWithBadge,
        zIndexOffset: 1000
      }).addTo(map);
    } else {
      smoothMove(meMarker, lat, lng, 500);
    }

    meMarker.bindPopup(`<strong>Passenger</strong><br>Total: ${companionCount + 1} (You + ${companionCount} companions)`);

    if (map) {
      map.panTo([lat, lng]); // Always center on current position
    }

    updateGeofenceCircle(lat, lng);

    try {
      await updateLocation(lat, lng);
    } catch (e) {
      console.warn("Failed to update passenger location:", e);
    }

    return;
  }

  // DRIVER: Only update if trip is active
  if (myRole === "driver") {
    if (!getActiveTripId()) return;

    // Get route from active trip or current driver location first, then fall back to resolver
    let route = null;
    try {
      const locSnap = await get(ref(db, `drivers_location/${auth.currentUser.uid}`));
      if (locSnap.exists() && locSnap.val().route) {
        route = locSnap.val().route;
      }
    } catch {}
    
    if (!route) {
      const resolved = await resolveRoute(auth.currentUser.uid);
      route = resolved.route;
    }
    
    const oldPos = _lastPos.get(meMarker) || { lat, lng };
    const bearing = updateBearingState(oldPos.lat, oldPos.lng, lat, lng);


    if (!meMarker) {
      const icon = await getJeepIcon(route);
      meMarker = L.marker([lat, lng], { icon, zIndexOffset: 1200 }).addTo(map);
      _lastPos.set(meMarker, { lat, lng });
    } else {
      smoothMove(meMarker, lat, lng, 500);
    }

    updateDirectionArrow(lat, lng, bearing);
    updateCapacityBubble(lat, lng);

    try {
      const u = auth.currentUser;
      if (!u) return;

      const icon = await getJeepIcon(route);
      meMarker.setIcon(icon);

      const driverSnap = await get(ref(db, `drivers/${u.uid}`));
      const driverData = driverSnap.exists() ? driverSnap.val() : {};

      meMarker.bindPopup(`
        <strong>${driverData.name || u.email || "Driver"}</strong><br>
        Route: ${route}<br>
        Plate: ${driverData.plate || "N/A"}<br>
        Status: ${myFullBadge ? "Full" : "Available"}
      `);

      if (myFullBadge) {
        meMarker.bindTooltip("FULL", { permanent: true, direction: "top", className: "full-badge" });
      } else {
        meMarker.unbindTooltip();
      }

      await updateLocation(lat, lng, route);
      checkNearbyPassengers(lat, lng);

    } catch (e) {
      console.warn("Driver tracking update failed:", e);
    }
  }
}

// -------- Create passenger icon with proper badge --------
function createPassengerIcon() {
  // Show badge only if there are companions (companionCount > 0)
  const showBadge = companionCount > 0;
  
  return L.divIcon({
    html: `
      <div style="position: relative; width: 40px; height: 40px;">
        <img src="/icons/passenger.png" style="width: 100%; height: 100%; object-fit: contain;">
        ${showBadge ? `
          <div style="
            position: absolute;
            top: -8px;
            right: -8px;
            background: linear-gradient(135deg, #ff4f81, #ff6b6b);
            color: white;
            border-radius: 50%;
            min-width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            padding: 0 4px;
          ">${companionCount + 1}</div>
        ` : ''}
      </div>
    `,
    className: 'passenger-marker-with-badge',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
}

// -------- Check for passengers in driver's capacity bubble --------
async function checkNearbyPassengers(driverLat, driverLng) {
  if (!map || myRole !== "driver") return;

  try {
    const snap = await get(ref(db, "passengers_location"));
    if (!snap.exists()) return;

    const passengers = snap.val();
    const driverUid = auth.currentUser?.uid;

    // Rectangle dimensions
    const lengthMeters = 3;
    const widthMeters = 2.35;
    const latOffset = (lengthMeters / 2) / 111320;
    const lngOffset = (widthMeters / 2) / (111320 * Math.cos(driverLat * Math.PI / 180));

    for (const [passengerUid, data] of Object.entries(passengers)) {
      if (!data || typeof data.lat !== "number" || typeof data.lng !== "number") continue;

      // Check if passenger is within rectangle bounds
      const inLatBounds = Math.abs(data.lat - driverLat) <= latOffset;
      const inLngBounds = Math.abs(data.lng - driverLng) <= lngOffset;

      if (inLatBounds && inLngBounds) {
        await set(ref(db, `passenger_driver_links/${passengerUid}`), {
          driver_uid: driverUid,
          linked_at: Date.now()
        });
      }
    }
  } catch (e) {
    console.warn("Failed to check nearby passengers:", e);
  }
}

//startWatch(onGeoPoint);

// ===== Show all drivers and passengers (others) =====
const otherDriverMarkers = new Map();
const driverArrows = new Map();
const driverBubbles = new Map();

function removeOtherDriver(uid) {
  try {
    const m = otherDriverMarkers.get(uid);
    if (m) { map.removeLayer(m); otherDriverMarkers.delete(uid); }

    const arrow = driverArrows.get(uid);
    if (arrow) { map.removeLayer(arrow); driverArrows.delete(uid); }

    const bubble = driverBubbles.get(uid);
    if (bubble) { map.removeLayer(bubble); driverBubbles.delete(uid); }
  } catch (e) {
    console.warn(`Failed to remove driver ${uid}:`, e);
  }
}

async function upsertOtherDriver(uid, rec) {
  if (!map || !rec || typeof rec.lat !== "number" || typeof rec.lng !== "number") return;
  const cur = auth.currentUser;
  if (cur && uid === cur.uid) return;

  const online = computeOnline(rec);

  if (!online) {
    removeOtherDriver(uid);
    return;
  }

  const meta = await getDriverMeta(uid);
  const icon = await getJeepIcon(rec.route);

  let m = otherDriverMarkers.get(uid);
  if (!m) {
    m = L.marker([rec.lat, rec.lng], { icon, zIndexOffset: 700 }).addTo(map);
    otherDriverMarkers.set(uid, m);
    _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
  } else {
    smoothMove(m, rec.lat, rec.lng, 500);
    m.setIcon(icon);
    m.setZIndexOffset(700);
  }

  if (rec.status === "full") {
    m.bindTooltip("FULL", { permanent: true, direction: "top", className: "full-badge" });
  } else {
    meMarker.unbindTooltip();
  }

  m.bindPopup(`
    <strong>${meta.name}</strong><br>
    Route: ${normRouteName(rec.route)}<br>
    Plate: ${meta.plate}<br>
    Status: Online
  `);

  if (rec.bearing) {
    const arrowLength = 0.0005;
    const endLat = rec.lat + arrowLength * Math.cos(rec.bearing * Math.PI / 180);
    const endLng = rec.lng + arrowLength * Math.sin(rec.bearing * Math.PI / 180);
    let arrow = driverArrows.get(uid);
    if (arrow) map.removeLayer(arrow);

    arrow = L.polyline(
      [[rec.lat, rec.lng], [endLat, endLng]],
      { color: "#007bff", weight: 3, opacity: 0.6 }
    ).addTo(map);
    driverArrows.set(uid, arrow);
  }

  let bubble = driverBubbles.get(uid);
  if (bubble) map.removeLayer(bubble);

  // Rectangle dimensions matching driver's own bubble
  const lengthMeters = 3;
  const widthMeters = 2.35;
  const latOffset = (lengthMeters / 2) / 111320;
  const lngOffset = (widthMeters / 2) / (111320 * Math.cos(rec.lat * Math.PI / 180));

  const bounds = [
    [rec.lat - latOffset, rec.lng - lngOffset],
    [rec.lat + latOffset, rec.lng + lngOffset]
  ];

  bubble = L.rectangle(bounds, {
    color: "#ffc107",
    fillColor: "#ffc107",
    fillOpacity: 0.1,
    weight: 1,
    opacity: 0.3
  }).addTo(map);
  driverBubbles.set(uid, bubble);
}

function removePassenger(uid) {
  const m = passengerMarkers.get(uid);
  if (!m) return;
  map.removeLayer(m);
  passengerMarkers.delete(uid);
}

const passengerMarkers = new Map();
const linkedPassengers = new Set();

async function upsertPassenger(uid, rec) {
    if (!map || !rec || typeof rec.lat !== "number" || typeof rec.lng !== "number") return;

    // Add this check - only show online passengers
    const online = computeOnline(rec) && rec.online !== false;
    if (!online) {
        removePassenger(uid);
        return;
    }

    try {
        const linkSnap = await get(ref(db, `passenger_driver_links/${uid}`));
        const linked = linkSnap.exists();
        linked ? linkedPassengers.add(uid) : linkedPassengers.delete(uid);

        const cur = auth.currentUser;
        if (linked && cur && cur.uid !== uid) {
            removePassenger(uid);
            return;
        }
    } catch {}

    let m = passengerMarkers.get(uid);
    if (!m) {
      m = L.marker([rec.lat, rec.lng], { icon: PASSENGER_ICON, zIndexOffset: 300 }).addTo(map);
      passengerMarkers.set(uid, m);
      _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
    } else {
      smoothMove(m, rec.lat, rec.lng, 500);
    }

    const comps = Number(rec.companions || 0);
    m.bindPopup(`<strong>Passenger</strong><br>Companions: ${comps}`);
}

// Live feeds
onValue(ref(db, "drivers_location"), async (snap) => {
  const all = snap.exists() ? snap.val() : {};
  const seen = new Set(Object.keys(all));
  for (const uid of Object.keys(all)) await upsertOtherDriver(uid, all[uid] || {});
  for (const [uid] of otherDriverMarkers) if (!seen.has(uid)) removeOtherDriver(uid);
});

onValue(ref(db, "passengers_location"), async (snap) => {
  if (!snap.exists()) return;
  const all = snap.val() || {};
  const seen = new Set(Object.keys(all));
  for (const uid of Object.keys(all)) await upsertPassenger(uid, all[uid] || {});
  for (const [uid] of passengerMarkers) if (!seen.has(uid)) removePassenger(uid);
});

// FIXED: Added listener to force re-evaluation when links change
onValue(ref(db, "passenger_driver_links"), async (snap) => {
  const links = snap.exists() ? snap.val() : {};
  const cur = auth.currentUser;
  
  for (const [passengerUid, linkData] of Object.entries(links)) {
    const isLinkedToMe = linkData && linkData.driver_uid === cur?.uid;
    const isMe = passengerUid === cur?.uid;
    
    if (linkData && !isLinkedToMe && !isMe) {
      removePassenger(passengerUid);
    }
  }
});

// -------- Passenger tracking controls --------
export async function startPassengerTracking(companions = 0) {
  if (myRole !== 'passenger') {
    try {
      const u = auth.currentUser;
      if (u) {
        const roleSnap = await get(ref(db, `all_users/${u.uid}/role`));
        if (roleSnap.exists()) myRole = String(roleSnap.val() || 'passenger');
      }
    } catch {}
    if (myRole !== 'passenger') {
      myRole = 'passenger';
    }
  }

  passengerTrackingActive = true;
  companionCount = Math.max(0, Number(companions) || 0);

  console.log(`Starting passenger tracking with ${companionCount} companions`);

  // Try to get immediate location, but don't wait too long
  let immediateLocation = null;
  try {
    immediateLocation = await getPreciseLocation();
  } catch (error) {
    console.log("Immediate location failed, will use continuous tracking:", error);
  }

  // Create marker immediately - either at precise location or default
  const iconWithBadge = createPassengerIcon();
  
  if (meMarker) {
    map.removeLayer(meMarker);
  }

  if (immediateLocation && immediateLocation.coords) {
    const { latitude, longitude } = immediateLocation.coords;
    console.log(`Immediate location acquired: ${latitude}, ${longitude}`);
    
    meMarker = L.marker([latitude, longitude], {
      icon: iconWithBadge, 
      zIndexOffset: 1000
    }).addTo(map);
    
    // Center map on location
    map.setView([latitude, longitude], 16);
    
    updateGeofenceCircle(latitude, longitude);
    
    try { 
      await updateLocation(latitude, longitude); 
    } catch (e) {
      console.warn("Failed to update location:", e);
    }
  } else {
    // Use default position but don't center - let continuous tracking handle it
    const defaultLat = 16.043;
    const defaultLng = 120.333;
    
    meMarker = L.marker([defaultLat, defaultLng], {
      icon: iconWithBadge, 
      zIndexOffset: 1000
    }).addTo(map);
    
    console.log("Using default position, waiting for continuous tracking...");
  }

  meMarker.bindPopup(`<strong>Passenger</strong><br>Total: ${companionCount + 1} (You + ${companionCount} companions)`);

  // Start continuous tracking
  startWatch(onGeoPoint);
}

// NEW: Function to get precise location with better accuracy
function getPreciseLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    // Use simpler, more reliable geolocation with shorter timeout
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("Location found:", position.coords);
        resolve(position);
      },
      (error) => {
        console.warn("Geolocation failed:", error);
        reject(error);
      },
      { 
        enableHighAccuracy: true,
        timeout: 5000, // Shorter timeout
        maximumAge: 30000 // Allow slightly cached locations for faster response
      }
    );
  });
}

export async function beginPassengerTracking(companions = 0) {
  return startPassengerTracking(companions);
}

export async function stopPassengerTracking(options = {}) {
    if (myRole !== "passenger") return;
    passengerTrackingActive = false;
    companionCount = 0; // Reset companion count when stopping

    // Only remove visual elements from the map
    if (meMarker) { 
        map.removeLayer(meMarker); 
        meMarker = null; 
    }
    if (myGeofenceCircle) { 
        map.removeLayer(myGeofenceCircle); 
        myGeofenceCircle = null; 
    }
    if (myDestinationMarker) { 
        map.removeLayer(myDestinationMarker); 
        myDestinationMarker = null; 
    }

    // Stop geolocation watching
    stopWatch();
    
    // Update online status to false instead of deleting data
    const u = auth.currentUser;
    if (u) {
        await update(ref(db, `passengers_location/${u.uid}`), {
            online: false,
            last_update: Date.now()
        });
    }
    
    window.dispatchEvent(new CustomEvent('jeepni:passenger-tracking-stopped', { 
        detail: { reason: options.reason || 'manual' } 
    }));

    console.log("Passenger tracking stopped - marker removed");
}

export function isPassengerTracking() {
  return passengerTrackingActive;
}

export function setPassengerWaitingCount(count = 0) {
  companionCount = Math.max(0, Number(count) || 0);
  console.log(`Companion count updated to: ${companionCount}`);
  
  if (meMarker && map) {
    const iconWithBadge = createPassengerIcon();
    meMarker.setIcon(iconWithBadge);
    meMarker.bindPopup(`<strong>Passenger</strong><br>Total: ${companionCount + 1} (You + ${companionCount} companions)`);
  }
  
  const u = auth.currentUser;
  if (u && passengerTrackingActive) {
    update(ref(db, `passengers_location/${u.uid}`), { 
      companions: companionCount, 
      last_update: Date.now() 
    });
  }
}

export function setDestination(lat, lng, name = "Destination") {
  if (myDestinationMarker) { map.removeLayer(myDestinationMarker); myDestinationMarker = null; }
  myDestinationMarker = L.marker([lat, lng], { icon: DESTINATION_ICON, zIndexOffset: 400 }).addTo(map);
  myDestinationMarker.bindPopup(`<strong>${name}</strong>`);
}

export function clearDestination() {
  if (myDestinationMarker) { map.removeLayer(myDestinationMarker); myDestinationMarker = null; }
}

// -------- Driver sharing controls --------
let _activeTripId = null;
export function getActiveTripId() { return _activeTripId; }
export function setActiveTripId(v) { _activeTripId = v; }

export async function beginSharing(tripId, assignedRoute = null) {
  if (myRole !== "driver") {
    try {
      const u = auth.currentUser;
      if (u) {
        const roleSnap = await get(ref(db, `all_users/${u.uid}/role`));
        if (roleSnap.exists()) myRole = String(roleSnap.val() || 'driver');
      }
    } catch {}
    if (myRole !== "driver") {
      throw new Error("Drivers only");
    }
  }
  
  _activeTripId = String(tripId || "");
  
  // If route is provided, update it immediately in drivers_location
  if (assignedRoute && auth.currentUser) {
    try {
      await update(ref(db, `drivers_location/${auth.currentUser.uid}`), {
        route: normRouteName(assignedRoute),
        online: true,
        active: true,
        trip_id: _activeTripId,
        last_update: Date.now()
      });
    } catch (e) {
      console.warn('Failed to set initial route:', e);
    }
  }
  
  startWatch(onGeoPoint);
  return true;
}

export async function stopSharing() {
  if (myRole !== "driver") return;
  
  // CRITICAL: Stop geolocation FIRST before any cleanup
  stopWatch();
  
  // Clear trip state immediately to prevent onGeoPoint from recreating marker
  _activeTripId = null;
  
  // Remove ALL driver visual elements from map
  if (meMarker) { 
    try { map.removeLayer(meMarker); } catch(e) { console.warn('meMarker removal:', e); }
    meMarker = null; 
  }
  if (myDirectionArrow) { 
    try { map.removeLayer(myDirectionArrow); } catch(e) { console.warn('arrow removal:', e); }
    myDirectionArrow = null; 
  }
  if (myCapacityBubble) { 
    try { map.removeLayer(myCapacityBubble); } catch(e) { console.warn('bubble removal:', e); }
    myCapacityBubble = null; 
  }
  
  // Clear database presence completely
  await clearDriverPresence();
  
  console.log('Driver sharing stopped - marker removed from map');
}

export function isSharing() {
  return !!_activeTripId;
}

export async function setMyFull(isFull) {
  if (myRole !== "driver") return false;

  myFullBadge = !!isFull;

  if (meMarker) {
    if (myFullBadge) {
      meMarker.bindTooltip("FULL", { permanent: true, direction: "top", className: "full-badge" });
    } else {
      meMarker.unbindTooltip();
    }
  }

  try {
    const u = auth.currentUser;
    if (u && getActiveTripId()) {
      await update(ref(db, `drivers_location/${u.uid}`), {
        full: myFullBadge,
        status: myFullBadge ? "full" : "available",
        last_update: Date.now()
      });
    }
  } catch (e) {
    console.warn("Failed to update driver status:", e);
  }

  return myFullBadge;
}

export function getMyRole() { return myRole; }
export function getMapInstance() { return map; }

// -------- Route Legend Data --------
export const ROUTE_LEGEND = [
  { name: "Gueset", color: "#6c757d", icon: "/icons/Gueset.png" },
  { name: "Boquig", color: "#007bff", icon: "/icons/Boquig.png" },
  { name: "Longos", color: "#28a745", icon: "/icons/Longos.png" },
  { name: "Binloc", color: "#ffc107", icon: "/icons/Binloc.png" },
  { name: "Tondaligan", color: "#dc3545", icon: "/icons/Tondaligan.png" }
];

export function enableManualPassengerMode() {
  if (_manualMode || !map) return;
  _manualMode = true;

  _manualClickHandler = async (e) => {
    if (myRole !== 'passenger' || !passengerTrackingActive) return;
    const { lat, lng } = e.latlng;

    if (!meMarker) {
      meMarker = L.marker([lat, lng], { icon: PASSENGER_ICON, zIndexOffset: 1000 }).addTo(map);
    } else {
      meMarker.setLatLng([lat, lng]);
    }
    meMarker.bindPopup(`<strong>Passenger</strong><br>Companions: ${companionCount}`);
    updateGeofenceCircle(lat, lng);
    try { await updateLocation(lat, lng); } catch {}
  };

  map.on('click', _manualClickHandler);
  document.dispatchEvent(new CustomEvent('jeepni:manual-mode-enabled'));
}

export function disableManualPassengerMode() {
  if (!_manualMode || !map) return;
  map.off('click', _manualClickHandler);
  _manualClickHandler = null;
  _manualMode = false;
  document.dispatchEvent(new CustomEvent('jeepni:manual-mode-disabled'));
}

export function isManualModeActive() {
  return _manualMode;
}

// -------- Just Me mode function --------
export function setJustMeMode() {
  companionCount = 0;
  
  // Force immediate icon update without badge
  if (meMarker && map && passengerTrackingActive) {
    const iconWithoutBadge = createPassengerIcon();
    meMarker.setIcon(iconWithoutBadge);
    meMarker.bindPopup(`<strong>Passenger</strong><br>Just you (no companions)`);
  }
  
  // Update in database
  const u = auth.currentUser;
  if (u && passengerTrackingActive) {
    update(ref(db, `passengers_location/${u.uid}`), { 
      companions: 0,
      last_update: Date.now() 
    });
  }
}

// -------- Utilities --------
export function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { 
      enableHighAccuracy: true, 
      timeout: 10000, 
      maximumAge: 0 
    });
  });
}

// -------- Global API --------
if (typeof window !== "undefined") {
  window.JeepNiTracker = {
    // Driver functions
    beginSharing,
    stopSharing,
    isSharing,
    setMyFull,

    // Passenger functions
    startPassengerTracking,
    beginPassengerTracking,
    stopPassengerTracking,
    isPassengerTracking,
    setPassengerWaitingCount,
    setJustMeMode, // <-- ADD THIS LINE
    setDestination,
    clearDestination,

    // Manual mode functions
    enableManualPassengerMode,
    disableManualPassengerMode,
    isManualModeActive,

    // Common functions
    getCurrentLocation,
    getMyRole,
    getMapInstance,
    startWatch: () => startWatch(onGeoPoint),
    getActiveTripId,
    setActiveTripId,
    isGeolocationBlocked,

    // Route legend
    ROUTE_LEGEND
  };
}