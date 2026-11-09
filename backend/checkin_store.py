"""Unified check-in/check-out storage in MongoDB.

All three sources (face recognition, IP camera, eSSL biometric) write to
the same collection so a check-in from any source is visible everywhere.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

from db import get_db

DEBOUNCE_HOURS = 4
MIN_WORK_MINUTES = 1


def _checkins():
    return get_db().checkins


def _employees():
    return get_db().employees


def try_checkin(
    employee_id: str,
    name: str,
    department: str = "",
    designation: str = "",
    similarity: float = 0.0,
    source: str = "face",
    internal_id: str | None = None,
) -> dict | None:
    """Record a check-in if no open session exists for today (any source).

    Returns the check-in record if new, or None if already checked in.
    """
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    open_session = _checkins().find_one({
        "employee_id": employee_id,
        "date": today,
        "checked_out_at": None,
    })

    if open_session:
        return None

    record = {
        "employee_id": employee_id,
        "name": name,
        "department": department,
        "designation": designation,
        "similarity": similarity,
        "source": source,
        "checked_in_at": now.isoformat(),
        "checked_out_at": None,
        "working_hours": None,
        "date": today,
    }
    if internal_id:
        record["internal_id"] = internal_id

    _checkins().insert_one(record)
    record.pop("_id", None)
    return record


def try_checkout(
    employee_id: str,
    similarity: float = 0.0,
    source: str = "face",
) -> dict | None:
    """Check out an employee if they have an open session today.

    Returns the updated record, or None if no open session or too early.
    """
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    doc = _checkins().find_one({
        "employee_id": employee_id,
        "date": today,
        "checked_out_at": None,
    })

    if not doc:
        return None

    checkin_time = datetime.fromisoformat(doc["checked_in_at"])
    elapsed = (now - checkin_time).total_seconds() / 60
    if elapsed < MIN_WORK_MINUTES:
        return None

    checked_out_at = now.isoformat()
    hours = round((now - checkin_time).total_seconds() / 3600, 2)

    _checkins().update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "checked_out_at": checked_out_at,
            "working_hours": hours,
            "checkout_source": source,
        }},
    )

    doc["checked_out_at"] = checked_out_at
    doc["working_hours"] = hours
    doc["checkout_source"] = source
    doc.pop("_id", None)
    return doc


def has_checked_out_today(employee_id: str) -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return _checkins().find_one({
        "employee_id": employee_id,
        "date": today,
        "checked_out_at": {"$ne": None},
    }) is not None


def is_checked_in_today(employee_id: str) -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return _checkins().find_one({
        "employee_id": employee_id,
        "date": today,
        "checked_out_at": None,
    }) is not None


def get_todays_checkins() -> list[dict]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = list(_checkins().find({"date": today}).sort("checked_in_at", -1))
    for r in rows:
        r.pop("_id", None)
    return rows


def get_checkins_by_date(date_str: str) -> list[dict]:
    rows = list(_checkins().find({"date": date_str}).sort("checked_in_at", -1))
    for r in rows:
        r.pop("_id", None)
    return rows


def get_attendance_summary(date_str: str | None = None) -> list[dict]:
    """Attendance summary grouped by employee for a date (default: today)."""
    if not date_str:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    rows = list(_checkins().find({"date": date_str}).sort("checked_in_at", 1))

    employees: dict[str, dict] = {}
    for r in rows:
        r.pop("_id", None)
        eid = r["employee_id"]
        if eid not in employees:
            employees[eid] = {
                "internal_id": r.get("internal_id", eid),
                "employee_id": eid,
                "name": r["name"],
                "department": r.get("department", ""),
                "designation": r.get("designation", ""),
                "sessions": [],
                "total_hours": 0.0,
                "status": "absent",
                "source": r.get("source", "unknown"),
            }
        employees[eid]["sessions"].append({
            "checked_in_at": r["checked_in_at"],
            "checked_out_at": r.get("checked_out_at"),
            "working_hours": r.get("working_hours"),
            "source": r.get("source", "unknown"),
        })
        wh = r.get("working_hours")
        if wh:
            employees[eid]["total_hours"] = round(employees[eid]["total_hours"] + wh, 2)
        if r.get("checked_out_at"):
            employees[eid]["status"] = "checked_out"
        elif employees[eid]["status"] != "checked_out":
            employees[eid]["status"] = "checked_in"

    return list(employees.values())


def get_weekly_summary() -> list[dict]:
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    rows = list(_checkins().find({"date": {"$gte": week_ago}}).sort("checked_in_at", 1))

    by_date: dict[str, list[dict]] = {}
    for r in rows:
        r.pop("_id", None)
        by_date.setdefault(r["date"], []).append(r)

    summary = []
    for i in range(7):
        d = (now - timedelta(days=6 - i)).strftime("%Y-%m-%d")
        records = by_date.get(d, [])
        unique_employees = {r["employee_id"] for r in records}
        checked_out = {r["employee_id"] for r in records if r.get("checked_out_at")}
        total_hours = sum(r.get("working_hours") or 0 for r in records)
        summary.append({
            "date": d,
            "present": len(unique_employees),
            "completed": len(checked_out),
            "total_hours": round(total_hours, 2),
        })
    return summary
