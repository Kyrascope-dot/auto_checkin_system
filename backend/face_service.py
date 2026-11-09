"""Face detection and embedding extraction using InsightFace."""

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from config import MODEL_NAME, DET_SIZE

# Singleton — heavy model, load once
_app: FaceAnalysis | None = None


def get_face_app() -> FaceAnalysis:
    """Return the shared FaceAnalysis instance (lazy-loaded)."""
    global _app
    if _app is None:
        _app = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
        _app.prepare(ctx_id=0, det_size=DET_SIZE)
        print(f"[face_service] InsightFace model '{MODEL_NAME}' loaded")
    return _app


def extract_faces(image_bytes: bytes) -> list[dict]:
    """Detect faces in an image and return their bounding boxes + embeddings.

    Returns a list of dicts:
        {
            "bbox": [x1, y1, x2, y2],
            "confidence": float,
            "embedding": np.ndarray (512-d)
        }
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    app = get_face_app()
    faces = app.get(img)

    results = []
    for face in faces:
        results.append(
            {
                "bbox": face.bbox.tolist(),
                "confidence": float(face.det_score),
                "embedding": face.embedding,
            }
        )
    return results


