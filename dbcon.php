<!-- /*
Author: Rica May Simbulan
Filename: dbcon.php
Date Started: March 23, 2025
Date Finished: May 16, 2025
Purpose: This file establishes a connection to the Firebase Realtime Database and 
         Firebase Authentication service using the Kreait Firebase PHP SDK.
         It uses a service account JSON file for authentication and sets the database URI.
         The database and auth instances are created and can be used in other scripts.
*/ -->
<?php

require __DIR__.'/vendor/autoload.php';
use Kreait\Firebase\Factory;
use Kreait\Firebase\Auth;

$factory = (new Factory)->withServiceAccount('jeepni-6b6fb-firebase-adminsdk-fbsvc-5f05c273d7.json')
->withDatabaseUri('https://jeepni-6b6fb-default-rtdb.firebaseio.com/');

$database = $factory->createDatabase();
$auth = $factory->createAuth();

?>