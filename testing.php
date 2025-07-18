<!-- /*
Author: Rica May Simbulan
Filename: testing.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: For testing of the export functionality of the JeepN! Tracking System. 
*/ -->
<?php
require_once 'vendor/autoload.php';
session_start();
require_once 'dbcon.php';
include('authentication.php');
include('admin_auth.php');
include('includes/header.php');

// Export Masterlist
if (isset($_POST['export_masterlist'])) {
    $all_users = $database->getReference('all_users')->getValue();
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="masterlist.csv"');
    $output = fopen('php://output', 'w');
    fputcsv($output, ['User ID', 'Full Name', 'Email', 'Role']);
    if ($all_users) {
        foreach ($all_users as $key => $row) {
            fputcsv($output, [
                substr($key, 0, 6),
                ($row['full_name'] ?? 'N/A') . ' ' . ($row['lname'] ?? ''),
                $row['email'] ?? 'N/A',
                $row['role'] ?? 'norole'
            ]);
        }
    }
    fclose($output);
    exit;
}

// Export Drivers
if (isset($_POST['export_drivers'])) {
    $drivers = $database->getReference('drivers')->getValue();
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="drivers_list.csv"');
    $output = fopen('php://output', 'w');
    fputcsv($output, ['User ID', 'Full Name', 'Email', 'Role']);
    if ($drivers) {
        foreach ($drivers as $key => $row) {
            fputcsv($output, [
                substr($key, 0, 6),
                ($row['full_name'] ?? 'N/A') . ' ' . ($row['lname'] ?? ''),
                $row['email'] ?? 'N/A',
                $row['role'] ?? 'norole'
            ]);
        }
    }
    fclose($output);
    exit;
}

// Export Passengers
if (isset($_POST['export_passengers'])) {
    $passengers = $database->getReference('passengers')->getValue();
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="passengers_list.csv"');
    $output = fopen('php://output', 'w');
    fputcsv($output, ['User ID', 'Full Name', 'Email', 'Role']);
    if ($passengers) {
        foreach ($passengers as $key => $row) {
            fputcsv($output, [
                substr($key, 0, 6),
                ($row['full_name'] ?? 'N/A') . ' ' . ($row['lname'] ?? ''),
                $row['email'] ?? 'N/A',
                $row['role'] ?? 'norole'
            ]);
        }
    }
    fclose($output);
    exit;
}
?>

<div class="container">
    <div class="row">
        <div class="col-md-12">
            <?php if (isset($_SESSION['status'])): ?>
                <?php 
                    $status = $_SESSION['status']; 
                    unset($_SESSION['status']);
                    if (stripos($status, 'access denied') === false):
                ?>
                    <h5 class='alert alert-success'><?= $status ?></h5>
                <?php endif; ?>
            <?php endif; ?>

            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h4 class="mb-0">Dashboard</h4>
                    <div>
                        <form method="post" class="d-inline">
                            <button type="submit" name="export_masterlist" class="btn btn-sm btn-info">⬇️ Export Masterlist</button>
                        </form>
                        <form method="post" class="d-inline">
                            <button type="submit" name="export_drivers" class="btn btn-sm btn-primary">⬇️ Export Drivers</button>
                        </form>
                        <form method="post" class="d-inline">
                            <button type="submit" name="export_passengers" class="btn btn-sm btn-success">⬇️ Export Passengers</button>
                        </form>
                    </div>
                </div>
                <div class="card-body">
                    <?php
                    if (isset($_SESSION['verified_user_id'])) {
                        $uid = $_SESSION['verified_user_id'];
                        $user_data = $database->getReference('all_users/' . $uid)->getValue();
                        $role = $user_data['role'] ?? 'unknown';

                        // Admin can view everything
                        if ($role === 'admin' || $role === 'super_admin') {
                            include('admin-dashboard.php');
                            echo '<hr>';
                            include('driver-dashboard.php');
                            echo '<hr>';
                            include('passenger-dashboard.php');
                        } elseif ($role === 'driver') {
                            include('driver-dashboard.php');
                        } elseif ($role === 'passenger') {
                            include('passenger-dashboard.php');
                        } else {
                            echo "<div class='alert alert-warning'>Unknown role. Access limited.</div>";
                        }
                    } else {
                        echo "<div class='alert alert-warning'>Unable to retrieve user data. Please log in again.</div>";
                    }
                    ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php include('includes/footer.php'); ?>
