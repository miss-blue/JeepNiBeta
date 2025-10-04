import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import logging
from typing import Dict, List, Tuple
import pickle
import os

# Set random seed for reproducibility
np.random.seed(42)
random.seed(42)

class PassengerDataGenerator:
    """Generate synthetic passenger demand data for jeepney stops"""
    
    def __init__(self):
        self.stops_data = {
            "Saint Gabriel The Archangel Parish": {"coords": (16.0754843, 120.3546182), "type": "religious"},
            "Alip, Boquig Waiting Shed": {"coords": (16.073742, 120.351614), "type": "student"},
            "Bonuan Boquig, Baranggay Hall": {"coords": (16.076286, 120.3557308), "type": "government"},
            "Sagor, Longos": {"coords": (16.066106, 120.353298), "type": "mixed"},
            "Centro, Longos": {"coords": (16.070591, 120.359635), "type": "mixed"},
            "Don Leon Francisco Maramba Elementary School, Longos": {"coords": (16.0710835, 120.3591833), "type": "student"},
            "Bonuan Boquig - Biazon Waiting Shed": {"coords": (16.0756322, 120.3656381), "type": "student"},
            "Bonuan Buquig National Highschool": {"coords": (16.078721, 120.360024), "type": "student"},
            "7 Eleven Bonuan": {"coords": (16.075331, 120.342945), "type": "commercial"},
            "North Central, Don Marcelo Elementary School": {"coords": (16.073780, 120.340295), "type": "student"},
            "MCDo Bonuan": {"coords": (16.0722655, 120.3386216), "type": "commercial"},
            "Nepo Mall": {"coords": (16.0511218, 120.3408555), "type": "commercial"},
            "Universidad De Dagupan": {"coords": (16.0511218, 120.3408555), "type": "university"},
            "Junction": {"coords": (16.046392, 120.343012), "type": "transport_hub"},
            "Region 1 Medical Center": {"coords": (16.048645, 120.341774), "type": "medical"},
            "Phinma-University of Pangasinan": {"coords": (16.046392, 120.343012), "type": "university"},
            "CSI City Mall": {"coords": (16.043989, 120.335708), "type": "commercial"},
            "Hererro-Perez Waiting Shed": {"coords": (16.042155, 120.342460), "type": "student"},
            "Victory, Five Star": {"coords": (16.042842, 120.344109), "type": "transport_hub"},
            "SM Center Dagupan": {"coords": (16.0444626, 120.3425649), "type": "commercial"},
            "DBP": {"coords": (16.043786, 120.344272), "type": "financial"},
            "Tondaligan Centro": {"coords": (16.084194, 120.348134), "type": "recreational"},
            "Region 1 MC Annex": {"coords": (16.090689, 120.3622115), "type": "medical"},
            "Bliss Waiting Shed, Binloc": {"coords": (16.0935083, 120.3675867), "type": "residential"},
            "Leisure Coast Resort": {"coords": (16.0959466, 120.3724469), "type": "recreational"},
            "Binloc Barangay Hall": {"coords": (16.1002609, 120.3778482), "type": "government"}
        }
        
        # Define base passenger patterns by stop type
        self.base_patterns = {
            "student": {"peak_hours": [7, 8, 16, 17], "base_demand": 15, "peak_multiplier": 3.0},
            "commercial": {"peak_hours": [12, 13, 18, 19], "base_demand": 20, "peak_multiplier": 2.5},
            "university": {"peak_hours": [7, 8, 16, 17, 18], "base_demand": 25, "peak_multiplier": 2.8},
            "transport_hub": {"peak_hours": [7, 8, 17, 18], "base_demand": 30, "peak_multiplier": 2.0},
            "medical": {"peak_hours": [9, 10, 14, 15], "base_demand": 12, "peak_multiplier": 1.8},
            "financial": {"peak_hours": [8, 9, 17, 18], "base_demand": 10, "peak_multiplier": 2.2},
            "recreational": {"peak_hours": [10, 11, 15, 16], "base_demand": 8, "peak_multiplier": 2.5},
            "residential": {"peak_hours": [6, 7, 17, 18], "base_demand": 12, "peak_multiplier": 2.0},
            "government": {"peak_hours": [8, 9, 16, 17], "base_demand": 8, "peak_multiplier": 1.5},
            "religious": {"peak_hours": [6, 7, 17, 18], "base_demand": 5, "peak_multiplier": 3.0},
            "mixed": {"peak_hours": [7, 8, 17, 18], "base_demand": 15, "peak_multiplier": 2.0}
        }
        
        # Philippine holidays (simplified)
        self.holidays = [
            "2024-01-01", "2024-04-09", "2024-05-01", "2024-06-12", "2024-08-26",
            "2024-11-30", "2024-12-25", "2024-12-30", "2024-12-31"
        ]
        
        # School dismissal times
        self.school_dismissal_hours = [15, 16, 17]  # 3 PM, 4 PM, 5 PM
        
        # Tide data (simplified - in reality this would come from an API)
        self.high_tide_hours = [2, 8, 14, 20]  # Every 6 hours approximately
    
    def generate_features(self, dt: datetime, stop_name: str) -> Dict:
        """Generate features for a specific datetime and stop"""
        features = {}
        
        # Time-based features
        features['hour_of_day'] = dt.hour
        features['day_of_week'] = dt.weekday()
        features['is_weekend'] = 1 if dt.weekday() >= 5 else 0
        
        # Holiday check
        features['is_public_holiday'] = 1 if dt.strftime('%Y-%m-%d') in self.holidays else 0
        
        # School dismissal time
        features['is_school_dismissal_time'] = 1 if dt.hour in self.school_dismissal_hours else 0
        
        # High tide (simplified)
        features['is_hightide'] = 1 if dt.hour in self.high_tide_hours else 0
        
        # Cyclical features
        features['hour_sin'] = np.sin(2 * np.pi * dt.hour / 24)
        features['hour_cos'] = np.cos(2 * np.pi * dt.hour / 24)
        features['day_of_week_sin'] = np.sin(2 * np.pi * dt.weekday() / 7)
        features['day_of_week_cos'] = np.cos(2 * np.pi * dt.weekday() / 7)
        
        return features
    
    def generate_passenger_demand(self, dt: datetime, stop_name: str, features: Dict) -> int:
        """Generate passenger demand based on features"""
        stop_info = self.stops_data[stop_name]
        stop_type = stop_info["type"]
        pattern = self.base_patterns[stop_type]
        
        # Base demand
        base_demand = pattern["base_demand"]
        
        # Hour-based multiplier
        hour_multiplier = 1.0
        if features['hour_of_day'] in pattern["peak_hours"]:
            hour_multiplier = pattern["peak_multiplier"]
        
        # Weekend effect
        weekend_multiplier = 0.6 if features['is_weekend'] else 1.0
        
        # Holiday effect
        holiday_multiplier = 0.4 if features['is_public_holiday'] else 1.0
        
        # School dismissal effect (mainly for student stops)
        school_multiplier = 1.0
        if features['is_school_dismissal_time'] and stop_type in ["student", "university"]:
            school_multiplier = 1.5
        
        # High tide effect (affects coastal areas)
        tide_multiplier = 1.0
        if features['is_hightide'] and stop_name in ["Tondaligan Centro", "Leisure Coast Resort"]:
            tide_multiplier = 1.3
        
        # Calculate final demand
        demand = base_demand * hour_multiplier * weekend_multiplier * holiday_multiplier * school_multiplier * tide_multiplier
        
        # Add some random noise
        noise = np.random.normal(0, 0.1 * demand)
        demand = max(0, demand + noise)
        
        return int(round(demand))
    
    def generate_dataset(self, start_date: str, end_date: str, num_records: int = 50000) -> pd.DataFrame:
        """Generate complete dataset"""
        logging.info(f"Generating {num_records} records from {start_date} to {end_date}")
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        data = []
        records_generated = 0
        
        current_dt = start_dt
        while current_dt <= end_dt and records_generated < num_records:
            for hour in range(24):
                for stop_name in self.stops_data.keys():
                    dt = current_dt.replace(hour=hour)
                    
                    # Generate features
                    features = self.generate_features(dt, stop_name)
                    
                    # Generate passenger demand
                    demand = self.generate_passenger_demand(dt, stop_name, features)
                    
                    # Create record
                    record = {
                        'datetime': dt,
                        'stop_name': stop_name,
                        'latitude': self.stops_data[stop_name]['coords'][0],
                        'longitude': self.stops_data[stop_name]['coords'][1],
                        'stop_type': self.stops_data[stop_name]['type'],
                        'passenger_count': demand,
                        **features
                    }
                    
                    data.append(record)
                    records_generated += 1
                    
                    if records_generated >= num_records:
                        break
                
                if records_generated >= num_records:
                    break
            
            current_dt += timedelta(days=1)
            
            if records_generated % 10000 == 0:
                logging.info(f"Generated {records_generated} records...")
        
        # Create DataFrame
        df = pd.DataFrame(data)
        
        # Add lag features
        df = df.sort_values(['stop_name', 'datetime'])
        df['lag_1_hour_demand'] = df.groupby('stop_name')['passenger_count'].shift(1)
        df['lag_24_hour_demand'] = df.groupby('stop_name')['passenger_count'].shift(24)
        
        # Add rolling averages
        df['rolling_3_hour_avg_demand'] = df.groupby('stop_name')['passenger_count'].rolling(window=3, min_periods=1).mean().reset_index(0, drop=True)
        df['rolling_6_hour_avg_demand'] = df.groupby('stop_name')['passenger_count'].rolling(window=6, min_periods=1).mean().reset_index(0, drop=True)
        
        # Fill NaN values
        df['lag_1_hour_demand'].fillna(df['passenger_count'], inplace=True)
        df['lag_24_hour_demand'].fillna(df['passenger_count'], inplace=True)
        
        logging.info(f"Dataset generated with {len(df)} records")
        return df
    
    def save_dataset(self, df: pd.DataFrame, filename: str):
        """Save dataset to CSV"""
        df.to_csv(filename, index=False)
        logging.info(f"Dataset saved to {filename}")
    
    def load_dataset(self, filename: str) -> pd.DataFrame:
        """Load dataset from CSV"""
        df = pd.read_csv(filename)
        df['datetime'] = pd.to_datetime(df['datetime'])
        logging.info(f"Dataset loaded from {filename}")
        return df

# Main execution
if __name__ == "__main__":
    generator = PassengerDataGenerator()
    
    # Generate dataset for 2 years (2023-2024)
    df = generator.generate_dataset('2023-01-01', '2024-12-31', 60000)
    
    # Save dataset
    generator.save_dataset(df, 'passenger_demand_data.csv')
    
    # Display basic statistics
    print("Dataset Statistics:")
    print(f"Total records: {len(df)}")
    print(f"Date range: {df['datetime'].min()} to {df['datetime'].max()}")
    print(f"Average passenger count: {df['passenger_count'].mean():.2f}")
    print(f"Unique stops: {df['stop_name'].nunique()}")
    print("\nStop types distribution:")
    print(df['stop_type'].value_counts())
