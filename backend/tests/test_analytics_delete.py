import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from backend.app import analytics, main


class DeleteDatasetTests(unittest.TestCase):
    def setUp(self):
        self.dataset = {'tables': [{'table_name': 'analytics_data_7_sheet1'}, {'table_name': 'analytics_data_7_sheet2'}]}
        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value.__enter__.return_value

    def test_drops_only_owned_sheet_tables_before_metadata(self):
        with patch.object(analytics, 'get_dataset', return_value=self.dataset) as owned, patch.object(analytics, 'db_connection') as db:
            db.return_value.__enter__.return_value = self.connection
            analytics.delete_dataset(42, 7)
            owned.assert_called_once_with(42, 7)
            calls = self.cursor.execute.call_args_list
            self.assertEqual(calls[0].args, ('DROP TABLE IF EXISTS `analytics_data_7_sheet1`, `analytics_data_7_sheet2`',))
            self.assertEqual(calls[1].args, ('DELETE FROM analytics_datasets WHERE id = %s AND user_id = %s', (7, 42)))

    def test_other_users_dataset_cannot_be_deleted(self):
        with patch.object(analytics, 'get_dataset', side_effect=ValueError('Dataset not found.')), patch.object(analytics, 'db_connection') as db:
            with self.assertRaises(ValueError):
                analytics.delete_dataset(99, 7)
            db.assert_not_called()

    def test_unexpected_table_metadata_is_rejected(self):
        for name in ['users', 'analytics_data_8_sheet1', 'analytics_data_7_sheet;DROP TABLE users']:
            with self.subTest(name=name), patch.object(analytics, 'get_dataset', return_value={'tables': [{'table_name': name}]}), patch.object(analytics, 'db_connection') as db:
                with self.assertRaises(RuntimeError):
                    analytics.delete_dataset(42, 7)
                db.assert_not_called()

    def test_drop_failure_keeps_metadata_for_retry(self):
        self.cursor.execute.side_effect = RuntimeError('drop failed')
        with patch.object(analytics, 'get_dataset', return_value=self.dataset), patch.object(analytics, 'db_connection') as db:
            db.return_value.__enter__.return_value = self.connection
            with self.assertRaises(RuntimeError):
                analytics.delete_dataset(42, 7)
            self.assertEqual(self.cursor.execute.call_count, 1)

    def test_endpoint_enforces_permission(self):
        with patch.object(main, '_require_permission', side_effect=HTTPException(status_code=403)), patch.object(main, 'delete_dataset') as delete:
            with self.assertRaises(HTTPException):
                main.delete_analytics_dataset(7, None)
            delete.assert_not_called()

    def test_endpoint_uses_authenticated_owner(self):
        with patch.object(main, '_require_permission', return_value={'id': 42}) as permission, patch.object(main, 'delete_dataset') as delete:
            self.assertEqual(main.delete_analytics_dataset(7, 'test'), {'deleted': True, 'dataset_id': 7})
            permission.assert_called_once_with('test', 'data_analytics')
            delete.assert_called_once_with(42, 7)


if __name__ == '__main__':
    unittest.main()
