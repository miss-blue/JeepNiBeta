<!-- /*
Author: Rica May Simbulan
Filename: my-profile copy.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This a copy of my-profile page for the JeepN! Tracking System. 
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
                    if (isset($_SESSION['status'])) {
                        $status = $_SESSION['status'];
                        unset($_SESSION['status']);

                        // Only show if it's not an access-denied error
                        if (stripos($status, 'access denied') === false) {
                            echo "<h5 class='alert alert-success'>{$status}</h5>";
                        }
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
                                                <input type="text" name="display_name" class="form-control editable" value="<?=$user->displayName;?>" required class="form-control">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label for="">Phone Number</label>
                                                <input type="text" name="phone" class="form-control editable" value="<?=$user->phoneNumber;?>" class="form-control">
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
                                                    echo ($user->disabled ?? false) ? 'Disabled' : 'Enabled';                                                ?>
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
                                        }else {
                                            
                                            echo "Update your profile picture";
                                            
                                        }
                                        ?>
                                    </div>
                                    <div class="form-control editable" class="form-group mb-3">
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
