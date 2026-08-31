from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    jetson_host: str
    jetson_port: int = 22
    jetson_user: str = "jetson"
    jetson_private_key: Path
    jetson_known_hosts: Path
    jetson_workspace: str = "/home/jetson/BRIN RI NDIP"
    camera_ip: str = "10.21.20.52"
    camera_config_file: str = "Mobil_Pos.py"
    camera_frame_cache: str = "/home/jetson/.cache/brin-edge/camera-frame.jpg"
    camera_live_channel: int = 101
    camera_max_live_viewers: int = 4
    detection_python: str = "/home/jetson/yolo-env/bin/python"
    frontend_origin: str = "http://localhost:3000"
    firebase_web_api_key: SecretStr
    firebase_project_id: str
    firebase_admin_email: str
    auth_username: str = "admin"
    auth_cookie_secure: bool = False
    api_docs_enabled: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
