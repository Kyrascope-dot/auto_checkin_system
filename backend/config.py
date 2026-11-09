"""Application configuration."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATA_DIR = BASE_DIR / "data"
CHROMA_DIR = DATA_DIR / "chroma_db"
ENROLLED_FACES_DIR = DATA_DIR / "enrolled_faces"

# InsightFace settings
MODEL_NAME = "buffalo_l"
DET_SIZE = (640, 640)

# Matching threshold — cosine similarity (0-1). Above this = match.
MATCH_THRESHOLD = 0.45

# Max photos per enrollment
MAX_ENROLLMENT_PHOTOS = 5

# IP Camera settings
CAMERA_IP = os.getenv("CAMERA_IP", "")
CAMERA_USER = os.getenv("CAMERA_USER", "admin")
CAMERA_PASS = os.getenv("CAMERA_PASS", "")
CAMERA_RTSP_PATH = os.getenv("CAMERA_RTSP_PATH", "/Streaming/Channels/101")
CAMERA_SNAPSHOT_PATH = os.getenv("CAMERA_SNAPSHOT_PATH", "/ISAPI/Streaming/channels/101/picture")

# MongoDB
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "auto_checkin")

# eSSL Biometric Device
ESSL_IP = os.getenv("ESSL_IP", "")
ESSL_PORT = int(os.getenv("ESSL_PORT", "4370"))
ESSL_DATA_DIR = DATA_DIR / "essl"

# Ensure directories exist
ESSL_DATA_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)
ENROLLED_FACES_DIR.mkdir(parents=True, exist_ok=True)
