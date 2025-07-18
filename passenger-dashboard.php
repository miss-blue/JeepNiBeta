<!-- /*
Author: Rica May Simbulan
Filename: passenger-dashboard.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the passenger dashboard page for the JeepN! Tracking System. 
         Same with my driver-dashboard.php, this is only for future updates.
*/ -->
<?php
include('authentication.php');
include('dbcon.php');

if (!isset($_SESSION['verified_user_id'])) {
    $_SESSION['status'] = "Please log in.";
    header('Location: login.php');
    exit();
}

$passenger_id = $_SESSION['verified_user_id'];
$passenger = $auth->getUser($passenger_id);
?>

<div class="container">
    <div class="row">
        <div class="col-md-12">
            <?php
            if(isset($_SESSION['status']))
            {
                echo "<h5 class='alert alert-success'>".$_SESSION['status']."</h5>";
                unset($_SESSION['status']);
            }
            ?>
            
  
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the map
    let map;
    let markers = {};
    
    function initMap() {
        // Default map center (Philippines)
        const defaultLocation = [10.3157, 123.8854]; // Cebu City coordinates
        
        // Create the map
        map = L.map('map').setView(defaultLocation, 15);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Get user's current position
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const userLocation = [position.coords.latitude, position.coords.longitude];
                    map.setView(userLocation, 15);
                    
                    // Add marker for user's location
                    const userMarker = L.marker(userLocation).addTo(map);
                    userMarker.bindPopup("Your location").openPopup();
                },
                function(error) {
                    console.error("Error getting location: ", error);
                    alert("Could not get your location. Please enable location services and refresh the page.");
                }
            );
        } else {
            alert("Geolocation is not supported by this browser.");
        }
        
        // Load active jeepneys
        loadActiveJeepneys();
    }
    
    // Load active jeepneys from Firebase
    function loadActiveJeepneys() {
        // Reference to active trips
        const activeTripsRef = firebase.database().ref('trip_logs');
        
        activeTripsRef.orderByChild('status').equalTo('active').on('value', function(snapshot) {
            const trips = snapshot.val();
            
            // Clear existing markers
            for (let id in markers) {
                map.removeLayer(markers[id]);
            }
            markers = {};
            
            // Clear the list
            document.getElementById('activeJeepneyList').innerHTML = '';
            
            if (trips) {
                let count = 0;
                let listHtml = '<div class="list-group">';
                
                // Get filter values
                const routeFilter = document.getElementById('routeFilter').value;
                const typeFilter = document.getElementById('typeFilter').value;
                
                for (let tripId in trips) {
                    const trip = trips[tripId];
                    
                    // Skip if trip doesn't match filters
                    if ((routeFilter && trip.route !== routeFilter) || 
                        (typeFilter && trip.jeepney_type !== typeFilter)) {
                        continue;
                    }
                    
                    count++;
                    
                    // Get last coordinates
                    if (trip.coordinates) {
                        const coords = Object.values(trip.coordinates);
                        
                        if (coords.length > 0) {
                            // Get the most recent coordinate
                            const latest = coords[coords.length - 1];
                            
                            // Add marker to map
                            const markerIcon = L.icon({
                                iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-icon.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                            });
                            
                            const marker = L.marker([latest.lat, latest.lng], {icon: markerIcon}).addTo(map);
                            marker.bindPopup(`
                                <strong>Route:</strong> ${trip.route}<br>
                                <strong>Type:</strong> ${trip.jeepney_type}<br>
                                <strong>Last Updated:</strong> ${new Date(latest.timestamp).toLocaleTimeString()}
                            `);
                            
                            markers[tripId] = marker;
                            
                            // Add to list
                            listHtml += `
                                <a href="#" class="list-group-item list-group-item-action" 
                                   onclick="event.preventDefault(); map.setView([${latest.lat}, ${latest.lng}], 15); 
                                   markers['${tripId}'].openPopup();">
                                    <div class="d-flex w-100 justify-content-between">
                                        <h5 class="mb-1">Route: ${trip.route}</h5>
                                        <small>${trip.jeepney_type} jeepney</small>
                                    </div>
                                    <p class="mb-1">Last updated: ${new Date(latest.timestamp).toLocaleTimeString()}</p>
                                </a>
                            `;
                        }
                    }
                }
                
                listHtml += '</div>';
                
                if (count > 0) {
                    document.getElementById('activeJeepneyList').innerHTML = listHtml;
                } else {
                    document.getElementById('activeJeepneyList').innerHTML = 
                        '<div class="alert alert-warning">No active jeepneys found matching the filters.</div>';
                }
            } else {
                document.getElementById('activeJeepneyList').innerHTML = 
                    '<div class="alert alert-warning">No active jeepneys found.</div>';
            }
        });
    }
    
    // Initialize map
    initMap();
    
    // Apply filters button
    document.getElementById('applyFiltersBtn').addEventListener('click', function() {
        loadActiveJeepneys();
    });
});
</script>

<?php
include('includes/footer.php');
?>
