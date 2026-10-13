import unittest
from unittest.mock import MagicMock, patch
from fastapi import BackgroundTasks, HTTPException
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

    def test_started_task_cannot_return_to_pending(self):
        self.cursor.fetchone.return_value = {"id": 4, "title": "Report", "status": "In Progress", "created_by_user_id": 9, "employee_name": "Employee"}
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            with self.assertRaises(HTTPException) as error:
                main.update_work_task_status(4, main.WorkTaskStatusRequest(status="Pending"), BackgroundTasks())
        self.assertEqual(error.exception.status_code, 409)
        self.assertFalse(any(call.args[0].lstrip().startswith("UPDATE work_tasks") for call in self.cursor.execute.call_args_list))

    def test_pending_task_must_start_before_done(self):
        self.cursor.fetchone.return_value = {"id": 4, "title": "Report", "status": "Pending", "created_by_user_id": 9, "employee_name": "Employee"}
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            with self.assertRaises(HTTPException) as error:
                main.update_work_task_status(4, main.WorkTaskStatusRequest(status="Done"), BackgroundTasks())
        self.assertEqual(error.exception.status_code, 409)

    def test_done_task_cannot_restart(self):
        self.cursor.fetchone.return_value = {"id": 4, "title": "Report", "status": "Done", "created_by_user_id": 9, "employee_name": "Employee"}
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection):
            with self.assertRaises(HTTPException) as error:
                main.update_work_task_status(4, main.WorkTaskStatusRequest(status="In Progress"), BackgroundTasks())
        self.assertEqual(error.exception.status_code, 409)

    def test_progress_starts_timer(self):
        self.cursor.fetchone.side_effect = [
            {"id": 4, "title": "Report", "status": "Pending", "created_by_user_id": 7, "employee_name": "Employee"},
            {"id": 4, "status": "In Progress"},
        ]
        with patch.object(main, "_require_user", return_value=self.user), patch.object(main, "db_connection", return_value=self.connection), patch.object(main, "_default_admin_user_id", return_value=None), patch.object(main, "_work_task_row", return_value={"id": 4, "status": "In Progress"}):
            result = main.update_work_task_status(4, main.WorkTaskStatusRequest(status="In Progress"), BackgroundTasks())
        self.assertEqual(result["task"]["status"], "In Progress")
        self.assertTrue(any("started_at" in call.args[0] for call in self.cursor.execute.call_args_list))


if __name__ == "__main__":
    unittest.main()
