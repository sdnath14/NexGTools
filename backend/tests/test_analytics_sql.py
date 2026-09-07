import unittest
from backend.app.analytics import validate_sql

class AnalyticsSqlValidationTests(unittest.TestCase):
    allowed = {'analytics_data_1_data'}

    def test_replace_function_can_clean_excel_numeric_text(self):
        sql = "SELECT SUM(CAST(REPLACE(`amount`, ',', '') AS DECIMAL(18,2))) FROM `analytics_data_1_data`"
        self.assertEqual(validate_sql(sql, self.allowed), sql + ' LIMIT 1000')

    def test_cell_values_are_not_sql_syntax(self):
        for value in ['Import from China', 'AB--12', 'part;2', '/*sample*/', 'limit 1', 'Join users', '#ref', "O''Brien from London"]:
            sql = f"SELECT * FROM `analytics_data_1_data` WHERE `name` = '{value}'"
            with self.subTest(value=value):
                self.assertEqual(validate_sql(sql, self.allowed), sql + ' LIMIT 1000')

    def test_actual_comments_writes_and_other_tables_are_rejected(self):
        for sql in ['REPLACE INTO analytics_data_1_data VALUES (1)', 'SELECT * FROM users', 'SELECT * FROM analytics_data_1_data JOIN users ON 1=1', 'SELECT * FROM other.analytics_data_1_data', 'SELECT * FROM `other`.`analytics_data_1_data`', 'SELECT * FROM analytics_data_1_data; DELETE FROM users', 'SELECT * FROM analytics_data_1_data -- comment', 'SELECT * FROM analytics_data_1_data # comment', 'SELECT * FROM analytics_data_1_data /* comment */', "SELECT 'FROM analytics_data_1_data'", 'SELECTED * FROM analytics_data_1_data']:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                validate_sql(sql, self.allowed)

    def test_selected_dataset_is_enforced(self):
        with self.assertRaises(ValueError):
            validate_sql('SELECT * FROM analytics_data_2_data', self.allowed)

    def test_existing_limit_is_preserved(self):
        sql = 'SELECT * FROM analytics_data_1_data LIMIT 10'
        self.assertEqual(validate_sql(sql, self.allowed), sql)

if __name__ == '__main__':
    unittest.main()
