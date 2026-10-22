import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.app import main


class ExpenseEditTests(unittest.TestCase):
    def setUp(self):
        self.payload = main.ExpenseRequest(
            category='Food', particulars='Team lunch', amount=Decimal('215.50'),
            expense_type='Reimbursement', payment_method='UPI', upi_id='team@bank')

    def test_only_admin_can_read_and_edit(self):
        with patch.object(main, '_require_permission', return_value={'id': 2, 'is_nexg_admin': False}):
            for action in (lambda: main.get_expense_for_edit(7, 'token'),
                           lambda: main.edit_expense(7, self.payload, 'token'),
                           lambda: main.update_expense_status(7, main.ExpenseStatusRequest(status='Approved'), 'token')):
                with self.assertRaises(HTTPException) as error:
                    action()
                self.assertEqual(error.exception.status_code, 403)

    def test_expense_creation_is_disabled_for_users_and_admins(self):
        for is_admin in (False, True):
            with patch.object(main, '_require_permission', return_value={'id': 1, 'is_nexg_admin': is_admin}):
                with self.assertRaises(HTTPException) as error:
                    main.create_expense(self.payload, 'token')
                self.assertEqual(error.exception.status_code, 403)

    def test_admin_edit_updates_fields_without_changing_owner_or_status(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Issue Raised'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_permission', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            self.assertEqual(main.edit_expense(7, self.payload, 'token'), {'id': 7})
        sql, values = cursor.execute.call_args_list[-1].args
        self.assertIn('UPDATE expenses SET', sql)
        self.assertNotIn('user_id =', sql)
        self.assertNotIn('status =', sql)
        self.assertEqual(values[2], Decimal('215.50'))
        self.assertEqual(values[-1], 7)

    def test_missing_expense_returns_404(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_permission', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.edit_expense(999, self.payload, 'token')
        self.assertEqual(error.exception.status_code, 404)

    def test_paid_expense_cannot_be_edited_or_changed(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Reimbursed'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_permission', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            for action in (lambda: main.edit_expense(7, self.payload, 'token'),
                           lambda: main.update_expense_status(7, main.ExpenseStatusRequest(status='Rejected'), 'token')):
                with self.assertRaises(HTTPException) as error:
                    action()
                self.assertEqual(error.exception.status_code, 409)

    def test_issue_requires_note_and_saves_it(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Pending'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_permission', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.update_expense_status(7, main.ExpenseStatusRequest(status='Issue Raised'), 'token')
            self.assertEqual(error.exception.status_code, 400)
            main.update_expense_status(7, main.ExpenseStatusRequest(status='Issue Raised', issue_note=' Missing invoice '), 'token')
        self.assertEqual(cursor.execute.call_args_list[-1].args[1], ('Issue Raised', 'Missing invoice', 7))


if __name__ == '__main__':
    unittest.main()
