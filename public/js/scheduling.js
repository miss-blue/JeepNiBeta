// public/js/scheduling.js
// Single source for all "schedules" reads/writes.

import { auth, db, ref, push, set, get, update, serverTimestamp } from "./authentication.js";

/** Format: YYYY-MM-DD (local date) */
export function dateKey(d = new Date()) {
  // use local date (not UTC) so it matches what you see on the UI
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Create a dispatch – call from ADMIN UI only */
export async function createDispatch({
  date = dateKey(),
  dep_time,          // "HH:MM" (string) or timestamp
  route,
  jeep_id,           // plate/unit id
  driver_uid = "",   // may be empty at creation time
  notes = ""
}) {
  if (!auth.currentUser) throw new Error("Not signed in");
  // Rules enforce admin; client just does a basic check.
  const idRef = push(ref(db, `schedules/${date}`));
  const dispatchId = idRef.key;

  const payload = {
    id: dispatchId,
    date,
    dep_time: dep_time || "",
    route: route || "",
    jeep_id: jeep_id || "",
    driver_uid: driver_uid || null,
    status: "pending",                   // pending | accepted | enroute | completed | canceled
    notes: notes || "",
    created_by: auth.currentUser.uid,
    created_at: serverTimestamp(),
    status_by: auth.currentUser.uid,
    status_ts: serverTimestamp(),
    updated_at: serverTimestamp()
  };

  await set(idRef, payload);
  return dispatchId;
}

/** List all dispatches for a day (admin/driver) */
export async function listDispatches(date = dateKey()) {
  const snap = await get(ref(db, `schedules/${date}`));
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.values(data).sort((a, b) => (a.dep_time || "").localeCompare(b.dep_time || ""));
}

/** Assign/change driver – call from ADMIN UI only */
export async function setDriver({ date, dispatchId, driverUid }) {
  if (!auth.currentUser) throw new Error("Not signed in");
  await update(ref(db, `schedules/${date}/${dispatchId}`), {
    driver_uid: driverUid || null,
    updated_at: serverTimestamp()
  });
}

/** Admin set status function */
export async function adminSetStatus({ date, dispatchId, status }) {
  const allowed = ["pending", "accepted", "enroute", "completed", "canceled"];
  if (!allowed.includes(status)) throw new Error("Invalid status");
  if (!auth.currentUser) throw new Error("Not signed in");

  await update(ref(db, `schedules/${date}/${dispatchId}`), {
    status,
    status_by: auth.currentUser.uid,
    status_ts: serverTimestamp(),
    updated_at: serverTimestamp()
  });
}

/** 
 * Driver set status function - for drivers to update their own assignments
 * This was missing and causing imports to fail
 */
export async function setStatus({ date, dispatchId, status }) {
  // Make sure all required parameters are present
  if (!date || !dispatchId || !status) {
    throw new Error("Missing required parameters");
  }

  const allowed = ["assigned", "accepted", "enroute", "completed"];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status for driver. Must be one of: ${allowed.join(', ')}`);
  }

  if (!auth.currentUser) {
    throw new Error("Not signed in");
  }

  // First verify this dispatch belongs to the current driver
  const dispatchSnap = await get(ref(db, `schedules/${date}/${dispatchId}`));
  if (!dispatchSnap.exists()) {
    throw new Error("Dispatch not found");
  }
  
  const dispatch = dispatchSnap.val();
  if (dispatch.driver_uid !== auth.currentUser.uid) {
    throw new Error("You can only update your own assignments");
  }

  await update(ref(db, `schedules/${date}/${dispatchId}`), {
    status,
    status_by: auth.currentUser.uid,
    status_ts: serverTimestamp(),
    updated_at: serverTimestamp()
  });
}

/** For Driver UI: return only my assignments for the day */
export async function myAssignments(date = dateKey()) {
  if (!auth.currentUser) throw new Error("Not signed in");
  const all = await listDispatches(date);
  return all.filter(d => d.driver_uid === auth.currentUser.uid);
}

/**
 * Get a specific dispatch by ID
 * @param {string} date - Date key (YYYY-MM-DD)
 * @param {string} dispatchId - The dispatch ID
 * @returns {Promise<Object|null>} Dispatch data or null if not found
 */
export async function getDispatch(date, dispatchId) {
  const snap = await get(ref(db, `schedules/${date}/${dispatchId}`));
  return snap.exists() ? snap.val() : null;
}

/**
 * Update dispatch notes (admin only)
 * @param {Object} params - Update parameters
 * @param {string} params.date - Date key
 * @param {string} params.dispatchId - Dispatch ID  
 * @param {string} params.notes - New notes
 */
export async function updateDispatchNotes({ date, dispatchId, notes }) {
  if (!auth.currentUser) throw new Error("Not signed in");
  
  await update(ref(db, `schedules/${date}/${dispatchId}`), {
    notes: notes || "",
    updated_at: serverTimestamp()
  });
}

/**
 * Delete a dispatch (admin only)
 * @param {string} date - Date key
 * @param {string} dispatchId - Dispatch ID
 */
export async function deleteDispatch(date, dispatchId) {
  if (!auth.currentUser) throw new Error("Not signed in");
  
  await set(ref(db, `schedules/${date}/${dispatchId}`), null);
}

/**
 * Get driver assignments for a date range
 * @param {string} driverUid - Driver UID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of assignments
 */
export async function getDriverAssignments(driverUid, startDate, endDate) {
  const assignments = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayAssignments = await listDispatches(dateKey);
    const driverAssignments = dayAssignments.filter(a => a.driver_uid === driverUid);
    assignments.push(...driverAssignments);
  }
  
  return assignments;
}