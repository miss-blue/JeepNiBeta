<!-- /*
Author: Rica May Simbulan
Filename: logout.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the logout page for the JeepN! Tracking System. 
         It handles user logout by destroying the session and redirecting to the login page.
         It also sets a status message indicating successful logout or session expiration.
*/ -->
<?php
session_start();

unset($_SESSION['verified_user_id']);
unset($_SESSION['idTokenString']);

if (isset($_SESSION['verified_admin'])) {

    unset($_SESSION['verified_admin']);
    $_SESSION['status'] = "Logged Out Successfully";
}elseif($_SESSION['verified_super_admin'])
{
    unset($_SESSION['verified_super_admin']);
    $_SESSION['status'] = "Logged Out Successfully";
}

if(isset($_SESSION['expiry_status']))
{
    $_SESSION['status'] = "Session Expired";
}else{
    $_SESSION['status'] = "Logged Out Successfully";
}
header('Location: login.php');
exit();
?>