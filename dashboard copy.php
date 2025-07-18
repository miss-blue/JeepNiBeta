<!-- /*
Author: Rica May Simbulan
Filename: dashboard copy.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is another copy for dashboard page for the JeepN! Tracking System. 
        It displays user information, trip history, and statistics for drivers and passengers.
*/ -->
<?php
require_once 'vendor/autoload.php';
session_start();
include('admin_auth.php');
include('authentication.php');
include('includes/header.php');
include('dbcon.php');
?>

<div class="container">
    <div class="row">
        <div class="col-md-12">
            <?php
            if(isset($_SESSION['status'])) {
                echo "<h5 class='alert alert-success'>".$_SESSION['status']."</h5>";
                unset($_SESSION['status']);
            }
            ?>
            <div class="card">
                <div class="card-body">
                    <?php
                    if(isset($_SESSION['verified_user_id'])) {
                        $uid = $_SESSION['verified_user_id'];
                        $user_ref = $database->getReference('all_users/' . $uid);
                        $user_data = $user_ref->getValue();
                        $role = $user_data['role'] ?? 'unknown';

                        if($role === 'drivers') {
                            ?>
                            <div class="alert alert-info">
                                <h5>Driver Dashboard</h5>
                                <p>Welcome to your driver dashboard. From here you can:</p>
                                <ul>
                                    <li>Start a new trip</li>
                                    <li>View your trip history</li>
                                    <li>Share your location</li>
                                    <li>Update your profile information</li>
                                </ul>
                                <a href="driver-dashboard.php" class="btn btn-primary me-2">Go to Dashboard</a>
                                <a href="home.php" class="btn btn-success">Live Tracking Map</a>
                            </div>
                            <?php
                        } elseif($role === 'passengers') {
                            ?>
                            <div class="alert alert-info">
                                <h5>Passenger Dashboard</h5>
                                <p>Welcome to your passenger dashboard. From here you can:</p>
                                <ul>
                                    <li>Track nearby jeepneys</li>
                                    <li>View available routes</li>
                                    <li>Update your profile information</li>
                                </ul>
                                <a href="passenger-dashboard.php" class="btn btn-primary me-2">Go to Dashboard</a>
                                <a href="live-map.php" class="btn btn-success">Live Tracking Map</a>
                            </div>
                            <?php
                        } else {
                            ?>
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h5 class="card-title">Total Users</h5>
                                            <?php
                                            $ref_table = 'all_users';
                                            $all_users = $database->getReference($ref_table)->getValue();
                                            $valid_count = 0;
                                            if ($all_users) {
                                                foreach ($all_users as $user) {
                                                    if (is_array($user)) {
                                                        $valid_count++;
                                                    }
                                                }
                                            }
                                            ?>
                                            <h2><?php echo $valid_count; ?></h2>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h5 class="card-title">Drivers</h5>
                                            <?php
                                            $drivers = $database->getReference('drivers')->getValue();
                                            $drivers_count = is_array($drivers) ? count($drivers) : 0;
                                            ?>
                                            <h2><?php echo $drivers_count; ?></h2>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <div class="card text-center">
                                        <div class="card-body">
                                            <h5 class="card-title">Passengers</h5>
                                            <?php
                                            $passengers = $database->getReference('passengers')->getValue();
                                            $passengers_count = is_array($passengers) ? count($passengers) : 0;
                                            ?>
                                            <h2><?php echo $passengers_count; ?></h2>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="card mb-4">
                                <div class="card-header bg-white border-0 d-flex align-items-center"
                                    style="border-left: 6px solid #4fc3f7; border-radius: 0.75rem 0.75rem 0 0; box-shadow: 0 2px 8px #e3f2fd;">
                                <span style="font-size:2rem; margin-right:10px;"></span>
                                <span class="fw-bold text-primary" style="font-size:1.4rem; letter-spacing:1px;">Masterlist</span>
                                </div>                                
                                <div class="card-body">
                                    <table class="table table-bordered table-hover">
                                        <thead>
                                            <tr>
                                                <th>User ID</th>
                                                <th>Full Name</th>
                                                <th>Email</th>
                                                <th>Role</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php
                                            $ref_table = "all_users";
                                            $fetchdata = $database->getReference($ref_table)->getValue();
                                            if ($fetchdata) {
                                                foreach ($fetchdata as $key => $row) {
                                                    ?>
                                                    <tr>
                                                        <td><?= substr($key, 0, 6); ?></td>
                                                        <td><?= $row['full_name'] ?? 'N/A'; ?> <?= $row['lname'] ?? ''; ?></td>
                                                        <td><?= $row['email'] ?? 'N/A'; ?></td>
                                                        <td><?= $row['role'] ?? 'norole'; ?></td>
                                                        <td>
                                                            <?php if ($row['role'] === 'driver') { ?>
                                                                <a href="driver-edit.php?id=<?= $key; ?>" class="btn btn-sm btn-warning">Edit</a>
                                                            <?php } elseif ($row['role'] === 'passenger') { ?>
                                                                <a href="passenger-edit.php?id=<?= $key; ?>" class="btn btn-sm btn-warning">Edit</a>
                                                            <?php } ?>
                                                            <a href="edit-info.php?id=<?= $key; ?>" class="btn btn-sm btn-info">Edit</a>
                                                        </td>
                                                    </tr>
                                                    <?php
                                                }
                                            } else {
                                                echo "<tr><td colspan='5'>No users found.</td></tr>";
                                            }
                                            ?>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div class="card mb-4">
                                <div class="card-header bg-primary text-white">Drivers List</div>
                                <div class="card-body">
                                    <?php include('driver-list.php'); ?>
                                </div>
                            </div>

                            <div class="card mb-4">
                                <div class="card-header bg-success text-white">Passengers List</div>
                                <div class="card-body">
                                    
                                    <?php include('passenger-list.php'); ?>
                                </div>
                            </div>
                            <?php
                        }
                    } else {
                        ?>
                        <div class="alert alert-warning">
                            <p>There was an issue retrieving your user information. Please log out and log back in.</p>
                        </div>
                        <?php
                    }
                    ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php include('includes/footer.php'); ?>
