import base64
import json
import re
import stat
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import AsyncIterator

import asyncssh

from .config import Settings
from .models import CameraHealth, DirectoryListing, FileContent, FileEntry, JetsonHealth, SystemHealth

BLOCKED_SUFFIXES = {".key", ".pem", ".pkl", ".pt", ".pth", ".onnx"}
BLOCKED_NAME_PARTS = {"firebase-adminsdk", "service-account", "credential", "secret", "private_key"}
ALLOWED_TEXT_TYPES = {
    ".py": "python",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".md": "markdown",
    ".txt": "text",
    ".log": "log",
}
MAX_FILE_SIZE = 1_000_000

HEALTH_SCRIPT = r'''
import json, re, shutil, subprocess, sys
camera_ip = json.loads(sys.stdin.buffer.read())["camera_ip"]
ping = subprocess.run(["ping", "-c", "1", "-W", "2", camera_ip], capture_output=True, text=True)
latency_match = re.search(r"time[=<]([0-9.]+)\s*ms", ping.stdout)
try:
    tegra = subprocess.run(["timeout", "2", "tegrastats", "--interval", "500"], capture_output=True, text=True, timeout=3).stdout.splitlines()[0]
except Exception:
    tegra = ""
ram = re.search(r"RAM\s+(\d+)/(\d+)MB", tegra)
gpu = re.search(r"GR3D_FREQ\s+(\d+)%", tegra)
temp = re.search(r"(?:tj|gpu)@([0-9.]+)C", tegra)
disk = shutil.disk_usage("/")
with open("/proc/uptime", encoding="ascii") as handle:
    uptime = int(float(handle.read().split()[0]))
print(json.dumps({
    "camera_online": ping.returncode == 0,
    "camera_latency_ms": float(latency_match.group(1)) if latency_match else None,
    "gpu_percent": int(gpu.group(1)) if gpu else 0,
    "temperature_c": float(temp.group(1)) if temp else 0.0,
    "memory_used_mb": int(ram.group(1)) if ram else 0,
    "memory_total_mb": int(ram.group(2)) if ram else 0,
    "storage_percent": round(disk.used / disk.total * 100),
    "uptime_seconds": uptime,
}))
'''

FRAME_SCRIPT = r'''
import ast, json, os, sys
import requests
from requests.auth import HTTPDigestAuth
config = json.loads(sys.stdin.buffer.read())
with open(config["config_path"], encoding="utf-8") as source_file:
    tree = ast.parse(source_file.read())
values = {}
for node in tree.body:
    if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
        name = node.targets[0].id
        if name in {"CAMERA_IP", "USERNAME", "CAMERA_PASSWORD"}:
            try:
                value = ast.literal_eval(node.value)
                if isinstance(value, str): values[name] = value
            except (ValueError, TypeError):
                pass
if values.get("CAMERA_IP") != config["expected_ip"]:
    raise SystemExit(5)
url = f"http://{values['CAMERA_IP']}/ISAPI/Streaming/channels/101/picture"
response = requests.get(
    url,
    auth=HTTPDigestAuth(values["USERNAME"], values["CAMERA_PASSWORD"]),
    timeout=(3, 8),
    stream=True,
)
if response.status_code != 200:
    raise SystemExit(2)
length = int(response.headers.get("content-length", "0"))
if length <= 0 or length > 5_000_000:
    raise SystemExit(3)
content = response.raw.read(length)
response.close()
if len(content) != length or not content.startswith(b"\xff\xd8"):
    raise SystemExit(4)
temporary = "/tmp/brin-edge-camera-frame.jpg.tmp"
with open(temporary, "wb") as frame_file:
    frame_file.write(content)
os.replace(temporary, "/tmp/brin-edge-camera-frame.jpg")
print(length)
'''


def normalize_relative_path(value: str) -> PurePosixPath:
    if "\x00" in value or value.startswith("/"):
        raise ValueError("Path tidak valid")

    path = PurePosixPath(value or ".")
    if ".." in path.parts:
        raise ValueError("Path tidak boleh keluar dari workspace")
    return path


def is_blocked(name: str) -> bool:
    lower = name.lower()
    return (
        lower.startswith(".")
        or PurePosixPath(lower).suffix in BLOCKED_SUFFIXES
        or any(part in lower for part in BLOCKED_NAME_PARTS)
    )


def sanitize_text_content(content: str) -> str:
    secret_assignment = re.compile(
        r"(?im)^(\s*[\"']?(?:[A-Z0-9_]*(?:PASSWORD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*|USERNAME|USER)[\"']?\s*[:=]\s*).+$"
    )
    content = secret_assignment.sub(r'\1"<redacted>"', content)
    return re.sub(
        r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s\"']+@",
        r"\1<credentials-redacted>@",
        content,
    )


def encoded_python_command(source: str) -> str:
    payload = base64.b64encode(source.encode()).decode("ascii")
    return f'python3 -c "import base64;exec(base64.b64decode(\'{payload}\'))"'


@asynccontextmanager
async def connect(settings: Settings) -> AsyncIterator[asyncssh.SSHClientConnection]:
    connection = await asyncssh.connect(
        settings.jetson_host,
        port=settings.jetson_port,
        username=settings.jetson_user,
        client_keys=[str(settings.jetson_private_key)],
        known_hosts=str(settings.jetson_known_hosts),
        login_timeout=8,
    )
    try:
        yield connection
    finally:
        connection.close()
        await connection.wait_closed()


async def check_connection(settings: Settings) -> tuple[str, str]:
    async with connect(settings) as connection:
        result = await connection.run("hostname", check=True, timeout=5)
        async with connection.start_sftp_client() as sftp:
            attrs = await sftp.stat(settings.jetson_workspace)
            if not stat.S_ISDIR(attrs.permissions or 0):
                raise RuntimeError("Workspace Jetson bukan direktori")
        return result.stdout.strip(), settings.jetson_workspace


async def list_directory(settings: Settings, requested_path: str) -> DirectoryListing:
    relative = normalize_relative_path(requested_path)
    remote_path = str(PurePosixPath(settings.jetson_workspace) / relative)

    async with connect(settings) as connection:
        async with connection.start_sftp_client() as sftp:
            names = await sftp.readdir(remote_path)

    entries: list[FileEntry] = []
    for item in names:
        name = item.filename
        permissions = item.attrs.permissions or 0
        if name in {".", ".."} or is_blocked(name) or stat.S_ISLNK(permissions):
            continue
        if not (stat.S_ISDIR(permissions) or stat.S_ISREG(permissions)):
            continue

        item_path = str(relative / name)
        entries.append(
            FileEntry(
                name=name,
                path=item_path.removeprefix("./"),
                type="directory" if stat.S_ISDIR(permissions) else "file",
                size=item.attrs.size if stat.S_ISREG(permissions) else None,
            )
        )

    entries.sort(key=lambda entry: (entry.type != "directory", entry.name.casefold()))
    return DirectoryListing(
        device=settings.jetson_host,
        workspace=settings.jetson_workspace,
        path="" if str(relative) == "." else str(relative),
        entries=entries,
    )


async def read_text_file(settings: Settings, requested_path: str) -> FileContent:
    relative = normalize_relative_path(requested_path)
    if str(relative) == "." or any(is_blocked(part) for part in relative.parts):
        raise PermissionError("Berkas tidak diizinkan")

    suffix = relative.suffix.lower()
    language = ALLOWED_TEXT_TYPES.get(suffix)
    if language is None:
        raise PermissionError("Jenis berkas tidak dapat ditampilkan")

    remote_path = str(PurePosixPath(settings.jetson_workspace) / relative)
    async with connect(settings) as connection:
        async with connection.start_sftp_client() as sftp:
            real_root = str(await sftp.realpath(settings.jetson_workspace)).rstrip("/")
            real_file = str(await sftp.realpath(remote_path))
            if not real_file.startswith(f"{real_root}/"):
                raise PermissionError("Berkas berada di luar workspace")

            attrs = await sftp.lstat(remote_path)
            permissions = attrs.permissions or 0
            if stat.S_ISLNK(permissions) or not stat.S_ISREG(permissions):
                raise PermissionError("Path bukan berkas reguler")
            if attrs.size is None or attrs.size > MAX_FILE_SIZE:
                raise PermissionError("Ukuran berkas melebihi batas 1 MB")

            async with sftp.open(remote_path, "rb") as remote_file:
                data = await remote_file.read(MAX_FILE_SIZE + 1)

    if len(data) > MAX_FILE_SIZE:
        raise PermissionError("Ukuran berkas melebihi batas 1 MB")
    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise PermissionError("Berkas bukan teks UTF-8") from error

    return FileContent(
        name=relative.name,
        path=str(relative),
        language=language,  # type: ignore[arg-type]
        size=len(data),
        content=sanitize_text_content(content),
    )


async def get_system_health(settings: Settings) -> SystemHealth:
    payload = json.dumps({"camera_ip": settings.camera_ip}).encode()
    async with connect(settings) as connection:
        result = await connection.run(
            encoded_python_command(HEALTH_SCRIPT),
            input=payload,
            encoding=None,
            check=True,
            timeout=10,
        )

    values = json.loads(result.stdout.decode("utf-8"))
    camera_online = bool(values["camera_online"])
    temperature = float(values["temperature_c"])
    return SystemHealth(
        camera=CameraHealth(
            ip=settings.camera_ip,
            status="online" if camera_online else "offline",
            latency_ms=values["camera_latency_ms"],
        ),
        jetson=JetsonHealth(
            status="healthy" if temperature < 75 else "warning",
            gpu_percent=int(values["gpu_percent"]),
            temperature_c=temperature,
            memory_used_mb=int(values["memory_used_mb"]),
            memory_total_mb=int(values["memory_total_mb"]),
            storage_percent=int(values["storage_percent"]),
            uptime_seconds=int(values["uptime_seconds"]),
        ),
        updated_at=datetime.now(UTC).isoformat(),
    )


async def refresh_camera_frame(settings: Settings) -> bytes:
    config_path = str(PurePosixPath(settings.jetson_workspace) / settings.camera_config_file)
    frame_config = json.dumps(
        {"config_path": config_path, "expected_ip": settings.camera_ip}
    ).encode()
    async with connect(settings) as connection:
        result = await connection.run(
            encoded_python_command(FRAME_SCRIPT),
            input=frame_config,
            encoding=None,
            check=False,
            timeout=25,
        )

        if result.exit_status != 0:
            raise RuntimeError("Frame kamera tidak tersedia")
        async with connection.start_sftp_client() as sftp:
            async with sftp.open("/tmp/brin-edge-camera-frame.jpg", "rb") as frame_file:
                frame = await frame_file.read(5_000_001)

    if len(frame) > 5_000_000 or not frame.startswith(b"\xff\xd8"):
        raise RuntimeError("Frame kamera tidak valid")
    return frame


async def get_cached_camera_frame(settings: Settings) -> tuple[bytes, float]:
    async with connect(settings) as connection:
        async with connection.start_sftp_client() as sftp:
            attrs = await sftp.stat("/tmp/brin-edge-camera-frame.jpg")
            async with sftp.open("/tmp/brin-edge-camera-frame.jpg", "rb") as frame_file:
                frame = await frame_file.read(5_000_001)

    if len(frame) > 5_000_000 or not frame.startswith(b"\xff\xd8"):
        raise RuntimeError("Frame kamera tidak valid")
    return frame, float(attrs.mtime or 0)
