<!-- /*
Author: Rica May Simbulan
Filename: admin_auth.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the admin authentication page for the JeepN! Tracking System. 
         It checks if the user is logged in and has admin or super admin privileges.
*/ -->
<?php
require_once 'dbcon.php';
require_once 'vendor/autoload.php';

use Kreait\Firebase\Factory;
use Kreait\Firebase\Exception\Auth\UserNotFound;

if (!isset($_SESSION['verified_user_id'])) {
    $_SESSION['status'] = "Please login to access this page.";
    header("Location: login.php");
    exit();
}

$uid = $_SESSION['verified_user_id'];
$factory = (new Factory)->withServiceAccount(__DIR__.'/jeepni-6b6fb-firebase-adminsdk-fbsvc-5f05c273d7.json')
->withDatabaseUri('https://jeepni-6b6fb-default-rtdb.firebaseio.com/');
$auth = $factory->createAuth();
$database = $factory->createDatabase();

$userInfo = $database->getReference("all_users/{$uid}")->getValue();
$role = $userInfo['role'] ?? null;

if ($role !== 'admin' && $role !== 'super_admin') {
    $_SESSION['status'] = "Access on some part is denied. You are not an admin.";
    header("Location: home.php");
    exit();
}
