from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
import os
import logging
import threading
import time
import math
import copy
from datetime import datetime
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import atexit

from flask_cors import CORS
import requests

# Set up logging as early as possible
logging.basicConfig(level=logging.DEBUG)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

# Create the app (single instance)
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
CORS(app)  # Enable CORS for all routes

def _normalise_api_key(raw_key: str | None) -> str:
    if not raw_key:
        return ""
    key = raw_key.strip()
    if not key:
        return ""
    upper = key.upper()
    if upper.startswith(("SET_", "ENTER_", "REPLACE_", "YOUR_")) or "CHANGE" in upper:
        return ""
    return key

SEMAPHORE_API_KEY = _normalise_api_key(os.environ.get("SEMAPHORE_API_KEY"))
SEMAPHORE_SENDER_NAME = os.environ.get("SEMAPHORE_SENDER_NAME", "SEMAPHORE")
SEMAPHORE_MESSAGES_URL = "https://api.semaphore.co/api/v4/messages"
SEMAPHORE_ACCOUNT_URL = "https://api.semaphore.co/api/v4/account"
SEMAPHORE_TIMEOUT = int(os.environ.get("SEMAPHORE_TIMEOUT_SECONDS", "15"))
BALANCE_CACHE_SECONDS = int(os.environ.get("SEMAPHORE_BALANCE_CACHE_SECONDS", "60"))

if not SEMAPHORE_API_KEY:
    logging.warning("Semaphore API key not configured. SMS endpoints will return 500 until a valid key is supplied.")

_balance_cache_lock = threading.Lock()
_balance_cache = {
    "timestamp": 0.0,
    "ttl": 0.0,
    "payload": None,
    "status": 200,
    "retrieved_timestamp": 0.0,
}
_balance_error_cache = {
    "timestamp": 0.0,
    "ttl": 0.0,
    "payload": None,
    "status": 429,
}
_balance_fetch_lock = threading.Lock()


def _is_rate_limit_payload(payload) -> bool:
    """Best-effort detection of Semaphore rate limit responses."""
    if payload is None:
        return False
    try:
        if isinstance(payload, str):
            haystack = payload
        elif isinstance(payload, (bytes, bytearray)):
            haystack = payload.decode("utf-8", "ignore")
        elif isinstance(payload, dict):
            fragments = []
            for key, value in payload.items():
                fragments.append(str(key))
                if isinstance(value, (list, tuple)):
                    fragments.extend(str(item) for item in value)
                else:
                    fragments.append(str(value))
            haystack = " ".join(fragments)
        else:
            haystack = str(payload)
        return "rate limit" in haystack.lower()
    except Exception:
        return False

def _normalise_recipients(raw_numbers):
    """Normalise incoming numbers into a comma-separated string."""
    if raw_numbers is None:
        return ""
    if isinstance(raw_numbers, str):
        return ",".join(
            segment.strip()
            for segment in raw_numbers.split(",")
            if segment.strip()
        )
    if isinstance(raw_numbers, (list, tuple, set)):
        return ",".join(
            str(item).strip()
            for item in raw_numbers
            if str(item).strip()
        )
    # Fallback for unexpected payloads
    return str(raw_numbers).strip()

def _build_balance_payload(raw_payload):
    """Convert Semaphore account response into a standard payload for the frontend."""
    if isinstance(raw_payload, list):
        account_data = raw_payload[0] if raw_payload else {}
    elif isinstance(raw_payload, dict):
        account_data = raw_payload.get("account") or raw_payload
    else:
        account_data = {}

    def _to_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    balance_value = _to_float(
        account_data.get("balance")
        or account_data.get("credit_balance")
        or account_data.get("credits")
        or 0
    )
    if not math.isfinite(balance_value):
        balance_value = 0.0

    account_summary = {
        "id": account_data.get("account_id") or account_data.get("id"),
        "name": account_data.get("account_name") or account_data.get("name") or "",
        "status": account_data.get("status") or account_data.get("account_status") or "unknown",
        "email": account_data.get("email") or "",
        "sender": account_data.get("sendername") or account_data.get("sender_name") or SEMAPHORE_SENDER_NAME,
    }

    return {
        "success": True,
        "balance": balance_value,
        "account": account_summary,
        "raw": raw_payload,
        "stale": False,
        "retrieved_at": datetime.utcnow().isoformat() + "Z",
    }

@app.route("/api/send-sms", methods=["POST"])
@app.route("/api/send_sms", methods=["POST"])
def send_sms():
    """Forward SMS requests to Semaphore using server-side credentials."""
    if not SEMAPHORE_API_KEY:
        logging.error("Semaphore API key is not configured; aborting SMS send.")
        return jsonify({"success": False, "error": "SMS service is not configured on the server."}), 500

    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    sender_name = (payload.get("sender") or payload.get("sendername") or "").strip() or SEMAPHORE_SENDER_NAME
    recipients = _normalise_recipients(
        payload.get("number") or payload.get("numbers") or payload.get("recipients")
    )

    if not recipients:
        return jsonify({"success": False, "error": "At least one recipient number is required."}), 400

    if not message:
        return jsonify({"success": False, "error": "Message content is required."}), 400

    if len(message) > 160:
        return jsonify({"success": False, "error": "Message exceeds 160 character limit for single SMS segment."}), 400

    data = {
        "apikey": SEMAPHORE_API_KEY,
        "number": recipients,
        "message": message,
        "sendername": sender_name[:11],
    }

    response = None
    try:
        response = requests.post(
            SEMAPHORE_MESSAGES_URL,
            data=data,
            timeout=SEMAPHORE_TIMEOUT,
        )
        response.raise_for_status()
        try:
            result = response.json()
        except ValueError:
            logging.warning("Semaphore response was not JSON: %s", response.text)
            return jsonify({"success": True, "raw": response.text})

        return jsonify(result)
    except requests.HTTPError as http_error:
        try:
            error_body = response.json() if response is not None else {}
        except ValueError:
            raw_text = response.text if response is not None else str(http_error)
            error_body = {"error": raw_text or str(http_error)}
        logging.error("Semaphore API returned an error: %s", error_body)
        status_code = response.status_code if response is not None else 502
        return jsonify({"success": False, "error": error_body}), status_code
    except requests.RequestException as request_error:
        logging.error("Error contacting Semaphore API: %s", request_error)
        return jsonify({"success": False, "error": "Unable to reach SMS service. Please try again later."}), 502

@app.route("/api/get-sms-balance", methods=["GET"])
@app.route("/api/sms-balance", methods=["GET"])
def get_sms_balance():
    """Retrieve current SMS account balance via Semaphore."""
    if not SEMAPHORE_API_KEY:
        logging.error("Semaphore API key is not configured; cannot fetch balance.")
        return jsonify({"success": False, "error": "SMS service is not configured on the server."}), 500

    now = time.monotonic()
    with _balance_cache_lock:
        cache_ttl = _balance_cache.get("ttl", 0.0)
        cache_timestamp = _balance_cache.get("timestamp", 0.0)
        cache_status = _balance_cache.get("status", 200)
        if (
            _balance_cache.get("payload") is not None
            and cache_status < 400
            and cache_ttl > 0
            and (now - cache_timestamp) < cache_ttl
        ):
            logging.debug("Returning SMS balance response from cache.")
            return jsonify(_balance_cache["payload"]), _balance_cache.get("status", 200)

        error_ttl = _balance_error_cache.get("ttl", 0.0)
        error_timestamp = _balance_error_cache.get("timestamp", 0.0)
        if (
            _balance_error_cache.get("payload") is not None
            and error_ttl > 0
            and (now - error_timestamp) < error_ttl
        ):
            logging.debug("Returning cached SMS balance error response.")
            return jsonify(_balance_error_cache["payload"]), _balance_error_cache.get("status", 429)

    with _balance_fetch_lock:
        now = time.monotonic()
        with _balance_cache_lock:
            cache_ttl = _balance_cache.get("ttl", 0.0)
            cache_timestamp = _balance_cache.get("timestamp", 0.0)
            cache_status = _balance_cache.get("status", 200)
            if (
                _balance_cache.get("payload") is not None
                and cache_status < 400
                and cache_ttl > 0
                and (now - cache_timestamp) < cache_ttl
            ):
                logging.debug("Returning SMS balance response from cache (post-wait).")
                return jsonify(_balance_cache["payload"]), _balance_cache.get("status", 200)

            error_ttl = _balance_error_cache.get("ttl", 0.0)
            error_timestamp = _balance_error_cache.get("timestamp", 0.0)
            if (
                _balance_error_cache.get("payload") is not None
                and error_ttl > 0
                and (now - error_timestamp) < error_ttl
            ):
                logging.debug("Returning cached SMS balance error response (post-wait).")
                return jsonify(_balance_error_cache["payload"]), _balance_error_cache.get("status", 429)

        response = None
        try:
            response = requests.get(
                SEMAPHORE_ACCOUNT_URL,
                params={"apikey": SEMAPHORE_API_KEY},
                timeout=SEMAPHORE_TIMEOUT,
            )
            response.raise_for_status()
            try:
                account_payload = response.json()
            except ValueError:
                logging.warning("Semaphore account response was not JSON: %s", response.text)
                payload = {
                    "success": True,
                    "balance": None,
                    "account": {},
                    "raw": response.text,
                    "stale": False,
                    "note": "Semaphore returned a non-JSON response.",
                    "retrieved_at": datetime.utcnow().isoformat() + "Z",
                }
                cache_duration = max(BALANCE_CACHE_SECONDS, 0)
                if cache_duration > 0:
                    with _balance_cache_lock:
                        now_ts = time.monotonic()
                        _balance_cache.update({
                            "timestamp": now_ts,
                            "retrieved_timestamp": now_ts,
                            "ttl": cache_duration,
                            "payload": payload,
                            "status": 200,
                        })
                        _balance_error_cache.update({
                            "timestamp": 0.0,
                            "ttl": 0.0,
                            "payload": None,
                            "status": 429,
                        })
                return jsonify(payload)

            payload = _build_balance_payload(account_payload)
            cache_duration = max(BALANCE_CACHE_SECONDS, 0)
            if cache_duration > 0:
                with _balance_cache_lock:
                    now_ts = time.monotonic()
                    _balance_cache.update({
                        "timestamp": now_ts,
                        "retrieved_timestamp": now_ts,
                        "ttl": cache_duration,
                        "payload": payload,
                        "status": 200,
                    })
                    _balance_error_cache.update({
                        "timestamp": 0.0,
                        "ttl": 0.0,
                        "payload": None,
                        "status": 429,
                    })

            return jsonify(payload)
        except requests.HTTPError as http_error:
            status_code = response.status_code if response is not None else 502
            try:
                error_body = response.json() if response is not None else {}
            except ValueError:
                error_body = {"error": response.text if response is not None else str(http_error)}

            retry_after_header = response.headers.get("Retry-After") if response is not None else None

            if status_code != 429:
                if retry_after_header:
                    logging.warning(
                        "Semaphore returned %s with Retry-After=%s; treating as rate-limit.",
                        status_code,
                        retry_after_header,
                    )
                    status_code = 429
                elif _is_rate_limit_payload(error_body):
                    logging.warning(
                        "Semaphore returned %s but payload indicates rate limiting; coercing status to 429.",
                        status_code,
                    )
                    status_code = 429

            logging.error("Semaphore balance API error: %s", error_body)

            if status_code == 429:
                try:
                    retry_after = int(retry_after_header) if retry_after_header is not None else None
                except (TypeError, ValueError):
                    retry_after = None
                if retry_after is None:
                    retry_after = BALANCE_CACHE_SECONDS if BALANCE_CACHE_SECONDS > 0 else 30
                retry_after = max(retry_after, 5)
                with _balance_cache_lock:
                    cached_payload = copy.deepcopy(_balance_cache.get("payload"))
                    cached_status = _balance_cache.get("status", 200)
                    cached_retrieved_ts = _balance_cache.get("retrieved_timestamp", 0.0)

                if cached_payload and cached_status < 400:
                    stale_payload = dict(cached_payload)
                    stale_payload["stale"] = True
                    stale_payload["success"] = True
                    stale_payload["note"] = "Showing cached balance. Semaphore rate limit reached; please retry later."
                    stale_payload["retry_after"] = retry_after
                    if cached_retrieved_ts:
                        stale_payload["last_updated_seconds_ago"] = max(int(time.monotonic() - cached_retrieved_ts), 0)
                    else:
                        stale_payload["last_updated_seconds_ago"] = None

                    now_ts = time.monotonic()
                    with _balance_cache_lock:
                        _balance_cache.update({
                            "timestamp": now_ts,
                            "ttl": retry_after,
                            "payload": stale_payload,
                            "status": 200,
                            "retrieved_timestamp": cached_retrieved_ts or now_ts,
                        })
                        _balance_error_cache.update({
                            "timestamp": 0.0,
                            "ttl": 0.0,
                            "payload": None,
                            "status": 429,
                        })
                    logging.info("Returning cached SMS balance due to Semaphore rate limit.")
                    return jsonify(stale_payload)

                payload = {
                    "success": False,
                    "error": "Semaphore rate limit reached. Please wait before refreshing the balance.",
                    "retry_after": retry_after,
                    "details": error_body,
                }
                with _balance_cache_lock:
                    _balance_error_cache.update({
                        "timestamp": time.monotonic(),
                        "ttl": retry_after,
                        "payload": payload,
                        "status": 429,
                    })
                return jsonify(payload), 429

            error_payload = {"success": False, "error": error_body}
            error_ttl = max(5, min(BALANCE_CACHE_SECONDS, 30)) if BALANCE_CACHE_SECONDS > 0 else 10
            with _balance_cache_lock:
                _balance_error_cache.update({
                    "timestamp": time.monotonic(),
                    "ttl": error_ttl,
                    "payload": error_payload,
                    "status": status_code,
                })
            return jsonify(error_payload), status_code
        except requests.RequestException as request_error:
            logging.error("Error contacting Semaphore API for balance: %s", request_error)
            error_payload = {"success": False, "error": "Unable to reach SMS service. Please try again later."}
            error_ttl = max(5, min(BALANCE_CACHE_SECONDS, 30)) if BALANCE_CACHE_SECONDS > 0 else 10
            with _balance_cache_lock:
                _balance_error_cache.update({
                    "timestamp": time.monotonic(),
                    "ttl": error_ttl,
                    "payload": error_payload,
                    "status": 502,
                })
            return jsonify(error_payload), 502

# Configure the database
import tempfile
import sqlite3

# Use a temporary directory for development database
TEMP_DIR = tempfile.gettempdir()
DB_PATH = os.path.join(TEMP_DIR, "passenger_forecasting.db")

print(f"Using database path: {DB_PATH}")

# Initialize empty database if it doesn't exist
if not os.path.exists(DB_PATH):
    try:
        # Create the SQLite database file
        conn = sqlite3.connect(DB_PATH)
        conn.close()
        print(f"Created new database file at: {DB_PATH}")
    except Exception as e:
        print(f"Error creating database file: {e}")

app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

# Initialize the app with the extension
db.init_app(app)

# Initialize scheduler
scheduler = BackgroundScheduler()
scheduler.start()

# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())

with app.app_context():
    # Import models to ensure tables are created
    import models
    db.create_all()

    # Import and register routes (import side-effect registers endpoints)
    import routes  # noqa: F401

    # Import and setup scheduler
    from scheduler import setup_daily_prediction_job
    setup_daily_prediction_job(scheduler)

# Export for main.py
__all__ = ['app']
