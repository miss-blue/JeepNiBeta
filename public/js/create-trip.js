// public/js/create-trip.js
import { auth, db, ref, set, serverTimestamp } from "./authentication.js";

/** Start a trip for current user (driver or passenger), at a given route */
export async function startTrip(route, startLat, startLng) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const uid  = user.uid;
  const now  = new Date();
  const ymd  = now.toISOString().slice(0,10); // YYYY-MM-DD

  const tripRef = ref(db, `trip_logs/${uid}/${ymd}`);
  // Store a simple shape; adjust fields to your exact schema if needed
  await set(tripRef, {
    route,
    start: { lat: startLat, lng: startLng, ts: Date.now() },
    status: "active",
    created_at: now.toISOString()
  });

  // optional: update driver’s live location record
  await set(ref(db, `drivers_location/${uid}`), {
    route,
    lat: startLat, lng: startLng,
    online: true,
    last_update: serverTimestamp()
  });
}
