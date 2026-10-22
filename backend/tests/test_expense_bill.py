import unittest
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from pypdf import PdfReader

from backend.app.expense_bill import render_expense_bill


class ExpenseBillTests(unittest.TestCase):
    def test_totals_and_itemized_rows(self):
        rows = [
            {'created_at': datetime(2026, 10, 20), 'submitted_by': 'Asha', 'particulars': 'Client travel',
             'category': 'Travel', 'expense_type': 'Reimbursement', 'status': 'Approved', 'amount': Decimal('543.50')},
            {'created_at': datetime(2026, 10, 21), 'submitted_by': 'Asha', 'particulars': 'Team lunch',
             'category': 'Food', 'expense_type': 'Advance', 'status': 'Pending', 'amount': Decimal('215.00')},
        ]
        pdf = render_expense_bill(rows, 'Asha', 'October 2026', datetime(2026, 10, 22, 10, 0))
        reader = PdfReader(BytesIO(pdf))
        text = '\n'.join(page.extract_text() for page in reader.pages)
        self.assertEqual(len(reader.pages), 1)
        logo = reader.pages[0]['/Resources']['/XObject']['/Im1'].get_object()
        self.assertEqual(logo['/Subtype'], '/Image')
        self.assertEqual(logo['/Width'], 370)
        self.assertEqual(logo['/Height'], 128)
        for value in ('Expense Bill', 'October 2026', 'Client travel', 'Team lunch',
                      'PETROLUBE', 'INR 758.50', 'INR 543.50', 'INR 215.00', '2 expense(s)'):
            self.assertIn(value, text)

    def test_long_bill_paginates(self):
        row = {'created_at': datetime(2026, 10, 20), 'submitted_by': 'Asha', 'particulars': 'Travel',
               'category': 'Travel', 'expense_type': 'Reimbursement', 'status': 'Approved', 'amount': Decimal('10.00')}
        reader = PdfReader(BytesIO(render_expense_bill([row] * 50, 'Asha', 'All dates')))
        self.assertGreater(len(reader.pages), 1)
        self.assertIn('INR 500.00', reader.pages[-1].extract_text())

    def test_raised_issue_counts_as_pending(self):
        row = {'created_at': datetime(2026, 10, 20), 'submitted_by': 'Asha', 'particulars': 'Office supplies',
               'category': 'Stationery', 'expense_type': 'Reimbursement', 'status': 'Issue Raised', 'amount': Decimal('325.00')}
        text = '\n'.join(page.extract_text() for page in PdfReader(BytesIO(render_expense_bill([row], 'Asha', 'October 2026'))).pages)
        self.assertIn('PENDING', text)
        self.assertIn('INR 325.00', text)


if __name__ == '__main__':
    unittest.main()
