import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseSummary } from './expenseSummary.js';

test('payment moves money out of unpaid and into the correct received balance', () => {
  const rows = [
    { amount: '120.10', expense_type: 'Reimbursement', status: 'Pending' },
    { amount: '30.20', expense_type: 'Reimbursement', status: 'Issue Raised' },
    { amount: '50.00', expense_type: 'Advance', status: 'Approved' },
    { amount: '90', expense_type: 'Reimbursement', status: 'Rejected' },
  ];
  const before = expenseSummary(rows);
  assert.equal(before.unpaid, 200.30);
  assert.equal(before.reimbursementDue, 150.30);
  assert.equal(before.advanceDue, 50);
  assert.equal(before.issues, 1);
  const after = expenseSummary(rows.map((row, index) => index === 0 || index === 2 ? { ...row, status: 'Reimbursed' } : row));
  assert.equal(after.unpaid, 30.20);
  assert.equal(after.reimbursementDue, 30.20);
  assert.equal(after.advanceDue, 0);
  assert.equal(after.reimbursed, 120.10);
  assert.equal(after.advanceTaken, 50);
  assert.equal(after.rejected, 90);
  assert.equal(after.entries, 4);
});

test('empty account starts with zero balances', () => {
  assert(Object.values(expenseSummary([])).every((value) => value === 0));
});
