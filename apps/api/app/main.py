import asyncio
import time

import asyncssh
from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .jetson import check_connection, get_cached_camera_frame, get_system_health, list_directory, read_text_file, refresh_camera_frame
from .models import ConnectionHealth, DirectoryListing, FileContent, SystemHealth

app = FastAPI(title="BRIN Edge Workspace API", version="0.1.0")
settings = get_settings()
_camera_refresh_task: asyncio.Task[bytes] | None = None
_camera_frame_cache: bytes | None = None
_camera_frame_captured_at = 0.0
_camera_frame_lock = asyncio.Lock()


def _finish_camera_refresh(task: asyncio.Task[bytes]) -> None:
    global _camera_refresh_task, _camera_frame_cache, _camera_frame_captured_at
    try:
        _camera_frame_cache = task.result()
        _camera_frame_captured_at = time.time()
    except (asyncio.CancelledError, Exception):
        pass
    _camera_refresh_task = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/v1/health/jetson", response_model=ConnectionHealth)
async def jetson_health(config: Settings = Depends(get_settings)) -> ConnectionHealth:
    try:
        hostname, workspace = await check_connection(config)
        return ConnectionHealth(status="connected", hostname=hostname, workspace=workspace)
    except (asyncssh.Error, OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Jetson tidak dapat dijangkau",
        ) from error


@app.get("/api/v1/workspaces/default/files", response_model=DirectoryListing)
async def workspace_files(
    path: str = Query(default="", max_length=500),
    config: Settings = Depends(get_settings),
) -> DirectoryListing:
    try:
        return await list_directory(config, path)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    except (asyncssh.Error, OSError, RuntimeError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Workspace Jetson tidak dapat dibaca",
        ) from error


@app.get("/api/v1/workspaces/default/file", response_model=FileContent)
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


@app.get("/api/v1/system/health", response_model=SystemHealth)
async def system_health(config: Settings = Depends(get_settings)) -> SystemHealth:
    try:
        return await get_system_health(config)
    except (asyncssh.Error, OSError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kondisi perangkat tidak dapat dibaca",
        ) from error


@app.get("/api/v1/cameras/main/frame")
async def camera_frame(config: Settings = Depends(get_settings)) -> Response:
    global _camera_refresh_task, _camera_frame_cache, _camera_frame_captured_at
    try:
        async with _camera_frame_lock:
            if _camera_frame_cache is None:
                try:
                    _camera_frame_cache, _camera_frame_captured_at = await get_cached_camera_frame(config)
                except asyncssh.SFTPNoSuchFile:
                    _camera_frame_cache = await refresh_camera_frame(config)
                    _camera_frame_captured_at = time.time()
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
