// public/js/admin_auth.js
// Admin-only guards built on top of authentication.js

import { auth, db, ref, get, onAuthReady, requireLogin, getRole, signOutAndRedirect } from "./authentication.js";

export async function requireAdmin(redirectIfNotAdmin = "login.html") {
  const user = await requireLogin(redirectIfNotAdmin);
  const role = await getRole(user.uid);
  if (role !== "admin" && role !== "super_admin") {
    // Optional: show a message page or redirect
    alert("Access denied. Admins only.");
    await signOutAndRedirect("login.html");
    throw new Error("Admin required");
  }
  return { user, role };
}

export function attachAdminBadge(elSelector = "#adminInfo") {
  onAuthReady(async (user) => {
    const el = document.querySelector(elSelector);
    if (!el) return;
    if (!user) { el.textContent = "Not signed in"; return; }
    const role = await getRole(user.uid);
    el.textContent = `${user.email} (${role})`;
  });
}
