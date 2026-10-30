import unittest
import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.app import main


class ExpenseEditTests(unittest.TestCase):
    def setUp(self):
        self.payload = main.ExpenseRequest(
            category='Food', particulars='Team lunch', amount=Decimal('215.50'),
            expense_type='Reimbursement', payment_method='UPI', upi_id='team@bank')

    def test_only_admin_can_change_status(self):
        with patch.object(main, '_require_user', return_value={'id': 2, 'is_nexg_admin': False}):
            with self.assertRaises(HTTPException) as error:
                main.update_expense_status(7, main.ExpenseStatusRequest(status='Approved'), 'token')
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

    def test_admin_expense_list_includes_latest_employee_change(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [{
            'id': 7, 'amount': Decimal('200.00'),
            'latest_edit_changes': json.dumps([{'field': 'Amount', 'previous': '300.00', 'updated': '200.00'}]),
            'latest_edit_at': None,
        }]
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            result = main.list_expenses('token')
        self.assertIn('LEFT JOIN expense_edit_history', cursor.execute.call_args.args[0])
        self.assertEqual(result['expenses'][0]['latest_edit_changes'][0]['previous'], '300.00')

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

    def test_advance_requires_client_and_location_before_writing(self):
        for fields in ({}, {'client_name': 'Acme'}, {'client_name': 'Acme', 'location': ' '}):
            payload = self.payload.model_copy(update={'expense_type': 'Advance', **fields})
            with self.subTest(fields=fields), \
                 patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
                 patch.object(main, 'db_connection') as connection:
                with self.assertRaises(HTTPException) as error:
                    main.create_expense(payload, 'token')
                self.assertEqual(error.exception.status_code, 400)
                connection.assert_not_called()

    def test_advance_saves_client_location_and_selected_bank_details(self):
        payload = self.payload.model_copy(update={
            'expense_type': 'Advance', 'client_name': ' Acme ', 'location': ' Kolkata ',
            'particulars': ' Client site visit ',
            'payment_method': 'NEFT', 'account_number': '123456789', 'ifsc_code': ' bank0001234 '})
        cursor = MagicMock()
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            main.create_expense(payload, 'token')
        sql, values = cursor.execute.call_args.args
        columns = sql.split('(', 1)[1].split(')', 1)[0].replace(' ', '').replace('\n', '').split(',')
        saved = dict(zip(columns, values))
        self.assertEqual(saved['particulars'], 'Client site visit')
        self.assertEqual(saved['client_name'], 'Acme')
        self.assertEqual(saved['location'], 'Kolkata')
        self.assertEqual(saved['upi_id'], '')
        self.assertEqual(saved['account_number'], '123456789')
        self.assertEqual(saved['ifsc_code'], 'BANK0001234')

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

    def test_employee_can_update_own_open_request_and_notify_admin(self):
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {'user_id': 8, 'status': 'Issue Raised', 'expense_type': 'Reimbursement',
             'category': 'Travel', 'particulars': 'Old lunch', 'amount': Decimal('200.00'),
             'payment_method': 'UPI', 'upi_id': 'team@bank', 'account_number': '',
             'ifsc_code': '', 'client_name': '', 'location': '', 'attachment_name': None},
            {'id': 1},
        ]
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'name': 'Employee', 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            result = main.edit_expense(7, self.payload, 'token')
        self.assertEqual(result, {'id': 7})
        self.assertIn('UPDATE expenses SET', cursor.execute.call_args_list[1].args[0])
        self.assertNotIn('user_id =', cursor.execute.call_args_list[1].args[0])
        history_sql, history_values = cursor.execute.call_args_list[2].args
        self.assertIn('INSERT INTO expense_edit_history', history_sql)
        self.assertEqual(history_values[:2], (7, 8))
        self.assertEqual(json.loads(history_values[2]), [
            {'field': 'Category', 'previous': 'Travel', 'updated': 'Food'},
            {'field': 'Particulars', 'previous': 'Old lunch', 'updated': 'Team lunch'},
            {'field': 'Amount', 'previous': '200.00', 'updated': '215.50'},
        ])
        self.assertEqual(cursor.execute.call_args_list[-1].args[1][:4], (7, 1, 8, 'expense_request_updated'))

    def test_only_admin_can_read_update_history(self):
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection') as connection:
            with self.assertRaises(HTTPException) as error:
                main.list_expense_edit_history(7, 'token')
        self.assertEqual(error.exception.status_code, 403)
        connection.assert_not_called()

    def test_admin_reads_previous_and_updated_values(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'id': 7}
        cursor.fetchall.return_value = [{
            'id': 12, 'actor': 'Employee', 'changes_json': json.dumps([
                {'field': 'Amount', 'previous': '200.00', 'updated': '215.50'}]),
            'created_timestamp': 1000,
        }]
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            result = main.list_expense_edit_history(7, 'token')
        self.assertEqual(result['updates'][0]['changes'][0],
                         {'field': 'Amount', 'previous': '200.00', 'updated': '215.50'})
        self.assertEqual(result['updates'][0]['createdAt'], 1000000)

    def test_employee_cannot_update_another_request_or_change_type(self):
        cursor = MagicMock()
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'name': 'Employee', 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            cursor.fetchone.return_value = {'user_id': 9, 'status': 'Pending', 'expense_type': 'Reimbursement'}
            with self.assertRaises(HTTPException) as error:
                main.edit_expense(7, self.payload, 'token')
            self.assertEqual(error.exception.status_code, 404)
            cursor.fetchone.return_value = {'user_id': 8, 'status': 'Pending', 'expense_type': 'Advance'}
            with self.assertRaises(HTTPException) as error:
                main.edit_expense(7, self.payload, 'token')
            self.assertEqual(error.exception.status_code, 400)
            cursor.fetchone.return_value = {'user_id': 8, 'status': 'Reimbursed', 'expense_type': 'Reimbursement'}
            with self.assertRaises(HTTPException) as error:
                main.edit_expense(7, self.payload, 'token')
            self.assertEqual(error.exception.status_code, 409)

    def test_employee_can_delete_own_open_batch_but_not_final_batch(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'user_id': 8, 'status': 'Pending', 'batch_id': 'batch-1'}
        cursor.fetchall.return_value = [{'id': 7, 'status': 'Pending'}, {'id': 8, 'status': 'Issue Raised'}]
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            self.assertEqual(main.delete_own_expense(7, 'token'), {'deleted': 2})
            self.assertIn('DELETE FROM expenses', cursor.execute.call_args_list[-1].args[0])
            self.assertEqual(cursor.execute.call_args_list[-1].args[1], ('batch-1', 8))
            cursor.reset_mock()
            cursor.fetchall.return_value = [{'id': 7, 'status': 'Pending'}, {'id': 8, 'status': 'Reimbursed'}]
            with self.assertRaises(HTTPException) as error:
                main.delete_own_expense(7, 'token')
            self.assertEqual(error.exception.status_code, 409)
            self.assertFalse(any('DELETE FROM expenses' in call.args[0] for call in cursor.execute.call_args_list))

    def test_employee_cannot_delete_another_users_request(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'user_id': 9, 'status': 'Pending', 'batch_id': None}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.delete_own_expense(7, 'token')
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(cursor.execute.call_count, 1)

    def test_employee_can_delete_own_single_pending_request(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'user_id': 8, 'status': 'Pending', 'batch_id': None}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            self.assertEqual(main.delete_own_expense(7, 'token'), {'deleted': 1})
        self.assertEqual(cursor.execute.call_args_list[-1].args[1], (7, 8))

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
        cursor.fetchone.return_value = {'user_id': 8, 'status': 'Pending', 'expense_type': 'Reimbursement'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 1, 'name': 'Admin', 'is_nexg_admin': True}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.update_expense_status(7, main.ExpenseStatusRequest(status='Issue Raised'), 'token')
            self.assertEqual(error.exception.status_code, 400)
            main.update_expense_status(7, main.ExpenseStatusRequest(status='Issue Raised', issue_note=' Missing invoice '), 'token')
        self.assertEqual(cursor.execute.call_args_list[-2].args[1], ('Issue Raised', 'Missing invoice', 7))
        self.assertEqual(cursor.execute.call_args_list[-1].args[1][:4], (7, 8, 1, 'expense_issue_raised'))
        self.assertIn('Missing invoice', cursor.execute.call_args_list[-1].args[1][-1])

    def test_employee_issue_reply_notifies_admin_and_rejects_other_users(self):
        cursor = MagicMock()
        cursor.lastrowid = 42
        cursor.fetchone.side_effect = [
            {'user_id': 8, 'status': 'Issue Raised', 'expense_type': 'Advance'},
            {'id': 1},
        ]
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'name': 'Employee', 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            result = main.create_expense_issue_reply(7, main.ExpenseIssueReplyRequest(message=' Receipt attached '), 'token')
        self.assertEqual(result, {'id': 42})
        self.assertEqual(cursor.execute.call_args_list[1].args[1], (7, 8, 'Receipt attached'))
        self.assertEqual(cursor.execute.call_args_list[-1].args[1][:4], (7, 1, 8, 'expense_issue_reply'))
        self.assertIn('Receipt attached', cursor.execute.call_args_list[-1].args[1][-1])

        cursor.reset_mock()
        cursor.fetchone.side_effect = None
        cursor.fetchone.return_value = {'user_id': 9, 'status': 'Issue Raised', 'expense_type': 'Advance'}
        with patch.object(main, '_require_user', return_value={'id': 8, 'name': 'Employee', 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.create_expense_issue_reply(7, main.ExpenseIssueReplyRequest(message='Hello'), 'token')
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(cursor.execute.call_count, 1)

    def test_employee_cannot_reply_after_issue_is_closed(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'user_id': 8, 'status': 'Reimbursed', 'expense_type': 'Advance'}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'name': 'Employee', 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.create_expense_issue_reply(7, main.ExpenseIssueReplyRequest(message='Updated'), 'token')
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(cursor.execute.call_count, 1)

    def test_other_employee_cannot_read_issue_replies(self):
        cursor = MagicMock()
        cursor.fetchone.return_value = {'user_id': 9}
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value = cursor
        with patch.object(main, '_require_user', return_value={'id': 8, 'is_nexg_admin': False}), \
             patch.object(main, 'db_connection', return_value=connection):
            with self.assertRaises(HTTPException) as error:
                main.list_expense_issue_replies(7, 'token')
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(cursor.execute.call_count, 1)


if __name__ == '__main__':
    unittest.main()
