from typing import Literal

from pydantic import BaseModel


class ConnectionHealth(BaseModel):
    status: Literal["connected"]
    hostname: str
    workspace: str


class FileEntry(BaseModel):
    name: str
    path: str
    type: Literal["file", "directory"]
    size: int | None = None


class DirectoryListing(BaseModel):
    device: str
    workspace: str
    path: str
    entries: list[FileEntry]


class FileContent(BaseModel):
    name: str
    path: str
    language: Literal["python", "yaml", "json", "markdown", "text", "log"]
    size: int
    content: str


class CameraHealth(BaseModel):
    id: str = "CAM-01"
    ip: str
    status: Literal["online", "offline"]
    latency_ms: float | None


class JetsonHealth(BaseModel):
    id: str = "tegra-ubuntu"
    status: Literal["healthy", "warning"]
    gpu_percent: int
    temperature_c: float
    memory_used_mb: int
    memory_total_mb: int
    storage_percent: int
    uptime_seconds: int


class SystemHealth(BaseModel):
    camera: CameraHealth
    jetson: JetsonHealth
    updated_at: str
