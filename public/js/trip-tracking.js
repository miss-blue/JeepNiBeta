import { auth, db, ref, push, set, update, serverTimestamp, get } from "./authentication.js";

const ACTIVE_TRIP_STORAGE_KEY = 'active_trip_id';

/** Dispatch a toast event if UI provides handlers. */
function emitToast(message, variant = 'danger') {
  try {
    if (typeof window !== 'undefined') {
      if (typeof window.showToast === 'function') {
        window.showToast(message, variant);
        return;
      }
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, variant } }));
    }
  } catch (_) {}
  console.error(message);
}

/** Persist the current active trip id locally. */
function storeActiveTripId(tripId) {
  try {
    if (tripId) {
      localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, tripId);
    } else {
      localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Failed storing active trip id:', err);
  }
}

/** Read the cached active trip id if any. */
function getStoredTripId() {
  try {
    return localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY) || null;
  } catch (_) {
    return null;
  }
}

/** Remove any cached active trip id. */
function clearStoredTripId() {
  storeActiveTripId(null);
}

/** Compute haversine distance in meters between two coordinates. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((n) => Number.isFinite(n))) return 0;
  const rad = (deg) => deg * Math.PI / 180;
  const R = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Normalize optional coordinates into numbers or null. */
function normalizeCoordinate(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Start a new trip for the current driver and return the trip id. */
export async function startTrip({ route = '', startLat = null, startLng = null, jeep = 'modern', notes = '' } = {}) {
  const user = auth.currentUser;
  if (!user) {
    emitToast('You must be signed in to start a trip.');
    throw new Error('Not signed in');
  }

  const tripRef = push(ref(db, 'trip_logs'));
  const tripId = tripRef.key;
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const lat = normalizeCoordinate(startLat);
  const lng = normalizeCoordinate(startLng);

  const skeleton = {
    trip_id: tripId,
    driver_uid: user.uid,
    route,
    jeepney_type: (jeep || 'modern').toLowerCase(),
    notes: notes || '',
    status: 'active',
    date: dateKey,
    start: {
      lat,
      lng,
      ts: serverTimestamp()
    },
    distance_m: 0,
    duration_ms: 0,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  try {
    await set(tripRef, skeleton);
    await set(ref(db, `user_trips/${user.uid}/${dateKey}/${tripId}`), {
      trip_id: tripId,
      driver_uid: user.uid,
      route: skeleton.route,
      jeepney_type: skeleton.jeepney_type,
      status: skeleton.status,
      start: skeleton.start,
      distance_m: 0,
      duration_ms: 0,
      date: dateKey,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
    await set(ref(db, `drivers_location/${user.uid}`), {
      route: skeleton.route,
      lat,
      lng,
      online: true,
      active: true,
      trip_id: tripId,
      last_update: serverTimestamp()
    });
    storeActiveTripId(tripId);
    return tripId;
  } catch (error) {
    emitToast('Failed to start trip. Please try again.');
    clearStoredTripId();
    throw error;
  }
}

/** Append a point to the trip log and update live location. */
export async function updateLocation(lat, lng, route) {
  const user = auth.currentUser;
  if (!user) {
    emitToast('You must be signed in to share your location.');
    throw new Error('Not signed in');
  }

  const tripId = getStoredTripId();
  if (!tripId) {
    emitToast('No active trip found; please start a trip first.');
    return;
  }

  const normalizedLat = normalizeCoordinate(lat);
  const normalizedLng = normalizeCoordinate(lng);
  const path = ref(db, `drivers_location/${user.uid}`);

  try {
    await update(path, {
      lat: normalizedLat,
      lng: normalizedLng,
      route: route || null,
      online: true,
      active: true,
      trip_id: tripId,
      last_update: serverTimestamp()
    });

    if (normalizedLat !== null && normalizedLng !== null) {
      const locRef = push(ref(db, `trip_logs/${tripId}/locations`));
      await set(locRef, {
        lat: normalizedLat,
        lng: normalizedLng,
        ts: serverTimestamp()
      });
    }
  } catch (error) {
    emitToast('Unable to sync location. Check your connection.');
    throw error;
  }
}

/** Finalize an active trip, computing metrics and clearing presence. */
export async function endTrip({ tripId = null, endLat = null, endLng = null, completed = true } = {}) {
  const user = auth.currentUser;
  if (!user) {
    emitToast('You must be signed in to stop a trip.');
    throw new Error('Not signed in');
  }

  const activeTripId = tripId || getStoredTripId();
  if (!activeTripId) {
    emitToast('No active trip to stop.');
    throw new Error('No active trip');
  }

  const tripRef = ref(db, `trip_logs/${activeTripId}`);
  const tripSnap = await get(tripRef);
  if (!tripSnap.exists()) {
    clearStoredTripId();
    emitToast('Trip record not found; it may have been removed.');
    return;
  }

  const trip = tripSnap.val() || {};
  const dateKey = trip.date || new Date().toISOString().slice(0, 10);
  const normalizedLat = normalizeCoordinate(endLat);
  const normalizedLng = normalizeCoordinate(endLng);

  try {
    if (normalizedLat !== null && normalizedLng !== null) {
      const locRef = push(ref(db, `trip_logs/${activeTripId}/locations`));
      await set(locRef, {
        lat: normalizedLat,
        lng: normalizedLng,
        ts: serverTimestamp(),
        kind: 'end'
      });
    }

    const locationsSnap = await get(ref(db, `trip_logs/${activeTripId}/locations`));
    const points = [];
    if (locationsSnap.exists()) {
      const raw = locationsSnap.val() || {};
      for (const value of Object.values(raw)) {
        const latVal = normalizeCoordinate(value?.lat);
        const lngVal = normalizeCoordinate(value?.lng);
        if (latVal !== null && lngVal !== null) {
          points.push({ lat: latVal, lng: lngVal, ts: value?.ts || null });
        }
      }
    }

    let distance = 0;
    for (let i = 1; i < points.length; i += 1) {
      distance += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }

    const startTs = typeof trip.start?.ts === 'number' ? trip.start.ts : Date.now();
    const duration = Math.max(0, Date.now() - startTs);

    const updates = {
      status: completed ? 'completed' : 'cancelled',
      end: {
        lat: normalizedLat,
        lng: normalizedLng,
        ts: serverTimestamp()
      },
      ended_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      distance_m: Math.round(distance),
      duration_ms: duration
    };

    await update(tripRef, updates);
    await update(ref(db, `user_trips/${user.uid}/${dateKey}/${activeTripId}`), updates);
    await set(ref(db, `drivers_location/${user.uid}`), null);
    clearStoredTripId();
  } catch (error) {
    emitToast('Failed to finalize trip. Please retry.');
    throw error;
  }
}

/** Look up the active trip record for the signed-in driver. */
export async function getActiveTrip() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const tripId = getStoredTripId();
  if (tripId) {
    const snap = await get(ref(db, `trip_logs/${tripId}`));
    if (snap.exists()) {
      const data = snap.val();
      if (data?.status === 'active') return { id: tripId, ...data };
      clearStoredTripId();
    } else {
      clearStoredTripId();
    }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const daySnap = await get(ref(db, `user_trips/${user.uid}/${todayKey}`));
  if (!daySnap.exists()) return null;

  const trips = Object.entries(daySnap.val() || {})
    .map(([id, val]) => ({ id, ...val }))
    .filter((val) => val.status === 'active');

  if (!trips.length) return null;
  if (trips.length > 1) {
    trips.sort((a, b) => (a.start?.ts || 0) - (b.start?.ts || 0));
    const newest = trips[trips.length - 1];
    for (let i = 0; i < trips.length - 1; i += 1) {
      const staleId = trips[i].id;
      try {
        await update(ref(db, `trip_logs/${staleId}`), { status: 'cancelled', updated_at: serverTimestamp() });
        await update(ref(db, `user_trips/${user.uid}/${todayKey}/${staleId}`), { status: 'cancelled', updated_at: serverTimestamp() });
      } catch (err) {
        console.warn('Failed to auto-close stale trip', staleId, err);
      }
    }
    storeActiveTripId(newest.id);
    return newest;
  }

  storeActiveTripId(trips[0].id);
  return trips[0];
}

/** Backwards compatible helper that forwards to startTrip. */
export async function createTrip(route, startLat, startLng) {
  return startTrip({ route, startLat, startLng });
}
