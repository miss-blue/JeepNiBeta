// public/js/sms-integration.js
// Backend-mediated Semaphore SMS integration helpers

import { db, ref, get } from "./authentication.js";
import { ENV_CONFIG } from "./env-config.js";


const SINGLE_SEGMENT_LIMIT = 160;
const CONCAT_SEGMENT_SIZE = 153;

const DEFAULT_SMS_ENDPOINT = `${window.API_BASE}/api/send-sms`;
const DEFAULT_SMS_BALANCE_ENDPOINT = `${window.API_BASE}/api/get-sms-balance`;

function sanitiseConfigString(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^SET[_A-Z]*YOUR/i.test(trimmed)) return "";
  return trimmed;
}

function resolveConfigValue(localValue, windowKey, fallback = "") {
  const local = sanitiseConfigString(localValue);
  if (local) return local;
  if (typeof window !== "undefined" && window[windowKey]) {
    const fromWindow = sanitiseConfigString(String(window[windowKey]));
    if (fromWindow) return fromWindow;
  }
  return fallback;
}

const ENV_SENDER = sanitiseConfigString(ENV_CONFIG?.SEMAPHORE_SENDER ?? "");
const ENV_SMS_ENDPOINT = sanitiseConfigString(ENV_CONFIG?.BACKEND_SMS_URL ?? "");
const ENV_SMS_BALANCE_ENDPOINT = sanitiseConfigString(
  ENV_CONFIG?.BACKEND_SMS_BALANCE_URL ?? ""
);

const DEFAULT_SENDER = resolveConfigValue(
  "",
  "SEMAPHORE_SENDER",
  ENV_SENDER || "JEEPNI"
);
const BACKEND_SMS_URL = resolveConfigValue(
  "",
  "BACKEND_SMS_URL",
  ENV_SMS_ENDPOINT || DEFAULT_SMS_ENDPOINT
);
const BACKEND_SMS_BALANCE_URL = resolveConfigValue(
  "",
  "BACKEND_SMS_BALANCE_URL",
  ENV_SMS_BALANCE_ENDPOINT || DEFAULT_SMS_BALANCE_ENDPOINT
);

function extractSemaphoreError(payload) {
  if (!payload) return "";

  if (typeof payload === "string") return payload;

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = extractSemaphoreError(entry);
      if (nested) return nested;
    }
    return "";
  }

  const candidates =
    payload.error ||
    payload.errors ||
    payload.message ||
    payload.error_message ||
    payload.meta?.error;

  if (!candidates) return "";

  if (Array.isArray(candidates)) {
    return candidates
      .map((item) => extractSemaphoreError(item) || String(item))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof candidates === "object") {
    return Object.entries(candidates)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}: ${value.join(", ")}`;
        }
        return `${key}: ${value}`;
      })
      .join("; ");
  }

  return String(candidates);
}

function resolveSenderName(senderName) {
  const candidate = sanitiseConfigString(
    typeof senderName === "string" ? senderName : ""
  );
  if (candidate && candidate !== "JEEPNI") return candidate.substring(0, 11);
  const fallback = (DEFAULT_SENDER || "JEEPNI").substring(0, 11);
  return fallback;
}

export async function getAllRecipients() {
  try {
    const [driversSnap, passengersSnap] = await Promise.all([
      get(ref(db, "drivers")),
      get(ref(db, "passengers")),
    ]);

    const recipients = [];

    if (driversSnap.exists()) {
      const drivers = driversSnap.val();
      Object.keys(drivers).forEach((uid) => {
        const driver = drivers[uid];
        if (driver?.phone) {
          recipients.push({
            uid,
            name: driver.name || driver.email || "Unknown Driver",
            role: "driver",
            phone: formatPhoneNumber(driver.phone),
            email: driver.email || "",
            route: driver.route || "N/A",
          });
        }
      });
    }

    if (passengersSnap.exists()) {
      const passengers = passengersSnap.val();
      Object.keys(passengers).forEach((uid) => {
        const passenger = passengers[uid];
        if (passenger?.phone) {
          recipients.push({
            uid,
            name: passenger.name || passenger.email || "Unknown Passenger",
            role: "passenger",
            phone: formatPhoneNumber(passenger.phone),
            email: passenger.email || "",
          });
        }
      });
    }

    recipients.sort((a, b) => {
      if (a.role !== b.role) return a.role === "driver" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return recipients;
  } catch (error) {
    console.error("Error fetching recipients:", error);
    throw new Error(`Failed to fetch recipients: ${error.message}`);
  }
}

export function formatPhoneNumber(phone) {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("639")) return cleaned;
  if (cleaned.startsWith("09")) return "63" + cleaned.substring(1);
  if (cleaned.startsWith("9") && cleaned.length === 10) return "63" + cleaned;
  if (cleaned.startsWith("+639")) return cleaned.substring(1);
  if (cleaned.startsWith("+63")) return cleaned.substring(1);
  return cleaned;
}

export function isValidPhoneNumber(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, "");
  return /^639\d{9}$/.test(cleaned);
}

function normaliseRecipients(phoneNumbers) {
  if (!Array.isArray(phoneNumbers)) return [];
  const formatted = phoneNumbers
    .map(formatPhoneNumber)
    .filter(Boolean)
    .filter((value, index, self) => self.indexOf(value) === index);
  const invalid = formatted.filter((num) => !isValidPhoneNumber(num));
  if (invalid.length) {
    throw new Error(`Invalid phone number(s): ${invalid.join(", ")}`);
  }
  if (!formatted.length) {
    throw new Error("No valid phone numbers were provided");
  }
  return formatted;
}

export async function sendSMS(
  phoneNumbers,
  message,
  senderName = DEFAULT_SENDER,
  options = {}
) {
  try {
    const trimmedMessage = typeof message === "string" ? message.trim() : "";

    if (!phoneNumbers || !phoneNumbers.length) {
      throw new Error("Please provide at least one recipient.");
    }
    if (!trimmedMessage) {
      throw new Error("Message cannot be empty.");
    }
    if (trimmedMessage.length > SINGLE_SEGMENT_LIMIT) {
      throw new Error(
        `Message exceeds ${SINGLE_SEGMENT_LIMIT} characters (current: ${trimmedMessage.length}).`
      );
    }
    if (trimmedMessage.toUpperCase().startsWith("TEST")) {
      throw new Error(
        'Messages cannot start with "TEST" - Semaphore will ignore them.'
      );
    }

    const recipients = normaliseRecipients(phoneNumbers);
    const metadata = typeof options?.metadata === "object" ? { ...options.metadata } : {};
    if (!metadata.uid && options?.uid) {
      metadata.uid = options.uid;
    }
    if (!metadata.role && options?.role) {
      metadata.role = options.role;
    }

    const payload = {
      number: recipients.join(","),
      message: trimmedMessage,
      sender: resolveSenderName(senderName),
      metadata,
    };

    const headers = {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    };

    if (options?.role) {
      headers["X-JeepNi-Role"] = String(options.role);
    }
    if (options?.uid) {
      headers["X-JeepNi-UID"] = String(options.uid);
    }
    if (options?.idToken) {
      headers.Authorization = `Bearer ${options.idToken}`;
    }

    const response = await fetch(BACKEND_SMS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      mode: "cors",
      cache: "no-store",
    });

    const text = await response.text();
    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch (err) {
      console.warn("SMS send response was not JSON:", text);
      result = text;
    }

    console.log("=== SEMAPHORE RESPONSE DEBUG ===");
    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(result, null, 2));
    console.log("Messages array:", result);
    console.log("================================");

    if (!response.ok) {
      const errorDetail = extractSemaphoreError(result) || result?.error || text;
      throw new Error(errorDetail || `Failed to send SMS: HTTP ${response.status}`);
    }

    const messages = Array.isArray(result)
      ? result
      : Array.isArray(result?.messages)
      ? result.messages
      : [];

    let successful = 0;
    let failed = 0;
    const failureDetails = [];
    const statusSummaries = [];

    if (messages.length) {
      messages.forEach((item) => {
        const status = String(item?.status || "").toUpperCase();
        const recipient = item?.recipient || item?.number || "UNKNOWN";
        if (["QUEUED", "PENDING", "SENT"].includes(status)) {
          successful += 1;
        } else {
          failed += 1;
          const reason =
            item?.error ||
            item?.error_message ||
            item?.status_description ||
            item?.message ||
            status ||
            "Unknown error";

          failureDetails.push({
            recipient,
            reason,
            status,
            carrier: item?.network || "unknown",
            raw: item,
          });
        }
        statusSummaries.push(`${recipient}: ${status}`);
      });
    } else {
      successful = recipients.length;
    }

    if (failed && !successful) {
      const formatted = failureDetails
        .map((item) => `${item.recipient}: ${item.reason}`)
        .join("; ");
      throw new Error(
        formatted || "All messages failed. Check the Semaphore dashboard for details."
      );
    }

    let note = failureDetails
      .map((item) => `${item.recipient}: ${item.reason}`)
      .join("; ");

    if (!note && statusSummaries.length) {
      note = `${statusSummaries.join("; ")}. Delivery updates may take a few seconds in Semaphore.`;
    }

    return {
      success: true,
      accepted: messages.length || recipients.length,
      successful,
      failed,
      results: messages.length ? messages : result,
      failureDetails,
      note,
      statusSummary: statusSummaries.join("; "),
    };
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
}

export async function getSMSBalance(options = {}) {
  const {
    ignoreCooldown = false,
    forceRefresh = false,
    role,
    idToken,
    uid,
    headers: extraHeaders,
  } = options;
  try {
    const query = forceRefresh ? "?force=1" : "";
    const url = `${BACKEND_SMS_BALANCE_URL}${query}`;
    const headers = {
      Accept: "application/json",
      ...(extraHeaders || {}),
    };

    if (role) {
      headers["X-JeepNi-Role"] = String(role);
    }
    if (uid) {
      headers["X-JeepNi-UID"] = String(uid);
    }
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      mode: "cors",
      headers,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      console.warn("SMS balance response was not JSON:", text);
      data = text;
    }

    const dataSuccessFalse =
      data && typeof data === "object" && data.success === false;

    if (!response.ok || dataSuccessFalse) {
      let friendly =
        extractSemaphoreError(data) ||
        (typeof data === "string" ? data : data?.error) ||
        `Failed to fetch SMS balance: HTTP ${response.status}`;

      let retryAfterSeconds = Number(data?.retry_after);
      if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
        const headerRetry = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(headerRetry) && headerRetry > 0) {
          retryAfterSeconds = headerRetry;
        }
      }
      if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
        retryAfterSeconds = 30;
      }

      if (response.status === 429 || dataSuccessFalse) {
        const waitSeconds = Math.max(5, Math.ceil(retryAfterSeconds));
        friendly = `Semaphore rate limit reached. Please wait ${waitSeconds} seconds before refreshing the balance.`;
      }

      const error = new Error(friendly);
      error.retryAfter = Math.max(5, Math.ceil(retryAfterSeconds));
      error.payload = data;
      throw error;
    }

    if (!data || (typeof data !== "object" && !Array.isArray(data))) {
      throw new Error("SMS balance response was empty.");
    }

    const accountData = Array.isArray(data) ? data[0] : data.account || data;
    if (!accountData) {
      throw new Error("SMS balance response did not include account information.");
    }

    const balanceRaw =
      accountData.balance ??
      accountData.credit_balance ??
      accountData.credits ??
      "0";
    const balanceValue = Number.parseFloat(balanceRaw);

    return {
      success: true,
      balance: Number.isFinite(balanceValue) ? balanceValue : 0,
      account: {
        id: accountData.account_id ?? accountData.id ?? null,
        name: accountData.account_name ?? accountData.name ?? "",
        status: accountData.status ?? accountData.account_status ?? "unknown",
        email: accountData.email ?? "",
        sender:
          accountData.sendername ??
          accountData.sender_name ??
          resolveSenderName(DEFAULT_SENDER),
      },
      raw: data,
      stale: Boolean(data?.stale),
      note: data?.note || "",
      retry_after: Number.isFinite(Number(data?.retry_after))
        ? Number(data.retry_after)
        : null,
      last_updated_seconds_ago: Number.isFinite(
        Number(data?.last_updated_seconds_ago)
      )
        ? Number(data.last_updated_seconds_ago)
        : null,
      retrieved_at: data?.retrieved_at || null,
      localCooldown: ignoreCooldown,
    };
  } catch (error) {
    console.error("Error fetching SMS balance:", error);
    throw error;
  }
}

export function getSMSInfo(message) {
  const text = typeof message === "string" ? message : "";
  const length = text.length;
  const segments = length === 0 ? 0 : Math.ceil(length / CONCAT_SEGMENT_SIZE);
  return {
    characters: length,
    remaining: SINGLE_SEGMENT_LIMIT - length,
    maxLength: SINGLE_SEGMENT_LIMIT,
    perSegment: CONCAT_SEGMENT_SIZE,
    segments,
    isValid: length > 0 && length <= SINGLE_SEGMENT_LIMIT,
    exceeds: length > SINGLE_SEGMENT_LIMIT,
  };
}

export function renderRecipientsTable(
  recipients,
  containerId,
  filterRole = "all"
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const filtered =
    filterRole === "all"
      ? recipients
      : recipients.filter((r) => r.role === filterRole);

  if (!filtered.length) {
    container.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-3">
          No recipients found
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = filtered
    .map(
      (recipient) => `
        <tr>
          <td>
            <div class="form-check">
              <input
                class="form-check-input recipient-checkbox"
                type="checkbox"
                value="${recipient.phone}"
                data-uid="${recipient.uid}"
                data-name="${recipient.name}"
                data-role="${recipient.role}"
                id="recipient-${recipient.uid}"
              >
              <label class="form-check-label" for="recipient-${recipient.uid}">
                ${recipient.name}
              </label>
            </div>
          </td>
          <td>
            <span class="badge ${
              recipient.role === "driver" ? "bg-primary" : "bg-info"
            }">
              ${recipient.role}
            </span>
          </td>
          <td><small>${recipient.phone}</small></td>
          <td class="text-muted small">${recipient.email}</td>
        </tr>
      `
    )
    .join("");
}

export function formatPredictionForSMS(prediction) {
  const message = prediction?.message || "";
  if (message.length <= SINGLE_SEGMENT_LIMIT) return message;
  return `${message.substring(0, SINGLE_SEGMENT_LIMIT - 3)}...`;
}

export default {
  getAllRecipients,
  formatPhoneNumber,
  isValidPhoneNumber,
  sendSMS,
  getSMSBalance,
  getSMSInfo,
  renderRecipientsTable,
  formatPredictionForSMS,
  DEFAULT_SENDER,
  BACKEND_SMS_URL,
  BACKEND_SMS_BALANCE_URL,
};
