// public/js/sms-integration.js
// Consolidated SMS Integration Module for Semaphore API

import { db, ref, get } from "./authentication.js";

/**
 * Get all recipients (drivers and passengers) from Firebase RTDB
 * @returns {Promise<Array>} Array of recipients with name, role, phone, and email
 */
export async function getAllRecipients() {
  try {
    const [driversSnap, passengersSnap] = await Promise.all([
      get(ref(db, 'drivers')),
      get(ref(db, 'passengers'))
    ]);

    const recipients = [];

    // Process drivers
    if (driversSnap.exists()) {
      const drivers = driversSnap.val();
      Object.keys(drivers).forEach(uid => {
        const driver = drivers[uid];
        if (driver.phone) {
          recipients.push({
            uid: uid,
            name: driver.name || driver.email || 'Unknown Driver',
            role: 'driver',
            phone: formatPhoneNumber(driver.phone),
            email: driver.email || '',
            route: driver.route || 'N/A'
          });
        }
      });
    }

    // Process passengers
    if (passengersSnap.exists()) {
      const passengers = passengersSnap.val();
      Object.keys(passengers).forEach(uid => {
        const passenger = passengers[uid];
        if (passenger.phone) {
          recipients.push({
            uid: uid,
            name: passenger.name || passenger.email || 'Unknown Passenger',
            role: 'passenger',
            phone: formatPhoneNumber(passenger.phone),
            email: passenger.email || ''
          });
        }
      });
    }

    // Sort by role first (drivers, then passengers), then by name
    recipients.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'driver' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return recipients;
  } catch (error) {
    console.error('Error fetching recipients:', error);
    throw new Error('Failed to fetch recipients: ' + error.message);
  }
}

/**
 * Format phone number to Philippine format (639XXXXXXXXX)
 * Handles multiple input formats
 * @param {string} phone - Phone number in various formats
 * @returns {string} Formatted phone number
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle different formats
  if (cleaned.startsWith('639')) {
    // Already in correct format: 639XXXXXXXXX
    return cleaned;
  } else if (cleaned.startsWith('09')) {
    // Convert 09XXXXXXXXX to 639XXXXXXXXX
    return '63' + cleaned.substring(1);
  } else if (cleaned.startsWith('9') && cleaned.length === 10) {
    // Convert 9XXXXXXXXX to 639XXXXXXXXX
    return '63' + cleaned;
  } else if (cleaned.startsWith('63') && !cleaned.startsWith('639')) {
    // Handle 63XXXXXXXXXX (missing 9)
    return cleaned;
  } else if (cleaned.startsWith('+639')) {
    // Handle +639XXXXXXXXX
    return cleaned.substring(1);
  } else if (cleaned.startsWith('+63')) {
    // Handle +63XXXXXXXXXX
    return cleaned.substring(1);
  }
  
  // If format is unclear, return as-is
  return cleaned;
}

/**
 * Validate Philippine phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid Philippine mobile number
 */
export function isValidPhoneNumber(phone) {
  const cleaned = phone.replace(/\D/g, '');
  // Philippine mobile numbers: 639XXXXXXXXX (12 digits total)
  // 63 (country code) + 9 (mobile prefix) + 9 digits
  return /^639\d{9}$/.test(cleaned);
}

/**
 * Send SMS via backend proxy (routes.py)
 * @param {Array<string>} phoneNumbers - Array of phone numbers
 * @param {string} message - Message content (max 160 chars)
 * @param {string} senderName - Sender name (default: JEEPNI)
 * @returns {Promise<Object>} Response from API
 */
export async function sendSMS(phoneNumbers, message, senderName = 'JEEPNI') {
  try {
    // Validate inputs
    if (!phoneNumbers || phoneNumbers.length === 0) {
      throw new Error('At least one phone number is required');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }

    // Validate message doesn't start with TEST (Semaphore restriction)
    if (message.trim().toUpperCase().startsWith('TEST')) {
      throw new Error('Messages cannot start with "TEST" - Semaphore will silently ignore them');
    }

    // Validate message length (160 characters max for single SMS)
    if (message.trim().length > 160) {
      throw new Error(`Message exceeds 160 characters (current: ${message.trim().length})`);
    }

    // Format all phone numbers
    const formattedNumbers = phoneNumbers.map(formatPhoneNumber);

    // Validate all phone numbers
    const invalidNumbers = formattedNumbers.filter(num => !isValidPhoneNumber(num));
    if (invalidNumbers.length > 0) {
      throw new Error(`Invalid phone number(s): ${invalidNumbers.join(', ')}`);
    }

    // Determine API base URL
    const API_BASE = window.API_BASE ?? (
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && 
      location.port !== '5000' ? 'http://localhost:5000' : ''
    );

    // Call backend proxy endpoint
    const response = await fetch(`${API_BASE}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        numbers: formattedNumbers,
        message: message.trim(),
        sender_name: senderName
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

/**
 * Get SMS account balance from Semaphore
 * @returns {Promise<Object>} Balance information
 */
export async function getSMSBalance() {
  try {
    const API_BASE = window.API_BASE ?? (
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1') && 
      location.port !== '5000' ? 'http://localhost:5000' : ''
    );

    const response = await fetch(`${API_BASE}/api/sms/balance`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('Error fetching SMS balance:', error);
    throw error;
  }
}

/**
 * Get SMS character count and message info
 * @param {string} message - Message content
 * @returns {Object} Character count information
 */
export function getSMSInfo(message) {
  const length = message.length;
  const remaining = 160 - length;
  
  return {
    characters: length,
    remaining: remaining,
    maxLength: 160,
    isValid: length > 0 && length <= 160,
    exceeds: length > 160
  };
}

/**
 * Render recipients table with checkboxes
 * @param {Array} recipients - Array of recipient objects
 * @param {string} containerId - Table body element ID
 * @param {string} filterRole - Filter by role ('all', 'driver', 'passenger')
 */
export function renderRecipientsTable(recipients, containerId, filterRole = 'all') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Filter recipients by role
  const filtered = filterRole === 'all' 
    ? recipients 
    : recipients.filter(r => r.role === filterRole);

  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-3">
          No recipients found
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = filtered.map(recipient => `
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
        <span class="badge ${recipient.role === 'driver' ? 'bg-primary' : 'bg-info'}">
          ${recipient.role}
        </span>
      </td>
      <td><small>${recipient.phone}</small></td>
      <td class="text-muted small">${recipient.email}</td>
    </tr>
  `).join('');
}

/**
 * Format prediction message for SMS (ensure 160 char limit)
 * @param {Object} prediction - Prediction object from API
 * @returns {string} Formatted message
 */
export function formatPredictionForSMS(prediction) {
  const message = prediction.message || '';
  
  // Truncate if necessary, keeping important info
  if (message.length <= 160) {
    return message;
  }
  
  // Truncate and add ellipsis
  return message.substring(0, 157) + '...';
}

// Export all functions
export default {
  getAllRecipients,
  formatPhoneNumber,
  isValidPhoneNumber,
  sendSMS,
  getSMSBalance,
  getSMSInfo,
  renderRecipientsTable,
  formatPredictionForSMS
};