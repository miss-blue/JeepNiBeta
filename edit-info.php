<!-- /*
Author: Rica May Simbulan
Filename: edit-info.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the authentication page for the JeepN! Tracking System. 
         It checks if the user is logged in and verifies their token.
         If the token is invalid or expired, it redirects to the logout page.
         If the user is not logged in, it redirects to the login page.
*/ -->
<?php
include('includes/header.php');
include('dbcon.php');
?>

<div class="container">
    <div class="row justify-content-center">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h4>
                        Edit & Update Info
                        <a href="dashboard.php" class="btn btn-danger float-end">Back</a>
                    </h4>
                </div>
                <div class="card-body">
                    <?php
                    if (isset($_GET['id'])) {
                        $key_child = $_GET['id'];

                        $ref_table = 'all_users';
                        $getdata = $database->getReference($ref_table)->getChild($key_child)->getValue();        

                        if ($getdata) {
                    ?>
                            <form action="code.php" method="POST">
                                <!-- ✅ Send correct UID -->
                                <input type="hidden" name="uid" value="<?= $key_child ?>">

                                <div class="form-group mb-3">
                                    <label for="">Full Name</label>
                                    <input type="text" name="full_name" value="<?= $getdata['full_name']; ?>" class="form-control">
                                </div>

                                <div class="form-group mb-3">
                                    <label for="">Email Address</label>
                                    <input type="text" name="email" value="<?= $getdata['email']; ?>" class="form-control">
                                </div>

                                <div class="form-group mb-3">
                                    <label for="">Phone Number</label>
                                    <input type="text" name="phone" value="<?= $getdata['phone']; ?>" class="form-control">
                                </div>

                                <div class="form-group mb-3">
                                    <button type="submit" name="update_all_users" class="btn btn-primary">Update Infos</button>
                                </div>
                            </form>
                    <?php
                        } else {
                            $_SESSION['status'] = "User not found.";
                            header('Location: index.php');
                            exit();
                        }
                    } else {
                        $_SESSION['status'] = "No user ID provided.";
                        header('Location: index.php');
                        exit();
                    }
                    ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php
include('includes/footer.php');
?>
