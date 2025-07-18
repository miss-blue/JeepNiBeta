<!-- /*
Author: Rica May Simbulan
Filename: logincode.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This is the login code for the JeepN! Tracking System. 
         It handles user authentication using Firebase Authentication.
         It checks if the user exists, verifies their password, and retrieves their role.
         If successful, it sets session variables and redirects to the dashboard.
         If unsuccessful, it sets an error message and redirects back to the login page.
*/ -->

<?php

use Firebase\Auth\Token\Exception\InvalidToken;

session_start();
include('dbcon.php');

if (isset($_POST['login_btn'])) {
    $email = trim($_POST['email'] ?? '');
    $clearTextPassword = trim($_POST['password'] ?? '');

    // Input validation
    if (empty($email)) {
        $_SESSION['status'] = "Enter your email address.";
        header("Location: login.php");
        exit();
    }

    if (empty($clearTextPassword)) {
        $_SESSION['status'] = "Enter your password.";
        header("Location: login.php");
        exit();
    }

    try {
        $user = $auth->getUserByEmail($email);

        try {
            $signInResult = $auth->signInWithEmailAndPassword($email, $clearTextPassword);
            $idTokenString = $signInResult->idToken();

            try {
                $verifiedIdToken = $auth->verifyIdToken($idTokenString);
                $uid = $verifiedIdToken->claims()->get('sub');

                // Check if account is disabled
                $user_data = $database->getReference('all_users/' . $uid)->getValue();
                if (isset($user_data['disabled']) && $user_data['disabled']) {
                    $_SESSION['status'] = "Your account is disabled. Please contact admin.";
                    header('Location: logout.php');
                    exit();
                }

                $claims = $auth->getUser($uid)->customClaims;
                $_SESSION['verified_user_id'] = $uid;
                $_SESSION['idTokenString'] = $idTokenString;

                $role = $user_data['role'] ?? 'unknown';
                $_SESSION['verified_user'] = [
                    'uid' => $uid,
                    'email' => $email,
                    'role' => $role,
                ];

                $_SESSION['status'] = "Logged in Successfully";

                // Redirect based on role
                header('Location: dashboard.php');
                exit();

            } catch (InvalidToken $e) {
                $_SESSION['status'] = "Invalid token: " . $e->getMessage();
            } catch (\InvalidArgumentException $e) {
                $_SESSION['status'] = "Token error: " . $e->getMessage();
            }

        } catch (Exception $e) {
            $_SESSION['status'] = "Wrong password.";
            header("Location: login.php");
            exit();
        }

    } catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
        $_SESSION['status'] = "Account not found.";
        header("Location: login.php");
        exit();
    }

} else {
    $_SESSION['status'] = "Not allowed.";
    header("Location: login.php");
    exit();
}
?>
