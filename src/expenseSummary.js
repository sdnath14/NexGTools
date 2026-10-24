export function expenseSummary(expenses) {
  const summary = { entries: expenses.length, unpaid: 0, reimbursementDue: 0, advanceDue: 0, reimbursed: 0, advanceTaken: 0, rejected: 0, issues: 0 };
  for (const item of expenses) {
    const amount = Math.round(Number(item.amount) * 100);
    if (item.status === 'Rejected') { summary.rejected += amount; continue; }
    if (item.status === 'Issue Raised') summary.issues += 1;
    if (item.status === 'Reimbursed') {
      summary[item.expense_type === 'Advance' ? 'advanceTaken' : 'reimbursed'] += amount;
    } else {
      summary.unpaid += amount;
      summary[item.expense_type === 'Advance' ? 'advanceDue' : 'reimbursementDue'] += amount;
    }
  }
  for (const key of ['unpaid', 'reimbursementDue', 'advanceDue', 'reimbursed', 'advanceTaken', 'rejected']) summary[key] /= 100;
  return summary;
}
