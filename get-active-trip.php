<!-- /*
Author: Rica May Simbulan
Filename: get-active-trip.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This script checks if there is an active trip for the user.
         It returns a JSON response indicating whether an active trip exists or not.
         If an active trip exists, it includes the trip ID in the response.
         This script is used in the dashboard to display the current trip status.
*/ -->
<?php
session_start();
header('Content-Type: application/json');

// Simulate a session-based active trip
if (!isset($_SESSION['verified_user_id'])) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Not authenticated'
    ]);
    exit;
}

// Simulate an active trip if session has a trip ID
if (isset($_SESSION['active_trip_id'])) {
    echo json_encode([
        'status' => 'success',
        'active_trip' => true,
        'trip_id' => $_SESSION['active_trip_id']
    ]);
} else {
    echo json_encode([
        'status' => 'success',
        'active_trip' => false
    ]);
}
?>
