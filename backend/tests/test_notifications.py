import unittest
from unittest.mock import MagicMock, patch

from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError
from backend.app import main


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.connection = MagicMock()
        self.cursor = self.connection.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.user = {"id": 7, "name": "Employee", "is_nexg_admin": False}

    def test_history_and_unread_count_are_scoped_to_authenticated_user(self):
        self.cursor.fetchall.return_value = [{"id": i, "task_id": 3, "event_type": "task_assignment",
            "message": "Assigned", "created_timestamp": 1791288000, "read_at": None if i % 2 else "read"} for i in range(100, 49, -1)]
        self.cursor.fetchone.return_value = {"unread_count": 26}
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            result = main.work_task_notifications(authorization="Bearer test", before_id=101)
        self.assertEqual(len(result["notifications"]), 50)
        self.assertEqual(result["nextBeforeId"], 51)
        self.assertEqual(result["unreadCount"], 26)
        self.assertTrue(result["notifications"][0]["isRead"])
        self.assertFalse(result["notifications"][1]["isRead"])
        self.assertEqual(self.cursor.execute.call_args_list[0].args[1], (7, 101, 101))
        self.assertEqual(self.cursor.execute.call_args_list[1].args[1], (7,))

    def test_read_only_updates_requested_ids_owned_by_user(self):
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            main.mark_work_task_notifications_read(main.NotificationReadRequest(ids=[10, 11]), authorization="Bearer test")
        sql, params = self.cursor.execute.call_args.args
        self.assertIn("recipient_user_id = %s", sql)
        self.assertIn("id IN (%s,%s)", sql)
        self.assertEqual(params, (7, 10, 11))
        with self.assertRaises(ValidationError):
            main.NotificationReadRequest(ids=[])

    def test_employee_progress_and_done_notify_admin_and_creator_once(self):
        for status in ["In Progress", "Done"]:
            with self.subTest(status=status):
                self.cursor.reset_mock()
                self.cursor.fetchone.return_value = {"id": 3, "title": "Prepare report", "status": "Pending",
                    "created_by_user_id": 1, "employee_user_id": 7}
                background = BackgroundTasks()
                with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection), patch.object(main, "_default_admin_user_id", return_value=1):
                    main.update_work_task_status(3, main.WorkTaskStatusRequest(status=status), background, authorization="Bearer test")
                inserts = [call for call in self.cursor.execute.call_args_list if "INSERT INTO work_task_notifications" in call.args[0]]
                self.assertEqual(len(inserts), 1)
                self.assertEqual(inserts[0].args[1][:3], (3, 1, 7))
                self.assertIn(status, inserts[0].args[1][-1])
                self.assertEqual(background.tasks[0].args[0], [1])

    def test_unchanged_status_does_not_duplicate_alert(self):
        self.cursor.fetchone.return_value = {"id": 3, "title": "Report", "status": "Done", "created_by_user_id": 1}
        background = BackgroundTasks()
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            main.update_work_task_status(3, main.WorkTaskStatusRequest(status="Done"), background, authorization="Bearer test")
        self.assertFalse(background.tasks)
        self.assertFalse(any("INSERT INTO work_task_notifications" in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_unrelated_employee_cannot_update_task(self):
        self.cursor.fetchone.return_value = None
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            with self.assertRaises(HTTPException) as error:
                main.update_work_task_status(3, main.WorkTaskStatusRequest(status="Done"), BackgroundTasks(), authorization="Bearer test")
        self.assertEqual(error.exception.status_code, 404)

    def test_assignment_is_persisted_before_push_is_queued(self):
        self.cursor.lastrowid = 42
        self.cursor.fetchone.return_value = {"id": 42, "title": "Prepare report"}
        employee = {"id": 2, "user_id": 7, "name": "Employee", "phone": ""}
        background = BackgroundTasks()
        with patch.object(main, "_require_permission", return_value={"id": 1, "name": "Admin"}), patch.object(main, "db_connection", return_value=self.connection), patch.object(main, "_work_employee_for_user", return_value=employee), patch.object(main, "_work_task_row", side_effect=lambda row: row), patch.object(main, "_send_work_assignment_email", return_value="not_configured"), patch.object(main, "send_whatsapp_task", return_value={}):
            main.create_work_task(main.WorkTaskRequest(employee_id=7, title="Prepare report"), background, authorization="Bearer test")
        inserts = [call for call in self.cursor.execute.call_args_list if "INSERT INTO work_task_notifications" in call.args[0]]
        self.assertEqual(inserts[0].args[1], (42, 7, 1, "task_assignment", "Admin assigned you: Prepare report"))
        self.assertEqual(background.tasks[0].args[0], 7)


if __name__ == "__main__":
    unittest.main()
