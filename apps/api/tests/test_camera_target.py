import io
import json
import sys
from types import SimpleNamespace
from unittest.mock import Mock

from app.jetson import FRAME_SCRIPT, LIVE_STREAM_SCRIPT


def test_camera_snapshot_uses_server_ip_even_when_jetson_config_is_stale(tmp_path, monkeypatch):
    config_file = tmp_path / "Mobil_Pos.py"
    config_file.write_text(
        "CAMERA_IP = '10.21.20.52'\nUSERNAME = 'test-user'\nCAMERA_PASSWORD = 'test-password'\n"
    )
    frame_file = tmp_path / "frame.jpg"
    payload = json.dumps(
        {"config_path": str(config_file), "expected_ip": "10.21.1.92", "frame_path": str(frame_file)}
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
