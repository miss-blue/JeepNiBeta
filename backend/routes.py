from flask import render_template, request, jsonify, redirect, url_for, flash, send_from_directory
import os
from app import app, db
from models import JeepneyStop, Prediction, UserNumber, ModelMetrics, initialize_default_data
from firebase_service import send_predictions_to_all_users, write_user_profile, write_role_profile, create_user_and_profiles, update_user_fields
from datetime import datetime, date
import traceback
import logging
from datetime import datetime, date, timedelta
import traceback
import logging
from functools import wraps
from collections import defaultdict
import threading
from werkzeug.utils import secure_filename
import requests
from flask import request, jsonify
import os

SEMAPHORE_API_KEY = os.environ.get('SEMAPHORE_API_KEY', '')
SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages'

UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'uploads'))
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Rate limiter for SMS endpoints
class SimpleRateLimiter:
    def __init__(self):
        self.requests = defaultdict(list)
        self.lock = threading.Lock()
    
    def is_allowed(self, key, max_requests=10, window_seconds=60):
        """Check if request is allowed based on rate limit"""
        with self.lock:
            now = datetime.now()
            window_start = now - timedelta(seconds=window_seconds)
            
            # Clean old requests
            self.requests[key] = [
                req_time for req_time in self.requests[key]
                if req_time > window_start
            ]
            
            # Check if under limit
            if len(self.requests[key]) >= max_requests:
                return False
            
            # Record this request
            self.requests[key].append(now)
            return True
    
    def get_retry_after(self, key, window_seconds=60):
        """Get seconds until rate limit resets"""
        with self.lock:
            if not self.requests[key]:
                return 0
            
            oldest_request = min(self.requests[key])
            reset_time = oldest_request + timedelta(seconds=window_seconds)
            now = datetime.now()
            
            if reset_time > now:
                return int((reset_time - now).total_seconds())
            return 0

# Create global rate limiter instance
sms_rate_limiter = SimpleRateLimiter()

def rate_limit(max_requests=10, window_seconds=60):
    """Decorator for rate limiting endpoints"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Use IP address as rate limit key
            client_ip = request.remote_addr
            
            if not sms_rate_limiter.is_allowed(client_ip, max_requests, window_seconds):
                retry_after = sms_rate_limiter.get_retry_after(client_ip, window_seconds)
                return jsonify({
                    'success': False,
                    'error': f'Rate limit exceeded. Try again in {retry_after} seconds.',
                    'retry_after': retry_after
                }), 429
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Initialize default data on first run
with app.app_context():
    initialize_default_data()

@app.route('/')
def dashboard():
    """Main admin dashboard"""
    # Get today's predictions
    today = date.today()
    predictions = Prediction.query.filter_by(prediction_date=today).all()
    
    # Get registered users count
    users_count = UserNumber.query.filter_by(is_active=True).count()
    
    # Get model metrics
    model_metrics = ModelMetrics.query.filter_by(is_active=True).first()
    
    # Get total predictions sent today
    sent_count = Prediction.query.filter_by(prediction_date=today, is_sent=True).count()
    
    return render_template('dashboard.html', 
                         predictions=predictions,
                         users_count=users_count,
                         model_metrics=model_metrics,
                         sent_count=sent_count,
                         today=today)

@app.route('/api/predictions/today')
def get_today_predictions():
    """API endpoint to get today's predictions"""
    today = date.today()
    predictions = Prediction.query.filter_by(prediction_date=today).all()
    return jsonify([p.to_dict() for p in predictions])

@app.route('/api/predictions/send', methods=['POST'])
def send_predictions():
    """Send today's predictions to all registered users"""
    try:
        today = date.today()
        predictions = Prediction.query.filter_by(prediction_date=today, is_sent=False).all()
        
        if not predictions:
            return jsonify({'error': 'No unsent predictions found for today'}), 400
        
        # Send via Firebase
        result = send_predictions_to_all_users(predictions)
        
        if result['success']:
            # Mark predictions as sent
            for prediction in predictions:
                prediction.is_sent = True
                prediction.sent_at = datetime.utcnow()
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'Successfully sent {len(predictions)} predictions to {result["users_count"]} users'
            })
        else:
            return jsonify({'error': result['error']}), 500
            
    except Exception as e:
        logging.error(f"Error sending predictions: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users')
def get_users():
    """Get all registered users"""
    users = UserNumber.query.filter_by(is_active=True).all()
    return jsonify([u.to_dict() for u in users])

@app.route('/api/users', methods=['POST'])
def add_user():
    """Add a new user number"""
    try:
        data = request.get_json()
        phone_number = data.get('phone_number')
        
        if not phone_number:
            return jsonify({'error': 'Phone number is required'}), 400
        
        # Check if user already exists
        existing_user = UserNumber.query.filter_by(phone_number=phone_number).first()
        if existing_user:
             if existing_user.is_active:
                return jsonify({'error': 'User already exists'}), 400
             else:
                existing_user.is_active = True
                db.session.commit()
                return jsonify({'success': True, 'user': existing_user.to_dict(), 'message': 'User reactivated'})
        
        user = UserNumber(phone_number=phone_number)
        db.session.add(user)
        db.session.commit()
        
        return jsonify({'success': True, 'user': user.to_dict()})
        
    except Exception as e:
        logging.error(f"Error adding user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Delete a user"""
    try:
        user = UserNumber.query.get_or_404(user_id)
        user.is_active = False
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'User deactivated successfully'})
        
    except Exception as e:
        logging.error(f"Error deleting user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/stops')
def get_stops():
    """Get all jeepney stops"""
    stops = JeepneyStop.query.all()
    return jsonify([s.to_dict() for s in stops])

@app.route('/api/model/metrics')
def get_model_metrics():
    """Get current model metrics"""
    metrics = ModelMetrics.query.filter_by(is_active=True).first()
    return jsonify(metrics.to_dict() if metrics else {})

@app.route('/api/predictions/generate', methods=['POST'])
def generate_predictions():
    """Manually trigger prediction generation.
    Accepts optional JSON body { date: 'YYYY-MM-DD' } or query param ?date=YYYY-MM-DD
    """
    try:
        from scheduler import generate_daily_predictions
        req_date = None
        try:
            if request.is_json:
                payload = request.get_json(silent=True) or {}
                d = payload.get('date')
                if d:
                    req_date = datetime.strptime(d, '%Y-%m-%d').date()
        except Exception:
            pass
        if not req_date:
            d = request.args.get('date')
            if d:
                try:
                    req_date = datetime.strptime(d, '%Y-%m-%d').date()
                except Exception:
                    pass
        result = generate_daily_predictions(req_date)
        if result.get('success'):
            return jsonify({'success': True, 'count': result.get('count', 0), 'message': f"Generated {result.get('count', 0)} predictions successfully"})
        return jsonify({'error': result.get('error', 'Generation failed')}), 500
    except Exception as e:
        logging.error("Error generating predictions:\n" + traceback.format_exc())
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500
@app.route('/api/predictions')
def get_all_predictions():
    """Get all predictions"""
    predictions = Prediction.query.all()
    return jsonify([p.to_dict() for p in predictions])

@app.route('/api/predictions/<date>')
def get_predictions_by_date(date):
    """Get predictions for specific date"""
    try:
        prediction_date = datetime.strptime(date, '%Y-%m-%d').date()
        predictions = Prediction.query.filter_by(prediction_date=prediction_date).all()
        return jsonify([p.to_dict() for p in predictions])
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

# Removed duplicate definition above

# --- Admin: create profile in Firebase RTDB (server-side, bypassing client rules) ---
@app.route('/api/admin/create_profile', methods=['POST'])
def api_admin_create_profile():
    try:
        data = request.get_json(force=True) or {}
        uid = data.get('uid')
        role = data.get('role')
        profile = data.get('profile') or {}
        if not uid or role not in ('driver','passenger'):
            return jsonify({'success': False, 'error': 'uid and valid role required'}), 400
        # write both all_users and role-specific node
        write_user_profile(uid, profile)
        write_role_profile(role, uid, profile)
        return jsonify({'success': True})
    except Exception as e:
        logging.error('api_admin_create_profile failed: %s', e)
    return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/create_account', methods=['POST'])
def api_admin_create_account():
    """Create or link an Auth user and upsert RTDB profiles in one atomic server action.
    Body: { name, email, password?, role: 'driver'|'passenger', phone?, notes?, route?, plate? }
    """
    try:
        data = request.get_json(force=True) or {}
        name = data.get('name') or ''
        email = data.get('email') or ''
        password = data.get('password')
        role = data.get('role')
        if not name or not email or role not in ('driver','passenger'):
            return jsonify({'success': False, 'error': 'name, email and valid role are required'}), 400
        extra = {k: v for k, v in data.items() if k in ('phone','notes','route','plate','created_at','created_ts')}
        res = create_user_and_profiles(name=name, email=email, password=password, role=role, extra=extra)
        return jsonify({'success': True, **res})
    except Exception as e:
        logging.error('api_admin_create_account failed: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 500

# --- Serve favicon for dev server to avoid 404 spam ---
@app.route('/favicon.ico')
def favicon():
    try:
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'icons'))
        return send_from_directory(base, 'JEEPNi.png', mimetype='image/png')
    except Exception:
        # Return 204 No Content instead of 404 if the icon is missing
        return ('', 204)

@app.route('/uploads/<path:subpath>')
def serve_uploads(subpath):
    try:
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'uploads'))
        return send_from_directory(base, subpath)
    except Exception:
        return ('', 404)

# SMS API Routes - Add these at the END of routes.py (after upload_profile_photo function)

@app.route('/api/sms/send', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60)  # Add this line
def send_sms():
    """
    Send SMS via Semaphore API
    Accepts phone numbers from request or fetches from Firebase
    Keeps API key secure on server side
    """
    try:
        # Check if API key is configured
        if not SEMAPHORE_API_KEY:
            return jsonify({
                'success': False,
                'error': 'Semaphore API key not configured. Set SEMAPHORE_API_KEY in environment variables.'
            }), 500
        
        # Get request data
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        numbers = data.get('numbers', [])
        message = data.get('message', '')
        sender_name = data.get('sender_name', os.environ.get('SEMAPHORE_SENDER_NAME', 'JEEPNI'))
        
        # Validate inputs
        if not numbers or len(numbers) == 0:
            return jsonify({'success': False, 'error': 'No phone numbers provided'}), 400
        
        if not message or len(message.strip()) == 0:
            return jsonify({'success': False, 'error': 'Message cannot be empty'}), 400
        
        # Validate message doesn't start with TEST (Semaphore restriction)
        if message.strip().upper().startswith('TEST'):
            return jsonify({
                'success': False,
                'error': 'Messages cannot start with "TEST" - Semaphore silently ignores them'
            }), 400
        
        # Validate message length (160 characters max for single SMS)
        if len(message.strip()) > 160:
            return jsonify({
                'success': False,
                'error': f'Message exceeds 160 characters (current: {len(message.strip())}). Please shorten your message.'
            }), 400
        
        # Limit recipients per API call (Semaphore allows up to 1000)
        if len(numbers) > 1000:
            return jsonify({
                'success': False,
                'error': 'Maximum 1000 recipients per request'
            }), 400
        
        # Validate phone number format (Philippine numbers)
        validated_numbers = []
        invalid_numbers = []
        
        for number in numbers:
            cleaned = ''.join(filter(str.isdigit, str(number)))
            
            # Philippine mobile format: 639XXXXXXXXX (12 digits)
            if len(cleaned) == 12 and cleaned.startswith('639'):
                validated_numbers.append(cleaned)
            elif len(cleaned) == 11 and cleaned.startswith('09'):
                # Convert 09XX to 639XX
                validated_numbers.append('63' + cleaned[1:])
            elif len(cleaned) == 10 and cleaned.startswith('9'):
                # Convert 9XX to 639XX
                validated_numbers.append('63' + cleaned)
            else:
                invalid_numbers.append(number)
        
        if invalid_numbers:
            return jsonify({
                'success': False,
                'error': f'Invalid phone number format: {", ".join(invalid_numbers)}. Use format: 639XXXXXXXXX'
            }), 400
        
        if not validated_numbers:
            return jsonify({
                'success': False,
                'error': 'No valid phone numbers after validation'
            }), 400
        
        # Prepare Semaphore API request
        # Join numbers with commas as per Semaphore API documentation
        numbers_string = ','.join(validated_numbers)
        
        semaphore_data = {
            'apikey': SEMAPHORE_API_KEY,
            'number': numbers_string,
            'message': message.strip(),
            'sendername': sender_name
        }
        
        # Log the request (excluding sensitive data)
        logging.info(f"Sending SMS to {len(validated_numbers)} recipient(s) via Semaphore API")
        
        # Make request to Semaphore API
        response = requests.post(
            SEMAPHORE_API_URL,
            data=semaphore_data,
            timeout=30
        )
        
        # Parse response
        response_data = response.json()
        
        # Check if request was successful
        if response.status_code != 200:
            error_message = 'Failed to send SMS'
            if isinstance(response_data, list) and len(response_data) > 0:
                # Semaphore returns array of results
                first_result = response_data[0]
                if 'status' in first_result and first_result['status'] == 'Failed':
                    error_message = f"SMS failed: {first_result.get('message', 'Unknown error')}"
            
            logging.error(f"Semaphore API error: {response.status_code} - {response_data}")
            return jsonify({
                'success': False,
                'error': error_message,
                'details': response_data
            }), response.status_code
        
        # Count successful and failed sends
        successful = 0
        failed = 0
        
        if isinstance(response_data, list):
            for result in response_data:
                status = result.get('status', '').lower()
                if status in ['queued', 'pending', 'sent']:
                    successful += 1
                else:
                    failed += 1
        else:
            # Single message response
            successful = len(validated_numbers)
        
        logging.info(f"SMS sent: {successful} succeeded, {failed} failed")
        
        return jsonify({
            'success': True,
            'successful': successful,
            'failed': failed,
            'total': len(validated_numbers),
            'message': f'SMS sent to {successful} recipient(s)',
            'details': response_data
        })
        
    except requests.exceptions.Timeout:
        logging.error("Semaphore API request timed out")
        return jsonify({
            'success': False,
            'error': 'Request timed out. Please try again.'
        }), 504
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Semaphore API request error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Network error: {str(e)}'
        }), 500
        
    except Exception as e:
        logging.error(f"Error sending SMS: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/sms/balance', methods=['GET'])
@rate_limit(max_requests=30, window_seconds=60)  # Add this line
def get_sms_balance():
    """
    Get Semaphore account balance (credits)
    """
    try:
        if not SEMAPHORE_API_KEY:
            return jsonify({
                'success': False,
                'error': 'Semaphore API key not configured'
            }), 500
        
        # Make request to Semaphore account API
        response = requests.get(
            'https://api.semaphore.co/api/v4/account',
            params={'apikey': SEMAPHORE_API_KEY},
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({
                'success': False,
                'error': 'Failed to fetch account balance'
            }), response.status_code
        
        account_data = response.json()
        
        return jsonify({
            'success': True,
            'balance': account_data.get('credit_balance', 0),
            'account_name': account_data.get('account_name', ''),
            'status': account_data.get('status', '')
        })
        
    except Exception as e:
        logging.error(f"Error fetching SMS balance: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500