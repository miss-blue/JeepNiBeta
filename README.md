# JeepNi — Installation & Setup Guide

This repository contains:
- Frontend: static pages in `public/` powered by Firebase Authentication and Realtime Database, designed to be hosted on Firebase Hosting.
- Backend: a Python Flask API in `backend/` that generates/sends passenger predictions, stores data in SQLite, and integrates with Firebase Admin SDK for messaging and profile management.

Below are concise, reproducible steps to run locally and deploy.

## Prerequisites

- Python 3.10+ (tested with 3.12)
- PowerShell (on Windows) or a POSIX shell (macOS/Linux)
- pip (comes with Python) and optional `venv`
- Firebase project with:
  - Web app credentials (used on the frontend in `public/js/authentication.js`)
  - Service account JSON (Admin SDK) for the backend
- Firebase CLI (for Hosting): `npm i -g firebase-tools` then `firebase login`

Optional:
- XAMPP/Apache is not required; the frontend is static and intended for Firebase Hosting. The backend runs as a standalone Flask app.

## Repository Structure

- `public/` — Static frontend, images, and JS
- `public/js/authentication.js` — Firebase Web config used by the frontend
- `backend/` — Flask app (`app.py`, `routes.py`, `models.py`, `scheduler.py`, `main.py`)
- `backend/data/` — SQLite DB location (`passenger_forecasting.db`)
- `firebase.json`, `.firebaserc` — Firebase Hosting config
- `JeepNiSQLVersion.sql` — SQL reference (not required for SQLite runtime)

## 1) Frontend Setup (Firebase Hosting)

- Ensure the Firebase Web config in `public/js/authentication.js` matches your project. Update these fields if you are not using the default `jeepni-6b6fb` project:
  - `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`
- Local preview (optional):
  - `firebase emulators:start --only hosting` (or `firebase serve`)
- Deploy to Hosting:
  - `firebase use <your-project-id>` (repo default is `jeepni-6b6fb`)
  - `firebase deploy --only hosting`

## 2) Backend Setup (Flask API)

The backend serves admin/API endpoints, writes to a local SQLite DB, and uses Firebase Admin SDK for notifications and profile updates.

- Create and activate a virtual environment:
  - PowerShell (Windows):
    - `cd backend`
    - `python -m venv .venv`
    - `.venv\Scripts\Activate.ps1`
  - macOS/Linux:
    - `cd backend`
    - `python3 -m venv .venv`
    - `source .venv/bin/activate`

- Install dependencies:
  - `pip install flask flask_sqlalchemy sqlalchemy flask-cors apscheduler requests firebase-admin google-auth google-auth-oauthlib google-auth-httplib2`

- Firebase Admin credentials:
  - Create a service account in the Firebase Console (Project Settings → Service accounts → Generate new private key).
  - Save the JSON file as `firebase_credentials.json` in the repository root (same directory as `firebase.json`). The backend expects this path (see `backend/firebase_service.py`).
  - If you prefer a different path, update `FIREBASE_CREDENTIALS_PATH` in `backend/firebase_service.py` accordingly.

- Run the backend locally:
  - From `backend/` with the venv active:
    - `python main.py`
  - The API listens on `http://localhost:5000` by default.

- Common environment variables (optional):
  - `PORT`: change server port (default `5000`).
  - `SESSION_SECRET`: Flask session secret (defaults to a dev key).
  - `DATABASE_URL`: override SQLite path if you want to use a different DB.

- Database:
  - SQLite DB is created automatically at `backend/data/passenger_forecasting.db` on first run.
  - Default data is seeded by `initialize_default_data()` when the app starts.

## 3) Connecting Frontend and Backend

- The frontend (hosted on Firebase) communicates directly with Firebase Auth/Realtime Database for most operations.
- Admin and prediction-related endpoints are provided by the Flask backend. If the frontend needs these, ensure your frontend JavaScript points to the backend base URL (e.g., `http://localhost:5000` during development or your deployed API URL in production) where applicable.
- CORS is enabled server-side (`flask_cors.CORS(app)`), allowing cross-origin calls from the hosted frontend.

## 4) Scheduling and Predictions

- A background scheduler (APScheduler) is configured in `backend/app.py` and `backend/scheduler.py` to run daily prediction jobs.
- You can also trigger prediction generation manually:
  - `POST /api/predictions/generate` with optional JSON `{ "date": "YYYY-MM-DD" }`

## 5) Firebase Admin Features from Backend

- Push notifications to user tokens via FCM HTTP v1 API.
- Admin profile management helpers:
  - `POST /api/admin/create_profile`
  - `POST /api/admin/create_account`
  - `POST /api/profile/upload_photo` (multipart/form-data)
- Ensure `firebase_credentials.json` exists and corresponds to the same project as the frontend.

## 6) Typical Local Dev Workflow

- Terminal A (backend):
  - `cd backend && .venv\Scripts\Activate.ps1` (or `source .venv/bin/activate`)
  - `python main.py`
- Terminal B (frontend):
  - `firebase emulators:start --only hosting`
  - Open the local Hosting URL printed by the emulator.

## 7) Troubleshooting

- Missing Firebase Admin SDK:
  - Install: `pip install firebase-admin google-auth`
- `firebase_credentials.json` not found:
  - Place the JSON at repo root or update the path in `backend/firebase_service.py`.
- CORS errors from the frontend:
  - Ensure the backend is running and reachable; CORS is already enabled in Flask.
- SQLite file permission issues:
  - The app writes to `backend/data/`. Ensure the process has write permission.
- Wrong Firebase project used on Hosting:
  - `firebase use <project-id>` to switch, then redeploy.

## 8) Deployment Notes

- Frontend: `firebase deploy --only hosting`
- Backend: host `backend/` on your preferred platform (e.g., a VM, container, or PaaS). A minimal WSGI command using Gunicorn might look like:
  - `gunicorn -w 2 -b 0.0.0.0:5000 app:app` (run from `backend/`)
  - Make sure the service account JSON is available on the server and the process has read access.

## License

Internal/academic project. Add a license if you plan to distribute.

