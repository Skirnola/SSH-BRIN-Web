from functools import lru_cache
from pathlib import Path

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
    frontend_origin: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
