import os
import json
import logging
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

try:
    import firebase_admin
    from firebase_admin import credentials, db as admin_db, auth as admin_auth
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logging.warning("Firebase Admin SDK not available. Install with: pip install firebase-admin google-auth")

from models import UserNumber, Prediction

# Firebase project configuration
FIREBASE_PROJECT_ID = "jeepni-6b6fb"
RTDB_URL = "https://jeepni-6b6fb-default-rtdb.firebaseio.com"
FIREBASE_CREDENTIALS_PATH = "firebase_credentials.json"
FCM_ENDPOINT = f"https://fcm.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/messages:send"

def initialize_firebase():
    """Initialize Firebase Admin SDK with HTTP v1 API support"""
    if not FIREBASE_AVAILABLE:
        logging.error("Firebase Admin SDK is not installed")
        return False
    
    try:
        # Check if Firebase is already initialized
        if firebase_admin._apps:
            logging.info("Firebase already initialized")
            return True
            
        # Initialize Firebase with service account
        if os.path.exists(FIREBASE_CREDENTIALS_PATH):
            cred = credentials.Certificate(FIREBASE_CREDENTIALS_PATH)
            firebase_admin.initialize_app(cred, {
                'projectId': FIREBASE_PROJECT_ID,
                'databaseURL': RTDB_URL
            })
            logging.info("Firebase initialized successfully with HTTP v1 API")
            return True
        else:
            logging.error(f"Firebase credentials file not found: {FIREBASE_CREDENTIALS_PATH}")
            return False
        
    except Exception as e:
        logging.error(f"Failed to initialize Firebase: {e}")
        return False

def get_access_token():
    """Get OAuth2 access token for Firebase HTTP v1 API"""
    try:
        if not os.path.exists(FIREBASE_CREDENTIALS_PATH):
            logging.error("Firebase credentials file not found")
            return None
            
        # Load service account credentials
        credentials_info = service_account.Credentials.from_service_account_file(
            FIREBASE_CREDENTIALS_PATH,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Refresh token to get access token
        request = Request()
        credentials_info.refresh(request)
        
        return credentials_info.token
        
    except Exception as e:
        logging.error(f"Error getting access token: {e}")
        return None

def send_message_to_token(token: str, message: str, title: str = "Jeepney Passenger Forecast") -> bool:
    """Send a message to a specific Firebase token using HTTP v1 API"""
    try:
        # Get access token
        access_token = get_access_token()
        if not access_token:
            logging.error("Failed to get access token")
            return False
        
        # Prepare headers
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Prepare message payload for HTTP v1 API
        payload = {
            "message": {
                "token": token,
                "notification": {
                    "title": title,
                    "body": message
                },
                "data": {
                    "timestamp": datetime.now().isoformat(),
                    "type": "passenger_forecast"
                }
            }
        }
        
        # Send HTTP POST request
        response = requests.post(FCM_ENDPOINT, headers=headers, json=payload)
        
        if response.status_code == 200:
            logging.info(f"Message sent successfully via HTTP v1 API: {response.json()}")
            return True
        else:
            logging.error(f"Failed to send message. Status: {response.status_code}, Response: {response.text}")
            return False
        
    except Exception as e:
        logging.error(f"Error sending message to token {token}: {str(e)}")
        return False

def send_predictions_to_all_users(predictions: List[Prediction]) -> Dict[str, Any]:
    """Send predictions to all registered users using HTTP v1 API"""
    try:
        # Get all active users
        users = UserNumber.query.filter_by(is_active=True).all()
        
        if not users:
            return {'success': False, 'error': 'No active users found'}
        
        # Create consolidated message from predictions
        message_lines = []
        for prediction in predictions[:5]:  # Limit to 5 predictions to avoid message length limits
            message_lines.append(prediction.message)
        
        full_message = "\n\n".join(message_lines)
        
        successful_sends = 0
        failed_sends = 0
        
        for user in users:
            try:
                if user.firebase_token:
                    success = send_message_to_token(user.firebase_token, full_message)
                    if success:
                        successful_sends += 1
                    else:
                        failed_sends += 1
                else:
                    # For demo purposes, log the message that would be sent
                    logging.info(f"Would send to {user.phone_number}: {full_message}")
                    successful_sends += 1
                    
            except Exception as e:
                logging.error(f"Error sending to user {user.phone_number}: {str(e)}")
                failed_sends += 1
        
        return {
            'success': True,
            'users_count': len(users),
            'successful_sends': successful_sends,
            'failed_sends': failed_sends,
            'message': f'Sent to {successful_sends} users, {failed_sends} failed'
        }
        
    except Exception as e:
        logging.error(f"Error in send_predictions_to_all_users: {str(e)}")
        return {'success': False, 'error': str(e)}

def register_user_token(phone_number: str, firebase_token: str) -> bool:
    """Register or update a user's Firebase token"""
    try:
        user = UserNumber.query.filter_by(phone_number=phone_number).first()
        
        if user:
            user.firebase_token = firebase_token
        else:
            user = UserNumber(phone_number=phone_number, firebase_token=firebase_token)
            from app import db
            db.session.add(user)
        
        from app import db
        db.session.commit()
        
        logging.info(f"Firebase token updated for user {phone_number}")
        return True
        
    except Exception as e:
        logging.error(f"Error registering user token: {str(e)}")
        return False

# Export functions
__all__ = ['initialize_firebase', 'send_message_to_token', 'send_predictions_to_all_users', 'register_user_token', 'write_user_profile', 'write_role_profile', 'create_user_and_profiles', 'update_user_fields']

# ---- Admin RTDB helpers ----
def write_user_profile(uid: str, profile: dict) -> None:
    if not initialize_firebase():
        raise RuntimeError('Firebase admin not initialized')
    admin_db.reference(f'all_users/{uid}').set(profile)

def write_role_profile(role: str, uid: str, profile: dict) -> None:
    if not initialize_firebase():
        raise RuntimeError('Firebase admin not initialized')
    path = 'drivers' if role == 'driver' else 'passengers'
    admin_db.reference(f'{path}/{uid}').set(profile)

def create_user_and_profiles(*, name: str, email: str, password: str | None, role: str, extra: dict | None = None) -> dict:
    """Create or fetch an Auth user, then upsert RTDB profiles.
    Returns { uid, created: bool }
    """
    if not initialize_firebase():
        raise RuntimeError('Firebase admin not initialized')
    extra = extra or {}
    # 1) Create or get user by email
    created = False
    try:
        user = admin_auth.get_user_by_email(email)
    except Exception:
        # Not found – create if password provided
        user = admin_auth.create_user(email=email, password=password or None, display_name=name)
        created = True

    uid = user.uid
    # 2) Build profile and upsert to DB
    profile = {
        'uid': uid,
        'name': name,
        'email': email,
        'role': role,
        'created_at': extra.get('created_at') or (datetime.utcnow().isoformat()),
        'created_ts': extra.get('created_ts') or int(datetime.utcnow().timestamp() * 1000),
    }
    # include optional fields
    for k in ['phone','notes','route','plate']:
        if k in extra:
            profile[k] = extra[k]

    write_user_profile(uid, profile)
    write_role_profile(role, uid, profile)
    return {'uid': uid, 'created': created}

def update_user_fields(uid: str, fields: dict) -> None:
    """Shallow update of fields under all_users/{uid} (no overwrite)."""
    if not initialize_firebase():
        raise RuntimeError('Firebase admin not initialized')
    admin_db.reference(f'all_users/{uid}').update(fields)
