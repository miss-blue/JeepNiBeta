<!-- /*
Author: Rica May Simbulan
Filename: trip-tracking.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the trip tracking page for the JeepN! Tracking System. 
         It checks if the user is logged in and verifies their Firebase ID token.
         If the token is invalid or expired, it redirects to the logout page.
         If the user is not logged in, it redirects to the login page.
*/ -->
<?php
session_start();
header('Content-Type: application/json');

$uid = $_SESSION['verified_user_id'];
$user_data = $database->getReference('all_users/' . $uid)->getValue();

if (isset($user_data['disabled']) && $user_data['disabled']) {
    $_SESSION['status'] = "Your account is disabled. Please contact admin.";
    header('Location: logout.php'); // or wherever you want to redirect
    exit();
}
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Check if user is logged in
if (!isset($_SESSION['verified_user_id'])) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Not authenticated'
    ]);
    exit;
}

$user_id = $_SESSION['verified_user_id'];
$role = $_SESSION['role'] ?? 'driver';

// Sample dummy database (replace with actual Firebase logic or MySQL)
$sampleLogData = [
    ['latitude' => 16.043, 'longitude' => 120.333, 'route' => 'Boquig', 'timestamp' => time() - 300],
    ['latitude' => 16.044, 'longitude' => 120.334, 'route' => 'Boquig', 'timestamp' => time() - 180],
    ['latitude' => 16.045, 'longitude' => 120.335, 'route' => 'Boquig', 'timestamp' => time() - 60],
];

switch ($action) {
    case 'get_user_info':
        echo json_encode([
            'status' => 'success',
            'user_id' => $user_id,
            'role' => $role
        ]);
        break;

    case 'check_tracking_status':
        // Simulate an active trip for demo purposes
        echo json_encode([
            'status' => 'success',
            'is_tracking' => true,
            'route' => 'Boquig'
        ]);
        break;

    case 'get_trip_logs':
        echo json_encode([
            'status' => 'success',
            'logs' => $sampleLogData
        ]);
        break;

    case 'export_data':
        $type = $_GET['type'] ?? 'csv';
        $filename = "trip_logs_export_" . date('Ymd') . ".$type";
        header("Content-Disposition: attachment; filename=$filename");
        if ($type === 'csv') {
            echo "Timestamp,Latitude,Longitude,Route\n";
            foreach ($sampleLogData as $log) {
                echo date('Y-m-d H:i:s', $log['timestamp']) . ",{$log['latitude']},{$log['longitude']},{$log['route']}\n";
            }
        } else {
            echo "PDF export not implemented in demo.";
        }
        break;

    default:
        echo json_encode([
            'status' => 'error',
            'message' => 'Invalid action'
        ]);
        break;
}
?>
