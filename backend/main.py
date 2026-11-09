"""FastAPI server — employee face enrollment & detection."""

import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

import checkin_store
import face_service
import vector_store
from config import (
    CAMERA_IP,
    CAMERA_PASS,
    CAMERA_USER,
    ENROLLED_FACES_DIR,
    MAX_ENROLLMENT_PHOTOS,
)
from schemas import (
    AttendanceSummary,
    AttendanceSummaryResponse,
    CheckinRecord,
    DayStat,
    DetectedFace,
    DetectResponse,
    EmployeeListResponse,
    EmployeeOut,
    EnrollResponse,
    LiveDetectResponse,
    LiveFaceResult,
    TodayCheckinsResponse,
    WeeklySummaryResponse,
)


@asynccontextmanager
async def lifespan(app):
    # Connect MongoDB
    from db import get_db, close_db
    get_db()
    # Face model loads lazily on first request to avoid startup OOM
    # Start eSSL real-time sync in background
    import essl_sync
    essl_sync.start_live_capture()
    yield
    essl_sync.stop_live_capture()
    close_db()


app = FastAPI(title="Auto Check-In — Face Recognition API", lifespan=lifespan)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve enrolled face thumbnails
app.mount(
    "/photos",
    StaticFiles(directory=str(ENROLLED_FACES_DIR)),
    name="photos",
)


# ── Enrollment ────────────────────────────────────────────────────────
@app.post("/api/employees/enroll", response_model=EnrollResponse)
async def enroll_employee(
    name: str = Form(...),
    employee_id: str = Form(...),
    department: str = Form(""),
    designation: str = Form(""),
    photos: list[UploadFile] = File(...),
):
    """Enroll a new employee with 1-5 face photos."""
    if len(photos) > MAX_ENROLLMENT_PHOTOS:
        raise HTTPException(400, f"Max {MAX_ENROLLMENT_PHOTOS} photos allowed")

    embeddings = []
    saved_paths: list[Path] = []

    for photo in photos:
        data = await photo.read()
        faces = face_service.extract_faces(data)

        if len(faces) == 0:
            raise HTTPException(
                400, f"No face detected in '{photo.filename}'. Use a clear photo."
            )
        if len(faces) > 1:
            raise HTTPException(
                400,
                f"Multiple faces in '{photo.filename}'. Use a photo with only the employee.",
            )

        embeddings.append(faces[0]["embedding"])

    # Store in vector DB
    emp = vector_store.enroll_employee(
        name=name,
        employee_id=employee_id,
        department=department,
        designation=designation,
        embeddings=embeddings,
    )

    # Save photos to disk
    emp_dir = ENROLLED_FACES_DIR / emp["id"]
    emp_dir.mkdir(exist_ok=True)
    for i, photo in enumerate(photos):
        await photo.seek(0)
        dest = emp_dir / f"{i}.jpg"
        with open(dest, "wb") as f:
            shutil.copyfileobj(photo.file, f)

    return EnrollResponse(
        success=True,
        employee=EmployeeOut(**emp),
        message=f"Enrolled {name} with {len(embeddings)} photo(s)",
    )


# ── Detection / Identification ────────────────────────────────────────
@app.post("/api/detect", response_model=DetectResponse)
async def detect_faces(image: UploadFile = File(...)):
    """Detect faces in an image and match against enrolled employees."""
    data = await image.read()
    faces = face_service.extract_faces(data)

    results: list[DetectedFace] = []
    for face in faces:
        matches = vector_store.search_face(face["embedding"], n_results=3)
        best = matches[0] if matches else None

        results.append(
            DetectedFace(
                bbox=face["bbox"],
                confidence=round(face["confidence"], 4),
                match=EmployeeOut(**best) if best else None,
                similarity=best["similarity"] if best else 0.0,
            )
        )

    return DetectResponse(faces_found=len(faces), results=results)


# ── Employee CRUD ─────────────────────────────────────────────────────
@app.get("/api/employees", response_model=EmployeeListResponse)
async def list_employees():
    employees = vector_store.list_employees()
    return EmployeeListResponse(
        total=len(employees),
        employees=[EmployeeOut(**e) for e in employees],
    )


@app.get("/api/employees/{internal_id}", response_model=EmployeeOut)
async def get_employee(internal_id: str):
    emp = vector_store.get_employee(internal_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    return EmployeeOut(**emp)


@app.delete("/api/employees/{internal_id}")
async def delete_employee(internal_id: str):
    deleted = vector_store.delete_employee(internal_id)
    if not deleted:
        raise HTTPException(404, "Employee not found")
    # Remove saved photos too
    emp_dir = ENROLLED_FACES_DIR / internal_id
    if emp_dir.exists():
        shutil.rmtree(emp_dir)
    return {"success": True, "message": "Employee deleted"}


# ── Live detect + auto check-in ───────────────────────────────────────
@app.post("/api/live-detect", response_model=LiveDetectResponse)
async def live_detect(image: UploadFile = File(...), mode: str = "checkin"):
    """Detect faces, match, and auto check-in or check-out based on mode."""
    data = await image.read()
    faces = face_service.extract_faces(data)

    results: list[LiveFaceResult] = []
    for face in faces:
        matches = vector_store.search_face(face["embedding"], n_results=3)
        best = matches[0] if matches else None

        just_checked_in = False
        already_checked_in = False
        just_checked_out = False
        already_checked_out = False

        if best:
            if mode == "checkout":
                co = checkin_store.try_checkout(
                    employee_id=best["employee_id"],
                    similarity=best["similarity"],
                    source="face",
                )
                if co:
                    just_checked_out = True
                elif checkin_store.has_checked_out_today(best["employee_id"]):
                    already_checked_out = True
                else:
                    already_checked_in = True
            else:
                record = checkin_store.try_checkin(
                    employee_id=best["employee_id"],
                    name=best["name"],
                    department=best["department"],
                    designation=best["designation"],
                    similarity=best["similarity"],
                    source="face",
                    internal_id=best["id"],
                )
                if record:
                    just_checked_in = True
                else:
                    already_checked_in = True

        results.append(
            LiveFaceResult(
                bbox=face["bbox"],
                confidence=round(face["confidence"], 4),
                match=EmployeeOut(**best) if best else None,
                similarity=best["similarity"] if best else 0.0,
                just_checked_in=just_checked_in,
                already_checked_in=already_checked_in,
                just_checked_out=just_checked_out,
                already_checked_out=already_checked_out,
            )
        )

    return LiveDetectResponse(faces_found=len(faces), results=results)


@app.get("/api/checkins/today", response_model=TodayCheckinsResponse)
async def todays_checkins():
    """Get all check-ins from today (all sources)."""
    records = checkin_store.get_todays_checkins()
    return TodayCheckinsResponse(
        total=len(records),
        checkins=[CheckinRecord(**{k: v for k, v in r.items() if k in CheckinRecord.model_fields}) for r in records],
    )


# ── IP Camera (background RTSP reader) ───────────────────────────────
import cv2
import threading
import logging

logger = logging.getLogger("camera")

_latest_jpeg: bytes | None = None
_frame_lock = threading.Lock()
_reader_thread: threading.Thread | None = None
_reader_stop = threading.Event()


def _build_rtsp_url() -> str:
    from config import CAMERA_RTSP_PATH
    from urllib.parse import quote
    encoded_pass = quote(CAMERA_PASS, safe="")
    return f"rtsp://{CAMERA_USER}:{encoded_pass}@{CAMERA_IP}:554{CAMERA_RTSP_PATH}"


def _rtsp_reader_loop():
    """Continuously read frames from the RTSP stream, keeping only the latest."""
    global _latest_jpeg
    url = _build_rtsp_url()
    while not _reader_stop.is_set():
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            logger.warning("RTSP connect failed, retrying in 3s…")
            _reader_stop.wait(3)
            continue
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        logger.info("RTSP connected to %s", CAMERA_IP)
        while not _reader_stop.is_set():
            ret, frame = cap.read()
            if not ret or frame is None:
                logger.warning("RTSP read failed, reconnecting…")
                break
            # Downscale to 720p for faster encode/transfer
            h, w = frame.shape[:2]
            if w > 1280:
                scale = 1280 / w
                frame = cv2.resize(frame, (1280, int(h * scale)))
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            with _frame_lock:
                _latest_jpeg = buf.tobytes()
        cap.release()
    logger.info("RTSP reader stopped")


def _ensure_reader():
    """Start the background reader thread if not already running."""
    global _reader_thread
    if _reader_thread is not None and _reader_thread.is_alive():
        return
    _reader_stop.clear()
    _reader_thread = threading.Thread(target=_rtsp_reader_loop, daemon=True)
    _reader_thread.start()


def _get_latest_frame() -> bytes:
    if not CAMERA_IP or not CAMERA_PASS:
        raise HTTPException(503, "IP camera not configured — set CAMERA_IP and CAMERA_PASS in .env")
    _ensure_reader()
    # Wait briefly for the first frame if just started
    for _ in range(20):
        with _frame_lock:
            if _latest_jpeg is not None:
                return _latest_jpeg
        _reader_stop.wait(0.25)
    raise HTTPException(502, "No frame from camera yet — is the RTSP stream reachable?")


@app.get("/api/camera/snapshot")
async def camera_snapshot():
    """Return a live JPEG frame from the IP camera."""
    data = _get_latest_frame()
    return Response(content=data, media_type="image/jpeg")


@app.get("/api/camera/stream")
async def camera_stream():
    """MJPEG stream — browser renders natively in an <img> tag."""
    import asyncio

    _ensure_reader()

    BOUNDARY = b"--frameboundary"

    async def generate():
        prev_id = id(None)
        while True:
            with _frame_lock:
                frame = _latest_jpeg
            if frame is not None and id(frame) != prev_id:
                prev_id = id(frame)
                yield (
                    BOUNDARY + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                    b"\r\n" + frame + b"\r\n"
                )
            await asyncio.sleep(0.066)  # ~15 fps cap

    from starlette.responses import StreamingResponse
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frameboundary",
    )


@app.get("/api/camera/status")
async def camera_status():
    """Check if the IP camera is reachable and configured."""
    if not CAMERA_IP or not CAMERA_PASS:
        return {"configured": False, "reachable": False, "ip": CAMERA_IP}
    try:
        data = _get_latest_frame()
        return {"configured": True, "reachable": True, "ip": CAMERA_IP, "frame_size": len(data)}
    except Exception as e:
        return {"configured": True, "reachable": False, "ip": CAMERA_IP, "error": str(e)}


@app.post("/api/camera/detect", response_model=DetectResponse)
async def camera_detect():
    """Grab a frame from the IP camera and run face recognition."""
    data = _get_latest_frame()
    faces = face_service.extract_faces(data)
    results: list[DetectedFace] = []
    for face in faces:
        best = None
        if face["embedding"] is not None:
            matches = vector_store.search_face(face["embedding"], n_results=3)
            best = matches[0] if matches else None
        results.append(
            DetectedFace(
                bbox=face["bbox"],
                confidence=round(face["confidence"], 4),
                match=EmployeeOut(**best) if best else None,
                similarity=best["similarity"] if best else 0.0,
            )
        )
    return DetectResponse(faces_found=len(results), results=results)


@app.post("/api/camera/live-detect", response_model=LiveDetectResponse)
async def camera_live_detect(mode: str = "checkin"):
    """Grab a frame from the IP camera — face detect, match, auto check-in or check-out."""
    data = _get_latest_frame()
    faces = face_service.extract_faces(data)
    results: list[LiveFaceResult] = []
    for face in faces:
        best = None
        just_checked_in = False
        already_checked_in = False
        just_checked_out = False
        already_checked_out = False

        if face["embedding"] is not None:
            matches = vector_store.search_face(face["embedding"], n_results=3)
            best = matches[0] if matches else None

        if best:
            if mode == "checkout":
                co = checkin_store.try_checkout(
                    employee_id=best["employee_id"],
                    similarity=best["similarity"],
                    source="camera",
                )
                if co:
                    just_checked_out = True
                elif checkin_store.has_checked_out_today(best["employee_id"]):
                    already_checked_out = True
                else:
                    already_checked_in = True
            else:
                record = checkin_store.try_checkin(
                    employee_id=best["employee_id"],
                    name=best["name"],
                    department=best["department"],
                    designation=best["designation"],
                    similarity=best["similarity"],
                    source="camera",
                    internal_id=best["id"],
                )
                if record:
                    just_checked_in = True
                else:
                    already_checked_in = True

        results.append(
            LiveFaceResult(
                bbox=face["bbox"],
                confidence=round(face["confidence"], 4),
                match=EmployeeOut(**best) if best else None,
                similarity=best["similarity"] if best else 0.0,
                just_checked_in=just_checked_in,
                already_checked_in=already_checked_in,
                just_checked_out=just_checked_out,
                already_checked_out=already_checked_out,
            )
        )
    return LiveDetectResponse(faces_found=len(results), results=results)


# ── Dashboard / Attendance ────────────────────────────────────────────

@app.get("/api/attendance/today", response_model=AttendanceSummaryResponse)
async def attendance_today():
    """Attendance summary for today."""
    from datetime import datetime, timezone
    records = checkin_store.get_attendance_summary()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    present = [e for e in records if e["status"] != "absent"]
    completed = [e for e in records if e["status"] == "checked_out"]
    return AttendanceSummaryResponse(
        date=today,
        total_present=len(present),
        total_checked_out=len(completed),
        employees=[AttendanceSummary(**e) for e in records],
    )


@app.get("/api/attendance/{date_str}", response_model=AttendanceSummaryResponse)
async def attendance_by_date(date_str: str):
    """Attendance summary for a specific date (YYYY-MM-DD)."""
    records = checkin_store.get_attendance_summary(date_str)
    present = [e for e in records if e["status"] != "absent"]
    completed = [e for e in records if e["status"] == "checked_out"]
    return AttendanceSummaryResponse(
        date=date_str,
        total_present=len(present),
        total_checked_out=len(completed),
        employees=[AttendanceSummary(**e) for e in records],
    )


@app.get("/api/attendance-weekly", response_model=WeeklySummaryResponse)
async def weekly_summary():
    """Weekly attendance overview for dashboard chart."""
    days = checkin_store.get_weekly_summary()
    return WeeklySummaryResponse(days=[DayStat(**d) for d in days])


# ── eSSL Biometric Device ────────────────────────────────────────────
import essl_sync


@app.post("/api/essl/sync")
async def essl_sync_now():
    """Pull latest data from the eSSL biometric device."""
    result = essl_sync.sync_device()
    return result


@app.get("/api/essl/status")
async def essl_status():
    """Get eSSL sync status and config."""
    from config import ESSL_IP, ESSL_PORT
    last = essl_sync.get_last_sync()
    return {
        "configured": bool(ESSL_IP),
        "ip": ESSL_IP,
        "port": ESSL_PORT,
        "last_sync": last,
        "live_capture": essl_sync._live_thread is not None and essl_sync._live_thread.is_alive(),
    }


@app.get("/api/essl/users")
async def essl_users():
    """Get all users from the eSSL device (last synced data)."""
    users = essl_sync.get_users()
    return {"total": len(users), "users": users}


# ── Health ────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "employees_enrolled": len(vector_store.list_employees())}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
