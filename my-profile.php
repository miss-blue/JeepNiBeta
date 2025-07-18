<!-- /*
Author: Rica May Simbulan
Filename: my-profile.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the my profile page for the JeepN! Tracking System. 
         It displays the user's profile information and allows them to update their profile and change their password.
         The page includes a form for updating the profile picture, display name, phone number, and password.
         It also includes a section for displaying the user's role and account status.  
*/ -->
<?php
session_start();
include('includes/header.php');
?>

<div class="container">
    <div class="row">
        <div class="col-md-12">
            <div class="card">
                <div class="card-header">
                    <h4>My Profile</h4>
                </div>
                <div class="card-body">

                <?php
                    if(isset($_SESSION['status']))
                    {
                        echo "<h5 class='alert alert-success'>".$_SESSION['status']."</h5>";
                        unset($_SESSION['status']);
                    }
                ?>
                    <?php
                        if (isset($_SESSION['verified_user_id'])) {
                            $uid = $_SESSION['verified_user_id'];
                            $user = $auth->getUser($uid);
                            ?>

                        <form action="code.php" method="POST" enctype="multipart/form-data">
                            <div class="row">
                                <div class="col-md-8 border-end">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label for="">Display Name</label>
                                                <input type="text" name="display_name" class="form-control editable" value="<?=$user->displayName;?>" required>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label for="">Phone Number</label>
                                                <input type="text" name="phone" class="form-control editable" value="<?=$user->phoneNumber;?>">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label for="">Email Address</label>
                                                <div class="form-control">
                                                    <?=$user->email;?>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label for="">Your Role</label>
                                                <div class="form-control">
                                                <?php
                                                    $driver = $database->getReference('all_users/' . $uid)->getValue();
                                                    $auth_uid = $driver['auth_uid'] ?? null;

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
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label for="">Account Status(Disable/Enable)</label>
                                                <div class="form-control">
                                                <?php
                                                    echo ($user->disabled ?? false) ? 'Disabled' : 'Enabled';
                                                ?>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="form-group border mb-3">
                                        <?php
                                        if ($user->photoUrl != NULL) {
                                            ?>
                                            <img src="<?=$user->photoUrl?>" class="w-100" alt="User Profile">
                                            <?php
                                        } else {
                                            echo "Update your profile picture";
                                        }
                                        ?>
                                    </div>
                                    <div class="form-control editable mb-3">
                                        <label for="">Upload Profile Image</label>
                                        <input type="file" name="profile" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-12">
                                    <hr>
                                    <div class="form-group mb-3">
                                        <button type="submit" name="update_user_profile" class="btn btn-primary float-end">Update Profile</button>
                                    </div>
                                </div>
                            </div>
                        </form>

                        <!-- Password Change Form -->
                        <hr>
                        <div class="card mt-4">
                            <div class="card-header bg-warning text-dark">Change Password</div>
                            <div class="card-body">
                                <form method="POST" action="code.php">
                                    <input type="hidden" name="change_pwd_user_id" value="<?=$uid?>">
                                    <div class="form-group mb-3">
                                        <label for="">Current Password</label>
                                        <input type="password" name="current_password" required class="form-control">
                                    </div>
                                    <div class="form-group mb-3">
                                        <label for="">New Password</label>
                                        <input type="password" name="new_password" required class="form-control">
                                    </div>
                                    <div class="form-group mb-3">
                                        <label for="">Re-Type Password</label>
                                        <input type="password" name="retype_password" required class="form-control">
                                    </div>
                                    <div class="form-group mb-3">
                                        <button type="submit" name="change_password_btn" class="btn btn-primary">Change and Logout</button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <?php
                        }
                    ?>
                </div>
            </div>
        </div>
    </div>
</div>

<?php
include('includes/footer.php')
?>
