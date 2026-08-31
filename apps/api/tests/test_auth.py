from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)
rate_limit_client = TestClient(app, client=("rate-limit-test", 50_000))


def test_protected_endpoint_requires_session() -> None:
    response = client.get("/api/v1/detection/scripts")
    assert response.status_code == 401
    assert response.json()["detail"] == "Silakan masuk terlebih dahulu"


def test_unknown_username_is_rejected_without_firebase_request() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "unknown", "password": "not-the-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Nama pengguna atau kata sandi salah"


def test_repeated_failed_logins_are_rate_limited() -> None:
    for _ in range(5):
        response = rate_limit_client.post(
            "/api/v1/auth/login",
            json={"username": "unknown", "password": "not-the-password"},
        )
        assert response.status_code == 401

    blocked = rate_limit_client.post(
        "/api/v1/auth/login",
        json={"username": "unknown", "password": "not-the-password"},
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "300"


def test_api_responses_include_security_headers() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"


def test_logout_clears_session_cookie() -> None:
    response = client.delete("/api/v1/auth/session")
    assert response.status_code == 204
    assert "brin_session=" in response.headers["set-cookie"]
    assert "brin_refresh=" in response.headers["set-cookie"]
