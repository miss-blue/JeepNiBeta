// public/js/admin_auth.js
// Admin-only guards built on top of authentication.js

import { onAuthReady, requireRole, getRole } from "./authentication.js";

export async function requireAdmin(redirectIfNotAdmin = "login.html") {
  return requireRole(['admin'], {
    redirectTo: redirectIfNotAdmin,
    onDeny: () => alert("Access denied. Admins only.")
  });
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

