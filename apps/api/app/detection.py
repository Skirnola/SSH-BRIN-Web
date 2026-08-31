import asyncio
import json
from pathlib import PurePosixPath
from typing import AsyncIterator

import asyncssh

from .config import Settings
from .jetson import connect, encoded_python_command

DETECTION_SCRIPTS = (
    "Test19Agus_line_fuzzy_anomaly.py",
    "Test19Agus_line_fuzzy_anomaly_fixed_alignment.py",
    "Test19Agus_optimized_fps_big_ui.py",
    "Test_anomaly_fuzzy_19Agustus.py",
    "Tset118aug.py",
    "Tset118aug_anomaly.py",
    "Tset118aug_anomaly_fuzzy.py",
    "Tset118aug_anomaly_fuzzy_colored_v2.py",
    "Tset118aug_fixed.py",
    "Tset118aug_fixed_polygon.py",
    "Tset118aug_optimized.py",
    "Tset118aug_optimized_big_ui.py",
)

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
runpy.run_path(script_path, run_name="__main__")
'''


def list_detection_scripts() -> list[str]:
    return list(DETECTION_SCRIPTS)


def validate_detection_script(script: str) -> str:
    if script not in DETECTION_SCRIPTS:
        raise ValueError("Script deteksi tidak diizinkan")
    return script


async def stream_detection_mjpeg(settings: Settings, script: str) -> AsyncIterator[bytes]:
    script = validate_detection_script(script)
    remote_path = str(PurePosixPath(settings.jetson_workspace) / script)
    payload = json.dumps(
        {"workspace": settings.jetson_workspace, "script": script}
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
