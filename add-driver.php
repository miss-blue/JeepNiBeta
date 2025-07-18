<!-- /*
Author: Rica May Simbulan
Filename: add-driver.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the add driver page for the JeepN! Tracking System. 
         It allows the admin to add a new driver to the system by entering their details.
         The form submits the data to code.php for processing.
*/ -->
<?php
include('includes/header.php');
?>

<div class="container">
    <div class="row justify-content-center">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h4>
                        Add Driver
                        <a href="driver-list.php" class="btn btn-danger float-end">Back</a>
                    </h4>
                </div>
                <div class="card-body">
                    <form action="code.php" method="POST">
                    <input type="hidden" name="role" value="drivers">
                        <div class="form-group mb-3">
                            <label for="">Fullname</label>
                            <input type="text" name="full_name" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label for="">Email Address</label>
                            <input type="text" name="email" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <label for="">Phone Number</label>
                            <input type="text" name="phone" class="form-control">
                        </div>
                        <div class="form-group mb-3">
                            <button type="submit" name="save_all_users" class="btn btn-primary">Save Infos</button>
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

   