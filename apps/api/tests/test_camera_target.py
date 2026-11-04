import io
import json
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from app.cameras import get_camera_target, list_camera_targets
from app.jetson import FRAME_SCRIPT, LIVE_STREAM_SCRIPT


def test_camera_snapshot_uses_server_ip_even_when_jetson_config_is_stale(tmp_path, monkeypatch):
    config_file = tmp_path / "Mobil_Pos.py"
    config_file.write_text(
        "CAMERA_IP = '10.21.20.52'\nUSERNAME = 'test-user'\nCAMERA_PASSWORD = 'test-password'\n"
    )
    frame_file = tmp_path / "frame.jpg"
    payload = json.dumps(
        {"config_path": str(config_file), "expected_ip": "10.21.1.92", "frame_path": str(frame_file), "channel": 101}
    ).encode()
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(payload)))
    response = SimpleNamespace(status_code=200, headers={"content-length": "4"}, raw=io.BytesIO(b"\xff\xd8xx"), close=Mock())
    request = Mock(return_value=response)
    monkeypatch.setattr("requests.get", request)

    exec(FRAME_SCRIPT, {"__name__": "__main__"})

    assert request.call_args.args[0] == "http://10.21.1.92/ISAPI/Streaming/channels/101/picture"
    assert frame_file.read_bytes() == b"\xff\xd8xx"


def test_camera_live_stream_uses_server_ip():
    assert "camera_ip = str(ipaddress.IPv4Address(config[\"expected_ip\"]))" in LIVE_STREAM_SCRIPT
    assert "@{camera_ip}:554/Streaming/Channels/{channel}" in LIVE_STREAM_SCRIPT
    assert "values['CAMERA_IP']" not in LIVE_STREAM_SCRIPT


def test_additional_camera_snapshot_uses_backend_credentials(tmp_path, monkeypatch):
    frame_file = tmp_path / "frame.jpg"
    payload = json.dumps(
        {
            "username": "camera-user",
            "password": "camera-password",
            "expected_ip": "10.21.1.93",
            "frame_path": str(frame_file),
            "channel": 101,
        }
    ).encode()
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(payload)))
    response = SimpleNamespace(status_code=200, headers={"content-length": "4"}, raw=io.BytesIO(b"\xff\xd8xx"), close=Mock())
    request = Mock(return_value=response)
    monkeypatch.setattr("requests.get", request)

    exec(FRAME_SCRIPT, {"__name__": "__main__"})

    assert request.call_args.args[0] == "http://10.21.1.93/ISAPI/Streaming/channels/101/picture"
    assert request.call_args.kwargs["auth"].username == "camera-user"
    assert request.call_args.kwargs["auth"].password == "camera-password"


def test_camera_targets_are_allowlisted_and_detection_stays_on_camera_one():
    settings = SimpleNamespace(
        camera_ip="10.21.1.92",
        camera_config_file="Mobil_Pos.py",
        camera_frame_cache="/cache/1.jpg",
        camera_2_ip="10.21.1.93",
        camera_2_username=SecretStr("user-2"),
        camera_2_password=SecretStr("password-2"),
        camera_2_frame_cache="/cache/2.jpg",
        camera_3_ip="10.21.1.94",
        camera_3_username=SecretStr("user-3"),
        camera_3_password=SecretStr("password-3"),
        camera_3_frame_cache="/cache/3.jpg",
    )

    targets = list_camera_targets(settings)
    assert [target.id for target in targets] == ["camera-1", "camera-2", "camera-3"]
    assert [target.detection_enabled for target in targets] == [True, False, False]
    assert get_camera_target(settings, "main").id == "camera-1"
    assert get_camera_target(settings, "camera-2").password.get_secret_value() == "password-2"
    with pytest.raises(ValueError):
        get_camera_target(settings, "camera-4")
