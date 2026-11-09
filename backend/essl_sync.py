"""eSSL biometric device sync — pulls users & attendance.

Syncs eSSL device data into MongoDB unified checkin store so that
check-ins from eSSL are visible alongside face recognition and camera.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from config import ESSL_DATA_DIR, ESSL_IP, ESSL_PORT

logger = logging.getLogger("essl")

USERS_FILE = ESSL_DATA_DIR / "users.json"
LAST_SYNC_FILE = ESSL_DATA_DIR / "last_sync.json"

_file_lock = threading.Lock()
_live_thread: threading.Thread | None = None
_live_stop = threading.Event()


def _load_json(path: Path) -> list | dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def _save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2, default=str, ensure_ascii=False), encoding="utf-8")


def _get_employee_id_for_essl_user(user_id: str, name: str) -> str:
    """Find or create the employee_id for an eSSL user.

    Links eSSL users to MongoDB employees by essl_user_id.
    If no match, creates an employee record using the eSSL user_id as employee_id.
    """
    from db import get_db
    db = get_db()

    emp = db.employees.find_one({"essl_user_id": user_id})
    if emp:
        return emp["employee_id"]

    emp = db.employees.find_one({"employee_id": user_id})
    if emp:
        db.employees.update_one({"_id": emp["_id"]}, {"$set": {"essl_user_id": user_id}})
        return emp["employee_id"]

    db.employees.update_one(
        {"employee_id": user_id},
        {"$set": {
            "employee_id": user_id,
            "essl_user_id": user_id,
            "name": name or f"User {user_id}",
            "department": "",
            "designation": "",
            "enrolled_at": datetime.now(timezone.utc).isoformat(),
            "source": "essl",
        }},
        upsert=True,
    )
    return user_id


def _sync_attendance_to_mongo(raw_attendance, users_map: dict[str, str]):
    """Write eSSL attendance records into the unified MongoDB checkin store."""
    from db import get_db
    db = get_db()

    by_user_day: dict[str, dict[str, list]] = {}
    for att in raw_attendance:
        uid = str(att.user_id)
        ts = att.timestamp.isoformat() if isinstance(att.timestamp, datetime) else str(att.timestamp)
        day = ts[:10]
        by_user_day.setdefault(uid, {}).setdefault(day, []).append(ts)

    new_records = 0
    for uid, days in by_user_day.items():
        name = users_map.get(uid, f"User {uid}")
        employee_id = _get_employee_id_for_essl_user(uid, name)

        for day, timestamps in days.items():
            timestamps.sort()
            first_in = timestamps[0]
            last_out = timestamps[-1] if len(timestamps) > 1 else None

            hours = None
            if first_in and last_out and first_in != last_out:
                try:
                    t_in = datetime.fromisoformat(first_in)
                    t_out = datetime.fromisoformat(last_out)
                    hours = round((t_out - t_in).total_seconds() / 3600, 2)
                except Exception:
                    pass

            existing = db.checkins.find_one({
                "employee_id": employee_id,
                "date": day,
                "source": "essl",
            })

            if existing:
                updates = {}
                if last_out and last_out != first_in:
                    updates["checked_out_at"] = last_out
                    updates["working_hours"] = hours
                updates["essl_punches"] = len(timestamps)
                if updates:
                    db.checkins.update_one({"_id": existing["_id"]}, {"$set": updates})
            else:
                db.checkins.insert_one({
                    "employee_id": employee_id,
                    "name": name,
                    "department": "",
                    "designation": "",
                    "similarity": 0.0,
                    "source": "essl",
                    "checked_in_at": first_in,
                    "checked_out_at": last_out if last_out and last_out != first_in else None,
                    "working_hours": hours,
                    "date": day,
                    "essl_user_id": uid,
                    "essl_punches": len(timestamps),
                })
                new_records += 1

    return new_records


def _auto_sync_loop():
    """Background loop: periodically sync attendance from device."""
    POLL_INTERVAL = 60

    while not _live_stop.is_set():
        if not ESSL_IP:
            logger.warning("ESSL_IP not set — auto-sync waiting")
            _live_stop.wait(30)
            continue

        try:
            logger.info("eSSL auto-sync: pulling data from %s:%s", ESSL_IP, ESSL_PORT)
            result = sync_device()
            if result.get("success"):
                new = result.get("new_records", 0)
                if new:
                    logger.info("eSSL auto-sync: %d new records", new)
                else:
                    logger.debug("eSSL auto-sync: no new records")
            else:
                logger.warning("eSSL auto-sync failed: %s", result.get("error"))
        except Exception as e:
            logger.warning("eSSL auto-sync error: %s", e)

        _live_stop.wait(POLL_INTERVAL)


def start_live_capture():
    """Start the background auto-sync thread (idempotent)."""
    global _live_thread
    if _live_thread and _live_thread.is_alive():
        return
    _live_stop.clear()
    _live_thread = threading.Thread(target=_auto_sync_loop, daemon=True, name="essl-autosync")
    _live_thread.start()
    logger.info("eSSL auto-sync thread started")


def stop_live_capture():
    """Stop the background auto-sync thread."""
    _live_stop.set()
    if _live_thread:
        _live_thread.join(timeout=5)
    logger.info("eSSL auto-sync thread stopped")


def sync_device() -> dict:
    """Connect to eSSL device, pull users and attendance, sync to MongoDB."""
    if not ESSL_IP:
        return {"success": False, "error": "ESSL_IP not configured in .env"}

    try:
        from zk import ZK
    except ImportError:
        return {"success": False, "error": "pyzk not installed — run: pip install pyzk"}

    zk = ZK(ESSL_IP, port=ESSL_PORT, timeout=10)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()

        raw_users = conn.get_users()
        users = []
        users_map = {}
        for u in raw_users:
            users.append({
                "uid": u.uid,
                "name": u.name,
                "user_id": u.user_id,
                "privilege": u.privilege,
            })
            users_map[str(u.user_id)] = u.name

        raw_attendance = conn.get_attendance()
        conn.enable_device()

        with _file_lock:
            _save_json(USERS_FILE, users)

        new_records = _sync_attendance_to_mongo(raw_attendance, users_map)

        summary = {
            "success": True,
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "total_users": len(users),
            "total_records": len(raw_attendance),
            "new_records": new_records,
            "device_ip": ESSL_IP,
        }
        with _file_lock:
            _save_json(LAST_SYNC_FILE, summary)
        logger.info("eSSL sync complete: %d users, %d new records", len(users), new_records)
        return summary

    except Exception as e:
        logger.error("eSSL sync failed: %s", e)
        return {"success": False, "error": str(e)}
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


def get_users() -> list[dict]:
    return _load_json(USERS_FILE)


def get_last_sync() -> dict | None:
    data = _load_json(LAST_SYNC_FILE)
    return data if data else None
