from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any
import logging

from .config import settings

logger = logging.getLogger(__name__)
_firebase_lock = Lock()
_firebase_initialized = False
_firebase_unavailable_reason = ""


INVALID_TOKEN_ERROR_CODES = {
    "invalid-argument",
    "registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/unregistered",
}


def _initialize_firebase() -> bool:
    global _firebase_initialized, _firebase_unavailable_reason
    if not settings.fcm_enabled:
        _firebase_unavailable_reason = "FCM is disabled"
        return False
    if _firebase_initialized:
        return True

    with _firebase_lock:
        if _firebase_initialized:
            return True
        try:
            import firebase_admin
            from firebase_admin import credentials
        except ImportError:
            _firebase_unavailable_reason = "firebase-admin is not installed"
            logger.warning("FCM disabled: firebase-admin is not installed")
            return False

        service_account_file = settings.firebase_service_account_file.strip()
        if not service_account_file:
            _firebase_unavailable_reason = "FIREBASE_SERVICE_ACCOUNT_FILE is not configured"
            logger.warning("FCM disabled: FIREBASE_SERVICE_ACCOUNT_FILE is not configured")
            return False
        if not Path(service_account_file).is_file():
            _firebase_unavailable_reason = "Firebase service-account file was not found"
            logger.warning("FCM disabled: Firebase service-account file was not found")
            return False

        try:
            if not firebase_admin._apps:
                options = {"projectId": settings.firebase_project_id.strip()} if settings.firebase_project_id.strip() else None
                firebase_admin.initialize_app(credentials.Certificate(service_account_file), options=options)
            _firebase_initialized = True
            _firebase_unavailable_reason = ""
            return True
        except Exception:
            _firebase_unavailable_reason = "Firebase Admin initialization failed"
            logger.exception("FCM disabled: Firebase Admin initialization failed")
            return False


def _firebase_error_code(error: Exception | None) -> str:
    if not error:
        return ""
    code = getattr(error, "code", "") or getattr(error, "detail", "")
    return str(code).lower()


def send_task_assignment_notification(tokens: list[dict[str, Any]], task: dict[str, Any]) -> dict[str, Any]:
    if not tokens:
        return {"sent": 0, "failed": 0, "invalid_token_hashes": [], "enabled": settings.fcm_enabled}
    if not _initialize_firebase():
        return {
            "sent": 0,
            "failed": len(tokens),
            "invalid_token_hashes": [],
            "enabled": False,
            "error": _firebase_unavailable_reason,
        }

    try:
        from firebase_admin import messaging
    except ImportError:
        return {"sent": 0, "failed": len(tokens), "invalid_token_hashes": [], "enabled": False}

    title = "New Task Assigned"
    body = f"You have been assigned a new task: {task.get('title') or 'Task'}"
    data = {
        "type": "task_assignment",
        "taskId": str(task.get("id") or ""),
    }
    android_config = messaging.AndroidConfig(
        priority="high",
        notification=messaging.AndroidNotification(
            channel_id=settings.fcm_default_android_channel_id,
            title=title,
            body=body,
            click_action="FCM_PLUGIN_ACTIVITY",
        ),
    )
    message = messaging.MulticastMessage(
        tokens=[row["token"] for row in tokens if row.get("token")],
        notification=messaging.Notification(title=title, body=body),
        data=data,
        android=android_config,
    )
    if not message.tokens:
        return {"sent": 0, "failed": 0, "invalid_token_hashes": [], "enabled": True}

    try:
        response = messaging.send_each_for_multicast(message, dry_run=settings.fcm_dry_run)
    except Exception:
        logger.exception("FCM task assignment send failed")
        return {"sent": 0, "failed": len(message.tokens), "invalid_token_hashes": [], "enabled": True}

    invalid_token_hashes: list[str] = []
    for index, result in enumerate(response.responses):
        if result.success:
            continue
        code = _firebase_error_code(result.exception)
        if code in INVALID_TOKEN_ERROR_CODES and index < len(tokens):
            invalid_token_hash = tokens[index].get("token_hash")
            if invalid_token_hash:
                invalid_token_hashes.append(invalid_token_hash)

    logger.info(
        "FCM task assignment send completed: sent=%s failed=%s invalidated=%s dry_run=%s",
        response.success_count,
        response.failure_count,
        len(invalid_token_hashes),
        settings.fcm_dry_run,
    )
    return {
        "sent": response.success_count,
        "failed": response.failure_count,
        "invalid_token_hashes": invalid_token_hashes,
        "enabled": True,
    }
