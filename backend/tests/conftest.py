from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine, init_database
from app.main import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    db_path = tmp_path / "test.db"
    init_database(f"sqlite:///{db_path}")
    from app.database import engine as current_engine

    Base.metadata.drop_all(bind=current_engine)
    Base.metadata.create_all(bind=current_engine)
    app = create_app()
    return TestClient(app)


@pytest.fixture()
def user_token(client: TestClient) -> str:
    payload = {"email": "a@a.com", "password": "secret123"}
    client.post("/auth/register", json=payload)
    res = client.post("/auth/login", json=payload)
    return res.json()["access_token"]
