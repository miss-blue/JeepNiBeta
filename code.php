<!-- /*
Author: Rica May Simbulan
Filename: code.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: this is the main code file for the JeepN! Tracking System. 
         It handles various functionalities such as user profile updates, password changes, user role management, and user registration.
         The file includes functions to interact with Firebase Authentication and Realtime Database.
         It also includes error handling and session management for user actions.
         And a lot more hihi.
*/ -->
<?php
session_start();
include('dbcon.php');


if (isset($_POST['update_user_profile'])) {
    $display_name = $_POST['display_name'];
    $phone = $_POST['phone'];

    if (!preg_match('/^\+639\d{9}$/', $phone)) {
        $_SESSION['status'] = "Invalid phone number format. Use format like +639123456789.";
        header("Location: my-profile.php");
        exit(0);
    }

    $uid = $_SESSION['verified_user_id'];
    $user = $auth->getUser($uid);
    $old_image = $user->photoUrl;

    $profile = $_FILES['profile']['name'];
    $new_image = rand(1111,9999) . "_" . $profile;

    $relative_path = "uploads/" . $new_image;
    $absolute_url = "http://localhost/JeepNi/" . $relative_path;
    // Upload image only if a new one is selected
    if (!empty($profile)) {
        move_uploaded_file($_FILES['profile']['tmp_name'], $relative_path);
        $photoUrl = $absolute_url;
    } else {
        $photoUrl = $old_image ?? "";
    }

    $properties = [
        'displayName' => $display_name,
        'phoneNumber' => $phone,
    ];

    if (!empty($photoUrl)) {
        $properties['photoUrl'] = $photoUrl;
    }

    try {
        $updatedUser = $auth->updateUser($uid, $properties);
        $_SESSION['verified_user'] = $auth->getUser($uid);
        $_SESSION['verified_user']->displayName = $display_name;

        // IMPORTANT: Add this code to update Firebase Realtime Database
        
        // 1. Get the user's role and info from all_users
        $userInfo = $database->getReference('all_users/'.$uid)->getValue();
        
        if ($userInfo) {
            $role = $userInfo['role'] ?? '';
            
            // 2. Update data to save to the database
            $updateData = [
                'full_name' => $display_name, // Use display_name for full_name
                'phone' => preg_replace('/^\+63/', '0', $phone), // Convert +63 format to 0 format if needed
            ];
            
            if (!empty($photoUrl)) {
                $updateData['photoUrl'] = $photoUrl;
            }
            
            // 3. Update all_users collection
            $database->getReference('all_users/'.$uid)->update($updateData);
            
            // 4. Update role-specific collection if applicable
            if ($role == 'drivers' || $role == 'passengers') {
                $database->getReference($role.'/'.$uid)->update($updateData);
            } else if (!empty($role)) {
                $database->getReference('roles/'.$uid)->update($updateData);
            }
        }

        $_SESSION['status'] = "User Profile Updated";
    } catch (Exception $e) {
        $_SESSION['status'] = "Error updating profile: " . $e->getMessage();
    }

    header("Location: my-profile.php");
    exit(0);
}




use Kreait\Firebase\Exception\Auth\EmailExists;
use Kreait\Firebase\Exception\Auth\PhoneNumberExists;


if (isset($_POST['user_claims_btn'])) {
    $uid = $_POST['claims_user_id'];
    $roles = $_POST['role_as'];

    $userData = $database->getReference("all_users/$uid")->getValue();
    $auth_uid = $userData['auth_uid'] ?? null;
    $role = $userData['role'] ?? 'passengers'; // fallback

    $redirectPage = ($role === 'drivers') ? 'driver-edit.php' : 'passenger-edit.php';

    try {
        if ($auth_uid) {
            if ($roles == 'admin') {
                $auth->setCustomUserClaims($auth_uid, ['admin' => true]);
                $msg = "User role as Admin";
            } elseif ($roles == 'super_admin') {
                $auth->setCustomUserClaims($auth_uid, ['super_admin' => true]);
                $msg = "User role as Super Admin";
            } elseif ($roles == 'norole') {
                $auth->setCustomUserClaims($auth_uid, null);
                $msg = "User role removed";
            } else {
                $msg = "No role selected.";
            }
        } else {
            $msg = "auth_uid not found.";
        }

        $_SESSION['status'] = $msg;
        header("Location: $redirectPage?id=$uid");
        exit();

    } catch (Exception $e) {
        $_SESSION['status'] = "Error setting role: " . $e->getMessage();
        header("Location: $redirectPage?id=$uid");
        exit();
    }
}


if (isset($_POST['change_password_btn'])) {
    $current_password = $_POST['current_password'];
    $new_password = $_POST['new_password'];
    $retype_password = $_POST['retype_password'];
    $uid = $_POST['change_pwd_user_id'];
    $currentUid = $_SESSION['verified_user_id'];

    $userData = $database->getReference("all_users/$uid")->getValue();
    $role = $userData['role'] ?? 'passengers';
    $redirectPage = ($role === 'drivers') ? 'driver' : 'passenger';
    $email = $userData['email'] ?? '';

    // Password mismatch handling
    if ($new_password !== $retype_password) {
        $_SESSION['status'] = "Passwords did not match";
        if ($uid === $currentUid) {
            header("Location: my-profile.php");
        } else {
            header("Location: {$redirectPage}-edit.php?id=$uid");
        }
        exit();
    }

    // Verify current password (only for self-change)
    if ($uid === $currentUid) {
        $verify_url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_FIREBASE_WEB_API_KEY";
        $verify_data = [
            "email" => $email,
            "password" => $current_password,
            "returnSecureToken" => true
        ];
        $ch = curl_init($verify_url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($verify_data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        $result = curl_exec($ch);
        $response = json_decode($result, true);
        curl_close($ch);

        if (isset($response['error'])) {
            $_SESSION['status'] = "Current password is incorrect.";
            header("Location: my-profile.php");
            exit();
        }
    }

    try {
        $auth->changeUserPassword($uid, $new_password);
        $_SESSION['status'] = "Password Updated";
        if ($uid === $currentUid) {
            session_destroy();
            header("Location: login.php");
        } else {
            header("Location: {$redirectPage}-edit.php?id=$uid");
        }
        exit();
    } catch (Exception $e) {
        $_SESSION['status'] = "Password not Updated: " . $e->getMessage();
        if ($uid === $currentUid) {
            header("Location: my-profile.php");
        } else {
            header("Location: {$redirectPage}-edit.php?id=$uid");
        }
        exit();
    }
}



if (isset($_POST['enable_disable_user_ac'])) {
    $disable_enable = $_POST['select_enable_disable'];
    $uid = $_POST['ena_dis_user_id'];

    $userInfo = $database->getReference("all_users/$uid")->getValue();
    $role = $userInfo['role'] ?? 'passengers';
    $hasAuthUid = isset($userInfo['auth_uid']);
    $redirectPage = ($role === 'drivers') ? 'dashboard.php' : 'dashboard.php';

    $msg = "No action taken";

    try {
        if ($disable_enable == "disable") {
            if ($hasAuthUid) {
                $auth->disableUser($userInfo['auth_uid']);
            }
            $database->getReference("$role/$uid")->update(['disabled' => true]);
            $msg = "Account Disabled";
        } else {
            if ($hasAuthUid) {
                $auth->enableUser($userInfo['auth_uid']);
            }
            $database->getReference("$role/$uid")->update(['disabled' => false]);
            $msg = "Account Enabled";
        }

        $_SESSION['status'] = $msg;
        header("Location: $redirectPage");
        exit();
    } catch (Exception $e) {
        $_SESSION['status'] = "Error: " . $e->getMessage();
        header("Location: $redirectPage");
        exit();
    }
}





if (isset($_POST['reg_user_delete_btn'])) {
    $key = $_POST['reg_user_delete_btn'];

    try {
        // Get user data from all_users table
        $user = $database->getReference('all_users/'.$key)->getValue();

        if ($user) {
            // ✅ Use auth_uid directly if available
            if (isset($user['auth_uid'])) {
                try {
                    $auth->deleteUser($user['auth_uid']);
                } catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
                    // User not in Firebase Auth — continue
                }
            } elseif (isset($user['email'])) {
                // Fallback: use email to get UID
                try {
                    $userRecord = $auth->getUserByEmail($user['email']);
                    $auth->deleteUser($userRecord->uid);
                } catch (\Kreait\Firebase\Exception\Auth\UserNotFound $e) {
                    // Not in Auth
                }
            }
        }

        $database->getReference('drivers/'.$key)->remove();
        $database->getReference('passengers/'.$key)->remove();
        $database->getReference('admin/'.$key)->remove();
        $database->getReference('all_users/'.$key)->remove();

        $_SESSION['status'] = "User Deleted Successfully";
        header('Location: dashboard.php');
        exit();

    } catch(Exception $e) {
        $_SESSION['status'] = "Error deleting user: ".$e->getMessage();
        header('Location: dashboard.php');
        exit();
    }
}


if(isset($_POST['update_driver_btn']))
{
    $full_name = $_POST['full_name'];
    $phone = $_POST['phone'];
    $uid = $_POST['driver_id'];

    $properties = [
        'full_name' => $full_name,
        'phone' => $phone,
    ];

    $update_result = $database->getReference('drivers/'.$uid)->update($properties);

    if($update_result){
        $_SESSION['status'] = "Drivers updated successfully";
    } else {
        $_SESSION['status'] = "Drivers not updated";
    }

    header('Location: driver-edit.php');
    exit();
}

if(isset($_POST['update_passenger_btn']))
{
    $full_name = $_POST['full_name'];
    $phone = $_POST['phone'];

    $uid = $_POST['passenger_id'];
    $properties = [
        'full_name' => $full_name,
        'phone' => $phone,
    ];

    $update_result = $database->getReference('passengers/'.$uid)->update($properties);

    if($update_result){
        $_SESSION['status'] = "User updated Successfully";
        header('Location: passenger-list.php');
        exit();
    }
    else{
        $_SESSION['status'] = "User not updated";
        header('Location: passenger-list.php');
        exit();
    }
}

if(isset($_POST['register_btn']))
{
    $full_name = $_POST['full_name'];
    $phone = $_POST['phone'];
    $email = $_POST['email'];
    $password = $_POST['password'];
    $role = $_POST['role'];

    if(empty($full_name) || empty($phone) || empty($email) || empty($password)) {
        $_SESSION['status'] = "All fields are required";
        header('Location: register.php');
        exit();
    }
    if (!preg_match('/^09\d{9}$/', $phone)) {
        $_SESSION['status'] = "Invalid phone number format. Use format like 09123456789.";
        header('Location: register.php');
        exit();
    }
    $formattedPhone = '+63' . ltrim($phone, '0');
    try {
        $userProperties = [
            'email' => $email,
            'emailVerified' => false,
            'phoneNumber' =>$formattedPhone,
            'password' => $password,
            'full_name' => $full_name,
        ];

        $createdUser = $auth->createUser($userProperties);
        
        $uid = $createdUser->uid;

        $userData = [
            'full_name' => $full_name,
            'phone' => $phone,
            'email' => $email,
            'role' => $role,
            'created_at' => date('Y-m-d H:i:s'),
            'auth_uid' => $uid
        ];

        
        if ($role == 'drivers' || $role == 'passengers' || $role == 'admin') {
            $ref_path = $role; // Use 'drivers' or 'passengers' as the path
            $database->getReference($ref_path.'/'.$uid)->set($userData);
        } else {
           
            $ref_path = 'roles';
            $database->getReference($ref_path.'/'.$uid)->set($userData);
        }

        $all_usersData = [
            'full_name' => $full_name,
            'email' => $email,
            'phone' => $phone,
            'role' => $role,
            'created_at' => date('Y-m-d H:i:s'),
            'auth_uid' => $uid
        ];
        $database->getReference('all_users/'.$uid)->set($all_usersData);

        $_SESSION['status'] = "User Created/Registered Successfully";
        header('Location: register.php');
        exit();

    } catch (EmailExists $e) {
        $_SESSION['status'] = "Email already exists. Please use another.";
        header('Location: register.php');
        exit();

    } catch (PhoneNumberExists $e) {
        $_SESSION['status'] = "Phone number already exists. Please use a different number.";
        header('Location: register.php');
        exit();

    } catch (Exception $e) {
        $_SESSION['status'] = "User Not Created/Registered";
        header('Location: register.php');
        exit();
    }
}

if(isset($_POST['delete_btn'])){
    $del_id = $_POST['delete_btn'];

    try {
        // Get user info before deleting to know which collections to remove from
        $userInfo = $database->getReference('all_users/'.$del_id)->getValue();
        $role = $userInfo['role'] ?? '';

        $auth->deleteUser($del_id);
        
        
        if ($role == 'drivers' || $role == 'passengers') {
            $database->getReference($role.'/'.$del_id)->remove();
        } else {
            $database->getReference('roles/'.$del_id)->remove();
        }
        
        $database->getReference('all_users/'.$del_id)->remove();

        $_SESSION['status'] = "User Deleted Successfully";
        header('Location: '.$_SERVER['HTTP_REFERER']);
        exit();
    } catch (Exception $e) {
        $_SESSION['status'] = "Error deleting user: ".$e->getMessage();
        header('Location: '.$_SERVER['HTTP_REFERER']);
        exit();
    }
}

if(isset($_POST['update_all_users']))
{
    $uid = $_POST['uid'];
    $full_name = $_POST['full_name'];
    $email = $_POST['email'];
    $phone = $_POST['phone'];

    $updateData = [
        'full_name'=>$full_name,
        'email'=>$email,
        'phone'=>$phone,
    ];

    $ref_table = 'all_users/'.$uid;
    $updatequery_result = $database->getReference($ref_table)->update($updateData);
    
    // Get the user's role to update the correct collection
    $userInfo = $database->getReference('all_users/'.$uid)->getValue();
    $role = $userInfo['role'] ?? '';
    

    if ($role == 'drivers' || $role == 'passengers') {
        $database->getReference($role.'/'.$uid)->update($updateData);
    } else {
        $database->getReference('roles/'.$uid)->update($updateData);
    }

    if($updatequery_result)
    {
        $_SESSION['status'] = "Information Updated Successfully";
        header('Location: dashboard.php');
    }
    else{
        $_SESSION['status'] = "Information Not Updated";
        header('Location: dashboard.php');
    }
}

if(isset($_POST['save_all_users']))
{
    $full_name = $_POST['full_name'];
    $email = $_POST['email'];
    $phone = $_POST['phone'];
    $role = $_POST['role'];

    // Generate a random default password (or you can set your own logic)
    $password = 'password123'; // Or generate one

    try {
        // 1. Create Firebase Auth user
        $userProperties = [
            'email' => $email,
            'emailVerified' => false,
            'phoneNumber' => '+63' . ltrim($phone, '0'),
            'password' => $password,
            'displayName' => $full_name,
        ];

        $createdUser = $auth->createUser($userProperties);
        $uid = $createdUser->uid;

        // 2. Data to save
        $postData = [
            'full_name' => $full_name,
            'email' => $email,
            'phone' => $phone,
            'role' => $role,
            'auth_uid' => $uid,
            'created_at' => date('Y-m-d H:i:s'),
            'disabled' => false,
        ];

        // 3. Save to all_users and appropriate role-specific collection
        $database->getReference("all_users/" . $uid)->set($postData);

        if ($role == 'drivers' || $role == 'passengers') {
            $database->getReference($role . "/" . $uid)->set($postData);
        } else {
            // For admins, super_admins and norole
            $database->getReference("roles/" . $uid)->set($postData);
        }

        $_SESSION['status'] = "User registered and stored successfully.";
        header('Location: index.php');
        exit();

    } catch (\Kreait\Firebase\Exception\Auth\EmailExists $e) {
        $_SESSION['status'] = "Email already exists.";
        header('Location: dashboard.php');
        exit();

    } catch (\Kreait\Firebase\Exception\Auth\PhoneNumberExists $e) {
        $_SESSION['status'] = "Phone number already exists.";
        header('Location: dashboard.php');
        exit();

    } catch (Exception $e) {
        $_SESSION['status'] = "Error: " . $e->getMessage();
        header('Location: dashboard.php');
        exit();
    }
}

?>