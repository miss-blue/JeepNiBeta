// public/js/get-active-trip.js
import { auth, db, ref, get } from "./authentication.js";

/** Return today's trip object if it's marked active */
export async function getActiveTrip() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const uid = user.uid;
  const ymd = new Date().toISOString().slice(0,10);
  const snap = await get(ref(db, `trip_logs/${uid}/${ymd}`));
  if (!snap.exists()) return null;

  const data = snap.val();
  return data?.status === "active" ? data : null;
}
