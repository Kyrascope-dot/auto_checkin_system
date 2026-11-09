"""MongoDB connection singleton."""

from __future__ import annotations

import certifi
import logging

from pymongo import MongoClient
from pymongo.database import Database

from config import MONGODB_URL, MONGODB_DB

logger = logging.getLogger("db")

_client: MongoClient | None = None
_db: Database | None = None


def get_db() -> Database:
    global _client, _db
    if _db is None:
        _client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000, tlsCAFile=certifi.where())
        _db = _client[MONGODB_DB]
        try:
            _client.admin.command("ping")
            _ensure_indexes(_db)
            logger.info("MongoDB connected: %s / %s", MONGODB_URL, MONGODB_DB)
        except Exception as e:
            logger.warning("MongoDB not reachable yet (%s) — will retry on first use", e)
    return _db


def _ensure_indexes(db: Database):
    db.employees.create_index("employee_id", unique=True)
    db.employees.create_index("internal_id", unique=True, sparse=True)
    db.employees.create_index("essl_user_id", sparse=True)

    db.checkins.create_index([("employee_id", 1), ("checked_in_at", -1)])
    db.checkins.create_index("checked_in_at")
    db.checkins.create_index([("employee_id", 1), ("date", 1)])


def close_db():
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB disconnected")
