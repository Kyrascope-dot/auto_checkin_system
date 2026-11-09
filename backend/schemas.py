"""Pydantic models for request/response schemas."""

from pydantic import BaseModel


class EmployeeBase(BaseModel):
    name: str
    employee_id: str
    department: str = ""
    designation: str = ""


class EmployeeOut(EmployeeBase):
    id: str  # internal UUID used as ChromaDB document id prefix
    photo_count: int
    enrolled_at: str


class DetectedFace(BaseModel):
    bbox: list[float]
    confidence: float
    match: EmployeeOut | None = None
    similarity: float = 0.0


class DetectResponse(BaseModel):
    faces_found: int
    results: list[DetectedFace]


class EnrollResponse(BaseModel):
    success: bool
    employee: EmployeeOut | None = None
    message: str


class EmployeeListResponse(BaseModel):
    total: int
    employees: list[EmployeeOut]


# ── Live detect + auto check-in ──────────────────────────────────────

class CheckinRecord(BaseModel):
    employee_id: str
    name: str
    department: str = ""
    designation: str = ""
    similarity: float = 0.0
    source: str = "face"
    checked_in_at: str
    checked_out_at: str | None = None
    working_hours: float | None = None
    internal_id: str | None = None


class LiveFaceResult(BaseModel):
    bbox: list[float]
    confidence: float
    match: EmployeeOut | None = None
    similarity: float = 0.0
    just_checked_in: bool = False
    already_checked_in: bool = False
    just_checked_out: bool = False
    already_checked_out: bool = False


class LiveDetectResponse(BaseModel):
    faces_found: int
    results: list[LiveFaceResult]


class TodayCheckinsResponse(BaseModel):
    total: int
    checkins: list[CheckinRecord]


# ── Dashboard / Attendance ───────────────────────────────────────────

class SessionRecord(BaseModel):
    checked_in_at: str
    checked_out_at: str | None = None
    working_hours: float | None = None
    source: str = "face"


class AttendanceSummary(BaseModel):
    internal_id: str | None = None
    employee_id: str
    name: str
    department: str = ""
    designation: str = ""
    sessions: list[SessionRecord]
    total_hours: float = 0.0
    status: str = "absent"  # "absent" | "checked_in" | "checked_out"
    source: str = "face"


class AttendanceSummaryResponse(BaseModel):
    date: str
    total_present: int
    total_checked_out: int
    employees: list[AttendanceSummary]


class DayStat(BaseModel):
    date: str
    present: int
    completed: int
    total_hours: float


class WeeklySummaryResponse(BaseModel):
    days: list[DayStat]
