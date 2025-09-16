import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
// re-export selected Firebase helpers for convenience
export { query, orderByChild, equalTo, onAuthStateChanged };

// ---- Update with your real config ----
const firebaseConfig = {
  apiKey: "AIzaSyB7huYA09GqhgGYfMJAOLpdSAeEpE0RiVg",
  authDomain: "jeepni-6b6fb.firebaseapp.com",
  databaseURL: "https://jeepni-6b6fb-default-rtdb.firebaseio.com",
  projectId: "jeepni-6b6fb",
  storageBucket: "jeepni-6b6fb.firebasestorage.app",
  messagingSenderId: "12352485829",
  appId: "1:12352485829:web:fd9f41a85d1f0e178a33ac",
  measurementId: "G-9Z9W2FNZ3E"
};
// --------------------------------------

function _initApp() {
  if (!getApps().length) initializeApp(firebaseConfig);
}
_initApp();

const auth = getAuth();
const db   = getDatabase();

// Role helpers
export async function getRole(uid) {
  const snap = await get(ref(db, `all_users/${uid}/role`));
  return snap.exists() ? snap.val() : "norole";
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
