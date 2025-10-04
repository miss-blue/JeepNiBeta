function ensurePassengerCircle() {
  if (!map || passengerCircle) return;
  passengerCircle = L.circle([0, 0], {
    radius: PASSENGER_GEOFENCE_RADIUS_METERS,
    className: "passenger-geofence",
    color: "#0d6efd",
    fillColor: "#0d6efd",
    fillOpacity: 0.08
  }).addTo(map);
}

function clearPassengerCircle() {
  if (passengerCircle && map) {
    map.removeLayer(passengerCircle);
  }
  passengerCircle = null;
}

function updatePassengerCircle(lat, lng) {
  ensurePassengerCircle();
  if (passengerCircle) passengerCircle.setLatLng([lat, lng]);
}

function updateDestinationMarkerOnMap() {
  if (!map || !passengerDestination) return;
  const { lat, lng } = passengerDestination;
  const label = passengerDestinationMeta ? `Destination: ${passengerDestinationMeta}` : "Destination";
  if (!passengerDestinationMarker) {
    passengerDestinationMarker = L.marker([lat, lng], { icon: DESTINATION_ICON, zIndexOffset: 250 });
    passengerDestinationMarker.addTo(map);
  } else {
    passengerDestinationMarker.setLatLng([lat, lng]);
  }
  passengerDestinationMarker.bindPopup(label);
}

function clearDestinationMarker() {
  if (passengerDestinationMarker && map) {
    map.removeLayer(passengerDestinationMarker);
  }
  passengerDestinationMarker = null;
}

function applyDriverStatusTooltip(marker, isFull) {
  if (!marker) return;
  try { marker.unbindTooltip(); } catch (_) {}
  const className = isFull ? "full-badge" : "available-badge";
  const label = isFull ? "FULL" : "Available";
  marker.bindTooltip(label, { permanent: true, direction: "top", className });
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function computeBearing(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  if (x === 0 && y === 0) return NaN;
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function projectPoint(lat, lng, distanceMeters, bearingDeg) {
  const R = 6378137;
  const δ = distanceMeters / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return {
    lat: toDeg(φ2),
    lng: toDeg(λ2)
  };
}

function updateDriverBubbleSelf(lat, lng) {
  if (!map) return;
  if (!getActiveTripId()) {
    if (myDriverBubble) {
      map.removeLayer(myDriverBubble);
      myDriverBubble = null;
    }
    if (myHeadingLine) {
      map.removeLayer(myHeadingLine);
      myHeadingLine = null;
    }
    return;
  }
  if (!myDriverBubble) {
    myDriverBubble = L.circle([lat, lng], { radius: DRIVER_BUBBLE_RADIUS_METERS, className: "driver-bubble" }).addTo(map);
  } else {
    myDriverBubble.setLatLng([lat, lng]);
  }
}

function updateDriverArrowSelf(prev, current) {
  if (!map || !prev || !current || !getActiveTripId()) return;
  const bearing = computeBearing(prev.lat, prev.lng, current.lat, current.lng);
  if (!Number.isFinite(bearing)) return;
  const target = projectPoint(current.lat, current.lng, DRIVER_ARROW_LENGTH_METERS, bearing);
  const latLngs = [
    [current.lat, current.lng],
    [target.lat, target.lng]
  ];
  if (!myHeadingLine) {
    myHeadingLine = L.polyline(latLngs, { color: "#0d6efd", weight: 4, opacity: 0.6 });
    myHeadingLine.addTo(map);
  } else {
    myHeadingLine.setLatLngs(latLngs);
  }
}

function clearMyDriverOverlays() {
  if (myDriverBubble && map) {
    map.removeLayer(myDriverBubble);
    myDriverBubble = null;
  }
  if (myHeadingLine && map) {
    map.removeLayer(myHeadingLine);
    myHeadingLine = null;
  }
}

function updateDriverBubbleForOther(uid, lat, lng, active) {
  if (!map) return;
  const existing = otherDriverBubbles.get(uid);
  if (!active) {
    if (existing) {
      map.removeLayer(existing);
      otherDriverBubbles.delete(uid);
    }
    return;
  }
  if (!existing) {
    const circle = L.circle([lat, lng], { radius: DRIVER_BUBBLE_RADIUS_METERS, className: "driver-bubble" }).addTo(map);
    otherDriverBubbles.set(uid, circle);
  } else {
    existing.setLatLng([lat, lng]);
  }
}

function updateDriverArrowForOther(uid, prev, current, active) {
  if (!map) return;
  const existing = otherDriverArrows.get(uid);
  if (!active || !prev) {
    if (existing) {
      map.removeLayer(existing);
      otherDriverArrows.delete(uid);
    }
    return;
  }
  const bearing = computeBearing(prev.lat, prev.lng, current.lat, current.lng);
  if (!Number.isFinite(bearing)) return;
  const target = projectPoint(current.lat, current.lng, DRIVER_ARROW_LENGTH_METERS, bearing);
  const latLngs = [
    [current.lat, current.lng],
    [target.lat, target.lng]
  ];
  if (!existing) {
    const line = L.polyline(latLngs, { color: "#0d6efd", weight: 3, opacity: 0.5 });
    line.addTo(map);
    otherDriverArrows.set(uid, line);
  } else {
    existing.setLatLngs(latLngs);
  }
}
function maybeHandlePassengerArrival(lat, lng) {
  if (!map || !isPassengerTracking || !passengerDestination) return;
  const distance = map.distance([lat, lng], [passengerDestination.lat, passengerDestination.lng]);
  if (Number.isFinite(distance) && distance <= PASSENGER_GEOFENCE_RADIUS_METERS) {
    handlePassengerArrival();
  }
}

async function handlePassengerArrival() {
  if (!isPassengerTracking) return;
  try {
    await stopPassengerTracking({ reason: "arrival" });
  } catch (error) {
    console.warn("Passenger arrival stop failed", error);
  }
  try {
    window.dispatchEvent(new CustomEvent("jeepni:passenger-arrived"));
  } catch (_) {}
}

async function linkPassengersWithinBubble(lat, lng, driverUid) {
  if (!map || !driverUid) return;
  if (!getActiveTripId()) return;
  if (myFull) return;

  for (const [uid, rec] of passengerRecords) {
    if (!rec || typeof rec.lat !== "number" || typeof rec.lng !== "number") continue;
    if (uid === driverUid) continue;
    if (rec.linked_driver && rec.linked_driver !== driverUid) continue;
    const distance = map.distance([lat, lng], [rec.lat, rec.lng]);
    if (!Number.isFinite(distance) || distance > DRIVER_BUBBLE_RADIUS_METERS) continue;
    await linkPassengerToDriver(uid, rec, driverUid);
  }
}

async function linkPassengerToDriver(uid, rec, driverUid) {
  if (!driverUid) return;
  if (rec?.linked_driver === driverUid) {
    linkedPassengers.add(uid);
    removePassenger(uid);
    return;
  }
  if (linkedPassengers.has(uid)) return;
  try {
    await update(ref(db, `passengers_location/${uid}`), {
      linked_driver: driverUid,
      linked_at: Date.now()
    });
    linkedPassengers.add(uid);
    removePassenger(uid);
  } catch (error) {
    console.warn("linkPassengerToDriver failed", error);
  }
}
export function setPassengerWaitingCount(count) {
  passengerWaitingCount = sanitizeWaitingCount(count);
  if (isPassengerTracking && auth.currentUser && lastPoint) {
    const { latitude, longitude, accuracy } = lastPoint.coords;
    syncPassengerLocation(auth.currentUser, latitude, longitude, { accuracy }).catch(() => {});
  }
  if (meMarker && myRole === "passenger") {
    meMarker.bindPopup(`Passenger<br>Companions: ${passengerWaitingCount}`);
  }
}

export function setPassengerDestination(point) {
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    passengerDestination = { lat: point.lat, lng: point.lng };
    passengerDestinationMeta = typeof point.name === "string" ? point.name : null;
    updateDestinationMarkerOnMap();
    if (isPassengerTracking && auth.currentUser && lastPoint) {
      const { latitude, longitude, accuracy } = lastPoint.coords;
      syncPassengerLocation(auth.currentUser, latitude, longitude, { accuracy }).catch(() => {});
    }
  } else {
    passengerDestination = null;
    passengerDestinationMeta = null;
    clearDestinationMarker();
  }
}

async function syncPassengerLocation(user, lat, lng, meta = {}) {
  if (!user) return;
  const now = Date.now();
  const payload = {
    lat,
    lng,
    waiting: passengerWaitingCount,
    online: isPassengerTracking,
    last_update: now
  };
  if (passengerDestination) payload.destination = passengerDestination;
  if (passengerLinkedDriver) payload.linked_driver = passengerLinkedDriver;
  if (Number.isFinite(meta.accuracy)) payload.accuracy = meta.accuracy;
  try {
    await set(ref(db, `passengers_location/${user.uid}`), payload);
  } catch (error) {
    console.warn("syncPassengerLocation failed", error);
  }
}

export async function beginPassengerTracking(options = {}) {
  const { waiting } = options;
  if (waiting !== undefined) setPassengerWaitingCount(waiting);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  passengerLinkedDriver = null;
  isPassengerTracking = true;
  lastPassengerSync = 0;
  updateDestinationMarkerOnMap();
  if (lastPoint) {
    const { latitude, longitude, accuracy } = lastPoint.coords;
    await syncPassengerLocation(user, latitude, longitude, { accuracy });
    updatePassengerCircle(latitude, longitude);
    if (meMarker && map && !map.hasLayer(meMarker)) {
      meMarker.addTo(map);
    }
  }
}

export async function stopPassengerTracking(options = {}) {
  const reason = options?.reason || null;
  isPassengerTracking = false;
  passengerLinkedDriver = null;
  const user = auth.currentUser || await getCurrentUser().catch(() => null);
  if (user) {
    try {
      await set(ref(db, `passengers_location/${user.uid}`), null);
    } catch (error) {
      console.warn("stopPassengerTracking cleanup failed", error);
    }
    passengerRecords.delete(user.uid);
  }
  clearPassengerCircle();
  passengerDestination = null;
  passengerDestinationMeta = null;
  clearDestinationMarker();
  if (meMarker && map && myRole === "passenger" && map.hasLayer(meMarker)) {
    map.removeLayer(meMarker);
  }
  window.dispatchEvent(new CustomEvent("jeepni:passenger-tracking-stopped", { detail: { reason } }));
}

async function onGeoPoint(lat, lng) {
  if (!map) return;

  const user = await getCurrentUser();
  if (!user) return;

  if (!meMarker) {
    meMarker = L.marker([lat, lng], {
      icon: makeDefaultIcon(),
      zIndexOffset: 1000
    }).bindPopup("Locating...");
  }

  const previous = lastSelfLatLng ? { ...lastSelfLatLng } : null;

  try {
    if (myRole === "norole") {
      try {
        const rs = await get(ref(db, `all_users/${user.uid}/role`));
        if (rs.exists()) myRole = String(rs.val() || "norole").toLowerCase();
      } catch (_) {}
      if (myRole === "norole") {
        try {
          const driverSnap = await get(ref(db, `drivers/${user.uid}`));
          myRole = driverSnap.exists() ? "driver" : "passenger";
        } catch (_) {
          myRole = "passenger";
        }
      }
    }

    let meta = null;
    const shouldShowMarker = myRole !== "passenger" || isPassengerTracking;

    if (myRole === "passenger") {
      meMarker.setIcon(PASSENGER_ICON);
      meMarker.setZIndexOffset(1000);
      meMarker.bindPopup(`Passenger<br>Companions: ${passengerWaitingCount}`);
    } else {
      meta = await resolveRouteAndType(user.uid);
      const icon = await getJeepIcon(meta.route, meta.type);
      meMarker.setIcon(icon);
      meMarker.setZIndexOffset(1000);
      meMarker.bindPopup(`${meta.route} - ${meta.type === "traditional" ? "Traditional" : "Modern"}`);
      applyDriverStatusTooltip(meMarker, myFull);
    }

    if (shouldShowMarker) {
      if (!map.hasLayer(meMarker)) meMarker.addTo(map);
      smoothMove(meMarker, lat, lng, 500);
    } else {
      if (map.hasLayer(meMarker)) map.removeLayer(meMarker);
      meMarker.setLatLng([lat, lng]);
      _lastPos.set(meMarker, { lat, lng });
    }

    if (map) {
      const bounds = map.getBounds();
      if (!bounds.contains([lat, lng])) {
        map.panTo([lat, lng]);
      }
    }

    if (myRole === "passenger") {
      if (isPassengerTracking) {
        updatePassengerCircle(lat, lng);
        maybeHandlePassengerArrival(lat, lng);
        const now = Date.now();
        const accuracy = lastPoint && lastPoint.coords ? lastPoint.coords.accuracy : undefined;
        if (now - lastPassengerSync >= PASSENGER_SYNC_INTERVAL_MS) {
          lastPassengerSync = now;
          await syncPassengerLocation(user, lat, lng, { accuracy });
        }
      } else {
        clearPassengerCircle();
      }
    } else if (meta) {
      updateDriverBubbleSelf(lat, lng);
      if (getActiveTripId()) {
        await updateLocation(lat, lng, meta.route);
      }
      updateDriverArrowSelf(previous, { lat, lng });
      await linkPassengersWithinBubble(lat, lng, user.uid);
    }
  } catch (error) {
    console.warn("tracking update failed:", error);
  }

  lastSelfLatLng = { lat, lng };
}

startWatch(onGeoPoint);
function computeOnline(rec) {
  const now = Date.now();
  const last = typeof rec?.last_update === "number" ? rec.last_update : (rec?.last_update?._serverTimestamp || 0);
  return !!rec?.online && now - last < 150000;
}

const driverMetaCache = new Map();
async function getDriverMeta(uid) {
  if (driverMetaCache.has(uid)) return driverMetaCache.get(uid);
  try {
    const snap = await get(ref(db, `drivers/${uid}`));
    const v = snap.exists() ? snap.val() : {};
    const meta = {
      name: v.name || v.email || uid.slice(0, 8),
      type: (v.type || "modern").toLowerCase(),
      plate: v.plate || v.plate_number || v.plateNo || ""
    };
    driverMetaCache.set(uid, meta);
    return meta;
  } catch {
    const meta = { name: uid.slice(0, 8), type: "modern", plate: "" };
    driverMetaCache.set(uid, meta);
    return meta;
  }
}

async function upsertOtherDriver(uid, rec) {
  if (!map || !rec || typeof rec.lat !== "number" || typeof rec.lng !== "number") return;
  const cur = auth.currentUser;
  if (cur && uid === cur.uid) return;

  const meta = await getDriverMeta(uid);
  const icon = await getJeepIcon(rec.route, meta.type);
  const online = computeOnline(rec);
  let marker = otherDriverMarkers.get(uid);
  if (!marker) {
    marker = L.marker([rec.lat, rec.lng], { icon, zIndexOffset: online ? 700 : 200 }).addTo(map);
    otherDriverMarkers.set(uid, marker);
  } else {
    smoothMove(marker, rec.lat, rec.lng, 500);
    marker.setIcon(icon);
    marker.setZIndexOffset(online ? 700 : 200);
  }
  marker.setOpacity(online ? 1 : 0.55);
  const statusLabel = rec.full ? "FULL" : (online ? "Available" : "Offline");
  const plate = meta.plate ? meta.plate : "Unavailable";
  marker.bindPopup(
    `<strong>${meta.name}</strong><br>ID: ${uid.slice(0, 8)}<br>Route: ${norm(rec.route)}<br>Status: ${statusLabel}<br>Plate: ${plate}`
  );
  applyDriverStatusTooltip(marker, rec.full === true);

  const active = !!rec.active;
  updateDriverBubbleForOther(uid, rec.lat, rec.lng, active);
  const prev = driverLastPositions.get(uid);
  updateDriverArrowForOther(uid, prev, { lat: rec.lat, lng: rec.lng }, active);
  driverLastPositions.set(uid, { lat: rec.lat, lng: rec.lng });
}

function removeOtherDriver(uid) {
  const marker = otherDriverMarkers.get(uid);
  if (marker && map) {
    map.removeLayer(marker);
  }
  otherDriverMarkers.delete(uid);

  const circle = otherDriverBubbles.get(uid);
  if (circle && map) {
    map.removeLayer(circle);
  }
  otherDriverBubbles.delete(uid);

  const line = otherDriverArrows.get(uid);
  if (line && map) {
    map.removeLayer(line);
  }
  otherDriverArrows.delete(uid);

  driverLastPositions.delete(uid);
}

function upsertPassenger(uid, rec) {
  passengerRecords.set(uid, rec);
  const currentUser = auth.currentUser;

  if (currentUser && uid === currentUser.uid) {
    passengerLinkedDriver = rec?.linked_driver || null;
    return;
  }

  if (rec?.linked_driver) {
    removePassenger(uid);
    return;
  }

  if (!map || typeof rec.lat !== "number" || typeof rec.lng !== "number") return;

  let marker = passengerMarkers.get(uid);
  if (!marker) {
    marker = L.marker([rec.lat, rec.lng], { icon: PASSENGER_ICON, zIndexOffset: 300 }).addTo(map);
    passengerMarkers.set(uid, marker);
  } else {
    smoothMove(marker, rec.lat, rec.lng, 500);
  }

  const companions = Number.isFinite(Number(rec.waiting)) ? Math.max(1, Math.round(Number(rec.waiting))) : 1;
  const label = `Passenger With You: ${companions}`;
  marker.bindPopup(`<strong>Passenger</strong><br>${label}`);
}

function removePassenger(uid) {
  passengerRecords.delete(uid);
  linkedPassengers.delete(uid);
  const marker = passengerMarkers.get(uid);
  if (!marker) return;
  if (map) map.removeLayer(marker);
  passengerMarkers.delete(uid);
}
onValue(ref(db, "drivers_location"), async (snap) => {
  const all = snap.exists() ? snap.val() : {};
  const seen = new Set(Object.keys(all));
  for (const uid of Object.keys(all)) {
    await upsertOtherDriver(uid, all[uid] || {});
  }
  for (const uid of Array.from(otherDriverMarkers.keys())) {
    if (!seen.has(uid)) removeOtherDriver(uid);
  }
});

onValue(ref(db, "passengers_location"), (snap) => {
  const all = snap.exists() ? snap.val() || {} : {};
  const seen = new Set(Object.keys(all));
  for (const uid of Object.keys(all)) {
    upsertPassenger(uid, all[uid] || {});
  }
  for (const uid of Array.from(passengerMarkers.keys())) {
    if (!seen.has(uid)) removePassenger(uid);
  }
  for (const uid of Array.from(passengerRecords.keys())) {
    if (!seen.has(uid)) {
      passengerRecords.delete(uid);
      linkedPassengers.delete(uid);
    }
  }
  const currentUser = auth.currentUser;
  if (currentUser && !seen.has(currentUser.uid)) {
    passengerLinkedDriver = null;
  }
});

export async function beginSharing() {
  const user = await getCurrentUser();
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
  linkedPassengers.clear();
  return tripId;
}

export async function stopSharing({ completed = true } = {}) {
  const center = map ? map.getCenter() : { lat: null, lng: null };
  try {
    await endTrip({
      endLat: center.lat,
      endLng: center.lng,
      completed
    });
  } finally {
    setActiveTripId(null);
    clearMyDriverOverlays();
    linkedPassengers.clear();
  }
}

export function isSharing() {
  return !!getActiveTripId();
}

export function getCurrentLocation() {
  return lastPoint ? {
    lat: lastPoint.coords.latitude,
    lng: lastPoint.coords.longitude,
    accuracy: lastPoint.coords.accuracy,
    timestamp: lastPoint.timestamp
  } : null;
}

if (typeof window !== "undefined") {
  window.JeepNiTracker = {
    beginSharing,
    stopSharing,
    beginPassengerTracking,
    stopPassengerTracking,
    setPassengerWaitingCount,
    setPassengerDestination,
    isSharing,
    getCurrentLocation,
    startWatch: () => startWatch(onGeoPoint),
    stopWatch,
    getActiveTripId,
    setActiveTripId,
    setMyFull: (flag) => {
      myFull = !!flag;
      myFullBadge = myFull;
      if (meMarker && myRole !== "passenger") {
        applyDriverStatusTooltip(meMarker, myFull);
      }
      return myFull;
    }
  };
}
