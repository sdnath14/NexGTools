"""Meta WhatsApp Cloud API task notifications."""

import logging
import re

import requests

from .config import settings

logger = logging.getLogger(__name__)


def normalize_whatsapp_number(value: str) -> str:
    """Return an international number containing digits only (India by default)."""
    raw = value.strip()
    if not raw or re.search(r"[^\d\s()+.-]", raw):
        raise ValueError("Invalid WhatsApp number")
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10 and digits[0] in "6789":
        digits = "91" + digits
    elif len(digits) == 11 and digits.startswith("0") and digits[1] in "6789":
        digits = "91" + digits[1:]
    if not 11 <= len(digits) <= 15 or digits.startswith("0"):
        raise ValueError("WhatsApp number must include a country code")
    return digits


def send_whatsapp_task(phone_number: str, employee_name: str, task: str, due_date: str, *, template_name: str | None = None) -> dict:
    if not phone_number.strip():
        return {"success": False, "error": "Employee does not have a WhatsApp number"}
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return {"success": False, "error": "WhatsApp Cloud API is not configured"}
    try:
        number = normalize_whatsapp_number(phone_number)
    except ValueError as exc:
        return {"success": False, "error": str(exc)}

    version = settings.whatsapp_api_version.strip()
    phone_id = settings.whatsapp_phone_number_id.strip()
    if not re.fullmatch(r"v\d+\.\d+", version) or not phone_id.isdigit():
        return {"success": False, "error": "Invalid WhatsApp API configuration"}
    selected_template = template_name or settings.whatsapp_task_template_name
    payload = {
        "messaging_product": "whatsapp",
        "to": number,
        "type": "template",
        "template": {
            "name": selected_template,
            "language": {"code": "en_US" if selected_template == "hello_world" else "en"},
        },
    }
    if selected_template != "hello_world":
        payload["template"]["components"] = [{"type": "body", "parameters": [
            {"type": "text", "text": employee_name},
            {"type": "text", "text": task},
            {"type": "text", "text": due_date or "No due date"},
        ]}]
    try:
        response = requests.post(
            f"https://graph.facebook.com/{version}/{phone_id}/messages",
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=12,
        )
        if not response.ok:
            logger.warning("WhatsApp task send failed with HTTP %s", response.status_code)
            return {"success": False, "error": f"Meta API returned HTTP {response.status_code}"}
        message_id = (response.json().get("messages") or [{}])[0].get("id")
        if not message_id:
            return {"success": False, "error": "Meta API did not return a message ID"}
        return {"success": True, "message_id": message_id}
    except (requests.RequestException, ValueError, KeyError, TypeError):
        logger.exception("WhatsApp task send failed")
        return {"success": False, "error": "Could not send WhatsApp message"}
