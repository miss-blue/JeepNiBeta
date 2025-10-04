/*
Author: Rica May Simbulan
Filename: setting.json
Date Finished: March 24, 2025
Purpose: This file shows the structure of JeepNi Firebase Realtime Database as SQL tables for documentation/reference purposes.
*/

-- Note: This is NOT for direct import, but for understanding of data model.

-- Table: all_users
CREATE TABLE all_users (
    uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(50),
    created_at DATETIME,
    auth_uid VARCHAR(128),
    disabled BOOLEAN DEFAULT 0,
    photoUrl VARCHAR(512)
);

-- Table: drivers
CREATE TABLE drivers (
    uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(50),
    created_at DATETIME,
    auth_uid VARCHAR(128),
    disabled BOOLEAN DEFAULT 0,
    photoUrl VARCHAR(512)
);

-- Table: passengers
CREATE TABLE passengers (
    uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(50),
    created_at DATETIME,
    auth_uid VARCHAR(128),
    disabled BOOLEAN DEFAULT 0,
    photoUrl VARCHAR(512)
);

-- Table: admin
CREATE TABLE admin (
    uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(50),
    created_at DATETIME,
    auth_uid VARCHAR(128),
    disabled BOOLEAN DEFAULT 0,
    photoUrl VARCHAR(512)
);

-- Table: roles (for other roles such as admin, driver, passenger, norole, etc.)
CREATE TABLE roles (
    uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(50),
    created_at DATETIME,
    auth_uid VARCHAR(128),
    disabled BOOLEAN DEFAULT 0,
    photoUrl VARCHAR(512)
);

-- Note: In Firebase, these are collections/paths, not SQL tables.
-- This structure is for documentation/reference only.
