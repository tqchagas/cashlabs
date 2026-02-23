from fastapi.testclient import TestClient


def test_register_and_login(client: TestClient) -> None:
    reg = client.post("/auth/register", json={"email": "john@example.com", "password": "abc12345"})
    assert reg.status_code == 201

    login = client.post("/auth/login", json={"email": "john@example.com", "password": "abc12345"})
    assert login.status_code == 200
    data = login.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_token(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "jane@example.com", "password": "abc12345"})
    login = client.post("/auth/login", json={"email": "jane@example.com", "password": "abc12345"})
    refresh = login.json()["refresh_token"]

    resp = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
