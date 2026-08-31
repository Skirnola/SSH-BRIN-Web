import asyncio
import time
from collections import defaultdict, deque
from pathlib import Path

import asyncssh
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .auth import AuthenticatedUser, LoginRequest, REFRESH_COOKIE, SESSION_COOKIE, authenticate_with_firebase, require_authenticated_user, set_session_cookies
from .config import Settings, get_settings
from .detection import list_detection_scripts, stream_detection_mjpeg, validate_detection_script
from .jetson import check_connection, get_cached_camera_frame, get_system_health, list_directory, read_text_file, refresh_camera_frame, stream_camera_mjpeg
from .models import ConnectionHealth, DirectoryListing, FileContent, SystemHealth

settings = get_settings()
app = FastAPI(
    title="BRIN Edge Workspace API",
    version="1.0.0",
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)
_camera_refresh_task: asyncio.Task[bytes] | None = None
_camera_frame_cache: bytes | None = None
_camera_frame_captured_at = 0.0
_camera_frame_lock = asyncio.Lock()
_camera_cache_path = Path(__file__).resolve().parent.parent / ".cache" / "camera-frame.jpg"
_detection_lock = asyncio.Lock()
_active_detection: str | None = None
_system_health_lock = asyncio.Lock()
_system_health_cache: tuple[float, SystemHealth] | None = None
_directory_cache_lock = asyncio.Lock()
_directory_cache: dict[str, tuple[float, DirectoryListing]] = {}
_live_viewers_lock = asyncio.Lock()
_live_viewers = 0
_login_failures: dict[str, deque[float]] = defaultdict(deque)
_login_failures_lock = asyncio.Lock()
_LOGIN_WINDOW_SECONDS = 300
_LOGIN_FAILURE_LIMIT = 5


def _store_local_camera_frame(frame: bytes) -> None:
    _camera_cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = _camera_cache_path.with_suffix(".tmp")
    temporary.write_bytes(frame)
    temporary.replace(_camera_cache_path)


def _finish_camera_refresh(task: asyncio.Task[bytes]) -> None:
    global _camera_refresh_task, _camera_frame_cache, _camera_frame_captured_at
    try:
        _camera_frame_cache = task.result()
        _camera_frame_captured_at = time.time()
        _store_local_camera_frame(_camera_frame_cache)
    except (asyncio.CancelledError, Exception):
        pass
    _camera_refresh_task = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    if settings.auth_cookie_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


async def _check_login_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    async with _login_failures_lock:
        failures = _login_failures[client_ip]
        while failures and now - failures[0] > _LOGIN_WINDOW_SECONDS:
            failures.popleft()
        if len(failures) >= _LOGIN_FAILURE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Terlalu banyak percobaan masuk. Coba kembali dalam lima menit",
                headers={"Retry-After": str(_LOGIN_WINDOW_SECONDS)},
            )


async def _record_login_result(client_ip: str, succeeded: bool) -> None:
    async with _login_failures_lock:
        if succeeded:
            _login_failures.pop(client_ip, None)
        else:
            _login_failures[client_ip].append(time.monotonic())


@app.get("/api/v1/health")
async def api_health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/login", response_model=AuthenticatedUser)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    config: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    client_ip = request.client.host if request.client else "unknown"
    await _check_login_rate_limit(client_ip)
    try:
        session = await authenticate_with_firebase(credentials, config)
    except HTTPException as error:
        if error.status_code == status.HTTP_401_UNAUTHORIZED:
            await _record_login_result(client_ip, succeeded=False)
        raise
    await _record_login_result(client_ip, succeeded=True)
    set_session_cookies(response, session, config)
    return AuthenticatedUser(username=config.auth_username)


@app.get("/api/v1/auth/session", response_model=AuthenticatedUser)
async def auth_session(user: AuthenticatedUser = Depends(require_authenticated_user)) -> AuthenticatedUser:
    return user


@app.delete("/api/v1/auth/session", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, config: Settings = Depends(get_settings)) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/", samesite="strict", secure=config.auth_cookie_secure)
    response.delete_cookie(key=REFRESH_COOKIE, path="/", samesite="strict", secure=config.auth_cookie_secure)


@app.get("/api/v1/health/jetson", response_model=ConnectionHealth, dependencies=[Depends(require_authenticated_user)])
async def jetson_health(config: Settings = Depends(get_settings)) -> ConnectionHealth:
    try:
        hostname, workspace = await check_connection(config)
        return ConnectionHealth(status="connected", hostname=hostname, workspace=workspace)
    except (asyncssh.Error, OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Jetson tidak dapat dijangkau",
        ) from error


@app.get("/api/v1/workspaces/default/files", response_model=DirectoryListing, dependencies=[Depends(require_authenticated_user)])
async def workspace_files(
    path: str = Query(default="", max_length=500),
    config: Settings = Depends(get_settings),
) -> DirectoryListing:
    try:
        async with _directory_cache_lock:
            cached = _directory_cache.get(path)
            if cached and time.monotonic() - cached[0] < 30:
                return cached[1]
            listing = await list_directory(config, path)
            _directory_cache[path] = (time.monotonic(), listing)
            return listing
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except (asyncssh.Error, OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Workspace Jetson tidak dapat dibaca",
        ) from error


@app.get("/api/v1/workspaces/default/file", response_model=FileContent, dependencies=[Depends(require_authenticated_user)])
async def workspace_file(
    path: str = Query(min_length=1, max_length=500),
    config: Settings = Depends(get_settings),
) -> FileContent:
    try:
        return await read_text_file(config, path)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    except asyncssh.SFTPNoSuchFile as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Berkas tidak ditemukan") from error
    except (asyncssh.Error, OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Berkas Jetson tidak dapat dibaca",
        ) from error


@app.get("/api/v1/system/health", response_model=SystemHealth, dependencies=[Depends(require_authenticated_user)])
async def system_health(config: Settings = Depends(get_settings)) -> SystemHealth:
    global _system_health_cache
    try:
        async with _system_health_lock:
            if _system_health_cache and time.monotonic() - _system_health_cache[0] < 30:
                return _system_health_cache[1]
            health = await get_system_health(config)
            _system_health_cache = (time.monotonic(), health)
            return health
    except (asyncssh.Error, OSError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kondisi perangkat tidak dapat dibaca",
        ) from error


@app.get("/api/v1/cameras/main/frame", dependencies=[Depends(require_authenticated_user)])
async def camera_frame(config: Settings = Depends(get_settings)) -> Response:
    global _camera_refresh_task, _camera_frame_cache, _camera_frame_captured_at
    try:
        async with _camera_frame_lock:
            if _camera_frame_cache is None:
                if _camera_cache_path.exists():
                    _camera_frame_cache = _camera_cache_path.read_bytes()
                    _camera_frame_captured_at = _camera_cache_path.stat().st_mtime
                else:
                    try:
                        _camera_frame_cache, _camera_frame_captured_at = await get_cached_camera_frame(config)
                    except asyncssh.SFTPNoSuchFile:
                        _camera_frame_cache = await refresh_camera_frame(config)
                        _camera_frame_captured_at = time.time()
                    _store_local_camera_frame(_camera_frame_cache)
            frame = _camera_frame_cache
            captured_at = _camera_frame_captured_at

        if time.time() - captured_at > 30 and _camera_refresh_task is None:
            _camera_refresh_task = asyncio.create_task(refresh_camera_frame(config))
            _camera_refresh_task.add_done_callback(_finish_camera_refresh)

        return Response(
            content=frame,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "no-store, max-age=0",
                "X-Captured-At": str(int(captured_at)),
            },
        )
    except (asyncssh.Error, OSError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frame kamera tidak tersedia",
        ) from error


@app.get("/api/v1/cameras/main/live", dependencies=[Depends(require_authenticated_user)])
async def camera_live(config: Settings = Depends(get_settings)) -> StreamingResponse:
    global _live_viewers
    async with _live_viewers_lock:
        if _live_viewers >= config.camera_max_live_viewers:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Batas penonton Real-Time Cam telah tercapai",
                headers={"Retry-After": "15"},
            )
        _live_viewers += 1

    async def limited_stream():
        global _live_viewers
        try:
            async for chunk in stream_camera_mjpeg(config):
                yield chunk
        finally:
            async with _live_viewers_lock:
                _live_viewers = max(0, _live_viewers - 1)

    return StreamingResponse(
        limited_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/v1/detection/scripts", response_model=list[str], dependencies=[Depends(require_authenticated_user)])
async def detection_scripts() -> list[str]:
    return list_detection_scripts()


@app.get("/api/v1/detection/live", dependencies=[Depends(require_authenticated_user)])
async def detection_live(
    script: str = Query(min_length=1, max_length=120),
    config: Settings = Depends(get_settings),
) -> StreamingResponse:
    global _active_detection
    try:
        script = validate_detection_script(script)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    async with _detection_lock:
        if _active_detection is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Deteksi {_active_detection} sedang berjalan",
            )
        _active_detection = script

    async def generate_detection():
        global _active_detection
        try:
            async for chunk in stream_detection_mjpeg(config, script):
                yield chunk
        finally:
            async with _detection_lock:
                if _active_detection == script:
                    _active_detection = None

    return StreamingResponse(
        generate_detection(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Detection-Script": script,
        },
    )
