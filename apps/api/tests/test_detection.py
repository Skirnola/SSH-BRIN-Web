import asyncio
import importlib
import io
import json
import sys
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import require_authenticated_user
from app.detection import (
    DETECTION_WRAPPER,
    get_detection_target,
    list_detection_scripts,
    validate_detection_script,
    stream_detection_mjpeg,
)


main = importlib.import_module("app.main")


def test_only_reviewed_detection_scripts_are_allowlisted() -> None:
    assert list_detection_scripts() == ["Test19Agus_optimized_fps_big_ui.py", "test.py"]
    assert get_detection_target("camera-1").args == ()
    target = get_detection_target("camera-2")
    assert target.script == "test.py"
    assert target.args == ("2",)  # Without this argument test.py defaults to Camera 1.


def test_rejects_arbitrary_script_execution() -> None:
    for script in ("../../dangerous.py", "Tset118aug.py", "Mobil_Pos_cam2.py", "mobil_positioning_2point_line_2.py"):
        with pytest.raises(ValueError):
            validate_detection_script(script)
    for camera in ("camera-3", "main", "../../test.py", "camera-2;whoami"):
        with pytest.raises(ValueError):
            get_detection_target(camera)


@pytest.mark.parametrize("camera_id", ["camera-1", "camera-2"])
def test_wrapper_supplies_only_trusted_argv(tmp_path, monkeypatch, camera_id) -> None:
    target = get_detection_target(camera_id)
    script_path = str(tmp_path / target.script)
    payload = {"workspace": str(tmp_path), "script": target.script, "args": target.args}
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(json.dumps(payload).encode())))
    monkeypatch.setattr(sys, "stdout", io.TextIOWrapper(io.BytesIO()))
    monkeypatch.setattr(sys, "argv", ["backend", "--untrusted-parent-argument"])
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace())
    monkeypatch.chdir(tmp_path)
    received = []
    run_path = Mock(side_effect=lambda *args, **kwargs: received.append(list(sys.argv)))
    monkeypatch.setattr("runpy.run_path", run_path)

    exec(DETECTION_WRAPPER, {"__name__": "__main__"})

    assert received == [[script_path, *target.args]]
    run_path.assert_called_once_with(script_path, run_name="__main__")


@pytest.mark.parametrize("camera_id", ["camera-1", "camera-2"])
def test_stream_sends_fixed_script_and_arguments_over_stdin(monkeypatch, camera_id) -> None:
    detection = importlib.import_module("app.detection")
    writes = []
    checked_paths = []

    class Reader:
        async def read(self, _size):
            return b""

    class Process:
        stdin = SimpleNamespace(write=writes.append, write_eof=lambda: None)
        stdout = Reader()
        stderr = Reader()
        terminate = Mock()
        kill = Mock()

        async def wait(self, timeout):
            return None

    class SFTP:
        async def stat(self, path):
            checked_paths.append(path)
            return SimpleNamespace(size=1024)

    @asynccontextmanager
    async def sftp_context():
        yield SFTP()

    class Connection:
        start_sftp_client = staticmethod(sftp_context)

        async def create_process(self, command, encoding):
            assert encoding is None
            # The selected script/argv travel in JSON, not shell interpolation.
            assert "test.py" not in command
            return Process()

    @asynccontextmanager
    async def fake_connect(_settings):
        yield Connection()

    monkeypatch.setattr(detection, "connect", fake_connect)

    async def exercise():
        assert [chunk async for chunk in stream_detection_mjpeg(main.settings, camera_id)] == []

    asyncio.run(exercise())
    target = get_detection_target(camera_id)
    payload = json.loads(writes[0])
    assert payload == {"workspace": main.settings.jetson_workspace, "script": target.script, "args": list(target.args)}
    assert checked_paths == [main.settings.jetson_workspace + "/" + target.script]


def test_detection_routes_require_authentication() -> None:
    with TestClient(main.app) as client:
        for camera_id in ("camera-1", "camera-2"):
            assert client.get(f"/api/v1/detection/live?camera_id={camera_id}").status_code == 401


def test_routes_resolve_camera_ids_and_preserve_legacy_camera_one(monkeypatch) -> None:
    requested = []

    async def fake_stream(_settings, camera_id):
        requested.append(camera_id)
        yield b"frame"

    monkeypatch.setattr(main, "stream_detection_mjpeg", fake_stream)
    monkeypatch.setattr(main, "_active_detection", None)
    main.app.dependency_overrides[require_authenticated_user] = lambda: SimpleNamespace(username="test-user")
    try:
        with TestClient(main.app) as client:
            for query, expected in (
                ("camera_id=camera-1", "camera-1"),
                ("camera_id=camera-2", "camera-2"),
                ("script=Test19Agus_optimized_fps_big_ui.py", "camera-1"),
            ):
                response = client.get(f"/api/v1/detection/live?{query}")
                assert response.status_code == 200
                assert response.headers["X-Camera-Id"] == expected
                assert response.content == b"frame"
                assert requested[-1] == expected
                assert main._active_detection is None
            for query in (
                "camera_id=camera-3",
                "camera_id=camera-2&script=Test19Agus_optimized_fps_big_ui.py",
                "script=test.py",
                "script=Mobil_Pos_cam2.py",
                "script=../../dangerous.py",
            ):
                assert client.get(f"/api/v1/detection/live?{query}").status_code == 400
            assert len(requested) == 3
    finally:
        main.app.dependency_overrides.pop(require_authenticated_user, None)


def test_detection_lock_is_shared_across_cameras_and_released_on_close(monkeypatch) -> None:
    async def fake_stream(_settings, _camera_id):
        yield b"frame"
        yield b"another-frame"

    monkeypatch.setattr(main, "stream_detection_mjpeg", fake_stream)
    monkeypatch.setattr(main, "_active_detection", None)

    async def exercise():
        response = await main.detection_live(camera_id="camera-2", script=None, config=main.settings)
        assert await anext(response.body_iterator) == b"frame"
        with pytest.raises(HTTPException) as error:
            await main.detection_live(camera_id="camera-1", script=None, config=main.settings)
        assert error.value.status_code == 409
        assert error.value.detail == "Deteksi Kamera 2 sedang berjalan"
        await response.body_iterator.aclose()
        assert main._active_detection is None
        retry = await main.detection_live(camera_id="camera-1", script=None, config=main.settings)
        assert [chunk async for chunk in retry.body_iterator] == [b"frame", b"another-frame"]
        assert main._active_detection is None

    asyncio.run(exercise())
