/*
Author: Rica May Simbulan
Filename: map-tracker.js
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This script handles the map tracking functionality for the JeepN! application.
*/

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  update, 
  push, 
  get, 
  child 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB7huYA09GqhgGYfMJAOLpdSAeEpE0RiVg",
  authDomain: "jeepni-6b6fb.firebaseapp.com",
  databaseURL: "https://jeepni-6b6fb-default-rtdb.firebaseio.com",
  projectId: "jeepni-6b6fb",
  storageBucket: "jeepni-6b6fb.appspot.com",
  messagingSenderId: "12352485829",
  appId: "1:12352485829:web:fd9f41a85d1f0e178a33ac"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const userId = document.getElementById("userId").value;
const shortUserId = userId.substring(0, 6);
const driverIdDisplay = document.getElementById("driverIdDisplay");
const firebaseStatus = document.getElementById("firebaseStatus");
const roleDisplay = document.getElementById("roleDisplay");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const exportType = document.getElementById("exportType");
const statusIndicator = document.getElementById("statusIndicator");
const logList = document.getElementById("log-list");
const routeSelect = document.getElementById("routeSelect");
const jeepneyType = document.getElementById("jeepneyType");
const exportDate = document.getElementById("exportDate");

// Global variables
let tripKey = null;
let userTripLogs = {};
let locationWatchId = null;
let isSharing = false;
let userMarker = null;
let userRole = "";

// Initialize map
const map = L.map("map").setView([16.0431, 120.3331], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// Track all driver markers
const driverMarkers = {};
const passengerMarkers = {};

/**
 * Get the appropriate icon based on route and jeepney type
 */
function getJeepIcon(route, jeepneyType) {
  const prefix = jeepneyType === 'traditional' ? 'old' : '';
  return L.icon({
    iconUrl: `icons/${prefix}${route.charAt(0).toUpperCase() + route.slice(1).toLowerCase()}.png`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
}

// Human icon for passengers
const humanIcon = L.icon({ 
  iconUrl: "icons/passenger.png", 
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30]
});

/**
 * Log entry to UI and store in user's trip logs
 */
function logEntry(msg) {
  const timestamp = new Date().toISOString();
  
  // Update UI
  const li = document.createElement("li");
  li.className = "list-group-item";
  li.textContent = msg;
  logList.prepend(li);
  
  // Store log in memory
  if (!userTripLogs[userId]) {
    userTripLogs[userId] = [];
  }
  userTripLogs[userId].push([timestamp, msg]);
  
  // Store log in Firebase under user's ID
  const logRef = ref(db, `trip_logs/${userId}`);
  push(logRef, {
    timestamp: timestamp,
    message: msg
  });
}

/**
 * Initialize user information
 */
function initUserInfo() {
  driverIdDisplay.textContent = shortUserId;
  
  // Get user role
get(child(ref(db), `all_users/${userId}/role`))
  .then((snap) => {
    if (snap.exists()) {
      const role = snap.val();
      if (["admin", "drivers", "passengers"].includes(role)) {
        userRole = role;
      } else {
        userRole = "passengers";
      }
    } else {
      userRole = "passengers";
    }

    let displayRole = "Passenger";
    if (userRole === "admin") displayRole = "Admin";
    else if (userRole === "drivers") displayRole = "Driver";

    roleDisplay.textContent = displayRole;
  })
  .catch(() => {
    userRole = "passengers";
    roleDisplay.textContent = "Unknown";
  });

  
  // Check Firebase connection status
  onValue(ref(db, ".info/connected"), (snap) => {
    firebaseStatus.textContent = snap.val() ? "Connected" : "Disconnected";
    firebaseStatus.style.color = snap.val() ? "green" : "red";
  });
  
  // Load existing trip logs for this user
  loadUserTripLogs();
}

/**
 * Load user's trip logs from Firebase
 */
function loadUserTripLogs() {
  const logsRef = ref(db, `trip_logs/${userId}`);
  
  onValue(logsRef, (snapshot) => {
    if (snapshot.exists()) {
      // Clear current in-memory logs
      userTripLogs[userId] = [];
      
      // Clear the UI log list
      logList.innerHTML = '';
      
      // Process and display each log
      const logsData = snapshot.val();
      Object.values(logsData).forEach(log => {
        userTripLogs[userId].push([log.timestamp, log.message]);
        
        // Add to UI only if it's from today or explicitly loading history
        const li = document.createElement("li");
        li.className = "list-group-item";
        li.textContent = log.message;
        logList.prepend(li);
      });
    } else {
      // Show alert if no logs are available
      alert("No logs available for your account.");
      // Optionally clear the UI log list
      logList.innerHTML = '';
    }
  });
}

/**
 * Update location in Firebase and on map
 */
function updateLocation(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const timestamp = new Date().toISOString();
  const currentRoute = routeSelect.value;
  const currentJeepneyType = jeepneyType.value;
  
  // Prepare location data
  const locationData = { 
    lat, 
    lng, 
    timestamp, 
    route: currentRoute,
    jeepType: currentJeepneyType
  };
  
  // Determine path based on user role
  const path = (userRole === 'drivers') ? 'drivers_location' : 'passengers_location';
  
  // Update location in Firebase
  set(ref(db, `${path}/${userId}`), locationData);
  
  // Create or update marker on map
  const dynamicIcon = (userRole === 'drivers') 
    ? getJeepIcon(currentRoute, currentJeepneyType) 
    : humanIcon;
    
  if (!userMarker) {
    userMarker = L.marker([lat, lng], { icon: dynamicIcon }).addTo(map);
    userMarker.bindPopup(`${userRole === 'drivers' ? 'Driver' : 'Passenger'}: ${shortUserId}`);
  } else {
    userMarker.setLatLng([lat, lng]);
    userMarker.setIcon(dynamicIcon);
  }
  
  // Center map on user
  map.panTo([lat, lng]);
  
  // If currently in a trip, log coordinates
  if (tripKey) {
    // Log to trip_logs collection
    push(ref(db, `trip_logs/${tripKey}/coordinates`), locationData);
    
    // Also log to user-specific trip collection
    push(ref(db, `user_trips/${userId}/${tripKey}/coordinates`), locationData);
  }
  
  // Log the update
  logEntry(`Logged position at ${new Date(timestamp).toLocaleTimeString()} [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
}

/**
 * Start location sharing
 */
function startSharing() {
  if (!navigator.geolocation || isSharing || !userId) return;
  
  // Create new trip
  tripKey = `trip_${Date.now()}_${userId}`;
  const startTime = new Date().toISOString();
  const route = routeSelect.value;
  const type = jeepneyType.value;
  
  // Save trip data in main trip_logs collection
  set(ref(db, `trip_logs/${tripKey}`), {
    user_id: userId,
    role: userRole,
    start_time: startTime,
    status: "in_progress",
    route: route,
    jeepType: type
  });
  
  // Also save in user-specific collection
  set(ref(db, `user_trips/${userId}/${tripKey}`), {
    start_time: startTime,
    status: "in_progress",
    route: route,
    jeepType: type
  });
  
  // Start watching location
  locationWatchId = navigator.geolocation.watchPosition(
    updateLocation,
    (error) => {
      logEntry(`Error: ${error.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );
  
  // Update UI
  isSharing = true;
  statusIndicator.textContent = "Actively Sharing";
  statusIndicator.style.backgroundColor = "#d4edda";
  statusIndicator.style.color = "#155724";
  logEntry("Started sharing location");
}

/**
 * Stop location sharing
 */
function stopSharing() {
  if (!isSharing || !tripKey) return;
  
  // Stop watching location
  navigator.geolocation.clearWatch(locationWatchId);
  
  // Update trip status in main collection
  update(ref(db, `trip_logs/${tripKey}`), {
    end_time: new Date().toISOString(),
    status: "completed"
  });
  
  // Update trip status in user collection
  update(ref(db, `user_trips/${userId}/${tripKey}`), {
    end_time: new Date().toISOString(),
    status: "completed"
  });
  
  // Reset variables
  isSharing = false;
  tripKey = null;
  
  // Update UI
  statusIndicator.textContent = "Not Sharing";
  statusIndicator.style.backgroundColor = "#f8d7da";
  statusIndicator.style.color = "#721c24";
  logEntry("Stopped sharing location");
}

/**
 * Export trip logs as CSV or PDF
 */
function exportTripLogs() {
  const selectedDate = exportDate.value;
  if (!selectedDate) {
    alert("Please select a date to export.");
    return;
  }

  // Get logs for the selected user
  get(ref(db, `trip_logs/${userId}`)).then((snapshot) => {
    if (!snapshot.exists()) {
      alert("No logs found for your account.");
      return;
    }
    
    // Filter logs by selected date
const logs = [];
snapshot.forEach((childSnapshot) => {
  const log = childSnapshot.val();
  // Only process if log has a timestamp and message
  if (log.timestamp && log.message) {
    const logDate = log.timestamp.substring(0, 10);
    if (logDate === selectedDate) {
      logs.push([log.timestamp, log.message]);
    }
  }
});
    
    if (logs.length === 0) {
      alert("No logs found for the selected date.");
      return;
    }
    
    // Export based on selected format
    const format = exportType.value;
    if (format === "csv") {
      exportAsCSV(logs, selectedDate);
    } else if (format === "pdf") {
      exportAsPDF(logs, selectedDate);
    }
  }).catch((error) => {
    console.error("Error fetching logs:", error);
    alert("Error retrieving logs. Please try again.");
  });
}

/**
 * Export logs as CSV file
 */
function exportAsCSV(logs, date) {
  let csv = "Timestamp,Event\n";
  logs.forEach(([time, event]) => {
    csv += `"${time}","${event.replace(/"/g, '""')}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `jeepni_trip_logs_${date}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export logs as PDF file
 */
function exportAsPDF(logs, date) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Add header
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 150);
  doc.text("JeepNi! Trip Log Report", 14, 15);
  
  // Add metadata
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`User ID: ${shortUserId}`, 14, 23);
  doc.text(`Role: ${userRole}`, 14, 28);
  doc.text(`Date: ${date}`, 14, 33);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
  
  // Create table
  doc.autoTable({
    head: [["Time", "Event"]],
    body: logs.map(([time, event]) => [
      new Date(time).toLocaleString(), 
      event
    ]),
    startY: 45,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [29, 203, 242] }
  });
  
  // Save the PDF
  doc.save(`jeepni_trip_logs_${date}.pdf`);
}

/**
 * Watch for other drivers/passengers on the map
 */
function watchOtherUsers() {
  // Watch drivers
   onValue(ref(db, 'drivers_location'), (snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const driverId = childSnapshot.key;
        if (driverId !== userId) {
          const data = childSnapshot.val();
          const route = data.route || 'Gueset';
          const jeepType = data.jeepType || 'modern';
          // Create or update marker
          if (!driverMarkers[driverId]) {
            driverMarkers[driverId] = L.marker([data.lat, data.lng], {
              icon: getJeepIcon(route, jeepType)
            }).addTo(map);
            driverMarkers[driverId].bindPopup(`Driver: ${driverId.substring(0, 6)}<br>Route: ${route}`);
          } else {
            driverMarkers[driverId].setLatLng([data.lat, data.lng]);
            driverMarkers[driverId].setIcon(getJeepIcon(route, jeepType));
            driverMarkers[driverId].getPopup().setContent(`Driver: ${driverId.substring(0, 6)}<br>Route: ${route}`);
          }
        }
      });
    }
    // Remove markers for drivers no longer present
    Object.keys(driverMarkers).forEach(id => {
      if (!snapshot.hasChild(id)) {
        map.removeLayer(driverMarkers[id]);
        delete driverMarkers[id];
      }
    });
  });

  // Watch passengers
  onValue(ref(db, 'passengers_location'), (snapshot) => {
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        const passengerId = childSnapshot.key;
        if (passengerId !== userId) {
          const data = childSnapshot.val();
          // Create or update marker
          if (!passengerMarkers[passengerId]) {
            passengerMarkers[passengerId] = L.marker([data.lat, data.lng], {
              icon: humanIcon
            }).addTo(map);
            passengerMarkers[passengerId].bindPopup(`Passenger: ${passengerId.substring(0, 6)}`);
          } else {
            passengerMarkers[passengerId].setLatLng([data.lat, data.lng]);
          }
        }
      });
    }
    // Remove markers for passengers no longer present
    Object.keys(passengerMarkers).forEach(id => {
      if (!snapshot.hasChild(id)) {
        map.removeLayer(passengerMarkers[id]);
        delete passengerMarkers[id];
      }
    });
  });
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
  initUserInfo();
  watchOtherUsers();
  
  // Set up event listeners
  startBtn.addEventListener('click', startSharing);
  stopBtn.addEventListener('click', stopSharing);
  exportBtn.addEventListener('click', exportTripLogs);
  
  // Set default export date to today
  const today = new Date().toISOString().split('T')[0];
  exportDate.value = today;
});