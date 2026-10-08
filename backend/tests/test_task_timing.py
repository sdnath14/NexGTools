import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from backend.app import main, fcm_service


class TaskTimingTests(unittest.TestCase):
    def setUp(self):
        self.connection = MagicMock()
        self.cursor = self.connection.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.user = {"id": 7, "email": "employee@example.test", "is_nexg_admin": False}

    def test_notification_preview_does_not_expose_full_task(self):
        title = "Prepare the monthly report and reconcile every invoice for the finance team"
        with patch.object(fcm_service, "_send_multicast_notification") as send:
            fcm_service.send_task_assignment_notification([], {"id": 4, "title": title})
        body = send.call_args.kwargs["body"]
        self.assertNotIn(title, body)
        self.assertIn(title[:(len(title) + 1) // 2], body)
        self.assertEqual(send.call_args.kwargs["data"]["taskId"], "4")

    def test_opening_employee_task_marks_seen_and_reads_only_their_alerts(self):
        self.cursor.fetchone.side_effect = [
            {"id": 4, "employee_user_id": 7, "email": self.user["email"], "assigned": 1},
            {"seen_timestamp": 1700000000},
        ]
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            result = main.mark_work_task_seen(4)
        self.assertEqual(result["seenAt"], 1700000000000)
        reads = [call for call in self.cursor.execute.call_args_list if "UPDATE work_task_notifications" in call.args[0]]
        self.assertEqual(reads[0].args[1], (4, 7))

    def test_admin_review_does_not_mark_employee_task_seen(self):
        self.cursor.fetchone.side_effect = [
            {"id": 4, "employee_user_id": 8, "email": "another@example.test", "assigned": 0},
            {"seen_timestamp": None},
        ]
        with patch.object(main, "_require_user", return_value={**self.user, "is_nexg_admin": True}), patch.object(main, "db_connection", return_value=self.connection):
            result = main.mark_work_task_seen(4)
        self.assertIsNone(result["seenAt"])
        self.assertFalse(any("UPDATE work_tasks" in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_unrelated_employee_cannot_mark_task_seen(self):
        self.cursor.fetchone.return_value = None
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            with self.assertRaises(HTTPException) as error:
                main.mark_work_task_seen(4)
        self.assertEqual(error.exception.status_code, 404)
        self.assertFalse(any(call.args[0].lstrip().startswith("UPDATE") for call in self.cursor.execute.call_args_list))


if __name__ == "__main__":
    unittest.main()
