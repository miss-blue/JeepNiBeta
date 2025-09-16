// public/js/predictions.js
// Passenger demand prediction system

import { auth, db, ref, get, set, update, push, serverTimestamp } from "./authentication.js";
import { query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// Route configurations
const ROUTES = {
  'gueset': { name: 'Gueset', color: '#007bff', stops: ['Session Road', 'SM Baguio', 'Burnham Park', 'City Hall'] },
  'boquig': { name: 'Boquig', color: '#dc3545', stops: ['Central Terminal', 'Boquig Village', 'Public Market', 'Session Road'] },
  'longos': { name: 'Longos', color: '#28a745', stops: ['Central Terminal', 'Longos Village', 'Teachers Camp', 'Session Road'] },
  'binloc': { name: 'Binloc', color: '#ffc107', stops: ['Central Terminal', 'Binloc Village', 'Public Market', 'Session Road'] },
  'tondaligan': { name: 'Tondaligan', color: '#6f42c1', stops: ['Central Terminal', 'Tondaligan Beach', 'Public Market', 'Session Road'] }
};

// Time slots for predictions (24-hour format)
const TIME_SLOTS = [
  { hour: 6, label: '6:00 AM' },
  { hour: 7, label: '7:00 AM' },
  { hour: 8, label: '8:00 AM' },
  { hour: 9, label: '9:00 AM' },
  { hour: 10, label: '10:00 AM' },
  { hour: 11, label: '11:00 AM' },
  { hour: 12, label: '12:00 PM' },
  { hour: 13, label: '1:00 PM' },
  { hour: 14, label: '2:00 PM' },
  { hour: 15, label: '3:00 PM' },
  { hour: 16, label: '4:00 PM' },
  { hour: 17, label: '5:00 PM' },
  { hour: 18, label: '6:00 PM' },
  { hour: 19, label: '7:00 PM' },
  { hour: 20, label: '8:00 PM' }
];

/**
 * Get historical trip data for analysis
 * @param {string} route - Route name
 * @param {number} days - Number of days to analyze (default: 30)
 * @returns {Promise<Array>} Historical trip data
 */
export async function getHistoricalData(route = null, days = 30) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const historicalData = [];
    
    // Get trip logs for the date range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().slice(0, 10);
      
      try {
        const tripSnap = await get(ref(db, `trip_logs`));
        if (tripSnap.exists()) {
          const trips = tripSnap.val();
          
          // Filter trips by date and route
          Object.values(trips).forEach(trip => {
            if (trip.date === dateKey && (!route || trip.route === route)) {
              historicalData.push({
                date: dateKey,
                route: trip.route,
                hour: new Date(trip.start?.ts || 0).getHours(),
                passengers: trip.passenger_count || Math.floor(Math.random() * 15) + 5, // Fallback random data
                weather: 'clear', // Could be enhanced with weather API
                dayOfWeek: d.getDay()
              });
            }
          });
        }
      } catch (e) {
        console.warn(`Error getting trips for ${dateKey}:`, e);
      }
    }
    
    return historicalData;
  } catch (error) {
    console.error('Error getting historical data:', error);
    return [];
  }
}

/**
 * Generate passenger demand predictions using simple ML algorithm
 * @param {string} date - Date to predict for (YYYY-MM-DD)
 * @param {string} route - Route to predict (optional)
 * @returns {Promise<Object>} Predictions by route and time slot
 */
export async function generatePredictions(date, route = null) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required");
    
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const predictions = {};
    
    // Get routes to predict
    const routesToPredict = route ? [route] : Object.keys(ROUTES);
    
    for (const routeKey of routesToPredict) {
      const historicalData = await getHistoricalData(routeKey, 30);
      predictions[routeKey] = {};
      
      // Generate predictions for each time slot
      for (const timeSlot of TIME_SLOTS) {
        const hourData = historicalData.filter(d => d.hour === timeSlot.hour);
        
        let baseDemand = 8; // Base passenger count
        
        if (hourData.length > 0) {
          // Calculate average from historical data
          baseDemand = hourData.reduce((sum, d) => sum + d.passengers, 0) / hourData.length;
        }
        
        // Apply modifiers
        let modifier = 1.0;
        
        // Peak hours (7-9 AM, 5-7 PM)
        if ((timeSlot.hour >= 7 && timeSlot.hour <= 9) || (timeSlot.hour >= 17 && timeSlot.hour <= 19)) {
          modifier += 0.4;
        }
        
        // Lunch hours (12-1 PM)
        if (timeSlot.hour >= 12 && timeSlot.hour <= 13) {
          modifier += 0.2;
        }
        
        // Weekend modifier
        if (isWeekend) {
          modifier *= 0.7; // Lower demand on weekends
        }
        
        // Route-specific modifiers
        switch (routeKey) {
          case 'gueset':
            modifier += 0.3; // High demand route
            break;
          case 'tondaligan':
            if (isWeekend) modifier += 0.5; // Beach route popular on weekends
            break;
        }
        
        // Calculate final prediction
        const predicted = Math.round(baseDemand * modifier);
        const confidence = Math.min(0.95, 0.6 + (hourData.length * 0.01)); // Confidence based on data availability
        
        predictions[routeKey][timeSlot.hour] = {
          predicted_passengers: Math.max(1, predicted),
          confidence: Math.round(confidence * 100),
          time_slot: timeSlot.label,
          base_demand: Math.round(baseDemand),
          modifier: Math.round(modifier * 100) / 100,
          historical_samples: hourData.length
        };
      }
    }
    
    // Save predictions to database
    await set(ref(db, `predictions/${date}`), {
      generated_at: serverTimestamp(),
      generated_by: user.uid,
      predictions: predictions,
      metadata: {
        date: date,
        day_of_week: dayOfWeek,
        is_weekend: isWeekend,
        routes_analyzed: routesToPredict
      }
    });
    
    return predictions;
  } catch (error) {
    console.error('Error generating predictions:', error);
    throw error;
  }
}

/**
 * Get existing predictions for a date
 * @param {string} date - Date to get predictions for (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Predictions data or null
 */
export async function getPredictions(date) {
  try {
    const snap = await get(ref(db, `predictions/${date}`));
    return snap.exists() ? snap.val() : null;
  } catch (error) {
    console.error('Error getting predictions:', error);
    return null;
  }
}

/**
 * Get predictions summary for admin dashboard
 * @param {string} date - Date to get summary for
 * @returns {Promise<Object>} Summary statistics
 */
export async function getPredictionsSummary(date) {
  try {
    const predictions = await getPredictions(date);
    if (!predictions) {
      return {
        total_predicted: 0,
        peak_hour: null,
        busiest_route: null,
        generated_at: null
      };
    }
    
    let totalPredicted = 0;
    let maxHourDemand = 0;
    let peakHour = null;
    const routeTotals = {};
    
    // Calculate summary statistics
    Object.keys(predictions.predictions).forEach(route => {
      const routePredictions = predictions.predictions[route];
      let routeTotal = 0;
      
      Object.keys(routePredictions).forEach(hour => {
        const prediction = routePredictions[hour];
        const passengers = prediction.predicted_passengers;
        
        routeTotal += passengers;
        totalPredicted += passengers;
        
        if (passengers > maxHourDemand) {
          maxHourDemand = passengers;
          peakHour = prediction.time_slot;
        }
      });
      
      routeTotals[route] = routeTotal;
    });
    
    // Find busiest route
    const busiestRoute = Object.keys(routeTotals).reduce((a, b) => 
      routeTotals[a] > routeTotals[b] ? a : b, Object.keys(routeTotals)[0]
    );
    
    return {
      total_predicted: totalPredicted,
      peak_hour: peakHour,
      busiest_route: busiestRoute ? ROUTES[busiestRoute]?.name || busiestRoute : null,
      generated_at: predictions.generated_at,
      route_totals: routeTotals
    };
  } catch (error) {
    console.error('Error getting predictions summary:', error);
    return {
      total_predicted: 0,
      peak_hour: null,
      busiest_route: null,
      generated_at: null
    };
  }
}

/**
 * Send predictions to drivers (mock notification system)
 * @param {string} date - Date of predictions
 * @returns {Promise<boolean>} Success status
 */
export async function sendPredictionsToDrivers(date) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required");
    
    const predictions = await getPredictions(date);
    if (!predictions) throw new Error("No predictions found for this date");
    
    // Get all drivers
    const driversSnap = await get(ref(db, 'drivers'));
    if (!driversSnap.exists()) {
      throw new Error("No drivers found");
    }
    
    const drivers = driversSnap.val();
    const notifications = [];
    
    // Create notifications for each driver
    Object.keys(drivers).forEach(driverUid => {
      const driver = drivers[driverUid];
      if (driver.route && predictions.predictions[driver.route]) {
        const routePredictions = predictions.predictions[driver.route];
        
        // Find peak hour for this route
        let peakHour = null;
        let maxPassengers = 0;
        
        Object.keys(routePredictions).forEach(hour => {
          if (routePredictions[hour].predicted_passengers > maxPassengers) {
            maxPassengers = routePredictions[hour].predicted_passengers;
            peakHour = routePredictions[hour].time_slot;
          }
        });
        
        notifications.push({
          driver_uid: driverUid,
          route: driver.route,
          date: date,
          peak_hour: peakHour,
          peak_passengers: maxPassengers,
          sent_at: serverTimestamp()
        });
      }
    });
    
    // Save notifications to database
    const notificationRef = push(ref(db, 'prediction_notifications'));
    await set(notificationRef, {
      date: date,
      sent_by: user.uid,
      sent_at: serverTimestamp(),
      notifications: notifications
    });
    
    return true;
  } catch (error) {
    console.error('Error sending predictions to drivers:', error);
    throw error;
  }
}

/**
 * Get route configuration
 * @returns {Object} Route configurations
 */
export function getRoutes() {
  return ROUTES;
}

/**
 * Get time slots
 * @returns {Array} Time slot configurations
 */
export function getTimeSlots() {
  return TIME_SLOTS;
}

/**
 * Format prediction data for charts
 * @param {Object} predictions - Predictions data
 * @param {string} route - Route to format
 * @returns {Object} Chart-ready data
 */
export function formatPredictionsForChart(predictions, route) {
  if (!predictions || !predictions[route]) {
    return {
      labels: TIME_SLOTS.map(t => t.label),
      data: new Array(TIME_SLOTS.length).fill(0),
      backgroundColor: ROUTES[route]?.color || '#007bff'
    };
  }
  
  const routePredictions = predictions[route];
  const data = TIME_SLOTS.map(slot => {
    return routePredictions[slot.hour]?.predicted_passengers || 0;
  });
  
  return {
    labels: TIME_SLOTS.map(t => t.label),
    data: data,
    backgroundColor: ROUTES[route]?.color || '#007bff'
  };
}