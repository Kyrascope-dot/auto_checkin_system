"""ChromaDB vector store for face embeddings.

Face embeddings stay in ChromaDB (purpose-built for vector search).
Employee metadata is also synced to MongoDB for unified access.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import chromadb
import numpy as np

from config import CHROMA_DIR, MATCH_THRESHOLD
from db import get_db

_client: chromadb.PersistentClient | None = None
COLLECTION_NAME = "face_embeddings"


def _get_collection() -> chromadb.Collection:
    """Return the face embeddings collection (lazy-created)."""
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def enroll_employee(
    name: str,
    employee_id: str,
    department: str,
    designation: str,
    embeddings: list[np.ndarray],
) -> dict:
    """Store one or more face embeddings for an employee.

    Returns the employee metadata dict.
    """
    collection = _get_collection()
    internal_id = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc).isoformat()

    ids = []
    emb_list = []
    metadatas = []
    for i, emb in enumerate(embeddings):
        doc_id = f"{internal_id}_{i}"
        ids.append(doc_id)
        emb_list.append(emb.tolist())
        metadatas.append(
            {
                "internal_id": internal_id,
                "name": name,
                "employee_id": employee_id,
                "department": department,
                "designation": designation,
                "enrolled_at": now,
                "photo_index": i,
                "photo_count": len(embeddings),
            }
        )

    collection.add(ids=ids, embeddings=emb_list, metadatas=metadatas)

    emp_data = {
        "id": internal_id,
        "name": name,
        "employee_id": employee_id,
        "department": department,
        "designation": designation,
        "photo_count": len(embeddings),
        "enrolled_at": now,
    }

    get_db().employees.update_one(
        {"employee_id": employee_id},
        {"$set": {
            "employee_id": employee_id,
            "internal_id": internal_id,
            "name": name,
            "department": department,
            "designation": designation,
            "photo_count": len(embeddings),
            "enrolled_at": now,
        }},
        upsert=True,
    )

    return emp_data


def search_face(embedding: np.ndarray, n_results: int = 1) -> list[dict]:
    """Find the closest matching employee for a face embedding.

    Returns list of { employee metadata + similarity score }.
    ChromaDB cosine distance = 1 - cosine_similarity, so
    similarity = 1 - distance.
    """
    collection = _get_collection()
    if collection.count() == 0:
        return []

    results = collection.query(
        query_embeddings=[embedding.tolist()],
        n_results=min(n_results, collection.count()),
        include=["metadatas", "distances"],
    )

    matches = []
    seen_ids = set()
    for meta, dist in zip(results["metadatas"][0], results["distances"][0]):
        similarity = 1.0 - dist  # cosine similarity
        iid = meta["internal_id"]
        if iid in seen_ids:
            continue
        seen_ids.add(iid)
        if similarity >= MATCH_THRESHOLD:
            matches.append(
                {
                    "id": iid,
                    "name": meta["name"],
                    "employee_id": meta["employee_id"],
                    "department": meta["department"],
                    "designation": meta["designation"],
                    "photo_count": meta["photo_count"],
                    "enrolled_at": meta["enrolled_at"],
                    "similarity": round(similarity, 4),
                }
            )
    return matches


def list_employees() -> list[dict]:
    """Return all enrolled employees (deduplicated by internal_id)."""
    collection = _get_collection()
    if collection.count() == 0:
        return []

    all_data = collection.get(include=["metadatas"])
    seen = {}
    for meta in all_data["metadatas"]:
        iid = meta["internal_id"]
        if iid not in seen:
            seen[iid] = {
                "id": iid,
                "name": meta["name"],
                "employee_id": meta["employee_id"],
                "department": meta["department"],
                "designation": meta["designation"],
                "photo_count": meta["photo_count"],
                "enrolled_at": meta["enrolled_at"],
            }
    return list(seen.values())


def get_employee(internal_id: str) -> dict | None:
    """Get a single employee by internal_id."""
    collection = _get_collection()
    all_data = collection.get(include=["metadatas"])
    for meta in all_data["metadatas"]:
        if meta["internal_id"] == internal_id:
            return {
                "id": internal_id,
                "name": meta["name"],
                "employee_id": meta["employee_id"],
                "department": meta["department"],
                "designation": meta["designation"],
                "photo_count": meta["photo_count"],
                "enrolled_at": meta["enrolled_at"],
            }
    return None


def delete_employee(internal_id: str) -> bool:
    """Delete all embeddings for an employee. Returns True if found."""
    collection = _get_collection()
    all_data = collection.get(include=["metadatas"])
    ids_to_delete = [
        doc_id
        for doc_id, meta in zip(all_data["ids"], all_data["metadatas"])
        if meta["internal_id"] == internal_id
    ]
    if not ids_to_delete:
        return False
    collection.delete(ids=ids_to_delete)
    get_db().employees.delete_one({"internal_id": internal_id})
    return True
