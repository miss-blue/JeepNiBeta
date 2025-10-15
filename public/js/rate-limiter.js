// Client-side rate limiting for SMS sends

export class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  canMakeRequest() {
    const now = Date.now();
    // Remove expired timestamps
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    this.requests.push(Date.now());
  }

  getTimeUntilReset() {
    if (this.requests.length === 0) return 0;
    const now = Date.now();
    const oldestRequest = Math.min(...this.requests);
    return Math.max(0, this.timeWindow - (now - oldestRequest));
  }

  getRemainingRequests() {
    return Math.max(0, this.maxRequests - this.requests.length);
  }
}

// Create instances for different API endpoints
export const smsRateLimiter = new RateLimiter(2, 30000); // 2 requests per 30 seconds
export const balanceRateLimiter = new RateLimiter(1, 30000); // 1 request per 30 seconds



// // Client-side rate limiting for SMS sends

// class RateLimiter {
//   constructor(maxRequests = 10, windowMs = 60000) {
//     this.maxRequests = maxRequests;
//     this.windowMs = windowMs;
//     this.requests = [];
//   }

//   canMakeRequest() {
//     const now = Date.now();
//     // Remove requests outside the time window
//     this.requests = this.requests.filter(time => now - time < this.windowMs);
    
//     return this.requests.length < this.maxRequests;
//   }

//   recordRequest() {
//     this.requests.push(Date.now());
//   }

//   getRemainingRequests() {
//     const now = Date.now();
//     this.requests = this.requests.filter(time => now - time < this.windowMs);
//     return Math.max(0, this.maxRequests - this.requests.length);
//   }

//   getTimeUntilReset() {
//     if (this.requests.length === 0) return 0;
    
//     const now = Date.now();
//     const oldestRequest = Math.min(...this.requests);
//     const timeUntilReset = this.windowMs - (now - oldestRequest);
    
//     return Math.max(0, timeUntilReset);
//   }

//   reset() {
//     this.requests = [];
//   }
// }

// // Create a limiter for SMS sends (10 requests per minute)
// export const smsRateLimiter = new RateLimiter(10, 60000);

// export default RateLimiter;