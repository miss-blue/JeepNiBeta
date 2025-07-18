<!-- /*
Author: Rica May Simbulan
Filename: passenger-list.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the passenger list page for the JeepN! Tracking System. 
         It displays a list of passengers and allows the admin to add, edit, or delete passengers.
         The page includes a table with passenger details and action buttons for each passenger.
         The page also includes a header and footer for consistent layout.
*/ -->
<?php
include('admin_auth.php');
include('dbcon.php');
?>

<div class="container">
    <div class="row">

        
        <div class="col-md-12">
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
                        <a href="add-passenger.php" class="btn btn-primary float-end">Add Passenger</a>
                    </h4>
                </div>
                <div class="card-body">
                    <table class="table table-bordered table-striped">
                        <thead>
                            <tr>
                            <th>Sl.no</th>
                            <th>Display</th>
                            <th>Email Id</th>
                            <th>Phone No</th>
                            <th>Role as</th>
                            <th>Disable/Enable</th>
                            <th>Edit</th>
                            <th>Delete</th>
                            </tr>                          
                        </thead>
                        <tbody>
                           <?php
                           include('dbcon.php');
                           $users = $database->getReference('passengers')
                                ->orderByChild('role')
                                ->equalTo('passengers')
                                ->getValue();

                                $i=1;
                                foreach ($users as $uid => $user) {
                                    ?>
                                    <tr>
                                        <td><?=$i++;?></td>
                                        <td><?= $user['full_name'] ?></td>
                                        <td><?= $user['email'] ?></td>
                                        <td><?= $user['phone'] ?></td>
                                        <td>
                                        <span class="border bg-warning p-2">
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
                                    </span>
                                        </td>
                                        <td>
                                            <?php
                                            echo (isset($user['disabled']) && $user['disabled']) ? 'Disabled' : 'Enabled';
                                            ?>
                                        </td>
                                        <td>
                                            <a href="passenger-edit.php?id=<?= $uid ?>" class="btn btn-primary">Edit</a>
                                        </td>
                                        <td>
                                        <form action="code.php" method="POST">
                                                <button type="submit" name="reg_user_delete_btn" value="<?= $uid?>" class="btn btn-danger btn-sm">Delete</button>
                                            </form>
                                        </td>
                                    </tr>
                                    <?php
                                }
                           ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="col-md-12">
            <hr>
        </div>
        
    </div>
</div>

<?php
include('includes/footer.php');
?>

   