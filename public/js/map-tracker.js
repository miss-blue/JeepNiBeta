// public/js/map-tracker.js
// Enhanced driver & passenger tracking with all requested features
// FIXED: Instant precise location and companion count display

// -------- Imports --------
import { auth, db, ref, get, set, update, onValue, push, serverTimestamp } from "./authentication.js";
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
let _lastAccuracy = null;

let _manualMode = false;
let _manualClickHandler = null;
let routing = null; // retained for backwards compatibility (legacy control)
let routingTarget = null;
let lastRoutingOrigin = null;
let lastRoutingTarget = null;
const ROUTE_POS_EPSILON = 5e-5; // ~5 meters, reduces noisy re-routes
const ROUTE_DEVIATION_TOLERANCE_METERS = 35;
const ROUTE_MIN_PROGRESS_DELTA = 0.05;
const ROUTE_BUFFER_KM = 0.08;
let activeRouteLine = null;
let routePolyline = null;
let routeShadowPolyline = null;
let lastRouteProgressMetric = -1;
let latestRouteRequestId = 0;
let routeEngine = null;
let routeProviderIndex = 0;
let lastRoutingNoticeAt = 0;
let routeFallbackActive = false;
let lastRoutingFailureAt = 0;
const ROUTING_PROVIDERS = Object.freeze([
  {
    name: 'Self-hosted OSRM',
    serviceUrl: 'http://188.166.216.44:5000/route/v1'
  },
  {
    name: 'OSRM Demo',
    serviceUrl: 'https://router.project-osrm.org/route/v1'
  },
  {
    name: 'OSM De Routing',
    serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1'
  }
]);
const ROUTING_FAILURE_COOLDOWN_MS = 60_000;

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
const GEO_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 12000
});

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
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    console.warn('Geolocation not supported on this device.');
    return;
  }

  try {
    _watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        _lastAccuracy = accuracy;
        _geoBlocked = false;
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
        if (_watchId != null) {
          stopWatch();
        }
      },
      GEO_OPTIONS
    );
  } catch (err) {
    console.warn('Failed to start geolocation watch:', err);
    _watchId = null;
  }
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
      
      // Update tracking state with latest location
      await saveTrackingState('passenger', { 
        companions: companionCount,
        location: { lat, lng }
      });
    }
  }

  if (myRole === "driver") {
    // Keep existing driver location update
    const tripId = _activeTripId || null;
    const normalizedRoute = normRouteName(route || "Gueset");

    await update(ref(db, `drivers_location/${u.uid}`), {
      lat, lng,
      route: normalizedRoute,
      bearing: getLastBearing(),
      status: myFullBadge ? "full" : "available",
      full: myFullBadge,
      online: true,
      active: true,
      trip_id: tripId,
      last_update: timestamp
    });

    if (tripId && Number.isFinite(lat) && Number.isFinite(lng)) {
      try {
        const locRef = push(ref(db, `trip_logs/${tripId}/locations`));
        await set(locRef, {
          lat,
          lng,
          ts: serverTimestamp()
        });
      } catch (err) {
        console.warn("Failed to append trip log point:", err);
      }
    }
    
    // Update tracking state with latest location
    if (tripId) {
      await saveTrackingState('driver', { 
        tripId,
        route: normalizedRoute || null,
        location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined
      });
    }
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

// -------- Geofence Circle Bubble for Passengers Passenger Bubble --------
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

// --------  passenger reached destination --------

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

    const popupText = companionCount === 0 
      ? `<strong>Passenger</strong><br>Just you (no companions)`
      : `<strong>Passenger</strong><br>Total: ${companionCount + 1} (You + ${companionCount} companion${companionCount > 1 ? 's' : ''})`;
    meMarker.bindPopup(popupText);
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

      if (routingTarget) {
        updateRouteProgress(lat, lng);
      }
    } catch (e) {
      console.warn("Driver tracking update failed:", e);
    }
  }
}


// -------- Create passenger icon with proper badge --------
function createPassengerIcon() {
  const showBadge = companionCount > 0;
  const totalCount = companionCount;
  
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
          ">+${totalCount}</div>
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

  if (rec.status === "full" || rec.full === true) {
    m.bindTooltip("FULL", { permanent: true, direction: "top", className: "full-badge" });
  } else {
    m.unbindTooltip();
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

    const currentUser = auth.currentUser;
    if (currentUser && currentUser.uid === uid) {
        removePassenger(uid);
        return;
    }

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

        if (linked && currentUser && currentUser.uid !== uid) {
            removePassenger(uid);
            return;
        }
    } catch {}

    const comps = Number(rec.companions || 0);
    const totalCount = comps;
    const showBadge = comps > 0;
    
    // Create custom icon with badge for other passengers
    const otherPassengerIcon = L.divIcon({
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
            ">+${totalCount}</div>
          ` : ''}
        </div>
      `,
      className: 'passenger-marker-with-badge',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });

    let m = passengerMarkers.get(uid);
    if (!m) {
      m = L.marker([rec.lat, rec.lng], { icon: otherPassengerIcon, zIndexOffset: 300 }).addTo(map);
      passengerMarkers.set(uid, m);
      _lastPos.set(m, { lat: rec.lat, lng: rec.lng });
    } else {
      smoothMove(m, rec.lat, rec.lng, 500);
      m.setIcon(otherPassengerIcon); // Update icon when companion count changes
    }

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
//passenger tracking controls
export async function startPassengerTracking(companions = 0) {
  const requestedCompanions = Math.max(0, Number(companions) || 0);

  if (myRole !== 'passenger') {
    try {
      const u = auth.currentUser;
      if (u) {
        const roleSnap = await get(ref(db, `all_users/${u.uid}/role`));
        if (roleSnap.exists()) myRole = String(roleSnap.val() || 'passenger');
      }
    } catch (err) {
      console.warn('Failed to resolve role for passenger tracking:', err);
    }
    if (myRole !== 'passenger') {
      myRole = 'passenger';
    }
  }

  if (passengerTrackingActive) {
    if (requestedCompanions !== companionCount) {
      setPassengerWaitingCount(requestedCompanions);
    }
    if (_watchId == null && !_geoBlocked) {
      startWatch(onGeoPoint);
    }
    return;
  }

  passengerTrackingActive = true;
  companionCount = requestedCompanions;

  console.log(`Starting passenger tracking with ${companionCount} companions`);

  // Save tracking state for persistence
  await saveTrackingState('passenger', { companions: companionCount });

  // Try to get immediate location so the first marker placement is accurate
  let immediateLocation = null;
  try {
    immediateLocation = await getPreciseLocation();
  } catch (error) {
    console.log("Immediate location failed, will use continuous tracking:", error);
  }

  const iconWithBadge = createPassengerIcon();
  const defaultLatLng = [16.043, 120.333];

  if (!meMarker) {
    const startingLatLng = immediateLocation?.coords
      ? [immediateLocation.coords.latitude, immediateLocation.coords.longitude]
      : defaultLatLng;
    meMarker = L.marker(startingLatLng, {
      icon: iconWithBadge,
      zIndexOffset: 1000
    }).addTo(map);
  } else {
    meMarker.setIcon(iconWithBadge);
    if (!map.hasLayer(meMarker)) {
      meMarker.addTo(map);
    }
  }

  const applyLocation = async (latitude, longitude) => {
    meMarker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], 16);
    updateGeofenceCircle(latitude, longitude);
    try {
      await updateLocation(latitude, longitude);
    } catch (e) {
      console.warn("Failed to update location:", e);
    }
  };

  if (immediateLocation?.coords) {
    const { latitude, longitude } = immediateLocation.coords;
    console.log(`Immediate location acquired: ${latitude}, ${longitude}`);
    await applyLocation(latitude, longitude);
  } else {
    console.log("Using default position, waiting for continuous tracking...");
    updateGeofenceCircle(defaultLatLng[0], defaultLatLng[1]);
  }

  refreshPassengerMarkerView();

  // Start continuous GPS tracking (idempotent inside startWatch)
  startWatch(onGeoPoint);

  if (routingTarget && meMarker) {
    const myPos = meMarker.getLatLng();
    ensureRouting({ lat: myPos.lat, lng: myPos.lng }, routingTarget);
  } else if (myDestinationMarker && meMarker) {
    const destPos = myDestinationMarker.getLatLng();
    const myPos = meMarker.getLatLng();
    routingTarget = { lat: destPos.lat, lng: destPos.lng };
    ensureRouting({ lat: myPos.lat, lng: myPos.lng }, routingTarget);
  }
}

// NEW: Function to get precise location with better accuracy
function getPreciseLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Location found:", position.coords);
          resolve(position);
        },
        (error) => {
          console.warn("Geolocation failed:", error);
          reject(error);
        },
        GEO_OPTIONS
      );
    } catch (err) {
      reject(err);
    }
  });
}

export async function beginPassengerTracking(companions = 0) {
  return startPassengerTracking(companions);
}

export async function stopPassengerTracking(options = {}) {
    if (myRole !== "passenger") return;
    passengerTrackingActive = false;
    companionCount = 0; // Reset companion count when stopping
    
    // Clear tracking state
    await clearTrackingState();

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
    
    // Ensure routing artefacts are cleared
    clearRoute({ removeControl: true });
    
    // Clear pending destination
    if (typeof window !== 'undefined') {
        window._pendingDestination = null;
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

    console.log("Passenger tracking stopped - marker and routing removed");
}

export function isPassengerTracking() {
  return passengerTrackingActive;
}

function refreshPassengerMarkerView() {
  if (!meMarker || !map) return;
  meMarker.setIcon(createPassengerIcon());
  const popupText = companionCount === 0
    ? `<strong>Passenger</strong><br>Just you (no companions)`
    : `<strong>Passenger</strong><br>Companions: ${companionCount}`;
  meMarker.bindPopup(popupText);
}

export function setPassengerWaitingCount(count = 0) {
  const newCount = Math.max(0, Number(count) || 0);
  companionCount = newCount;
  console.log(`Companion count updated to: ${companionCount}`);

  if (passengerTrackingActive) {
    refreshPassengerMarkerView();
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
  const destLat = Number(lat);
  const destLng = Number(lng);

  if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
    console.warn('Invalid destination coordinates provided:', lat, lng);
    return;
  }

  if (myDestinationMarker) {
    map.removeLayer(myDestinationMarker);
    myDestinationMarker = null;
  }

  myDestinationMarker = L.marker([destLat, destLng], { icon: DESTINATION_ICON, zIndexOffset: 400 }).addTo(map);
  myDestinationMarker.bindPopup(`<strong>${name}</strong>`);

  routingTarget = { lat: destLat, lng: destLng };

  if (meMarker) {
    const pos = meMarker.getLatLng();
    ensureRouting({ lat: pos.lat, lng: pos.lng }, routingTarget);
  }

  if (typeof window !== 'undefined') {
    window._pendingDestination = { lat: destLat, lng: destLng, name };
  }
}

export function clearDestination() {
  if (myDestinationMarker) {
    map.removeLayer(myDestinationMarker);
    myDestinationMarker = null;
  }
  clearRoute();
  if (typeof window !== 'undefined') {
    window._pendingDestination = null;
  }
}

// -------- Driver sharing controls --------
let _activeTripId = null;
export function getActiveTripId() { return _activeTripId; }
export function setActiveTripId(v) { _activeTripId = v; }

function isTrackingActive() {
  return passengerTrackingActive || !!_activeTripId;
}

// Persistence tracking state
const TRACKING_STATE_KEY = 'tracking_state';

export function getLastKnownLocation() {
  if (meMarker) {
    const pos = meMarker.getLatLng();
    return { lat: pos.lat, lng: pos.lng };
  }
  try {
    const cached = localStorage.getItem(TRACKING_STATE_KEY);
    if (cached) {
      const state = JSON.parse(cached);
      if (state?.location && Number.isFinite(state.location.lat) && Number.isFinite(state.location.lng)) {
        return { lat: state.location.lat, lng: state.location.lng };
      }
    }
  } catch (_) {}
  return null;
}

async function saveTrackingState(role, data) {
  const u = auth.currentUser;
  if (!u) return;
  
  // Include current location if available
  let currentLocation = null;
  if (meMarker) {
    const pos = meMarker.getLatLng();
    currentLocation = { lat: pos.lat, lng: pos.lng };
  }
  
  const state = {
    role,
    active: true,
    timestamp: Date.now(),
    location: currentLocation,
    ...data
  };
  
  try {
    await set(ref(db, `active_tracking/${u.uid}`), state);
    localStorage.setItem(TRACKING_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save tracking state:', e);
  }
}

async function clearTrackingState() {
  const u = auth.currentUser;
  if (!u) return;
  
  try {
    await set(ref(db, `active_tracking/${u.uid}`), null);
    localStorage.removeItem(TRACKING_STATE_KEY);
  } catch (e) {
    console.warn('Failed to clear tracking state:', e);
  }
}

export async function getTrackingState() {
  const u = auth.currentUser;
  if (!u) return null;
  
  try {
    const snap = await get(ref(db, `active_tracking/${u.uid}`));
    if (snap.exists()) {
      return snap.val();
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(TRACKING_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to get tracking state:', e);
  }
  
  return null;
}

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
  
  // Save tracking state for persistence
  await saveTrackingState('driver', { 
    tripId: _activeTripId, 
    route: assignedRoute ? normRouteName(assignedRoute) : null 
  });
  
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
  
  console.log('stopSharing called - removing driver marker');
  
  // CRITICAL: Stop geolocation FIRST before any cleanup
  stopWatch();
  
  // Clear trip state immediately to prevent onGeoPoint from recreating marker
  _activeTripId = null;
  
  // Clear tracking state
  await clearTrackingState();
  
  // Remove ALL driver visual elements from map
  if (meMarker) { 
    try { 
      console.log('Removing driver marker (meMarker)');
      map.removeLayer(meMarker); 
    } catch(e) { 
      console.warn('meMarker removal failed:', e); 
    }
    meMarker = null; 
  }
  if (myDirectionArrow) { 
    try { 
      console.log('Removing direction arrow');
      map.removeLayer(myDirectionArrow); 
    } catch(e) { 
      console.warn('arrow removal failed:', e); 
    }
    myDirectionArrow = null; 
  }
  if (myCapacityBubble) { 
    try { 
      console.log('Removing capacity bubble');
      map.removeLayer(myCapacityBubble); 
    } catch(e) { 
      console.warn('bubble removal failed:', e); 
    }
    myCapacityBubble = null; 
  }
  if (myDestinationMarker) {
    try { 
      console.log('Removing destination marker');
      map.removeLayer(myDestinationMarker); 
    } catch(e) { 
      console.warn('destination removal failed:', e); 
    }
    myDestinationMarker = null;
  }
  
  clearRoute({ removeControl: true });
  
  // Clear database presence completely
  await clearDriverPresence();
  
  console.log('Driver sharing stopped - all markers removed from map');
}

export function isSharing() {
  return !!_activeTripId;
}

export async function setMyFull(isFull) {
  if (myRole !== "driver") return false;

  myFullBadge = !!isFull;

  // Update marker tooltip immediately if marker exists
  if (meMarker) {
    if (myFullBadge) {
      meMarker.bindTooltip("FULL", { permanent: true, direction: "top", className: "full-badge" });
    } else {
      meMarker.unbindTooltip();
    }
  }

  // ALWAYS update database so the status persists
  try {
    const u = auth.currentUser;
    if (u) {
      const locSnap = await get(ref(db, `drivers_location/${u.uid}`));
      
      if (locSnap.exists()) {
        // Update existing location record
        await update(ref(db, `drivers_location/${u.uid}`), {
          full: myFullBadge,
          status: myFullBadge ? "full" : "available",
          last_update: Date.now()
        });
      } else {
        // Create initial record with full status (no location yet)
        await set(ref(db, `drivers_location/${u.uid}`), {
          full: myFullBadge,
          status: myFullBadge ? "full" : "available",
          online: false,
          last_update: Date.now()
        });
      }
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
  if (passengerTrackingActive) {
    refreshPassengerMarkerView();
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    try {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), GEO_OPTIONS);
    } catch (err) {
      console.warn('getCurrentLocation failed:', err);
      resolve(null);
    }
  });
}

function positionsDiffer(a, b) {
  if (!a || !b) return true;
  return Math.abs(a.lat - b.lat) > ROUTE_POS_EPSILON || Math.abs(a.lng - b.lng) > ROUTE_POS_EPSILON;
}

function emitRoutingNotice(level, message) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastRoutingNoticeAt < 15000) return;
  lastRoutingNoticeAt = now;
  try {
    window.dispatchEvent(new CustomEvent('jeepni:routing-notice', {
      detail: { level, message }
    }));
  } catch (err) {
    console.warn('Failed to emit routing notice:', err, message);
  }
}

function instantiateRoutingEngine(index = 0) {
  const provider = ROUTING_PROVIDERS[index];
  if (!provider) {
    routeEngine = null;
    return null;
  }
  try {
    routeEngine = L.Routing.osrmv1({
      serviceUrl: provider.serviceUrl,
      profile: "driving",
      timeout: 30 * 1000,
      useHints: true
    });
    routeProviderIndex = index;
    console.info(`Routing engine initialised via ${provider.name} (${provider.serviceUrl})`);
    return routeEngine;
  } catch (err) {
    console.warn(`Failed to initialise routing engine for ${provider.name}:`, err);
    routeEngine = null;
    return null;
  }
}

function getRouteEngine() {
  if (routeEngine) return routeEngine;
  const now = Date.now();
  if (routeFallbackActive && (now - lastRoutingFailureAt) < ROUTING_FAILURE_COOLDOWN_MS) {
    return null;
  }
  if (routeFallbackActive && (now - lastRoutingFailureAt) >= ROUTING_FAILURE_COOLDOWN_MS) {
    routeFallbackActive = false;
    routeProviderIndex = 0;
  }
  return instantiateRoutingEngine(routeProviderIndex);
}

function switchRoutingProvider() {
  const nextIndex = routeProviderIndex + 1;
  if (nextIndex >= ROUTING_PROVIDERS.length) return false;
  const provider = ROUTING_PROVIDERS[nextIndex];
  emitRoutingNotice('warning', `Primary routing server timed out. Switching to ${provider.name}.`);
  instantiateRoutingEngine(nextIndex);
  return !!routeEngine;
}

function clearRouteDisplay() {
  if (!map) return;
  if (routePolyline) {
    try { map.removeLayer(routePolyline); } catch {}
    routePolyline = null;
  }
  if (routeShadowPolyline) {
    try { map.removeLayer(routeShadowPolyline); } catch {}
    routeShadowPolyline = null;
  }
}

function updateRouteDisplay(latLngs) {
  if (!map || !Array.isArray(latLngs) || latLngs.length < 2) return;

  if (!routeShadowPolyline) {
    routeShadowPolyline = L.polyline(latLngs, {
      color: "#13315c",
      weight: 8,
      opacity: 0.18,
      lineJoin: "round",
      lineCap: "round",
      smoothFactor: 1.2
    }).addTo(map);
  } else {
    routeShadowPolyline.setLatLngs(latLngs);
  }

  if (!routePolyline) {
    routePolyline = L.polyline(latLngs, {
      color: "#ff5a5f",
      weight: 5,
      opacity: 0.95,
      lineJoin: "round",
      lineCap: "round",
      smoothFactor: 1.2
    }).addTo(map);
  } else {
    routePolyline.setLatLngs(latLngs);
  }

  if (routeShadowPolyline?.bringToBack) routeShadowPolyline.bringToBack();
  if (routePolyline?.bringToFront) routePolyline.bringToFront();
}

function setActiveRouteFromCoordinates(coordsLatLng) {
  if (!Array.isArray(coordsLatLng) || coordsLatLng.length < 2) {
    activeRouteLine = null;
    clearRouteDisplay();
    return;
  }
  try {
    activeRouteLine = turf.lineString(coordsLatLng.map(([lat, lng]) => [lng, lat]));
    lastRouteProgressMetric = -1;
  } catch (err) {
    console.warn("Failed to create route line:", err);
    activeRouteLine = null;
    clearRouteDisplay();
  }
}

function trimActiveRoute(lat, lng) {
  if (!activeRouteLine) return null;
  try {
    const point = turf.point([lng, lat]);
    const snapped = turf.nearestPointOnLine(activeRouteLine, point, { units: "meters" });
    const coords = activeRouteLine.geometry?.coordinates;
    if (!snapped || !coords || coords.length === 0) return null;

    const index = typeof snapped.properties?.index === "number" ? snapped.properties.index : 0;
    const trimmed = coords.slice(index);
    if (!trimmed.length) return null;

    trimmed[0] = snapped.geometry.coordinates;
    const progress = index + (typeof snapped.properties?.t === "number" ? snapped.properties.t : 0);
    lastRouteProgressMetric = Math.max(progress, lastRouteProgressMetric);

    return trimmed;
  } catch (err) {
    console.warn("trimActiveRoute failed:", err);
    return null;
  }
}

function updateRouteProgress(currentLat, currentLng) {
  if (!routingTarget) return;

  if (!activeRouteLine) {
    ensureRouting({ lat: currentLat, lng: currentLng }, routingTarget, { force: true });
    return;
  }

  try {
    const point = turf.point([currentLng, currentLat]);
    const deviation = turf.pointToLineDistance(point, activeRouteLine, { units: "meters" });

    if (deviation > ROUTE_DEVIATION_TOLERANCE_METERS) {
      ensureRouting({ lat: currentLat, lng: currentLng }, routingTarget, { force: true });
      return;
    }

    const trimmed = trimActiveRoute(currentLat, currentLng);
    if (trimmed && trimmed.length >= 2) {
      const latLngs = trimmed.map(([lng, lat]) => [lat, lng]);
      updateRouteDisplay(latLngs);
    } else if (trimmed) {
      clearRouteDisplay();
    }
  } catch (err) {
    console.warn("updateRouteProgress failed:", err);
  }
}

function handleRoutingFailure(origin, target, contextMessage) {
  lastRoutingFailureAt = Date.now();
  routeFallbackActive = true;
  routeEngine = null;
  routeProviderIndex = 0;
  const notice = contextMessage || 'Routing service is temporarily unavailable. We will retry shortly.';
  emitRoutingNotice('warning', notice);
  if (!activeRouteLine) {
    clearRouteDisplay();
  }
}

// -------- Routing functionality --------
function ensureRouting(meLatLng, targetLatLng, options = {}) {
  if (!map || !targetLatLng) return;

  const force = options?.force === true;
  const retryDepth = Number(options?.retryDepth || 0);

  const origin = {
    lat: Number(meLatLng.lat),
    lng: Number(meLatLng.lng)
  };
  const target = {
    lat: Number(targetLatLng.lat),
    lng: Number(targetLatLng.lng)
  };

  if (![origin.lat, origin.lng, target.lat, target.lng].every(Number.isFinite)) return;

  const shouldUpdate =
    force ||
    !activeRouteLine ||
    positionsDiffer(origin, lastRoutingOrigin) ||
    positionsDiffer(target, lastRoutingTarget);

  if (!shouldUpdate) {
    updateRouteProgress(origin.lat, origin.lng);
    return;
  }

  const now = Date.now();
  if (routeFallbackActive && (now - lastRoutingFailureAt) < ROUTING_FAILURE_COOLDOWN_MS) {
    if (!activeRouteLine) {
      clearRouteDisplay();
    }
    return;
  }

  lastRoutingOrigin = origin;
  lastRoutingTarget = target;
  const engine = getRouteEngine();
  if (!engine) {
    handleRoutingFailure(origin, target, 'Routing service is busy. Trying again soon.');
    return;
  }

  const requestId = ++latestRouteRequestId;

  engine.route(
    [
      L.Routing.waypoint(L.latLng(origin.lat, origin.lng)),
      L.Routing.waypoint(L.latLng(target.lat, target.lng))
    ],
    (err, routes) => {
      if (requestId !== latestRouteRequestId) return;
      if (err) {
        const provider = ROUTING_PROVIDERS[routeProviderIndex];
        console.warn(`Routing failed via ${provider?.name || 'provider'}:`, err);
        if (switchRoutingProvider() && retryDepth < ROUTING_PROVIDERS.length) {
          latestRouteRequestId += 1;
          ensureRouting(origin, target, { force: true, retryDepth: retryDepth + 1 });
        } else {
          handleRoutingFailure(origin, target, 'Routing service timed out. Retrying shortly.');
        }
        return;
      }
      if (!routes || !routes.length) {
        if (switchRoutingProvider() && retryDepth < ROUTING_PROVIDERS.length) {
          latestRouteRequestId += 1;
          ensureRouting(origin, target, { force: true, retryDepth: retryDepth + 1 });
        } else {
          handleRoutingFailure(origin, target, 'Routing data unavailable from the server right now.');
        }
        return;
      }

      try {
        const route = routes[0];
        const coordsLatLng = route.coordinates.map((p) => [p.lat, p.lng]);

        setActiveRouteFromCoordinates(coordsLatLng);
        routeFallbackActive = false;
        lastRoutingFailureAt = 0;

        const trimmed = trimActiveRoute(origin.lat, origin.lng);
        const displayCoords = trimmed && trimmed.length >= 2
          ? trimmed.map(([lng, lat]) => [lat, lng])
          : coordsLatLng.map(([lat, lng]) => [lat, lng]);

        updateRouteDisplay(displayCoords);

        if (activeRouteLine) {
          try {
            const corridor = turf.buffer(activeRouteLine, ROUTE_BUFFER_KM, { units: "kilometers" });
            refreshPassengersAlongRoute(corridor);
          } catch (corridorErr) {
            console.warn("Failed to refresh passengers along route:", corridorErr);
          }
        }

        if (route.summary) {
          const meters = Math.round(route.summary.totalDistance || 0);
          const seconds = Math.round(route.summary.totalTime || 0);
          window.dispatchEvent(new CustomEvent("jeepni:eta", { detail: { meters, seconds } }));
        }
      } catch (routeErr) {
        console.warn("Failed to process route response:", routeErr);
      }
    }
  );
}

export function routeTo(targetLat, targetLng) {
  routingTarget = { lat: Number(targetLat), lng: Number(targetLng) };
  if (meMarker) {
    const me = meMarker.getLatLng();
    ensureRouting({ lat: me.lat, lng: me.lng }, routingTarget);
  }
}

function clearRoute({ removeControl = false } = {}) {
  latestRouteRequestId += 1; // invalidate pending callbacks
  routingTarget = null;
  lastRoutingOrigin = null;
  lastRoutingTarget = null;
  activeRouteLine = null;
  lastRouteProgressMetric = -1;
  clearRouteDisplay();
}

function refreshPassengersAlongRoute(geojsonPolygon) {
  passengerMarkers.forEach((marker, uid) => {
    const latlng = marker.getLatLng();
    const pt = turf.point([latlng.lng, latlng.lat]);
    const inside = turf.booleanPointInPolygon(pt, geojsonPolygon);
    if (!inside) {
      try { map.removeLayer(marker); } catch {}
      passengerMarkers.delete(uid);
    }
  });
}

// -------- Global API --------
// -------- Auto-resume tracking --------
export async function autoResumeTracking() {
  const state = await getTrackingState();
  if (!state || !state.active) return false;
  
  const u = auth.currentUser;
  if (!u) return false;
  
  // Set myRole from saved state to prevent race conditions
  myRole = state.role || 'norole';
  
  console.log('Auto-resuming tracking from saved state:', state);
  
  if (state.role === 'passenger') {
    // Restore passenger tracking
    passengerTrackingActive = true;
    companionCount = state.companions || 0;
    
    // Restore marker at last known location if available
    if (state.location) {
      const iconWithBadge = createPassengerIcon();
      if (meMarker) map.removeLayer(meMarker);
      
      meMarker = L.marker([state.location.lat, state.location.lng], {
        icon: iconWithBadge,
        zIndexOffset: 1000
      }).addTo(map);
      
      const popupText = companionCount === 0 
        ? `<strong>Passenger</strong><br>Just you (no companions)`
        : `<strong>Passenger</strong><br>Total: ${companionCount + 1} (You + ${companionCount} companion${companionCount > 1 ? 's' : ''})`;
      meMarker.bindPopup(popupText);
      
      map.setView([state.location.lat, state.location.lng], 16);
      updateGeofenceCircle(state.location.lat, state.location.lng);
    }
    
    // Start GPS tracking
    startWatch(onGeoPoint);
    return true;
    
  } else if (state.role === 'driver') {
    if (state.tripId) {
      _activeTripId = state.tripId;
      
      // Restore marker at last known location if available
      if (state.location && state.route) {
        const icon = await getJeepIcon(state.route);
        if (meMarker) map.removeLayer(meMarker);
        
        meMarker = L.marker([state.location.lat, state.location.lng], {
          icon,
          zIndexOffset: 1200
        }).addTo(map);
        
        _lastPos.set(meMarker, { lat: state.location.lat, lng: state.location.lng });
        map.setView([state.location.lat, state.location.lng], 16);
        
        updateDirectionArrow(state.location.lat, state.location.lng, getLastBearing());
        updateCapacityBubble(state.location.lat, state.location.lng);
      }
      
      // Start GPS tracking
      startWatch(onGeoPoint);
      return true;
    }
  }
  
  return false;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isTrackingActive() && _watchId == null && !_geoBlocked) {
      startWatch(onGeoPoint);
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    stopWatch();
  });

  window.addEventListener('pageshow', (event) => {
    const shouldResume = event?.persisted || document.visibilityState === 'visible';
    if (shouldResume && isTrackingActive() && _watchId == null && !_geoBlocked) {
      startWatch(onGeoPoint);
    }
  });
}

// -------- Global API --------
if (typeof window !== "undefined") {
  window.JeepNiTracker = {
    // Driver functions
    beginSharing,
    stopSharing,
    isSharing,
    getLastKnownLocation,
    setMyFull,

    // Passenger functions
    startPassengerTracking,
    beginPassengerTracking,
    stopPassengerTracking,
    isPassengerTracking,
    setPassengerWaitingCount,
    setJustMeMode, 
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
    ROUTE_LEGEND,

    // Routing
    routeTo,
    
    // Auto-resume
    autoResumeTracking,
    getTrackingState
  };
}
