from pathlib import Path
path = Path(r'C:\xampp\htdocs\Final Sofeng 2\JeepNiBeta\README.md')
text = path.read_text(encoding='utf-16').replace('\r\n', '\n')
old = ('## 2) Backend Setup (Flask API)\n\nThe backend now focuses on exposing a secure proxy to the Semaphore SMS API that the admin dashboard can call. '
       'The backend code lives in the sibling directory ../JeepNiBackend/ (relative to this repo).\n\n'
       '- ../JeepNiBackend/backend/app.py - Flask app factory with /api/send-sms and /api/get-sms-balance\n'
       '- ../JeepNiBackend/backend/semaphore_client.py - helper that talks to Semaphore and logs responses\n'
       '- ../JeepNiBackend/backend/config.py - loads configuration from environment variables / .env\n'
       '- ../JeepNiBackend/main.py - convenience entrypoint that runs the Flask app on port 5000\n'
       '- ../JeepNiBackend/requirements.txt - consolidated dependency list\n')
new = ('## 2) Backend Setup (Flask API)\n\nThe backend code lives in the sibling directory ../JeepNiBackend/ (relative to this repo) and provides '
       'prediction, SMS, and admin services for the dashboards.\n\n'
       '- ../JeepNiBackend/app.py - main Flask application with CORS, scheduler bootstrap, and configuration\n'
       '- ../JeepNiBackend/routes.py - REST endpoints including /api/predictions/* and admin utilities\n'
       '- ../JeepNiBackend/scheduler.py - APScheduler jobs that generate daily predictions\n'
       '- ../JeepNiBackend/main.py - convenience entrypoint that runs the Flask app on port 5000\n'
       '- ../JeepNiBackend/requirements.txt - consolidated dependency list\n')
if old not in text:
    raise SystemExit('expected block not found')
text = text.replace(old, new)
path.write_text(text.replace('\n', '\r\n'), encoding='utf-16')
