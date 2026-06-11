"""
One-off script to seed an mlTask doc into Firestore.
Run once, then delete or keep for future tasks.

Usage:
  GRPC_DNS_RESOLVER=native python3 seed_ml_task.py
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone

KEY_PATH = os.path.expanduser('~/Desktop/Dev/Credentials/Firebase for Transit Stats.json')

cred = credentials.Certificate(KEY_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()

task = {
    'userId': 'N8f5vS0sLjgjwxMCSUZUkVFv7ax2',
    'description': 'Audit V4/V5 shadow accuracy — stop feature fix (spaces→underscores). Run: node Tools/audit-prediction-shadow.js <userId> --agency=TTC --source=sms',
    'tripTarget': 30,
    'tripsSince': '2026-06-09T00:00:00+00:00',
    'agency': 'TTC',
    'linearUrl': None,
    'triggered': False,
    'createdAt': datetime.now(timezone.utc).isoformat(),
}

ref = db.collection('mlTasks').add(task)
print(f'Created mlTask: {ref[1].id}')
