<!-- /*
Author: Rica May Simbulan
Filename: index.php 
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the main page for the JeepN! Tracking System. 
         It displays the total number of records and a master list of all users.
         The page includes options to edit and delete user records.
         It also includes a header and footer for consistent layout.
*/ -->
<?php
include('admin_auth.php');
include('includes/header.php');
?>

<div class="container">
    <div class="row">

        <div class="col-md-6 mb-3">
            <div class="card-body">
                <h5>Total No of Records:
                <?php
                include('dbcon.php');
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

    echo $valid_count;
?>
                </h5>
            </div>
        </div>
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
                        JeepN! Masterlist
                    </h4>
                </div>
                <div class="card-body">
                    <table class="table table-bordered table-striped">
                        <thead>
                            <tr>
                            <th>Sl.no</th>
                            <th>Fullname</th>
                            <th>Email Id</th>
                            <th>Phone No</th>
                            <th>Edit</th>
                            <th>Delete</th>
                            </tr>                          
                        </thead>
                        <tbody>
                            <?php
                                include('dbcon.php');

                                $ref_table = 'all_users';
                                $fetchdata = $database->getReference($ref_table)->getValue();
                                
                                if ($fetchdata > 0) 
                                {
                                    $i=0;
                                    foreach ($fetchdata as $key => $row) {
                                        // Skip if $row is not an array
                                        if (!is_array($row)) {
                                            continue;
                                        }
                                    ?>
                                    <tr>
                                        <td><?= $i++; ?></td>
                                        <td><?= isset($row['full_name']) ? $row['full_name'] : (isset($row['fullname']) ? $row['fullname'] : 'N/A'); ?></td>
                                        <td><?= isset($row['email']) ? $row['email'] : 'N/A'; ?></td>
                                        <td><?= isset($row['phone']) ? $row['phone'] : 'N/A'; ?></td>
                                        <td>
                                            <a href="edit-info.php?id=<?= $key ?>" class="btn btn-primary btn-sm">Edit</a>
                                        </td>
                                        <td>
                                            <form action="code.php" method="POST">
                                                <button type="submit" name="delete_btn" value="<?= $key ?>" class="btn btn-danger">Delete</button>
                                            </form>
                                        </td>
                                    </tr>
                                    <?php
                                    }
                                }
                                else 
                                {
                                    ?>
                                        <tr>
                                            <td colspan="7">No Record Found</td>
                                        </tr>
                                    <?php
                                }
                            ?>
                            <tr>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<?php
include('includes/footer.php');
?>

   