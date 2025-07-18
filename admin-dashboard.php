<!-- /*
Author: Rica May Simbulan
Filename: admin-dashboard.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the admin dashboard page for the JeepN! Tracking System. 
         It allows the admin to view user statistics, manage users, and access driver and passenger lists.
         The page includes sections for total users, drivers, passengers, and a masterlist of all users.
*/ -->
<?php
include('authentication.php'); // Ensure user is logged in
include('admin_auth.php');     // Ensure user is admin
include('dbcon.php');          // Firebase connection

$uid = $_SESSION['verified_user_id'];
$user_data = $database->getReference('all_users/' . $uid)->getValue();

if (isset($user_data['disabled']) && $user_data['disabled']) {
    $_SESSION['status'] = "Your account is disabled. Please contact admin.";
    header('Location: logout.php'); // or wherever you want to redirect
    exit();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Admin Dashboard</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css">
</head>
<body>
<div class="container mt-4">
  <h2 class="text-center mb-4">Admin Dashboard</h2>
  <!-- filepath: [admin-dashboard.php](http://_vscodecontentref_/0) -->
<div class="row mb-4">
  <!-- Total Users -->
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
  <!-- Total Drivers -->
  <div class="col-md-4 mb-3">
    <div class="card text-center">
      <div class="card-body">
        <h5 class="card-title">Total Drivers</h5>
        <?php
        $driver_count = 0;
        if ($all_users) {
          foreach ($all_users as $user) {
            if (is_array($user) && (isset($user['role']) && $user['role'] === 'drivers')) {
              $driver_count++;
            }
          }
        }
        ?>
        <h2><?php echo $driver_count; ?></h2>
      </div>
    </div>
  </div>
  <!-- Total Passengers -->
  <div class="col-md-4 mb-3">
    <div class="card text-center">
      <div class="card-body">
        <h5 class="card-title">Total Passengers</h5>
        <?php
        $passenger_count = 0;
        if ($all_users) {
          foreach ($all_users as $user) {
            if (is_array($user) && (isset($user['role']) && $user['role'] === 'passengers')) {
              $passenger_count++;
            }
          }
        }
        ?>
        <h2><?php echo $passenger_count; ?></h2>
      </div>
    </div>
  </div>
</div>
  <!-- Section: Masterlist -->
<div class="card mb-4">
    <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
        <span>Masterlist</span>
        <a href="register.php?role=admin" class="btn btn-sm btn-primary">+ Add Admin</a>    </div>

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

  <!-- Section: Drivers Only -->
  <div class="card mb-4">
    <div class="card-header bg-primary text-white">Drivers List</div>
    <div class="card-body">
      <?php include('driver-list.php'); ?>
    </div>
  </div>

  <!-- Section: Passengers Only -->
  <div class="card mb-4">
    <div class="card-header bg-success text-white">Passengers List</div>
    <div class="card-body">
      <?php include('passenger-list.php'); ?>
    </div>
  </div>
</div>
</body>
</html>
