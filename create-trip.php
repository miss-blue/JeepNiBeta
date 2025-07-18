<!-- /*
Author: Rica May Simbulan
Filename: create-trip.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the create trip page for the JeepN! Tracking System. 
*/ -->
<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['verified_user_id'])) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Not authenticated'
    ]);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!isset($data['route']) || !isset($data['jeepney_type'])) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid input'
    ]);
    exit;
}

// Simulate trip ID creation
$trip_id = uniqid("trip_");
$_SESSION['active_trip_id'] = $trip_id;

echo json_encode([
    'status' => 'success',
    'trip_id' => $trip_id
]);
?>
