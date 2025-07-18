<!-- /*
Author: Rica May Simbulan
Filename: home.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the home page for the JeepN! Tracking System. 
         It displays a map and allows users to track their trips in real-time.
         The page includes a sidebar for trip management and user information.
         The map is integrated with Leaflet.js for interactive mapping.
         The page also includes Bootstrap for styling and layout.
         The script handles user authentication and session management.
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

$uid = $_SESSION['verified_user_id'];
$user_data = $database->getReference('all_users/' . $uid)->getValue();

if (isset($user_data['disabled']) && $user_data['disabled']) {
    $_SESSION['status'] = "Your account is disabled. Please contact admin.";
    header('Location: logout.php'); // or wherever you want to redirect
    exit();
}
?>
<input type="hidden" id="userId" value="<?= $_SESSION['verified_user_id'] ?? '' ?>">

<div class="container-fluid">
  <div class="row flex-column flex-md-row">
    <div class="col-12 col-md-4 p-3" id="sidebar">
      <div class="d-flex align-items-center mb-3">
        <h5 class="mt-1 mb-0">Trip Tracker</h5>
      </div>
      <div id="statusIndicator" class="status-indicator">Not Sharing</div>
      
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
        <div class="legend-entry"><img class="legend-icon" src="icons/Gueset.png">Modern Gueset Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/Boquig.png">Modern Boquig Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/Longos.png">Modern Longos Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/Binloc.png">Modern Binloc Jeep</div>
        <div class="legend-entry"><img class="legend-icon" src="icons/Tondaligan.png">Modern Tondaligan Jeep</div>
        
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

<!-- External Scripts -->
<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>

<!-- Custom Scripts -->
<script type="module" src="js/map-tracker.js"></script>
</body>
</html>