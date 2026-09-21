import unittest
from dataclasses import replace
from unittest.mock import Mock, patch

from backend.app import whatsapp_service


class WhatsAppServiceTests(unittest.TestCase):
    def test_normalize_indian_numbers(self):
        for source in ("98765 43210", "+91 (98765) 43210", "09876543210"):
            with self.subTest(source=source):
                self.assertEqual(whatsapp_service.normalize_whatsapp_number(source), "919876543210")

    def test_reject_invalid_number(self):
        with self.assertRaises(ValueError):
            whatsapp_service.normalize_whatsapp_number("98765abc210")

    def test_template_send_uses_employee_values(self):
        response = Mock(ok=True)
        response.json.return_value = {"messages": [{"id": "wamid.test"}]}
        test_settings = replace(whatsapp_service.settings, whatsapp_access_token="test-token", whatsapp_phone_number_id="12345")
        with patch.object(whatsapp_service, "settings", test_settings), \
             patch.object(whatsapp_service.requests, "post", return_value=response) as post:
            result = whatsapp_service.send_whatsapp_task("9876543210", "Rahul", "Contact BPCL", "2026-09-21")
        self.assertEqual(result, {"success": True, "message_id": "wamid.test"})
        self.assertEqual(post.call_args.kwargs["json"]["to"], "919876543210")
        self.assertEqual(
            [parameter["text"] for parameter in post.call_args.kwargs["json"]["template"]["components"][0]["parameters"]],
            ["Rahul", "Contact BPCL", "2026-09-21"],
        )

    def test_missing_number_does_not_send(self):
        with patch.object(whatsapp_service.requests, "post") as post:
            self.assertEqual(whatsapp_service.send_whatsapp_task("", "Rahul", "Contact BPCL", ""), {
                "success": False, "error": "Employee does not have a WhatsApp number",
            })
        post.assert_not_called()

    def test_hello_world_has_no_task_parameters(self):
        response = Mock(ok=True)
        response.json.return_value = {"messages": [{"id": "wamid.test"}]}
        test_settings = replace(whatsapp_service.settings, whatsapp_access_token="test-token", whatsapp_phone_number_id="12345")
        with patch.object(whatsapp_service, "settings", test_settings), \
             patch.object(whatsapp_service.requests, "post", return_value=response) as post:
            result = whatsapp_service.send_whatsapp_task("9876543210", "Rahul", "ignored", "", template_name="hello_world")
        self.assertTrue(result["success"])
        self.assertEqual(post.call_args.kwargs["json"]["template"], {"name": "hello_world", "language": {"code": "en_US"}})


if __name__ == "__main__":
    unittest.main()
