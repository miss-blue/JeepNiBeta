import logging
import csv
import os
import threading
from datetime import datetime, date, timedelta, time
from app import app, db
from models import JeepneyStop, Prediction, ModelMetrics
from data_generator import PassengerDataGenerator
# Lazy import ML pipeline; it may not be available in some environments
try:
    from ml_pipeline import generate_prediction_for_stop  # type: ignore
except Exception:
    def generate_prediction_for_stop(*args, **kwargs):
        return None
from apscheduler.triggers.cron import CronTrigger
import random


DATASET_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'passenger_demand_data.csv')
_DATASET_COLUMNS = [
    'datetime', 'stop_name', 'latitude', 'longitude', 'stop_type', 'passenger_count',
    'hour_of_day', 'day_of_week', 'is_weekend', 'is_public_holiday', 'is_school_dismissal_time',
    'is_hightide', 'lag_1_hour_demand', 'lag_24_hour_demand', 'rolling_3_hour_avg_demand',
    'rolling_6_hour_avg_demand', 'hour_sin', 'hour_cos', 'day_of_week_sin', 'day_of_week_cos'
]
_dataset_lock = threading.Lock()
_data_generator = PassengerDataGenerator()

def _append_prediction_to_dataset(stop, prediction_date, prediction_data):
    """Persist generated predictions in the synthetic dataset for future retraining."""
    try:
        peak_hour = prediction_data.get('peak_hour', 0)
        dt = datetime.combine(prediction_date, time(peak_hour))
        features = _data_generator.generate_features(dt, stop.name)
        stop_meta = _data_generator.stops_data.get(stop.name, {})
        passenger_count = int(prediction_data.get('predicted_passengers', 0) or 0)
        row = {
            'datetime': dt.isoformat(),
            'stop_name': stop.name,
            'latitude': getattr(stop, 'latitude', 0.0),
            'longitude': getattr(stop, 'longitude', 0.0),
            'stop_type': stop_meta.get('type', 'unknown'),
            'passenger_count': passenger_count,
            **features
        }
        # Populate lag/rolling features with sensible fallbacks
        row['lag_1_hour_demand'] = prediction_data.get('lag_1_hour_demand', passenger_count)
        row['lag_24_hour_demand'] = prediction_data.get('lag_24_hour_demand', passenger_count)
        row['rolling_3_hour_avg_demand'] = prediction_data.get('rolling_3_hour_avg_demand', passenger_count)
        row['rolling_6_hour_avg_demand'] = prediction_data.get('rolling_6_hour_avg_demand', passenger_count)
        payload = {column: row.get(column, 0) for column in _DATASET_COLUMNS}
        with _dataset_lock:
            file_exists = os.path.exists(DATASET_FILE)
            with open(DATASET_FILE, 'a', newline='', encoding='utf-8') as handle:
                writer = csv.DictWriter(handle, fieldnames=_DATASET_COLUMNS)
                if not file_exists:
                    writer.writeheader()
                writer.writerow(payload)
    except Exception as exc:
        logging.error('Failed to append prediction data for %s: %s', getattr(stop, 'name', 'unknown'), exc)


def _heuristic_prediction(stop_name: str, prediction_date: date):
    """Lightweight fallback when ML model isn't available.
    Produces a reasonable peak hour and passenger estimate using simple rules.
    """
    try:
        # Weekday vs weekend behavior
        is_weekend = prediction_date.weekday() >= 5
        # Favor 7AM/5PM on weekdays, 3PM/6PM on weekends
        candidate_hours = [7, 17] if not is_weekend else [15, 18]
        peak_hour = random.choice(candidate_hours)
        # Rough passenger band
        base = 18 if not is_weekend else 14
        variability = 10
        predicted = max(5, int(base + random.randint(0, variability)))
        message = f"Peak time at {peak_hour}:00, expecting {predicted} passengers at {stop_name}."
        return {
            'predicted_passengers': predicted,
            'peak_hour': peak_hour,
            'confidence_score': 0.7 if is_weekend else 0.8,
            'is_school_dismissal': peak_hour in (15, 16),
            'is_high_tide': False,
            'is_public_holiday': False,
            'is_weekend': is_weekend,
            'message': message
        }
    except Exception:
        return None

def generate_daily_predictions(target_date=None):
    """Generate predictions for all stops for a specific date (default: today).
    Uses ML model when available, falls back to a heuristic to avoid hard failures.
    """
    try:
        with app.app_context():
            today = target_date or date.today()
            
            # Check if predictions already exist for today
            existing_predictions = Prediction.query.filter_by(prediction_date=today).all()
            if existing_predictions:
                logging.info(f"Deleting {len(existing_predictions)} existing predictions for {today}")
                # Delete existing predictions to regenerate fresh ones
                for prediction in existing_predictions:
                    db.session.delete(prediction)
                db.session.commit()
            
            # Get all stops
            stops = JeepneyStop.query.all()
            predictions_created = 0
            
            for stop in stops:
                try:
                    # Generate prediction for this stop
                    prediction_data = generate_prediction_for_stop(stop, today)
                    # Fallback when ML path is unavailable or errors
                    if not prediction_data:
                        prediction_data = _heuristic_prediction(stop.name, today)
                    
                    if prediction_data:
                        # Create prediction record
                        prediction = Prediction(
                            stop_id=stop.id,
                            prediction_date=today,
                            predicted_passengers=prediction_data['predicted_passengers'],
                            peak_hour=prediction_data['peak_hour'],
                            confidence_score=prediction_data['confidence_score'],
                            is_school_dismissal=prediction_data['is_school_dismissal'],
                            is_high_tide=prediction_data['is_high_tide'],
                            is_public_holiday=prediction_data['is_public_holiday'],
                            is_weekend=prediction_data['is_weekend'],
                            message=prediction_data['message']
                        )
                        
                        db.session.add(prediction)
                        predictions_created += 1
                        _append_prediction_to_dataset(stop, today, prediction_data)
                        
                except Exception as e:
                    logging.error(f"Error generating prediction for stop {stop.name}: {str(e)}")
                    continue
            
            db.session.commit()
            logging.info(f"Generated {predictions_created} predictions for {today}")
            
            return {'success': True, 'count': predictions_created}
            
    except Exception as e:
        logging.error(f"Error in generate_daily_predictions: {str(e)}")
        db.session.rollback()
        return {'success': False, 'error': str(e)}

def setup_daily_prediction_job(scheduler):
    """Setup the daily prediction generation job"""
    try:
        # Run every day at 6:00 AM
        scheduler.add_job(
            func=generate_daily_predictions,
            trigger=CronTrigger(hour=6, minute=0),
            id='daily_predictions',
            name='Generate Daily Predictions',
            replace_existing=True
        )
        
        logging.info("Daily prediction job scheduled for 6:00 AM")
        
        # Also generate predictions for today if none exist
        with app.app_context():
            today = date.today()
            existing_predictions = Prediction.query.filter_by(prediction_date=today).count()
            if existing_predictions == 0:
                logging.info("No predictions found for today, generating now...")
                generate_daily_predictions()
        
    except Exception as e:
        logging.error(f"Error setting up daily prediction job: {str(e)}")

def check_model_performance():
    """Check if model needs retraining based on performance"""
    try:
        with app.app_context():
            metrics = ModelMetrics.query.filter_by(is_active=True).first()
            
            if not metrics:
                logging.warning("No model metrics found")
                return
            
            # Check if model performance is below threshold
            if metrics.r2_score < 0.9 or metrics.rmse > 2.0:
                logging.warning(f"Model performance degraded: R² = {metrics.r2_score}, RMSE = {metrics.rmse}")
                # Here you could trigger model retraining
                
    except Exception as e:
        logging.error(f"Error checking model performance: {str(e)}")

# Export functions for external use
__all__ = ['generate_daily_predictions', 'setup_daily_prediction_job', 'check_model_performance']
