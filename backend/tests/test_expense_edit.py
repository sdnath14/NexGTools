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

    def test_only_admin_can_edit_or_change_status(self):
        with patch.object(main, '_require_user', return_value={'id': 2, 'is_nexg_admin': False}):
            for action in (lambda: main.edit_expense(7, self.payload, 'token'),
                           lambda: main.update_expense_status(7, main.ExpenseStatusRequest(status='Approved'), 'token')):
                with self.assertRaises(HTTPException) as error:
                    action()
                self.assertEqual(error.exception.status_code, 403)

    def test_employee_details_are_scoped_to_owner_and_include_particulars_and_receipt(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'id': 7, 'particulars': 'Team lunch', 'attachment_name': 'receipt.png', 'attachment_type': 'image/png'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 2, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            result = main.get_expense_for_edit(7, 'token')
        sql, params = cursor.execute.call_args.args
        self.assertIn('e.user_id = %s', sql)
        self.assertEqual(params, (7, 0, 2))
        self.assertEqual(result['expense']['particulars'], 'Team lunch')
        self.assertEqual(result['expense']['attachment_name'], 'receipt.png')

    def test_other_employees_expense_details_return_not_found(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 2, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.get_expense_for_edit(7, 'token')
        self.assertEqual(error.exception.status_code, 404)

    def test_user_can_add_own_expense_but_admin_cannot(self):
        cursor = MagicMock()
        cursor.lastrowid = 23
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False, 'permissions': []}), \
             patch.object(main, 'db_connection', return_value=connection):
            self.assertEqual(main.create_expense(self.payload, 'token'), {'id': 23})
        sql, values = cursor.execute.call_args.args
        self.assertIn('INSERT INTO expenses', sql)
        self.assertEqual(values[0], 8)
        self.assertEqual(values[3], Decimal('215.50'))
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}):
            with self.assertRaises(HTTPException) as error:
                main.create_expense(self.payload, 'token')
            self.assertEqual(error.exception.status_code, 403)

    def test_batch_saves_separate_expenses_with_one_group_id(self):
        payload = main.ExpenseBatchRequest(
            category='Food', expense_type='Reimbursement', payment_method='UPI', upi_id='team@bank',
            items=[{'particulars': 'Lunch', 'amount': '215.50'},
                   {'particulars': 'Tea', 'amount': '40.00'}])
        cursor = MagicMock()
        cursor.lastrowid = 23
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False, 'permissions': []}), \
             patch.object(main, 'db_connection', return_value=connection):
            result = main.create_expense_batch(payload, 'token')
        self.assertEqual(result['ids'], [23, 23])
        self.assertEqual(cursor.execute.call_count, 2)
        first = cursor.execute.call_args_list[0].args[1]
        second = cursor.execute.call_args_list[1].args[1]
        self.assertEqual((first[2], first[3]), ('Lunch', Decimal('215.50')))
        self.assertEqual((second[2], second[3]), ('Tea', Decimal('40.00')))
        self.assertEqual(first[-1], second[-1])
        self.assertEqual(first[-1], result['batch_id'])

    def test_batch_rejects_blank_particular_without_writing(self):
        payload = main.ExpenseBatchRequest(
            category='Food', expense_type='Reimbursement', payment_method='UPI', upi_id='team@bank',
            items=[{'particulars': 'Lunch', 'amount': '215.50'},
                   {'particulars': ' ', 'amount': '40.00'}])
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection') as connection:
            with self.assertRaises(HTTPException) as error:
                main.create_expense_batch(payload, 'token')
        self.assertEqual(error.exception.status_code, 400)
        connection.assert_not_called()

    def test_admin_edit_updates_fields_without_changing_owner_or_status(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Issue Raised'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
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
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.edit_expense(999, self.payload, 'token')
        self.assertEqual(error.exception.status_code, 404)

    def test_paid_expense_cannot_be_edited_or_changed(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Reimbursed'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            for action in (lambda: main.edit_expense(7, self.payload, 'token'),
                           lambda: main.update_expense_status(7, main.ExpenseStatusRequest(status='Rejected', issue_note='Invalid receipt'), 'token')):
                with self.assertRaises(HTTPException) as error:
                    action()
                self.assertEqual(error.exception.status_code, 409)

    def test_rejection_requires_reason_and_saves_it(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Pending'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.update_expense_status(7, main.ExpenseStatusRequest(status='Rejected', issue_note='  '), 'token')
            self.assertEqual(error.exception.status_code, 400)
            cursor.execute.assert_not_called()
            main.update_expense_status(7, main.ExpenseStatusRequest(status='Rejected', issue_note=' Duplicate claim '), 'token')
        self.assertEqual(cursor.execute.call_args_list[-1].args[1], ('Rejected', 'Duplicate claim', 7))

    def test_issue_requires_note_and_saves_it(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'status': 'Pending'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.update_expense_status(7, main.ExpenseStatusRequest(status='Issue Raised'), 'token')
            self.assertEqual(error.exception.status_code, 400)
            main.update_expense_status(7, main.ExpenseStatusRequest(status='Issue Raised', issue_note=' Missing invoice '), 'token')
        self.assertEqual(cursor.execute.call_args_list[-1].args[1], ('Issue Raised', 'Missing invoice', 7))


if __name__ == '__main__':
    unittest.main()
