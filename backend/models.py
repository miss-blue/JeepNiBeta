from app import db
from datetime import datetime
from sqlalchemy import Text, JSON
import json

class JeepneyStop(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text)
    
    # Relationships
    predictions = db.relationship('Prediction', backref='stop', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'description': self.description
        }

class Prediction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stop_id = db.Column(db.Integer, db.ForeignKey('jeepney_stop.id'), nullable=False)
    prediction_date = db.Column(db.Date, nullable=False)
    predicted_passengers = db.Column(db.Integer, nullable=False)
    peak_hour = db.Column(db.Integer, nullable=False)  # 0-23
    confidence_score = db.Column(db.Float, nullable=False)
    
    # Contextual information
    is_school_dismissal = db.Column(db.Boolean, default=False)
    is_high_tide = db.Column(db.Boolean, default=False)
    is_public_holiday = db.Column(db.Boolean, default=False)
    is_weekend = db.Column(db.Boolean, default=False)
    
    # Generated message
    message = db.Column(db.Text, nullable=False)
    
    # Status tracking
    is_sent = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sent_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'stop_name': self.stop.name,
            'prediction_date': self.prediction_date.isoformat(),
            'predicted_passengers': self.predicted_passengers,
            'peak_hour': self.peak_hour,
            'confidence_score': self.confidence_score,
            'is_school_dismissal': self.is_school_dismissal,
            'is_high_tide': self.is_high_tide,
            'is_public_holiday': self.is_public_holiday,
            'is_weekend': self.is_weekend,
            'message': self.message,
            'is_sent': self.is_sent,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None
        }

class UserNumber(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), nullable=False, unique=True)
    firebase_token = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'phone_number': self.phone_number,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat()
        }

class ModelMetrics(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    model_version = db.Column(db.String(50), nullable=False)
    r2_score = db.Column(db.Float, nullable=False)
    mae = db.Column(db.Float, nullable=False)
    rmse = db.Column(db.Float, nullable=False)
    training_date = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'model_version': self.model_version,
            'r2_score': self.r2_score,
            'mae': self.mae,
            'rmse': self.rmse,
            'training_date': self.training_date.isoformat(),
            'is_active': self.is_active
        }

# Initialize default data
def initialize_default_data():
    """Initialize jeepney stops and other default data"""
    stops_data = {
        "Saint Gabriel The Archangel Parish": {"coords": (16.0754843, 120.3546182), "desc": "Church where students from Bonuan Boquig practice"},
        "Alip, Boquig Waiting Shed": {"coords": (16.073742, 120.351614), "desc": "Popular waiting spot for students going home"},
        "Bonuan Boquig, Baranggay Hall": {"coords": (16.076286, 120.3557308), "desc": "Students and citizens wait near barangay hall"},
        "Sagor, Longos": {"coords": (16.066106, 120.353298), "desc": "Students and workers wait to go to school/work"},
        "Centro, Longos": {"coords": (16.070591, 120.359635), "desc": "Students and workers wait to go to school/work"},
        "Don Leon Francisco Maramba Elementary School, Longos": {"coords": (16.0710835, 120.3591833), "desc": "Students wait to go home"},
        "Bonuan Boquig - Biazon Waiting Shed": {"coords": (16.0756322, 120.3656381), "desc": "Students and citizens wait, farther from school"},
        "Bonuan Buquig National Highschool": {"coords": (16.078721, 120.360024), "desc": "High school students location"},
        "7 Eleven Bonuan": {"coords": (16.075331, 120.342945), "desc": "Center of Bonuan area"},
        "North Central, Don Marcelo Elementary School": {"coords": (16.073780, 120.340295), "desc": "Two elementary schools facing each other"},
        "MCDo Bonuan": {"coords": (16.0722655, 120.3386216), "desc": "Popular eating spot"},
        "Nepo Mall": {"coords": (16.0511218, 120.3408555), "desc": "Universidad de Dagupan students and workers wait here"},
        "Universidad De Dagupan": {"coords": (16.0511218, 120.3408555), "desc": "Students wait here to go to city proper"},
        "Junction": {"coords": (16.046392, 120.343012), "desc": "Main hub for Bonuan and bayan routes"},
        "Region 1 Medical Center": {"coords": (16.048645, 120.341774), "desc": "Medical center stop"},
        "Phinma-University of Pangasinan": {"coords": (16.046392, 120.343012), "desc": "College students school"},
        "CSI City Mall": {"coords": (16.043989, 120.335708), "desc": "Middle of city proper, many people wait here"},
        "Hererro-Perez Waiting Shed": {"coords": (16.042155, 120.342460), "desc": "PAMMA students waiting spot"},
        "Victory, Five Star": {"coords": (16.042842, 120.344109), "desc": "Bus terminal for other towns/cities"},
        "SM Center Dagupan": {"coords": (16.0444626, 120.3425649), "desc": "Popular mall waiting spot"},
        "DBP": {"coords": (16.043786, 120.344272), "desc": "Popular waiting spot to go to Bonuan"},
        "Tondaligan Centro": {"coords": (16.084194, 120.348134), "desc": "Beach destination"},
        "Region 1 MC Annex": {"coords": (16.090689, 120.3622115), "desc": "People from other towns come here"},
        "Bliss Waiting Shed, Binloc": {"coords": (16.0935083, 120.3675867), "desc": "Bliss residents stop here"},
        "Leisure Coast Resort": {"coords": (16.0959466, 120.3724469), "desc": "Universidad de Dagupan students destination"},
        "Binloc Barangay Hall": {"coords": (16.1002609, 120.3778482), "desc": "Binloc residents wait and stop"}
    }
    
    for stop_name, data in stops_data.items():
        existing_stop = JeepneyStop.query.filter_by(name=stop_name).first()
        if not existing_stop:
            stop = JeepneyStop(
                name=stop_name,
                latitude=data["coords"][0],
                longitude=data["coords"][1],
                description=data["desc"]
            )
            db.session.add(stop)
        else:
            changed = False
            if existing_stop.latitude != data["coords"][0]:
                existing_stop.latitude = data["coords"][0]
                changed = True
            if existing_stop.longitude != data["coords"][1]:
                existing_stop.longitude = data["coords"][1]
                changed = True
            if existing_stop.description != data["desc"]:
                existing_stop.description = data["desc"]
                changed = True
            if changed:
                db.session.add(existing_stop)

    db.session.commit()

