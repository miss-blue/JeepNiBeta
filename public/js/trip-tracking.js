import { auth, db, ref, push, set, update, serverTimestamp, get } from "./authentication.js";
/**
 * Start a new trip - creates a trip record and returns trip ID
 * @param {Object} tripData - Trip configuration
 * @param {string} tripData.route - The route name
 * @param {number} tripData.startLat - Starting latitude
 * @param {number} tripData.startLng - Starting longitude  
 * @param {string} tripData.jeep - Jeepney type (modern/traditional)
 * @param {string} tripData.notes - Optional notes
 * @returns {Promise<string>} The trip ID
 */
export async function startTrip({ route, startLat, startLng, jeep, notes = "" }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  // Generate unique trip ID
  const tripRef = push(ref(db, "trip_logs"));
  const tripId = tripRef.key;
  
  const tripData = {
    id: tripId,
    driver_uid: user.uid,
    route: route,
    jeepney_type: jeep,
    status: "active",
    start: {
      lat: startLat,
      lng: startLng,
      ts: serverTimestamp()
    },
    notes: notes,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  // Store trip data
  await set(tripRef, tripData);

  // Update driver's live location
  await set(ref(db, `drivers_location/${user.uid}`), {
    route: route,
    lat: startLat,
    lng: startLng,
    online: true,
    trip_id: tripId,
    last_update: serverTimestamp()
  });

  // Also store in user-specific path for easy querying
  const dateKey = new Date().toISOString().slice(0, 10);
  await set(ref(db, `user_trips/${user.uid}/${dateKey}/${tripId}`), {
    ...tripData,
    date: dateKey
  });

  return tripId;
}

/**
 * Update location during an active trip
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude  
 * @param {string} route - Current route
 * @returns {Promise<void>}
 */
export async function updateLocation(lat, lng, route) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  // Update driver's live location for map display
  await update(ref(db, `drivers_location/${user.uid}`), {
    lat: lat,
    lng: lng,
    route: route,
    online: true,
    last_update: serverTimestamp()
  });

  // Get active trip ID from localStorage or query database
  const activeTripId = localStorage.getItem("active_trip_id");
  if (!activeTripId) {
    console.warn("No active trip ID found");
    return;
  }

  // Add location point to trip log
  const locationRef = push(ref(db, `trip_logs/${activeTripId}/locations`));
  await set(locationRef, {
    lat: lat,
    lng: lng,
    ts: serverTimestamp()
  });

  // Update trip's last known position
  await update(ref(db, `trip_logs/${activeTripId}`), {
    last_location: {
      lat: lat,
      lng: lng,
      ts: serverTimestamp()
    },
    updated_at: serverTimestamp()
  });
}

/**
 * End an active trip
 * @param {Object} endData - Trip ending data
 * @param {number} endData.endLat - Ending latitude
 * @param {number} endData.endLng - Ending longitude
 * @param {boolean} endData.completed - Whether trip was completed successfully
 * @returns {Promise<void>}
 */
export async function endTrip({ endLat, endLng, completed = true }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const activeTripId = localStorage.getItem("active_trip_id");
  if (!activeTripId) throw new Error("No active trip found");

  // Update trip with end data
  await update(ref(db, `trip_logs/${activeTripId}`), {
    status: completed ? "completed" : "cancelled",
    end: {
      lat: endLat,
      lng: endLng,
      ts: serverTimestamp()
    },
    ended_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });

  // Update driver location to offline
  await update(ref(db, `drivers_location/${user.uid}`), {
    online: false,
    trip_id: null,
    last_update: serverTimestamp()
  });

  // Clear active trip from localStorage
  localStorage.removeItem("active_trip_id");
}

/**
 * Get current active trip for user
 * @returns {Promise<Object|null>} Active trip data or null
 */
export async function getActiveTrip() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const activeTripId = localStorage.getItem("active_trip_id");
  if (!activeTripId) return null;

  try {
    const snap = await get(ref(db, `trip_logs/${activeTripId}`));
    if (!snap.exists()) {
      // Clean up stale localStorage
      localStorage.removeItem("active_trip_id");
      return null;
    }

    const tripData = snap.val();
    return tripData?.status === "active" ? tripData : null;
  } catch (error) {
    console.error("Error getting active trip:", error);
    return null;
  }
}

/**
 * Alternative startTrip function for backward compatibility
 * @param {string} route - Route name
 * @param {number} startLat - Starting latitude  
 * @param {number} startLng - Starting longitude
 * @returns {Promise<string>} The trip ID
 */
export async function createTrip(route, startLat, startLng) {
  return await startTrip({
    route,
    startLat,
    startLng, 
    jeep: "modern",
    notes: ""
  });
}