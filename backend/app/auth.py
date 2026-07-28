from __future__ import annotations

import hashlib
import hmac
import secrets


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt.encode("utf-8"),
        120000,
    ).hex()
    return password_salt, digest


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    _salt, digest = hash_password(password, salt)
    return hmac.compare_digest(digest, password_hash)


def create_token() -> str:
    return secrets.token_urlsafe(48)
