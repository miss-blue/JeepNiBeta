// public/js/code.js
// Handles Firebase Auth action codes (verify email, reset password, etc.)

import { auth } from "./authentication.js";
import {
  applyActionCode,
  checkActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/** Read query param */
export function q(name, url = window.location.href) {
  const u = new URL(url);
  return u.searchParams.get(name) || "";
}

/** Decide which action to perform based on URL query */
export async function handleActionLink(onStatus) {
  // ?mode=verifyEmail|resetPassword|recoverEmail … &oobCode=… &continueUrl=…
  const mode    = q("mode");
  const oobCode = q("oobCode");
  const cont    = q("continueUrl");

  if (!mode || !oobCode) {
    onStatus?.("Missing parameters. Please use a valid link.", "danger");
    return;
  }

  try {
    switch (mode) {
      case "verifyEmail": {
        // Will throw if invalid/expired
        await applyActionCode(auth, oobCode);
        onStatus?.("Email verified successfully. You can now sign in.", "success");
        // Optional: redirect to login automatically after a pause
        setTimeout(() => { window.location.href = cont || "login.html"; }, 1200);
        break;
      }

      case "resetPassword": {
        // First verify the code, then the page should ask for a new password
        const email = await verifyPasswordResetCode(auth, oobCode);
        onStatus?.(`Reset password for: ${email}. Please enter a new password below.`, "info");
        // Return the email so the UI can show it
        return { mode, email, oobCode };
      }

      case "recoverEmail": {
        // If you use recoverEmail, you can inspect info with checkActionCode
        const info = await checkActionCode(auth, oobCode);
        // info.data.email / info.data.fromEmail might be available
        onStatus?.("Email recovery link is valid. Please sign in again.", "success");
        setTimeout(() => { window.location.href = cont || "login.html"; }, 1200);
        break;
      }

      default:
        onStatus?.("Unsupported operation.", "danger");
    }
  } catch (err) {
    onStatus?.(err?.message || "Action link error.", "danger");
  }
}

/** Complete password reset after user types a new password */
export async function doPasswordReset(oobCode, newPassword, onStatus) {
  try {
    await confirmPasswordReset(auth, oobCode, newPassword);
    onStatus?.("Password has been reset. You can now sign in.", "success");
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
  } catch (err) {
    onStatus?.(err?.message || "Failed to reset password.", "danger");
  }
}
