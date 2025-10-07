import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { firebaseConfig } from "./firebaseConfig.js";

if (!getApps().length) initializeApp(firebaseConfig);

import {
  getAuth, onAuthStateChanged, signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

export { query, orderByChild, equalTo, onAuthStateChanged };

const auth = getAuth();
const db   = getDatabase();

export async function getUserProfile(uid) {
  const snap = await get(ref(db, `all_users/${uid}`));
  return snap.exists() ? snap.val() : null;
}

async function hydrateProfileFromRoleNodes(user, allowedRoles, existingProfile = null) {
  if (!user || !Array.isArray(allowedRoles) || allowedRoles.length === 0) return null;
  const uid = user.uid;
  const base = existingProfile && typeof existingProfile === 'object' ? { ...existingProfile } : {};
  const roleCandidates = Array.from(new Set(allowedRoles.filter((role) => role === 'driver' || role === 'passenger')));
  for (const role of roleCandidates) {
    const node = role === 'driver' ? 'drivers' : 'passengers';
    try {
      const snap = await get(ref(db, `${node}/${uid}`));
      if (!snap.exists()) continue;
      const data = snap.val() || {};
      const merged = { ...data, ...base, role, uid };
      if (!merged.email && user.email) merged.email = user.email;
      if (!merged.name) merged.name = data.name || user.displayName || merged.email || uid;
      try { await update(ref(db, `all_users/${uid}`), merged); } catch (_) {}
      return merged;
    } catch (error) {
      console.warn(`hydrateProfileFromRoleNodes: failed for ${role}`, error);
    }
  }
  return null;
}

// Role
export async function getRole(uid) {
  const profile = await getUserProfile(uid);
  return profile?.role ?? "norole";
}

export function onAuthReady(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function requireLogin(redirectTo = "login.html") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) { location.href = redirectTo; return; }
      resolve(user);
    });
  });
}

export async function requireRole(allowedRoles, options = {}) {
  const {
    redirectTo = "login.html",
    transformRole,
    onDeny,
    missingRoleMessage = "Your account is not fully set up. Please contact support."
  } = options;

  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('allowedRoles must be a non-empty array');
  }

  const user = await requireLogin(redirectTo);

  let profile = await getUserProfile(user.uid).catch((error) => {
    console.error('requireRole: failed to load profile', error);
    return null;
  });
  let role = profile?.role ?? null;

  if (!role) {
    profile = await hydrateProfileFromRoleNodes(user, allowedRoles, profile) || profile;
    role = profile?.role ?? null;
  }

  if (!role) {
    if (typeof window !== 'undefined' && typeof window.alert === 'function' && missingRoleMessage) {
      try { window.alert(missingRoleMessage); } catch (_) {}
    }
    if (typeof onDeny === 'function') {
      try { onDeny({ user, role: null, profile }); } catch (_) {}
    }
    await signOutAndRedirect(redirectTo);
    return new Promise(() => {});
  }

  if (typeof transformRole === 'function') {
    try {
      role = await transformRole(role, user, profile);
    } catch (error) {
      console.warn('requireRole: transformRole error', error);
    }
  }

  if (!allowedRoles.includes(role)) {
    if (typeof onDeny === 'function') {
      try { onDeny({ user, role, profile }); } catch (_) {}
    }
    await signOutAndRedirect(redirectTo);
    return new Promise(() => {});
  }

  try { localStorage.setItem('role', role); } catch (_) {}

  return { user, role, profile };
}

export async function signOutAndRedirect(redirectTo = "login.html") {
  try { await fbSignOut(auth); } catch (_) {}
  localStorage.removeItem("uid");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
  location.href = redirectTo;
}

// Export commonly-used DB utilities so pages can import from here
export {
  auth, db, ref, get, set, update, push, onValue, runTransaction, serverTimestamp
};
