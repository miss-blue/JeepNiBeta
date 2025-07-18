<!-- /*
Author: Rica May Simbulan
Filename: passenger-edit.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the passenger edit page for the JeepN! Tracking System. 
         It allows the admin to edit and update passenger data, enable or disable user accounts, 
         change passwords, and manage custom user claims.
         The page includes a header and footer for consistent layout.
*/ -->
<?php
include('dbcon.php');
include('includes/header.php');
?>

<div class="container">
            <?php
            if(isset($_SESSION['status']))
            {
                echo "<h5 class='alert alert-success'>".$_SESSION['status']."</h5>";
                unset($_SESSION['status']);
            }
            ?>
    <div class="row justify-content-center">
        <div class="col-md-6">

            <div class="card">
                <div class="card-header">
                    <h4>
                        Edit & Update Passenger Data
                        <a href="passenger-edit.php" class="btn btn-danger float-end">Back</a>
                    </h4>
                </div>
                <div class="card-body">
                    <?php
                        include('dbcon.php');

                        if(isset($_GET['id']))
                        {
                            $uid = $_GET['id'];
                            $user = $database->getReference('passengers/'.$uid)->getValue();

                            if ($user) {
                    ?>
                        <form action="code.php" method="POST">
                            <input type="hidden" name="passenger_id" value="<?= $uid ?>">
                            <div class="form-group mb-3">
                                <label for="">Full Name</label>
                                <input type="text" name="full_name" value="<?= $user['full_name'] ?? '' ?>" class="form-control">
                            </div>
                            <div class="form-group mb-3">
                                <label for="">Phone Number</label>
                                <input type="text" name="phone" value="<?= $user['phone'] ?? '' ?>" class="form-control">
                            </div>
                            <div class="form-group mb-3">
                                <button type="submit" name="update_passenger_btn" class="btn btn-primary">Update Passenger</button>
                            </div>
                        </form>
                    <?php
                            } else {
                                echo "<h5 class='text-danger'>Passengers not found.</h5>";
                            }
                        }
                    ?>
                </div>
            </div>
        </div>

        <div class="col-md-6">
            <div class="card">
                <div class="card-header">
                    <h4>Enable or Disable User Account</h4>
                </div>
                <div class="card-body">
                <form action="code.php" method="POST">
                    <?php
                    if (isset($_GET['id'])) {
                        $uid = $_GET['id'];
                        try {
                            $passenger = $database->getReference('all_users/' . $uid)->getValue();
                            $auth_uid = $passenger['auth_uid'] ?? null;

                            if ($auth_uid) {
                                try {
                                    $user = $auth->getUser($auth_uid);
                                    ?>
                                    <input type="hidden" name="ena_dis_user_id" value="<?= $uid; ?>">
                                    <div class="input-group mb-3">
                                        <select name="select_enable_disable" class="form-control" required>
                                            <option value="">Select</option>
                                            <option value="disable">Disable</option>
                                            <option value="enable">Enable</option>
                                        </select>
                                        <button type="submit" name="enable_disable_user_ac" class="input-group-text btn btn-primary">
                                            Submit
                                        </button>
                                    </div>
                                    <?php
                                } catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
                                    echo "<div class='alert alert-danger'>Auth user not found in Firebase Auth.</div>";
                                }
                            } else {
                                echo "<div class='alert alert-warning'>This user has no auth_uid (likely not registered via Firebase Auth).</div>";
                            }
                        } catch (Exception $e) {
                            echo "<div class='alert alert-danger'>Error: " . $e->getMessage() . "</div>";
                        }
                    } else {
                        echo "<div class='alert alert-warning'>No user ID provided.</div>";
                    }
                    ?>
                </form>

                </div>
            </div>
        </div>

        <div class="col-md-6">
            <div class="card mt-4">
                <div class="card-header">
                    <h4>Change Password</h4>
                </div>
                <div class="card-body">
                    <form action="code.php" method="POST">
                                <?php 
                                    if (isset($_GET['id'])) 
                                    {
                                       $uid = $_GET['id'];
                                       try {
                                        $passenger = $database->getReference('all_users/' . $uid)->getValue();
                                        $auth_uid = $passenger['auth_uid'] ?? null;

                                        if ($auth_uid) {
                                            $user = $auth->getUser($auth_uid);
                                        } else {
                                            throw new Exception("auth_uid not found.");
                                        }
                                    ?>
                                    <input type="hidden" name="change_pwd_user_id" value="<?=$uid?>">
                                    <div class="form-group mb-3">
                                            <label for="">New Password</label>
                                            <input type="text" name="new_password" required class="form-control">
                                    </div>
                                    <div class="form-group mb-3">
                                            <label for="">Re-Type Password</label>
                                            <input type="text" name="retype_password" required class="form-control">
                                    </div>
                                    <div class="form-group mb-3">
                                            <button type="submit" name="change_password_btn" class="btn btn-primary">Submit</button>
                                    </div>
                                    <?php
                                    } catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
                                        echo $e->getMessage();
                                    }
                                    }
                                    else{
                                        echo "No id Found";
                                    }
                                ?>
                    </form>
                </div>
            </div>
        </div>

        <div class="col-md-6">
            <div class="card mt-4">
                <div class="card-header">
                    <h4>Custom User Claims</h4>
                </div>
                <div class="card-body">
                    <form action="code.php" method="POST">

                        <?php
                            if (isset($_GET['id'])) {
                                $uid = $_GET['id'];
                                ?>

                                <input type="hidden" name="claims_user_id" value="<?=$uid;?>">
                                <div class="form-group mb-3">
                                    <select name="role_as" class="form-control" required>
                                        <option value="">Select Roles</option>
                                        <option value="admin">Admin</option>
                                        <option value="norole">Remove Role</option>
                                    </select>
                                </div>
                                <label for="">Currently: user role is:</label>
                                    <h4 class="border bg-warning p-2">
                                        <?php
                                            $passenger = $database->getReference('all_users/' . $uid)->getValue();
                                            $auth_uid = $passenger['auth_uid'] ?? null;

                                            if ($auth_uid) {
                                                try {
                                                    $claims = $auth->getUser($auth_uid)->customClaims;

                                                    if (isset($claims['admin']) && $claims['admin']) {
                                                        echo "Role : Admin";
                                                    } elseif (isset($claims['super_admin']) && $claims['super_admin']) {
                                                        echo "Role : Super Admin";
                                                    } else {
                                                        echo "Role : No Role";
                                                    }
                                                } catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
                                                    echo "Auth user not found.";
                                                }
                                            } else {
                                                echo "auth_uid not found.";
                                            }
                                        ?>
                                    </h4>

                                <div class="form-group mb-3">
                                    <button type="submit" name="user_claims_btn" class="btn btn-primary">Submit</button>
                                </div>
                        <?php
                            }
                        ?>
                    </form>
                </div>
            </div>
        </div>

    </div>
</div>

<?php
include('includes/footer.php');
?>
