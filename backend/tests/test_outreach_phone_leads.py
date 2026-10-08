import json
import unittest
from unittest.mock import MagicMock, patch

from backend.app import database, main


class PhoneOnlyOutreachTests(unittest.TestCase):
    def test_null_email_can_be_saved_with_a_phone(self):
        payload = main.OutreachContactRequest(company_name="Garage", email=None, phone="9876543210")
        with patch.object(main, "_require_permission", return_value={"id": 7}), patch.object(main, "save_manual_outreach_contact", return_value={"id": 12}) as save:
            result = main.create_outreach_contact(payload)
        self.assertEqual(result["contact"]["id"], 12)
        self.assertEqual(save.call_args.args[3:5], ("", "9876543210"))

    def test_phone_import_returns_matching_contact_not_another_blank_email(self):
        contacts = [
            {"id": 11, "email": "", "phone": "1111111111"},
            {"id": 12, "email": "", "phone": "9876543210"},
        ]
        with patch.object(database, "db_connection", return_value=MagicMock()), patch.object(database, "list_outreach_contacts", return_value=contacts):
            result = database.save_manual_outreach_contact(7, "Garage", email="", phone="9876543210")
        self.assertEqual(result["id"], 12)

    def test_email_import_does_not_match_another_blank_phone(self):
        contacts = [
            {"id": 11, "email": "other@example.test", "phone": ""},
            {"id": 12, "email": "owner@example.test", "phone": ""},
        ]
        with patch.object(database, "db_connection", return_value=MagicMock()), patch.object(database, "list_outreach_contacts", return_value=contacts):
            result = database.save_manual_outreach_contact(7, "Garage", email="owner@example.test")
        self.assertEqual(result["id"], 12)

    def test_whatsapp_generation_accepts_null_email_and_uses_phone_contact(self):
        lead = {"id": 12, "company_name": "Garage", "email": None, "phone": "9876543210"}
        with patch.object(main, "_require_permission", return_value={"id": 7}), patch.object(main, "list_outreach_contacts", return_value=[lead]), patch.object(main, "_chat_completion", return_value=json.dumps({"subject": "", "message": "Hello Garage, can we discuss your requirements?"})) as generate:
            result = main.generate_outreach(main.OutreachGenerateRequest(contact_ids=[12], channel="whatsapp"))
        self.assertEqual(result["subject"], "")
        self.assertIn("Hello Garage", result["message"])
        context = generate.call_args.args[0][1]["content"]
        self.assertIn('"channel": "whatsapp"', context)
        self.assertIn("9876543210", context)


if __name__ == "__main__":
    unittest.main()
