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
                           lambda: main.edit_expense(7, self.payload, 'token')):
                with self.assertRaises(HTTPException) as error:
                    action()
                self.assertEqual(error.exception.status_code, 403)

    def test_admin_edit_updates_fields_without_changing_owner_or_status(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'id': 7}
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


if __name__ == '__main__':
    unittest.main()
