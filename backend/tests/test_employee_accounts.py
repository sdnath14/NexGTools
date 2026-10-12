import unittest
from unittest.mock import MagicMock, patch

from backend.app import database


class EmployeeAccountTests(unittest.TestCase):
    def setUp(self):
        self.connection = MagicMock()
        self.cursor = self.connection.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.cursor.lastrowid = 42

    def test_creates_account_with_selected_role_and_permissions(self):
        self.cursor.fetchone.return_value = {"id": 8, "name": "Sales", "permissions_json": '["outreach"]'}
        with patch.object(database, "db_connection", return_value=self.connection):
            user = database.create_user("Employee", "employee@example.test", "salt", "hash", role_id=8)
        self.assertEqual(self.cursor.execute.call_args_list[0].args[1], (8,))
        self.assertEqual(self.cursor.execute.call_args_list[1].args[1], ("Employee", "employee@example.test", "salt", "hash", 8))
        self.assertEqual(user["role_id"], 8)
        self.assertEqual(user["permissions"], ["outreach"])
        self.assertNotIn("password_hash", user)

    def test_invalid_role_does_not_insert_account(self):
        self.cursor.fetchone.return_value = None
        with patch.object(database, "db_connection", return_value=self.connection):
            with self.assertRaisesRegex(ValueError, "Role not found"):
                database.create_user("Employee", "employee@example.test", "salt", "hash", role_id=99)
        self.assertEqual(self.cursor.execute.call_count, 1)

    def test_existing_creation_flow_defaults_to_member(self):
        self.cursor.fetchone.return_value = {"id": 1, "name": "Member", "permissions_json": '["dashboard"]'}
        with patch.object(database, "db_connection", return_value=self.connection):
            user = database.create_user("Employee", "employee@example.test", "salt", "hash")
        self.assertIn("name = 'Member'", self.cursor.execute.call_args_list[0].args[0])
        self.assertEqual(user["role"], "Member")


if __name__ == "__main__":
    unittest.main()
