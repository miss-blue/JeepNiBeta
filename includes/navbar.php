<!-- /*
Author: Rica May Simbulan
Filename: navbar.php
Date Started: March 23, 2025
Date Finished: April 25, 2025
Purpose: this is the navigation bar for the JeepN! Tracking System. 
         It includes links to different pages and a dropdown menu for user profile options.
         The navbar is responsive and adjusts based on the user's login status.
*/ -->
<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
  }
?>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/gilroy">
</head>
<style>
  .navbar {
  border-bottom: 2px solid #1DCBF2;
}

.navbar a.nav-link {
  color: #ffffff !important;
  font-weight: 500;
  font-family: 'Poppins', sans-serif;
}

.navbar .dropdown-menu {
  background-color: #F1F1F1;
}

.navbar .dropdown-item {
  color: #865FD9;
}

.navbar .dropdown-item:hover {
  background-color: #1DCBF2;
  color: #ffffff;
}

.navbar .btn-primary.dropdown-toggle {
  background-color: #0477BF;
  border: none;
  color: #ffffff;
}
.jeepni-logo {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  height: 70px;
  width: auto;
  z-index: 1;
}
.navbar .navbar-brand {
  margin-left: -30px;
  color: white;
  font-weight: 700;
  font-family: 'Gilroy', sans-serif;
  font-size: 1.5rem;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.brand-text {
  margin-left: 20px;  
}
</style>
<nav class="navbar navbar-expand-lg" style="background-color: dodgerblue">
  <div class="container">
  <a class="navbar-brand d-flex align-items-center" href="#">
  <img src="icons/JEEPNi.png" class="jeepni-logo" alt="Trip Tracker Icon">
  <span class="brand-text d-none d-md-inline ms-2">JeepN!</span>
</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>

    <div class="collapse navbar-collapse" id="navbarSupportedContent">
      <ul class="navbar-nav ms-auto mb-2 mb-lg-0">


        <?php if (isset($_SESSION['verified_user_id'])): ?>
          <li class="nav-item">
            <a class="nav-link" href="dashboard.php">Home</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="home.php">Live Map</a>
          </li>



          <?php
            include('dbcon.php');
            $displayName = 'User';
          
            if (isset($_SESSION['verified_user_id'])) {
                $uid = $_SESSION['verified_user_id'];
            
                try {
                    // Get Firebase user (for displayName)
                    $userRecord = $auth->getUser($uid);
                    $displayName = $userRecord->displayName;
            
                    // Fallback to Realtime DB full_name if displayName is missing
                    if (!$displayName) {
                        $userData = $database->getReference('all_users/' . $uid)->getValue();
                        $displayName = $userData['full_name'] ?? 'User';
                    }
                } catch (Exception $e) {
                    $displayName = 'User';
                }
            }
          ?>
          <li class="nav-item dropdown">
          <a class="nav-link btn btn-primary dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
          <?= htmlspecialchars($displayName) ?>
          </a>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item" href="my-profile.php">My Profile</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="logout.php">Logout</a></li>
            </ul>
          </li>

        <?php else: ?>
          <li class="nav-item">
            <a class="nav-link" href="register.php">Register</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="login.php">Login</a>
          </li>
        <?php endif; ?>

      </ul>
    </div>
  </div>
</nav>
