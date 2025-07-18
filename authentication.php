<!-- /*
Author: Rica May Simbulan
Filename: authentication.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the authentication page for the JeepN! Tracking System. 
         It checks if the user is logged in and verifies their Firebase ID token.
         If the token is invalid or expired, it redirects to the logout page.
         If the user is not logged in, it redirects to the login page.
*/ -->

<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
include('dbcon.php');

use Kreait\Firebase\Exception\InvalidToken;

if (isset($_SESSION['verified_user_id'])) {
    $uid = $_SESSION['verified_user_id'];
    $idTokenString = $_SESSION['idTokenString'];

    // Fetch user data from Firebase
    $user_data = $database->getReference('all_users/' . $uid)->getValue();
    $_SESSION['role'] = $user_data['role'] ?? '';

    try {
        $verifiedIdToken = $auth->verifyIdToken($idTokenString);

    } catch (\InvalidArgumentException $e) {
        // ✅ Token is expired or invalid — logout
        $_SESSION['expiry_status'] = "Session expired or invalid. Login again.";
        header('Location: logout.php');
        exit();
    }
} else {
    $_SESSION['status'] = "Login to access this page";
    header('Location: login.php');
    exit();
}