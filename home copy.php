<!-- /*
Author: Rica May Simbulan
Filename: home copy.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the copy of home page for the JeepN! Tracking System. 
        For safety purposes only while i am editing.
*/ -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>JeepNi! - Live Map</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
  <style>
    body {
      margin: 0;
      font-family: 'Poppins', sans-serif;
      background-color:rgb(194, 232, 245);
      color: #1DCBF2;
    }
    h5, h6, label, .form-select, .btn, .list-group-item {
      font-family: 'Poppins', sans-serif;
      font-weight: 500;
      color: #0477BF;
    }
    #map {
      height: 100vh;
      width: 100%;
    }
    #trip-log {
      height: 100vh;
      overflow-y: auto;
      padding: 1rem;
      background: #E35AA8;
      border-right: 1px solid #A69C0F;
    }
    .form-select, .btn {
      background-color: #FFFFFF;
      color: #7858A6;
      border: 1px solid #7858A6;
    }
    .form-select:focus, .btn:focus {
      border-color: #7858A6;
      box-shadow: 0 0 0 0.25rem rgba(120, 88, 166, 0.25);
    }
    .btn-success {
      background-color: #1DCBF2;
      border-color: #1DCBF2;
      color: #FFFFFF;
    }
    .btn-danger {
      background-color:rgb(50, 5, 95);
      border-color:rgb(172, 38, 136);
      color: white;
    }
    .btn-secondary {
      background-color: #1DCBF2;
      border-color: #1DCBF2;
      color: #FFFFFF;
    }
    .status-indicator {
      padding: 6px;
      border-radius: 5px;
      font-size: 1 rem;
      margin-bottom: 15px;
      text-align: center;
      background-color:rgb(0, 178, 205);
      color: #F1F1F1;
      font-weight: 600;
    }
    .debug-panel {
      margin: 15px 0;
      padding: 10px;
      background-color: #Ffffff;
      border: 1px solid #7858A6;
      border-radius: 4px;
      color: #1e1e1e;
    }
    .legend-icon {
      width: 40px;
      height: 40px;
      object-fit: contain;
      margin-right: 8px;
    }
    .list-group-item {
      background-color: #F2D98D;
      border: 1px solid #BF78AC;
      color: #000000;
    }
  </style>
</head>
<body>
<?php
if (session_status() === PHP_SESSION_NONE) session_start();
include('includes/navbar.php');
?>
<input type="hidden" id="userId" value="<?= $_SESSION['verified_user_id'] ?? '' ?>">

<div class="container-fluid">
  <div class="row flex-column flex-md-row">
    <div class="col-12 col-md-4 p-3" id="sidebar">
    <div class="d-flex align-items-center mb-3">
    <h5 class="mt-1 mb-0">Trip Tracker</h5>
    </div>
      <div id="statusIndicator" class="status-indicator">Not Sharing</div>
      <!-- April 22, 2025 -->
      <label for="jeepneyType" class="form-label">Jeepney Type:</label>
      <select id="jeepneyType" class="form-select mb-3">
        <option value="modern">Modern Jeepney</option>
        <option value="traditional">Traditional Jeepney</option>
      </select>
      <label for="routeSelect" class="form-label">Select Route:</label>
      <select id="routeSelect" class="form-select mb-3">
        <option value="Gueset">Gueset</option>
        <option value="Boquig">Boquig</option>
        <option value="Longos">Longos</option>
        <option value="Binloc">Binloc</option>
        <option value="Tondaligan">Tondaligan</option>
      </select>
      <button id="startBtn" class="btn btn-success w-100 mb-2">Start Sharing</button>
      <button id="stopBtn" class="btn btn-danger w-100 mb-3">Stop Sharing</button>

      <label for="exportDate" class="form-label">Select Date to Download:</label>
      <input type="date" id="exportDate" class="form-control mb-2">
      <label for="exportType" class="form-label">Export as:</label>
      <select id="exportType" class="form-select mb-2">
        <option value="pdf">PDF</option>
        <option value="csv">CSV</option>
      </select>
      <button id="exportBtn" class="btn btn-secondary w-100">Download Trip Logs</button>

      <div class="debug-panel">
        <h6>Legend</h6>
        <div class="legend-entry"><img class="legend-icon" src="icons/gueset.png">Modern Gueset Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/boquig.png">Modern Boquig Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/longos.png">Modern Longos Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/binloc.png">Modern Binloc Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/tondaligan.png">Modern Tondaligan Jeep</div>
        
        <div class="legend-entry"><img class="legend-icon" src="icons/oldGueset.png">Traditional Gueset Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/oldBoquig.png">Traditional Boquig Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/oldLongos.png">Traditional Longos Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/oldBinloc.png">Traditional Binloc Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/oldTondaligan.png">Traditional Tondaligan Jeep</div>
      </div>

      <div class="debug-panel mt-4">
        <h6>User Info</h6>
        <div>User ID: <span id="driverIdDisplay">Loading...</span></div>
        <div>Role: <span id="roleDisplay">Loading...</span></div>
        <div>Firebase: <span id="firebaseStatus">Connecting...</span></div>
      </div>

      <h6 class="mt-4">Trip Log</h6>
      <ul id="log-list" class="list-group"></ul>
    </div>
    <div class="col-12 col-md-8 p-0">
      <div id="map"></div>
    </div>
  </div>
</div>

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js"></script>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, get, child } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7huYA09GqhgGYfMJAOLpdSAeEpE0RiVg",
  authDomain: "jeepni-6b6fb.firebaseapp.com",
  databaseURL: "https://jeepni-6b6fb-default-rtdb.firebaseio.com",
  projectId: "jeepni-6b6fb",
  storageBucket: "jeepni-6b6fb.appspot.com",
  messagingSenderId: "12352485829",
  appId: "1:12352485829:web:fd9f41a85d1f0e178a33ac"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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

let tripKey = null;
let tripLogs = [];
let locationWatchId = null;
let isSharing = false;
let userMarker = null;
let userRole = "";

const map = L.map("map").setView([16.0431, 120.3331], 14);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

function getJeepIcon(route, jeepneyType) {
  const prefix = jeepneyType === 'traditional' ? 'old' : '';
  return L.icon({
    iconUrl: `icons/${prefix}${route.toLowerCase()}.png`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
}
const humanIcon = L.icon({ iconUrl: "icons/passenger.png", iconSize: [30, 30] });

function logEntry(msg) {
  const li = document.createElement("li");
  li.className = "list-group-item";
  li.textContent = msg;
  logList.prepend(li);
  tripLogs.push([new Date().toISOString(), msg]);
}

driverIdDisplay.textContent = shortUserId;

get(child(ref(db), `all_users/${userId}/role`)).then((snap) => {
  userRole = snap.exists() ? snap.val() : "passengers";
  roleDisplay.textContent = userRole;
}).catch(() => {
  userRole = "passengers";
  roleDisplay.textContent = "Unknown";
});

onValue(ref(db, ".info/connected"), (snap) => {
  firebaseStatus.textContent = snap.val() ? "Connected" : "Disconnected";
  firebaseStatus.style.color = snap.val() ? "green" : "red";
});

function updateLocation(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const timestamp = new Date().toISOString();
  const route = document.getElementById("routeSelect").value;
  const jeepneyType = document.getElementById("jeepneyType").value;
  const icon = (userRole === 'drivers') ? getJeepIcon(route) : humanIcon;
  const path = (userRole === 'drivers') ? 'drivers_location' : 'passengers_location';

  const locationData = { lat, lng, timestamp, route: jeepneyType};
  set(ref(db, `${path}/${userId}`), locationData);

  const currentRoute = document.getElementById("routeSelect").value;
  const currentJeepneyType = document.getElementById("jeepneyType").value;

  const dynamicIcon = (userRole === 'drivers') 
    ? getJeepIcon(currentRoute, currentJeepneyType) 
    : humanIcon;

if (!userMarker) {
  userMarker = L.marker([lat, lng], { icon: dynamicIcon }).addTo(map);
} else {
  userMarker.setLatLng([lat, lng]);
  userMarker.setIcon(dynamicIcon);
}
  map.panTo([lat, lng]);

  if (tripKey) {
    push(ref(db, `trip_logs/${tripKey}/coordinates`), locationData);
  }

  logEntry(`Logged position at ${timestamp} [${lat}, ${lng}]`);
}

startBtn.onclick = () => {
  if (!navigator.geolocation || isSharing || !userId) return;
  tripKey = `trip_${Date.now()}`;
  const startTime = new Date().toISOString();
  set(ref(db, `trip_logs/${tripKey}`), {
    user_id: userId,
    role: userRole,
    start_time: startTime,
    status: "in_progress"
  });

  locationWatchId = navigator.geolocation.watchPosition(updateLocation);
  isSharing = true;
  statusIndicator.textContent = "Actively Sharing";
  statusIndicator.style.backgroundColor = "#d4edda";
  statusIndicator.style.color = "#155724";
  logEntry("Started sharing location");
};

stopBtn.onclick = () => {
  if (!isSharing || !tripKey) return;
  navigator.geolocation.clearWatch(locationWatchId);
  update(ref(db, `trip_logs/${tripKey}`), {
    end_time: new Date().toISOString(),
    status: "completed"
  });
  isSharing = false;
  statusIndicator.textContent = "Not Sharing";
  statusIndicator.style.backgroundColor = "#f8d7da";
  statusIndicator.style.color = "#721c24";
  logEntry("Stopped sharing location");
};

exportBtn.onclick = () => {
  const selectedDate = document.getElementById("exportDate").value;
  if (!selectedDate) {
    alert("Please select a date to export.");
    return;
  }

  const type = exportType.value;
  const filteredLogs = tripLogs.filter(([timestamp]) => {
    return timestamp.startsWith(selectedDate); // Compare YYYY-MM-DD
  });

  if (filteredLogs.length === 0) {
    alert("No logs found for the selected date.");
    return;
  }

  if (type === "csv") {
    let csv = "Timestamp,Event\n";
    filteredLogs.forEach(([time, event]) => {
      csv += `${time},${event}\n`;
    });
    const encoded = encodeURI("data:text/csv;charset=utf-8," + csv);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", `trip_logs_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else if (type === "pdf") {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("JeepNi! Trip Log Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`User ID: ${shortUserId}`, 14, 23);
    doc.text(`Role: ${userRole}`, 14, 28);
    doc.text(`Date: ${selectedDate}`, 14, 33);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);

    doc.autoTable({
      head: [["Timestamp", "Event"]],
      body: filteredLogs.map(([t, e]) => [t, e]),
      startY: 45,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [100, 100, 255] }
    });

    doc.save(`trip_logs_${selectedDate}.pdf`);
  }
};

</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
