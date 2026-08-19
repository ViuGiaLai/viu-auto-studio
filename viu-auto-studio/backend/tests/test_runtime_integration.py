from __future__ import annotations

import os
import tempfile
from pathlib import Path

TEST_ROOT = Path(tempfile.mkdtemp(prefix="viu-integration-"))
os.environ["VIU_DATA_DIR"] = str(TEST_ROOT / "data")
os.environ["VIU_PROJECTS_DIR"] = str(TEST_ROOT / "projects")
os.environ["VIU_LOG_DIR"] = str(TEST_ROOT / "logs")

from fastapi.testclient import TestClient  # noqa: E402
from backend.main import app  # noqa: E402


def test_routes_are_unique() -> None:
    seen: set[tuple[str, str]] = set()
    duplicates: list[tuple[str, str]] = []
    for route in app.routes:
        for method in getattr(route, "methods", set()):
            key = (method, route.path)
            if key in seen:
                duplicates.append(key)
            seen.add(key)
    assert not duplicates


def test_runtime_api_sqlite_and_flow_pairing() -> None:
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        providers = client.get("/api/tts/providers").json()
        assert any(p["id"] == "edge" and p["available"] for p in providers)
        assert not any(p["id"] == "mock" for p in providers)

        project = client.post("/api/projects", json={
            "name": "Integration project",
            "topic": "Real pipeline",
            "video_type": "long",
            "aspect_ratio": "16:9",
            "language": "vi",
            "target_duration": 30,
        })
        assert project.status_code == 201
        project_id = project.json()["id"]
        assert client.get(f"/api/projects/{project_id}").status_code == 200

        unauthorized = client.post("/api/flow-connection/heartbeat", json={"extension_id": "unknown"})
        assert unauthorized.status_code == 403
        code = client.post("/api/flow-connection/new-pairing-code").json()["pairing_code"]
        paired = client.post("/api/flow-connection/pair", json={
            "pairing_code": code,
            "extension_id": "integration-extension",
            "extension_version": "1.0.0",
        })
        assert paired.status_code == 200
        heartbeat = client.post("/api/flow-connection/heartbeat", json={"extension_id": "integration-extension"})
        assert heartbeat.status_code == 200


def test_global_settings_are_persisted() -> None:
    with TestClient(app) as client:
        payload = {"settings": {"flow_mode": "video", "flow_ratio": "9:16", "flow_concurrency": 2}}
        saved = client.patch("/api/global-settings", json=payload)
        assert saved.status_code == 200
        loaded = client.get("/api/global-settings").json()["settings"]
        assert loaded["flow_mode"] == "video"
        assert loaded["flow_ratio"] == "9:16"
