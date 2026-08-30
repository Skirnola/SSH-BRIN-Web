import pytest

from app.jetson import is_blocked, normalize_relative_path, sanitize_text_content


def test_accepts_relative_workspace_path() -> None:
    assert str(normalize_relative_path("folder/script.py")) == "folder/script.py"


@pytest.mark.parametrize("path", ["../etc", "folder/../../etc", "/etc/passwd"])
def test_rejects_paths_outside_workspace(path: str) -> None:
    with pytest.raises(ValueError):
        normalize_relative_path(path)


def test_blocks_sensitive_and_binary_files() -> None:
    assert is_blocked("digitaltwin-firebase-adminsdk-token.json")
    assert is_blocked("model.pt")
    assert is_blocked("positions.pkl")
    assert is_blocked(".env")
    assert not is_blocked("Deteksi.py")


def test_redacts_credentials_embedded_in_source_code() -> None:
    content = 'USERNAME = "admin"\nCAMERA_PASSWORD = "password"\nurl = "rtsp://admin:password@camera/stream"'
    sanitized = sanitize_text_content(content)
    assert "admin" not in sanitized
    assert "password" not in sanitized
    assert "<redacted>" in sanitized
