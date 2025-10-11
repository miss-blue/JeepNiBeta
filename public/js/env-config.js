// public/js/env-config.js
// Lightweight helper for exposing non-secret frontend configuration.

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readMetaContent(name) {
  if (typeof document === "undefined") return "";
  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta?.content ? meta.content.trim() : "";
}

const globalConfig =
  typeof window !== "undefined" && window.ENV_CONFIG && typeof window.ENV_CONFIG === "object"
    ? window.ENV_CONFIG
    : {};

const resolvedConfig = {
  SEMAPHORE_SENDER:
    safeString(globalConfig.SEMAPHORE_SENDER) ||
    safeString(readMetaContent("semaphore-sender")),
  BACKEND_SMS_URL:
    safeString(globalConfig.BACKEND_SMS_URL) ||
    safeString(readMetaContent("backend-sms-url")),
  BACKEND_SMS_BALANCE_URL:
    safeString(globalConfig.BACKEND_SMS_BALANCE_URL) ||
    safeString(readMetaContent("backend-sms-balance-url")),
};

export const ENV_CONFIG = Object.freeze(resolvedConfig);

if (typeof window !== "undefined") {
  window.ENV_CONFIG = ENV_CONFIG;
}
