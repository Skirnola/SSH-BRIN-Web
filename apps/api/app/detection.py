import asyncio
import json
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import AsyncIterator

import asyncssh

from .config import Settings
from .jetson import connect, encoded_python_command


@dataclass(frozen=True)
class DetectionTarget:
    camera_id: str
    label: str
    script: str
    args: tuple[str, ...] = ()


# Script names and argv are trusted server constants, never client-supplied commands.
DETECTION_TARGETS = (
    DetectionTarget("camera-1", "Kamera 1", "Test19Agus_optimized_fps_big_ui.py"),
    DetectionTarget("camera-2", "Kamera 2", "test.py", ("2",)),
)
DETECTION_SCRIPTS = tuple(target.script for target in DETECTION_TARGETS)


def get_detection_target(camera_id: str) -> DetectionTarget:
    for target in DETECTION_TARGETS:
        if target.camera_id == camera_id:
            return target
    raise ValueError("Deteksi hanya tersedia untuk Kamera 1 dan Kamera 2")


DETECTION_WRAPPER = r'''
import json, os, runpy, sys, time
os.environ["QT_QPA_PLATFORM"] = "offscreen"
import cv2

config = json.loads(sys.stdin.buffer.read())
workspace = config["workspace"]
script_name = config["script"]
script_path = os.path.join(workspace, script_name)
if os.path.dirname(os.path.realpath(script_path)) != os.path.realpath(workspace):
    raise SystemExit(10)

stream_output = sys.stdout.buffer
sys.stdout = sys.stderr
last_sent = 0.0


def emit_frame(_window_name, frame):
    global last_sent
    if frame is None or not hasattr(frame, "shape"):
        return
    now = time.monotonic()
    if now - last_sent < 0.25:
        return
    last_sent = now
    height, width = frame.shape[:2]
    if width > 1920:
        scale = 1920 / width
        frame = cv2.resize(frame, (1920, int(height * scale)), interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        return
    image = encoded.tobytes()
    packet = (
        b"--frame\r\n"
        b"Content-Type: image/jpeg\r\n"
        + f"Content-Length: {len(image)}\r\n\r\n".encode("ascii")
        + image
        + b"\r\n"
    )
    try:
        stream_output.write(packet)
        stream_output.flush()
    except BrokenPipeError:
        raise SystemExit(0)


cv2.imshow = emit_frame
cv2.waitKey = lambda _delay=0: -1
cv2.namedWindow = lambda *_args, **_kwargs: None
cv2.resizeWindow = lambda *_args, **_kwargs: None
cv2.moveWindow = lambda *_args, **_kwargs: None
cv2.setWindowProperty = lambda *_args, **_kwargs: None
cv2.destroyAllWindows = lambda: None

os.chdir(workspace)
sys.argv = [script_path, *config["args"]]
runpy.run_path(script_path, run_name="__main__")
'''


def list_detection_scripts() -> list[str]:
    return list(DETECTION_SCRIPTS)


def validate_detection_script(script: str) -> str:
    if script not in DETECTION_SCRIPTS:
        raise ValueError("Script deteksi tidak diizinkan")
    return script


async def stream_detection_mjpeg(settings: Settings, camera_id: str) -> AsyncIterator[bytes]:
    target = get_detection_target(camera_id)
    remote_path = str(PurePosixPath(settings.jetson_workspace) / target.script)
    payload = json.dumps(
        {"workspace": settings.jetson_workspace, "script": target.script, "args": target.args}
    ).encode()

    async with connect(settings) as connection:
        async with connection.start_sftp_client() as sftp:
            attrs = await sftp.stat(remote_path)
            if attrs.size is None or attrs.size > 1_000_000:
                raise RuntimeError("Script deteksi tidak valid")

        process = await connection.create_process(
            encoded_python_command(DETECTION_WRAPPER, settings.detection_python),
            encoding=None,
        )
        process.stdin.write(payload)
        process.stdin.write_eof()

        async def drain_stderr() -> None:
            while await process.stderr.read(16_384):
                pass

        stderr_task = asyncio.create_task(drain_stderr())
        try:
            while True:
                chunk = await process.stdout.read(65_536)
                if not chunk:
                    break
                yield chunk
        finally:
            process.terminate()
            try:
                await process.wait(timeout=5)
            except (TimeoutError, asyncssh.Error):
                process.kill()
            stderr_task.cancel()
            try:
                await stderr_task
            except asyncio.CancelledError:
                pass
