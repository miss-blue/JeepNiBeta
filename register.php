<!-- /*
Author: Rica May Simbulan
Filename: register.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the registration page for the JeepN! Tracking System. 
         It allows users to register as drivers, passengers, admin, or super admin.
         It includes form validation and session management.
*/ -->
<?php
session_start();
if (isset($_SESSION['verified_user_id']) && 
    (!isset($_SESSION['role']) || ($_SESSION['role'] != 'admin' && $_SESSION['role'] != 'super_admin'))) {
    $_SESSION['status'] = "You are already logged in";
    header('Location: home.php');
    exit();
}
include('includes/header.php');
$selected_role = $_GET['role'] ?? '';
?>

<div class="container">
    <div class="row justify-content-center">
        <div class="col-md-6">

            <?php
            if(isset($_SESSION['status']))
            {
                echo "<h5 class='alert alert-success'>".$_SESSION['status']."</h5>";
                unset($_SESSION['status']);
            }
            ?>
            <div class="card">
                <div class="card-header">
                    <h4>
                        Register
                        <a href="index.php" class="btn btn-danger float-end">Back</a>
                    </h4>
                </div>
                <div class="card-body">
                    <form action="code.php" method="POST">
                        <div class="form-group mb-3">
                            <label for="">Full Name</label>
                            <input type="text" name="full_name" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label for="">Phone Number</label>
                            <input type="text" name="phone" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label for="">Email Address</label>
                            <input type="text" name="email" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label>Password</label>
                            <input type="password" name="password" class="form-control" required
                                   minlength="8" id="password">
                            <small class="text-muted">Minimum 8 characters</small>
                        </div>
                        <div class="form-group mb-3">
                            <label><strong>Register As:</strong></label>
                            <select name="role" class="form-control" required>
                            <option value="">Select Role</option>
                             <option value="drivers" <?= $selected_role == 'drivers' ? 'selected' : '' ?>>Driver</option>
                            <option value="passengers" <?= $selected_role == 'passengers' ? 'selected' : '' ?>>Passenger</option>
                        </select>
                        </div>
                        <div class="form-group mb-3">
                            <button type="submit" name="register_btn" class="btn btn-primary">Register</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>

<?php
include('includes/footer.php');
?>

   