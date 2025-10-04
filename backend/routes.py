from flask import render_template, request, jsonify, redirect, url_for, flash, send_from_directory
import os
from app import app, db
from models import JeepneyStop, Prediction, UserNumber, ModelMetrics, initialize_default_data
from firebase_service import send_predictions_to_all_users, write_user_profile, write_role_profile, create_user_and_profiles, update_user_fields
from datetime import datetime, date
import traceback
import logging
from werkzeug.utils import secure_filename

UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'uploads'))
os.makedirs(UPLOADS_DIR, exist_ok=True)

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

# --- Profile photo upload (stores file under public/uploads/<uid>/ and updates RTDB photoUrl) ---
@app.route('/api/profile/upload_photo', methods=['POST'])
def upload_profile_photo():
    try:
        uid = request.form.get('uid') or request.args.get('uid')
        if not uid:
            return jsonify({'success': False, 'error': 'uid is required'}), 400
        if 'photo' not in request.files:
            return jsonify({'success': False, 'error': 'photo file is required (multipart/form-data)'}), 400
        file = request.files['photo']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'empty filename'}), 400
        fname = secure_filename(file.filename)
        ext = os.path.splitext(fname)[1].lower() or '.jpg'
        user_dir = os.path.join(UPLOADS_DIR, uid)
        os.makedirs(user_dir, exist_ok=True)
        ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        stored = f'profile_{ts}{ext}'
        abs_path = os.path.join(user_dir, stored)
        file.save(abs_path)

        # Construct public URL relative to /public
        public_url = f'/uploads/{uid}/{stored}'
        try:
            update_user_fields(uid, {'photoUrl': public_url})
        except Exception as e:
            logging.warning('Failed to update RTDB photoUrl: %s', e)
        return jsonify({'success': True, 'photoUrl': public_url})
    except Exception as e:
        logging.error('upload_profile_photo failed: %s', e)
        return jsonify({'success': False, 'error': str(e)}), 500
