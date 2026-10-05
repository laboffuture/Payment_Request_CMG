/**
 * Every user-facing validation message, word for word.
 * Prototype origin: the toast() calls in the A.* handlers; §8 of the brief.
 *
 * The API returns these as `{ error: "<message>" }`; the web app shows the same
 * text in a toast. Keeping them in one shared place is what makes "feature
 * parity of wording" testable.
 */

export const MSG = {
  // --- auth -----------------------------------------------------------
  loginRequired: 'Enter login ID and password',
  badCredentials: 'Wrong login ID or password',
  accountLocked:
    'Too many failed attempts — the account is locked. Try again later.',
  passwordRule: 'Password: at least 8 characters with letters and numbers',
  passwordMismatch: 'Passwords do not match',
  currentPasswordWrong: 'Current password is wrong',
  sessionExpired: 'Your session has expired — please sign in again',

  // --- MR (site) ------------------------------------------------------
  mrNoProject: 'Select a project — every MR needs one',
  mrNoDate: 'Set the required date',
  mrDatePast: 'Required date cannot be in the past',
  mrNoLines: 'Add at least one MR item',
  mrQtyRequired: 'Every item needs a quantity above 0',
  mrDescriptionRequired: 'Every item needs a description — say what you need',
  mrDescriptionRequiredFor: (item: string) => `${item}: add a description`,
  mrItemAlreadyAdded: 'That item is already on this MR',
  mrItemNameAndCategory: 'Item name and category are required',
  mrEditNotAllowed: 'This MR can no longer be edited',
  mrNotWithPm: 'This MR is not waiting for the Project Manager',
  mrNotWithQs: 'This MR is not with QS',
  pmNothingApproved: 'Nothing approved — use Reject instead',
  pmCommentRequired: 'Write a comment for the requester',
  boqTooLarge: 'The BOQ file is larger than 5 MB — compress it and try again',
  boqTooMany: (max: number) => `Attach at most ${max} BOQ files`,
  boqNoFiles: 'Choose at least one file',
  boqNotFound: 'That BOQ file is no longer attached',
  boqWrongType:
    'The BOQ must be a PDF, an image or a spreadsheet (CSV, XLS, XLSX)',
  mrDeleteNotAllowed: 'Only a draft can be deleted',
  itemAlreadyInMaster: (code: string) =>
    `Already in item master as ${code} — choose it from the list`,

  // --- QS -------------------------------------------------------------
  qsClearNewItems: 'Clear the new items first',
  qsChooseMapTarget: 'Choose the existing item to map to',
  qsNegative: 'Quantities cannot be negative',
  qsOverRequested: (item: string, given: string, requested: string) =>
    `${item}: store + PO (${given}) is more than requested (${requested})`,
  qsOverAvailable: (item: string, available: string) =>
    `${item}: only ${available} available in store`,
  qsNothingApproved: 'Nothing approved — use Reject instead',
  qsCommentRequired: 'Write a comment for the requester',
  qsRejectReasonRequired: 'Write a reason for rejection',

  // --- pool / enquiry -------------------------------------------------
  poolTakeRange: (mrNo: string, open: string) =>
    `${mrNo}: take qty must be between 0 and ${open}`,
  poolSelectLine: 'Select at least one line',
  rfqPickVendor: 'Pick at least one vendor',
  rfqDueFuture: 'Set a due time in the future',
  rfqDueFuturePick: 'Pick a time in the future',
  rfqClosed: 'The due time has passed',
  rfqNotInvited: 'Not invited',
  rfqPickVendorForLine: (item: string) => `Pick a vendor for ${item}`,
  rfqNoQuoteFrom: (item: string) => `No quote from that vendor for ${item}`,
  rfqReasonNotLowest:
    'Give a reason for choosing a vendor that is not the lowest',
  rfqNoSingleVendor: 'No single vendor quoted every item',

  // --- vendor portal --------------------------------------------------
  vendorLeadTime: 'Enter lead time in days',
  vendorRatesNegative: 'Rates cannot be negative',
  vendorQuoteAtLeastOne: 'Quote a rate for at least one item',
  vendorSheetColumns: 'Use the downloaded sheet (needs S.No and Rate columns)',
  vendorSheetFilled: (n: number) =>
    `${n} rate(s) filled from the sheet — check and submit`,
  vendorSheetEmpty: 'The file is empty',
  docChoosePo: 'Choose the PO',
  docNoRequired: 'Enter the document number',
  docFileRequired: 'Attach the file',
  docTooLarge: 'File is larger than 1 MB — compress or scan at lower quality',
  docAmountRequired: 'Enter the invoice amount',
  docRejectReason: 'Write a reason',

  // --- PO wizard ------------------------------------------------------
  poNoLines: 'Add at least one line',
  poNoVendor: 'Choose a vendor',
  poNoCurrency: 'Choose the currency',
  poNoRecommendation:
    'No past rates or lead times for these items yet — choose a vendor yourself',
  poNoCompany:
    'Choose the company (billing entity) — add one under Company & PO print',
  poNoCompanyShort: 'Choose the company',
  poRateRequired: (item: string) => `Enter a rate for ${item}`,
  poRateRequiredShort: (item: string) => `${item}: enter a rate`,
  poRatesNegative: 'Rates cannot be negative',
  poTaxNegative: 'Tax % cannot be negative',
  poQtyAboveZero: (item: string) => `${item}: qty must be above 0`,
  poOnlyAvailable: (item: string, available: string) =>
    `${item}: only ${available} available for this MR line`,
  poOnlyOpenOnLine: (item: string, open: string) =>
    `${item}: only ${open} open on that MR line`,
  poBelowReceived: (item: string, received: string) =>
    `${item}: cannot go below received qty ${received}`,
  poDirectOneProject:
    'Direct-to-site delivery works for one project only — choose Main store',
  poDirectOneProjectShort:
    'Direct-to-site works for one project only — choose Main store',
  poRevisionReason: 'Give the reason for this revision',
  poOnlyManagerApproves: 'Only a Procurement Manager can approve POs',
  poOnlyManagerRejects: 'Only a Procurement Manager can reject POs',
  poOwnPo:
    'You raised this PO — another Procurement Manager must approve it',
  poCancelHasGrn:
    'Goods have already been received against this PO — it cannot be cancelled',
  poNotWithProcMgr: 'This PO is not waiting for the Procurement Manager',
  poNotWithQs: 'This PO is not waiting for QS validation',
  poNotWithMgmt: 'This PO is not waiting for management',
  poOnlyQsValidates: 'Only QS can validate a purchase order',
  poOnlyMgmtApproves: 'Only management can give the final approval',
  poValidationRemark:
    'Say what is missing or wrong — procurement needs to know what to fix',
  poNotFound: 'No PO with that number',
  poWrongStatusToReceive: (poNo: string, status: string) =>
    `${poNo} is ${status} — cannot receive`,
  poWrongLocation: (poNo: string, where: string) =>
    `${poNo} is for ${where} delivery`,

  // --- GRN / issue / receive -----------------------------------------
  grnDnRequired: 'Delivery note / DO no. is required',
  grnOverBalance: (balance: string) =>
    `Receive qty is more than the PO balance (${balance})`,
  grnQtyRequired: 'Enter a quantity received',
  issueOverIssuable: (item: string, issuable: string) =>
    `${item}: only ${issuable} can be issued for this MR`,
  issueNoStock: (item: string) => `${item}: not enough stock on hand`,
  issueQtyRequired: 'Enter a quantity to issue',
  acceptRange: 'Accepted qty must be between 0 and issued qty',

  // --- admin ----------------------------------------------------------
  userNameLoginRequired: 'Name and login ID are required',
  userLoginFormat: 'Login ID: at least 2 letters/numbers, no spaces',
  userLoginTaken: 'That login ID is already used',
  userVendorRequired: 'Choose the vendor for this portal login',
  userPasswordRequired: 'Set a password',
  vendorNameRequired: 'Vendor name is required',
  vendorNameExists: 'A vendor with this name exists',
  projectFieldsRequired: 'Code and name are required',
  projectCodeExists: 'Project code exists',
  companyNameRequired: 'Company name is required',
  logoTooLarge: 'Logo is larger than 300 KB',
  categoryNameRequired: 'Enter a category name',
  categoryExists: 'Already exists',
  itemNameCategoryRequired: 'Name and category are required',
  itemExists: 'Item already exists',
  importMissingColumn: (col: string) =>
    `Missing column: ${col} — use the template`,
  importEmpty: 'The file is empty',
  importNoName: 'Item name missing',
  importExampleRow: 'Example row skipped',
  importCategoryUnknown: (cat: string) =>
    `Category "${cat}" not found — add it under Categories`,
  importSubCategoryUnknown: (sub: string, cat: string) =>
    `Sub-category "${sub}" not under ${cat}`,
  importQtyNumber: 'Opening qty must be a number ≥ 0',
  importDuplicate: 'Duplicate in file',
  importAlreadyOpening: (code: string, name: string) =>
    `${code} ${name} already has opening stock — skipped (one-time import)`,
  importDone: (newItems: number, withStock: number) =>
    `Imported: ${newItems} new item(s), opening stock for ${withStock} item(s)`,
  paymentUsersAllPresent: 'All Payment app users are already here',

  // --- generic --------------------------------------------------------
  notFound: 'Not found',
  forbidden: 'You do not have access to this record',
  stale: 'Someone else changed this — refresh',
  noConnection: 'No connection — check your network',
  nothingToExport: 'Nothing to export',
} as const;

/** Machine codes returned next to the human message (§12). */
export const ERR = {
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  STALE: 'STALE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type ErrCode = (typeof ERR)[keyof typeof ERR];
