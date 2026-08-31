import asyncio
import hashlib
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, Response, status
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field, SecretStr

from .config import Settings, get_settings

SESSION_COOKIE = "brin_session"
REFRESH_COOKIE = "brin_refresh"
_token_claims_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_token_claims_lock = asyncio.Lock()
_TOKEN_CACHE_SECONDS = 60


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: SecretStr = Field(min_length=6, max_length=128)


class AuthenticatedUser(BaseModel):
    username: str


@dataclass(frozen=True)
class FirebaseSession:
    token: str
    refresh_token: str
    expires_in: int


def _verify_firebase_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        claims = id_token.verify_firebase_token(
            token,
            GoogleAuthRequest(),
            audience=settings.firebase_project_id,
        )
    except (ValueError, OSError, GoogleAuthError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi tidak valid atau telah berakhir",
        ) from error

    if claims.get("email", "").casefold() != settings.firebase_admin_email.casefold():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun tidak diizinkan")
    return claims


async def verify_firebase_token(token: str, settings: Settings) -> dict[str, Any]:
    token_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    async with _token_claims_lock:
        cached = _token_claims_cache.get(token_digest)
        if cached and time.monotonic() - cached[0] < _TOKEN_CACHE_SECONDS:
            return cached[1]
        claims = await asyncio.to_thread(_verify_firebase_token, token, settings)
        if len(_token_claims_cache) >= 1_000:
            _token_claims_cache.clear()
        _token_claims_cache[token_digest] = (time.monotonic(), claims)
        return claims


async def authenticate_with_firebase(credentials: LoginRequest, settings: Settings) -> FirebaseSession:
    if credentials.username.casefold() != settings.auth_username.casefold():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nama pengguna atau kata sandi salah")

    endpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                endpoint,
                params={"key": settings.firebase_web_api_key.get_secret_value()},
                json={
                    "email": settings.firebase_admin_email,
                    "password": credentials.password.get_secret_value(),
                    "returnSecureToken": True,
                },
            )
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Layanan autentikasi tidak dapat dijangkau",
        ) from error

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nama pengguna atau kata sandi salah")

    payload = response.json()
    token = payload.get("idToken")
    refresh_token = payload.get("refreshToken")
    if not isinstance(token, str) or not isinstance(refresh_token, str):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Respons autentikasi tidak valid")

    await verify_firebase_token(token, settings)
    return FirebaseSession(
        token=token,
        refresh_token=refresh_token,
        expires_in=min(int(payload.get("expiresIn", 3600)), 3600),
    )


async def refresh_firebase_session(refresh_token: str, settings: Settings) -> FirebaseSession:
    endpoint = "https://securetoken.googleapis.com/v1/token"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(
                endpoint,
                params={"key": settings.firebase_web_api_key.get_secret_value()},
                data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Sesi tidak dapat diperbarui") from error

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesi telah berakhir. Silakan masuk kembali")
    payload = response.json()
    token = payload.get("id_token")
    rotated_refresh_token = payload.get("refresh_token")
    if not isinstance(token, str) or not isinstance(rotated_refresh_token, str):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Respons autentikasi tidak valid")
    await verify_firebase_token(token, settings)
    return FirebaseSession(
        token=token,
        refresh_token=rotated_refresh_token,
        expires_in=min(int(payload.get("expires_in", 3600)), 3600),
    )


def set_session_cookies(response: Response, session: FirebaseSession, settings: Settings) -> None:
    cookie_options = {
        "httponly": True,
        "secure": settings.auth_cookie_secure,
        "samesite": "strict",
        "path": "/",
    }
    response.set_cookie(key=SESSION_COOKIE, value=session.token, max_age=session.expires_in, **cookie_options)
    response.set_cookie(key=REFRESH_COOKIE, value=session.refresh_token, max_age=31_536_000, **cookie_options)


async def require_authenticated_user(
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    token = request.cookies.get(SESSION_COOKIE)
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not token and not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Silakan masuk terlebih dahulu")

    claims: dict[str, Any] | None = None
    if token:
        try:
            claims = await verify_firebase_token(token, settings)
        except HTTPException:
            claims = None

    if claims is None or int(claims.get("exp", 0)) <= int(time.time()) + 1200:
        if not refresh_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesi telah berakhir. Silakan masuk kembali")
        session = await refresh_firebase_session(refresh_token, settings)
        set_session_cookies(response, session, settings)

    return AuthenticatedUser(username=settings.auth_username)
