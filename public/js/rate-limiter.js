// Client-side rate limiting for SMS sends

class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  canMakeRequest() {
    const now = Date.now();
    // Remove requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    this.requests.push(Date.now());
  }

  getRemainingRequests() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  getTimeUntilReset() {
    if (this.requests.length === 0) return 0;
    
    const now = Date.now();
    const oldestRequest = Math.min(...this.requests);
    const timeUntilReset = this.windowMs - (now - oldestRequest);
    
    return Math.max(0, timeUntilReset);
  }

  reset() {
    this.requests = [];
  }
}

// Create a limiter for SMS sends (10 requests per minute)
export const smsRateLimiter = new RateLimiter(10, 60000);

export default RateLimiter;