from dataclasses import dataclass
from typing import Literal

from pydantic import SecretStr

from .config import Settings

CameraId = Literal["camera-1", "camera-2", "camera-3"]


@dataclass(frozen=True)
class CameraTarget:
    id: CameraId
    number: int
    label: str
    ip: str
    frame_cache: str
    username: SecretStr | None = None
    password: SecretStr | None = None
    config_file: str | None = None
    detection_enabled: bool = False


def list_camera_targets(settings: Settings) -> tuple[CameraTarget, ...]:
    return (
        CameraTarget(
            id="camera-1",
            number=1,
            label="Kamera 1",
            ip=settings.camera_ip,
            frame_cache=settings.camera_frame_cache,
            config_file=settings.camera_config_file,
            detection_enabled=True,
        ),
        CameraTarget(
            id="camera-2",
            number=2,
            label="Kamera 2",
            ip=settings.camera_2_ip,
            frame_cache=settings.camera_2_frame_cache,
            username=settings.camera_2_username,
            password=settings.camera_2_password,
            detection_enabled=True,
        ),
        CameraTarget(
            id="camera-3",
            number=3,
            label="Kamera 3",
            ip=settings.camera_3_ip,
            frame_cache=settings.camera_3_frame_cache,
            username=settings.camera_3_username,
            password=settings.camera_3_password,
        ),
    )


def get_camera_target(settings: Settings, camera_id: str) -> CameraTarget:
    normalized = "camera-1" if camera_id == "main" else camera_id
    for target in list_camera_targets(settings):
        if target.id == normalized:
            return target
    raise ValueError("Kamera tidak dikenal")
