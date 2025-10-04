// public/js/get-active-trip.js
import { auth, db, ref, get, update, serverTimestamp } from "./authentication.js";

/** Return the most recent active trip for the given driver or null. */
export async function getActiveTrip(driverUid = null) {
  const uid = driverUid || auth.currentUser?.uid;
  if (!uid) throw new Error('Driver UID required');

  const todayKey = new Date().toISOString().slice(0, 10);
  const userTripsRef = ref(db, `user_trips/${uid}/${todayKey}`);
  const daySnap = await get(userTripsRef);
  if (!daySnap.exists()) return null;

  const entries = Object.entries(daySnap.val() || {})
    .map(([id, data]) => ({ id, ...data }))
    .filter((item) => item.status === 'active');

  if (!entries.length) return null;

  if (entries.length > 1) {
    entries.sort((a, b) => (a.start?.ts || 0) - (b.start?.ts || 0));
    const latest = entries[entries.length - 1];
    const staleItems = entries.slice(0, -1);
    await Promise.all(staleItems.map(async ({ id }) => {
      try {
        await update(ref(db, `trip_logs/${id}`), { status: 'cancelled', updated_at: serverTimestamp() });
        await update(ref(db, `user_trips/${uid}/${todayKey}/${id}`), { status: 'cancelled', updated_at: serverTimestamp() });
      } catch (err) {
        console.warn('Failed to mark stale trip cancelled', id, err);
      }
    }));
    const logSnap = await get(ref(db, `trip_logs/${latest.id}`));
    if (logSnap.exists()) return { id: latest.id, ...logSnap.val() };
    return latest;
  }

  const active = entries[0];
  const tripSnap = await get(ref(db, `trip_logs/${active.id}`));
  if (tripSnap.exists()) return { id: active.id, ...tripSnap.val() };
  return active;
}
