/* The areas or processes a pre-audit report is filed under. Used by the report form and
   checked by the server, so a report can only carry one of these. */
export const PRE_AUDIT_AREAS=[
  "Accounts Receivable",
  "Compliance",
  "Accounts Payable (AP)",
  "Payroll",
  "Petty Cash",
  "Others",
  "Bank Reconciliation & Treasury",
  "Fixed Assets / Capex",
  "Budgeting & MIS",
  "Inventory / Stock (F&B)",
  "Revenue / POS Reconciliation",
  "Trust & Statutory Compliance (Education)",
  "Corporate / Statutory Filings",
  "Loans / Borrowings & Interest",
] as const;
