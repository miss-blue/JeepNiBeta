// public/js/create-trip.js
import { startTrip as startTrackedTrip } from "./trip-tracking.js";

/** Backwards compatible trip starter used by legacy dashboards. */
export async function startTrip(route, startLat, startLng, extra = {}) {
  return startTrackedTrip({ route, startLat, startLng, ...extra });
}
