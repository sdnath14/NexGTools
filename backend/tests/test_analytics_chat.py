import json
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from backend.app import main


class AnalyticsChatTests(unittest.TestCase):
    def setUp(self):
        self.schema = {'tables': [{'table_name': 'uploaded_data', 'sheet_name': 'Data', 'columns': [{'name': f'field_{i}', 'type': 'TEXT'} for i in range(21)]}]}
        self.payload = main.AnalyticsChatRequest(dataset_id=3, table_name='uploaded_data', question='total columns of the selected data')
        for name, result in [('_require_permission', {'id': 1}), ('schema_for_dataset', self.schema), ('preview_table', {'rows': []})]:
            patcher = patch.object(main, name, return_value=result)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_column_count_uses_ai_sql_execution_and_explanation(self):
        plan = json.dumps({'sql': 'SELECT 21 AS column_count, COUNT(*) AS row_count FROM uploaded_data', 'notes': ''})
        with patch.object(main, '_chat_completion', side_effect=[plan, 'The selected sheet has 21 columns.']) as ai, patch.object(main, 'execute_sql', return_value={'sql': 'SELECT 21 AS column_count, COUNT(*) AS row_count FROM uploaded_data LIMIT 1000', 'rows': [{'column_count': 21, 'row_count': 121}]}) as execute:
            answer = main.analytics_chat(self.payload, 'test')
            self.assertEqual(ai.call_count, 2)
            self.assertEqual(ai.call_args_list[0].kwargs['response_format'], main.ANALYTICS_QUERY_FORMAT)
            self.assertEqual(ai.call_args_list[0].kwargs['max_tokens'], 1800)
            explanation = ai.call_args_list[1].args[0][-1]['content']
            self.assertIn('"column_count": 21', explanation)
            execute.assert_called_once()
            self.assertEqual(answer['rows'][0]['column_count'], 21)
            supplied_schema = ai.call_args_list[0].args[0][1]['content']
            self.assertIn('field_20', supplied_schema)
            self.assertIn('"column_count": 21', supplied_schema)

    def test_tableless_query_is_repaired_before_execution(self):
        with patch.object(main, '_chat_completion', side_effect=['{"sql":"SELECT 21 AS column_count"}', '{"sql":"SELECT 21 AS column_count, COUNT(*) AS row_count FROM uploaded_data"}', '21 columns']), patch.object(main, 'execute_sql', return_value={'sql': 'validated query', 'rows': [{'column_count': 21}]}) as execute:
            self.assertEqual(main.analytics_chat(self.payload, 'test')['answer'], '21 columns')
            execute.assert_called_once()
            self.assertIn('FROM uploaded_data', execute.call_args.args[2])

    def test_unavailable_fields_can_request_clarification(self):
        with patch.object(main, '_chat_completion', return_value='{"sql":null,"notes":"Which field do you mean?"}'), patch.object(main, 'execute_sql') as execute:
            self.assertIsNone(main.analytics_chat(self.payload, 'test')['sql'])
            execute.assert_not_called()

    def test_outside_table_still_rejected(self):
        with patch.object(main, '_chat_completion', return_value='{"sql":"SELECT * FROM users"}'), patch.object(main, 'execute_sql') as execute:
            with self.assertRaises(HTTPException) as error:
                main.analytics_chat(self.payload, 'test')
            self.assertEqual(error.exception.status_code, 400)
            execute.assert_not_called()

    def test_malformed_plans_are_not_executed(self):
        for plan in ['{}', '{"sql":null}', '{"sql":21}', 'not json']:
            with self.subTest(plan=plan), self.assertRaises(HTTPException):
                main._analytics_query_plan(plan)


if __name__ == '__main__':
    unittest.main()
