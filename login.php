<!-- /*
Author: Rica May Simbulan
Filename: login.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the login page for the JeepN! Tracking System. 
         It allows users to enter their email and password to log in.
         If the user is already logged in, they are redirected to the dashboard.
         If there is a session status message, it is displayed at the top of the page.
*/ -->
<?php
session_start();
include('includes/header.php');
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
                        Login
                        <a href="index.php" class="btn btn-danger float-end">Back</a>
                    </h4>
                </div>
                <div class="card-body">
                    <form action="logincode.php" method="POST">
                        <div class="form-group mb-3">
                            <label for="">Email Address</label>
                            <input type="text" name="email" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label for="">Password</label>
                            <input type="password" name="password" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <button type="submit" name="login_btn" class="btn btn-primary">Login</button>
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

   