<!-- /*
Author: Rica May Simbulan
Filename: driver-dashboard.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the driver dashboard page for the JeepN! Tracking System. However, due to time constrictions I am not able to add this. 
         May i just leave it here just in case i need update in the future. 
         It displays driver information, active trips, and recent trip history.
         Only drivers can access this page.
*/ -->
<?php
include('authentication.php');
include('includes/header.php');
include('dbcon.php');

// Redirect if user is not a driver
if (!isset($_SESSION['verified_user']) || $_SESSION['verified_user']['role'] !== 'drivers') {
    $_SESSION['status'] = "Only drivers can access this page";
    header('Location: home.php');
    exit();
}

$driver_id = $_SESSION['verified_user_id'];
$driver = $auth->getUser($driver_id);
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
            
            <div class="card mb-4">
                <div class="card-header">
                    <h4>Driver Dashboard</h4>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="user-info">
                                <h5>Driver Information</h5>
                                <p><strong>Name:</strong> <?= $driver->displayName ?? 'Not set' ?></p>
                                <p><strong>Email:</strong> <?= $driver->email ?? 'Not set' ?></p>
                                <p><strong>Phone:</strong> <?= $driver->phoneNumber ?? 'Not set' ?></p>
                                <p><strong>Account Status:</strong> 
                                    <?php
                                    if ($driver->disabled) {
                                        echo '<span class="status-inactive">Disabled</span>';
                                    } else {
                                        echo '<span class="status-active">Active</span>';
                                    }
                                    ?>
                                </p>
                                <a href="my-profile.php" class="btn btn-info btn-sm">Edit Profile</a>
                            </div>
                        </div>
                        
                        <div class="col-md-6">
                            <?php
                            // Check for active trip
                            $active_trip = null;
                            if (isset($_SESSION['active_trip_id'])) {
                                $trip_id = $_SESSION['active_trip_id'];
                                $active_trip = $database->getReference('trip_logs/'.$trip_id)->getValue();
                            }
                            
                            if ($active_trip && isset($active_trip['status']) && $active_trip['status'] == 'active') {
                                ?>
                                <div class="alert alert-success">
                                    <h5>Active Trip</h5>
                                    <p><strong>Trip ID:</strong> <?= $_SESSION['active_trip_id'] ?></p>
                                    <p><strong>Route:</strong> <?= $active_trip['route'] ?? 'N/A' ?></p>
                                    <p><strong>Jeepney Type:</strong> <?= $active_trip['jeepney_type'] ?? 'N/A' ?></p>
                                    <p><strong>Started:</strong> <?= $active_trip['start_time'] ?? 'N/A' ?></p>
                                    <a href="start-trip.php" class="btn btn-primary">Continue Trip</a>
                                </div>
                                <?php
                            } else {
                                ?>
                                <div class="alert alert-info">
                                    <h5>Start a New Trip</h5>
                                    <p>You don't have any active trips. Start a new one!</p>
                                    <a href="start-trip.php" class="btn btn-primary">Start Trip</a>
                                </div>
                                <?php
                            }
                            ?>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h4>Recent Trips</h4>
                </div>
                <div class="card-body">
                    <table class="table table-bordered table-striped">
                        <thead>
                            <tr>
                                <th>Trip ID</th>
                                <th>Route</th>
                                <th>Jeepney Type</th>
                                <th>Start Time</th>
                                <th>End Time</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>                          
                        </thead>
                        <tbody>
                            <?php
                            // Get all trips for this driver
                            $trip_logs = $database->getReference('trip_logs')->getValue();
                            
                            if ($trip_logs) {
                                $driver_trips = [];
                                
                                // Filter trips for this driver
                                foreach ($trip_logs as $trip_id => $trip) {
                                    if (isset($trip['driver_id']) && $trip['driver_id'] == $driver_id) {
                                        $driver_trips[$trip_id] = $trip;
                                    }
                                }
                                
                                // Sort by start time descending (newest first)
                                uasort($driver_trips, function($a, $b) {
                                    return strtotime($b['start_time']) - strtotime($a['start_time']);
                                });
                                
                                // Take only the latest 5 trips
                                $recent_trips = array_slice($driver_trips, 0, 5);
                                
                                if (count($recent_trips) > 0) {
                                    foreach ($recent_trips as $trip_id => $trip) {
                                        ?>
                                        <tr>
                                            <td><?= $trip_id ?></td>
                                            <td><?= $trip['route'] ?? 'N/A' ?></td>
                                            <td><?= $trip['jeepney_type'] ?? 'N/A' ?></td>
                                            <td><?= $trip['start_time'] ?? 'N/A' ?></td>
                                            <td><?= $trip['end_time'] ?? 'N/A' ?></td>
                                            <td>
                                                <?php
                                                    if (isset($trip['status'])) {
                                                        if ($trip['status'] == 'active') {
                                                            echo '<span class="badge bg-success">Active</span>';
                                                        } else {
                                                            echo '<span class="badge bg-secondary">Completed</span>';
                                                        }
                                                    } else {
                                                        echo 'N/A';
                                                    }
                                                ?>
                                            </td>
                                            <td>
                                                <a href="view-trip.php?id=<?= $trip_id ?>" class="btn btn-info btn-sm">View</a>
                                            </td>
                                        </tr>
                                        <?php
                                    }
                                } else {
                                    ?>
                                    <tr>
                                        <td colspan="7">No trips found for this driver.</td>
                                    </tr>
                                    <?php
                                }
                            } else {
                                ?>
                                <tr>
                                    <td colspan="7">No trip logs found in the database.</td>
                                </tr>
                                <?php
                            }
                            ?>
                        </tbody>
                    </table>
                    
                    <div class="mt-3">
                        <a href="trip-history.php" class="btn btn-primary">View All Trips</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<?php
include('includes/footer.php');
?>
