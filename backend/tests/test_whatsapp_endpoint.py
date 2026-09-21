import unittest
from unittest.mock import MagicMock, patch

from backend.app import main


class WhatsAppEndpointTests(unittest.TestCase):
    def test_authenticated_test_route_selects_employee_and_hello_world(self):
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {
            "name": "Rahul", "phone": "9876543210", "whatsapp_number": "",
        }
        with patch.object(main, "_require_permission", return_value={"id": 7, "is_nexg_admin": False}), \
             patch.object(main, "db_connection", return_value=connection), \
             patch.object(main, "send_whatsapp_task", return_value={"success": True, "message_id": "wamid.test"}) as send:
            response = main.test_work_whatsapp(main.WorkWhatsAppTestRequest(employee_id=12), authorization="Bearer test-session")
        self.assertEqual(response, {"whatsapp": {"success": True, "message_id": "wamid.test"}})
        self.assertTrue(any(route.path == "/api/work-assignments/whatsapp/test" and "POST" in route.methods for route in main.app.routes))
        send.assert_called_once_with("9876543210", "Rahul", "WhatsApp test task", "", template_name="hello_world")


if __name__ == "__main__":
    unittest.main()
