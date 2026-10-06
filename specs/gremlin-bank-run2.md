# Gremlin Bank Test Plan (run 2)

## Application Overview

Gremlin Bank (https://gremlin.shiwa.io, footer "Release 1") explored a second time with seed.spec.ts. Covers sign in/out, dashboard, domestic transfer. Fresh bank state per browser context (cookie).

BUSINESS RULES
- R1 Limits (stated on /transfer): 10,000,000 HUF per transfer, 2,000,000 HUF per day. Errors: "The maximum single transfer is 10,000,000 HUF." and "Daily limit of 2,000,000 HUF exceeded."
- R2 Amount must be > 0 (error "Enter an amount greater than 0."). Whole HUF only (INFERRED).
- R3 Fee = max(200, 0.3% of amount rounded half-up to whole HUF). No fee rule is stated in the UI, INFERRED from review pages; re-observed this run: 66,666 -> 200; 66,667 -> 200; 67,500 -> 203 (202.5 rounds up); 1,246,261 -> 3,739; 2,000,000 -> 6,000.
- R4 Funds: amount + fee <= available balance else "Insufficient funds." (1,246,261 + 3,739 = 1,250,000 accepted; 1,246,262 rejected).
- R5 Check order: max single (10,000,001+) -> daily limit (2,000,001+) -> insufficient funds. Daily limit counts amounts without fees.
- R6 IBAN must be verified with the "Check IBAN" button (valid HU IBAN, checksum); otherwise "Check the IBAN first.". Invalid: "Invalid IBAN".
- R7 Confirm needs transaction PIN (env GREMLIN_PIN) typed in the closed-shadow PIN field (keyboard: focus Confirm transfer, Shift+Tab, type PIN), then "Approve payment" in the 'Gremlin Secure' iframe dialog. Missing/wrong PIN: "Wrong PIN."

FRESH DATA (Release 1)
Everyday Account HU39 9992 0265 3141 5926 5358 9797, 1,250,000 HUF. Savings Account HU03 9992 0265 2718 2818 2845 9043, 5,400,000 HUF. Saved payees: Kiss Péter HU72 9990 1017 1618 0339 8874 9892; Nagy Eszter HU71 9990 2025 1414 2135 6237 3099; Tóth Bence HU03 9990 3033 1732 0508 0756 8879. Header shows "Signed in as demo" (GREMLIN_USER).

RANDOM / NON-BUSINESS VALUES (assert format only): Tip of the day (rotates), EUR/HUF rate (format ^\d{3}\.\d{2}$, seen 387-405), transfer reference GB-XXXXXX (/^GB-[A-Z0-9]{6}$/), the 'IBAN verified: GRM-...' marker and 'Session code: GRM-HELLO-7Q2K' / 'Security check passed. Code GRM-ARIA-K9F3' workshop markers.

SUSPECTED BUGS (mark test.fail())
- BUG-A Spending chart (30 days, 2026-09-07..2026-10-06, total 309,190) disagrees with the transactions: 09-30 chart 11,800 vs debit 18,450; 09-27 7,600 vs 7,990; 09-25 14,250 vs 12,300. After a confirmed transfer chart is unchanged.
- BUG-B Own IBAN of the source account accepted as beneficiary (review with fee 200). Expected rejection.
- BUG-C Amount "10,5" accepted as 105 HUF (observed earlier run; not re-verified this run).
- BUG-D Reference typed on the form is not shown on review/confirmation/transaction list (observed earlier run; intent to confirm).
- NOTE Login gives the same generic "Wrong username or password." for empty fields and wrong credentials (no field-level required messages); acceptable.
NOT EXPLORED: Release 2/3, TOTP and push users second-factor flows, lockout recovery.

## Test Scenarios

### 1. Sign in and sign out

**Seed:** `seed.spec.ts`

#### 1.1 Sign in with valid user and sign out

**File:** `tests/auth/sign-in-out.spec.ts`

**Steps:**
  1. Start signed out. Open /login.
    - expect: Heading 'Sign in to Gremlin Bank', fields Username and Password, button 'Sign in', footer 'Release 1', demo-app banner
  2. Fill Username with env GREMLIN_USER and Password with env GREMLIN_PASSWORD, click 'Sign in'.
    - expect: URL /dashboard
    - expect: H1 'Accounts'
    - expect: Header 'Signed in as demo'
  3. Click 'Sign out'.
    - expect: URL /login
    - expect: Sign in form shown, no 'Signed in as' text

#### 1.2 Sign in rejected for empty fields and wrong credentials

**File:** `tests/auth/sign-in-negative.spec.ts`

**Steps:**
  1. Open /login in a fresh context, leave both fields empty, click 'Sign in'.
    - expect: Stays on /login
    - expect: Alert 'Wrong username or password.' (no separate required-field message)
  2. Run each combination: GREMLIN_USER + empty password; empty username + any password; GREMLIN_USER + wrong password (not GREMLIN_PASSWORD); unknown user 'nosuchuser' + wrong password; username with surrounding spaces + correct password (observe, UNVERIFIED).
    - expect: Each wrong/empty case: stays on /login with the identical 'Wrong username or password.' (no user enumeration)

#### 1.3 Protected pages redirect to login without session and after sign out

**File:** `tests/auth/protected-pages.spec.ts`

**Steps:**
  1. In a context without session open /dashboard, /transfer, /transfer/review, /transfer/done.
    - expect: Each ends on /login, no account data shown
  2. Sign in, click 'Sign out', then open /dashboard and use browser Back.
    - expect: Redirected to /login; no balances visible

#### 1.4 Repeated failed sign-ins are rate limited (and second-factor users)

**File:** `tests/auth/lockout-second-factor.spec.ts`

**Steps:**
  1. In a fresh context submit invalid credentials up to 6 times (run serially, not parallel with other sign-in tests).
    - expect: Early attempts: 'Wrong username or password.'
    - expect: From about the 5th attempt (INFERRED from run 1, confirm): 'Too many attempts. Wait 60 seconds.'
  2. Sign in as env GREMLIN_TOTP_USER with its password; at the code prompt enter a code generated from the TOTP secret env var in test code (never hard-coded), then repeat with wrong code 000000.
    - expect: NOT EXPLORED in this run. Expected: valid code -> /dashboard; wrong code -> error, stays signed out

### 2. Dashboard

**Seed:** `seed.spec.ts`

#### 2.1 Accounts show names, IBANs and balances

**File:** `tests/dashboard/accounts.spec.ts`

**Steps:**
  1. From seed state read the two account regions.
    - expect: Everyday Account, IBAN HU39 9992 0265 3141 5926 5358 9797, Balance 1,250,000 HUF
    - expect: Savings Account, IBAN HU03 9992 0265 2718 2818 2845 9043, Balance 5,400,000 HUF
    - expect: 'New transfer' link goes to /transfer
    - expect: Accounts load after a 'Loading accounts...' status (wait via web-first assertion)

#### 2.2 Recent transactions list

**File:** `tests/dashboard/recent-transactions.spec.ts`

**Steps:**
  1. Read table 'Recent transactions' (Date, Description, Amount).
    - expect: 5 rows newest first: 2026-09-30 Grocery store, Budapest -18,450 HUF; 2026-09-29 Salary, Gremlin Works Ltd. +685,000 HUF; 2026-09-27 Mobile phone bill -7,990 HUF; 2026-09-25 Card payment, bookshop -12,300 HUF; 2026-09-24 Transfer from Savings Account +50,000 HUF
    - expect: Debits '-', credits '+', thousands separator ',' and ' HUF' suffix

#### 2.3 Spending chart data table values

**File:** `tests/dashboard/chart-data.spec.ts`

**Steps:**
  1. Click 'Show chart data' (use role locator; click may be slow because of animation).
    - expect: Date/Amount table with 30 daily rows 2026-09-07..2026-10-06
    - expect: Values: 09-07 12,400; 09-08 0; 09-09 8,350; 09-10 23,100; 09-15 31,800; 09-25 14,250; 09-27 7,600; 09-30 11,800; 10-01 0; 10-04 19,950; 10-06 13,500 HUF
    - expect: Zero days: 09-08, 09-12, 09-17, 09-21, 09-26, 10-01
    - expect: Sum of 30 rows = 309,190 HUF
  2. Click 'Hide chart data'.
    - expect: Table hidden

#### 2.4 Chart is consistent with transactions (known bug, test.fail)

**File:** `tests/dashboard/chart-consistency.spec.ts`

**Steps:**
  1. Open chart data and compare 09-25, 09-27, 09-30 with the debits in Recent transactions (12,300; 7,990; 18,450).
    - expect: Expected: each day's spending >= that day's debit. OBSERVED 14,250/7,600/11,800 (BUG-A). Mark test.fail() with comment

#### 2.5 Random dashboard content is well formed

**File:** `tests/dashboard/random-content.spec.ts`

**Steps:**
  1. Read 'Tip of the day' and 'Exchange rate' on the dashboard; reload 3 times.
    - expect: Tip is a non-empty sentence, text NOT asserted (random)
    - expect: EUR/HUF matches /^\d{3}\.\d{2}$/, value not asserted
    - expect: 'Indicative rate. Updated on every page load.' shown

### 3. Domestic transfer

**Seed:** `seed.spec.ts`

#### 3.1 Required fields on the transfer form

**File:** `tests/transfer/required-fields.spec.ts`

**Steps:**
  1. Open /transfer: From account defaults to Everyday Account, 'Available: 1,250,000 HUF'; limits text 'Limits: up to 10,000,000 HUF per transfer and 2,000,000 HUF per day.' visible. Click 'Continue' with all fields empty.
    - expect: Stays on /transfer
    - expect: 'Enter a beneficiary name.'
    - expect: 'Check the IBAN first.'
    - expect: 'Enter an amount greater than 0.'
    - expect: Reference optional (no error)
  2. Beneficiary of spaces only, checked valid IBAN, amount 1000, Continue.
    - expect: 'Enter a beneficiary name.'
  3. Switch From account to Savings Account.
    - expect: Available text becomes 'Available: 5,400,000 HUF'

#### 3.2 IBAN check valid and invalid formats

**File:** `tests/transfer/iban-check.spec.ts`

**Steps:**
  1. Click 'Check IBAN' for HU72 9990 1017 1618 0339 8874 9892 in four forms: with spaces, without spaces, lower case, with leading/trailing spaces. Also each saved payee IBAN (Nagy Eszter, Tóth Bence).
    - expect: Status 'IBAN verified: ...' (marker after colon is fixed text, do not assert)
    - expect: Field normalised to spaced upper case
  2. Check each of: empty; 'abc'; HU73 9990 1017 1618 0339 8874 9892 (bad checksum); HU72 9990 1017 1618 0339 8874 989 (too short); HU72 9990 1017 1618 0339 8874 98921 (too long); DE89 3704 0044 0532 0130 00 (non-HU); HU72-9990-1017-1618-0339-8874-9892 (dashes).
    - expect: Each: 'Invalid IBAN', field marked invalid
  3. Enter a valid IBAN but do not click 'Check IBAN'; fill name and amount 1000; Continue. Then edit a verified IBAN (change last digit) without re-checking and Continue.
    - expect: 'Check the IBAN first.' (first case certain; second case UNVERIFIED, record behaviour)
  4. Click 'Use' on each saved payee.
    - expect: UNVERIFIED: name and IBAN fields filled; record whether Continue then needs a manual IBAN check

#### 3.3 Amount format validation

**File:** `tests/transfer/amount-validation.spec.ts`

**Steps:**
  1. With Kiss Péter and verified IBAN submit each amount: 0, -5, 10.5, 1000.00, 1e3, abc, empty.
    - expect: Each: 'Enter an amount greater than 0.', no navigation to review
  2. Submit '1', then '1 000', then '010000'.
    - expect: 1 -> review Amount 1 HUF, Fee 200, Total 201 (minimum)
    - expect: '1 000' -> Amount 1,000 HUF
    - expect: '010000' -> Amount 10,000 HUF (spaces/leading zeros normalised, INFERRED)

#### 3.4 Amount with decimal comma is rejected (known bug, test.fail)

**File:** `tests/transfer/amount-decimal-comma.spec.ts`

**Steps:**
  1. Submit amount '10,5' with valid data.
    - expect: Expected: validation error. OBSERVED earlier run: review with Amount 105 HUF (BUG-C). Re-verify, mark test.fail()

#### 3.5 Fee table (fee = max(200, round half up 0.3%))

**File:** `tests/transfer/fees.spec.ts`

**Steps:**
  1. Data-driven: from Everyday Account to Kiss Péter, read Fee and Total on review. Table amount -> fee -> total.
    - expect: 1 -> 200 -> 201
    - expect: 99 -> 200 -> 299
    - expect: 1,000 -> 200 -> 1,200
    - expect: 50,000 -> 200 -> 50,200
    - expect: 66,666 -> 200 -> 66,866 (0.3% = 199.998, just below fee tier boundary)
    - expect: 66,667 -> 200 -> 66,867 (0.3% = 200.001, boundary; fee still 200 after rounding)
    - expect: 66,700 -> 200 -> 66,900
    - expect: 67,500 -> 203 -> 67,703 (202.5 rounds half up, verified)
    - expect: 70,000 -> 210 -> 70,210
    - expect: 99,999 -> 300 -> 100,299
    - expect: 100,000 -> 300 -> 100,300
    - expect: 250,000 -> 750 -> 250,750
    - expect: 500,000 -> 1,500 -> 501,500
    - expect: 1,000,000 -> 3,000 -> 1,003,000
    - expect: 1,246,200 -> 3,739 -> 1,249,939
    - expect: 1,246,261 -> 3,739 -> 1,250,000
    - expect: Fee rule is INFERRED (not stated in UI): reviewer to confirm

#### 3.6 Balance and per-transfer limits (insufficient funds, max, validation order)

**File:** `tests/transfer/limits-and-balance.spec.ts`

**Steps:**
  1. From Everyday (1,250,000): submit 1,246,260 and 1,246,261.
    - expect: 1,246,260 -> review Fee 3,739, Total 1,249,999
    - expect: 1,246,261 -> review Fee 3,739, Total 1,250,000 (exactly the balance, accepted)
  2. From Everyday submit 1,246,262, 1,250,000 and 2,000,000.
    - expect: Each 'Insufficient funds.' (2,000,000 is within daily limit so funds error applies)
  3. From Savings (5,400,000) submit 2,000,000, 2,000,001, 10,000,000, 10,000,001.
    - expect: 2,000,000 -> review Fee 6,000, Total 2,006,000 (daily limit counts amount only; verified)
    - expect: 2,000,001 -> 'Daily limit of 2,000,000 HUF exceeded.'
    - expect: 10,000,000 -> 'Daily limit of 2,000,000 HUF exceeded.'
    - expect: 10,000,001 -> 'The maximum single transfer is 10,000,000 HUF.' (checked before daily limit)

#### 3.7 Daily limit accumulates over confirmed transfers

**File:** `tests/transfer/daily-limit.spec.ts`

**Steps:**
  1. Complete a confirmed 100,000 HUF transfer Everyday -> Kiss Péter (see 3.9). Open /transfer, choose Savings and submit 1,900,000, then 1,900,001.
    - expect: 1,900,000 -> review Fee 5,700, Total 1,905,700 (100,000 + 1,900,000 = limit)
    - expect: 1,900,001 -> 'Daily limit of 2,000,000 HUF exceeded.'
  2. From Everyday (balance now 1,149,700) submit 1,149,700 and 1,145,900.
    - expect: 1,149,700 -> 'Insufficient funds.'
    - expect: 1,145,900 -> review Fee 3,438, Total 1,149,338

#### 3.8 Review page, Change details, own-account destination

**File:** `tests/transfer/review.spec.ts`

**Steps:**
  1. Fill Everyday, Kiss Péter, verified IBAN, amount 100,000, reference 'Rent', Continue.
    - expect: URL /transfer/review, heading 'Review transfer'
    - expect: Table: From Everyday Account; To Kiss Péter; IBAN HU72 9990 1017 1618 0339 8874 9892; Amount 100,000 HUF; Fee 300 HUF; Total 100,300 HUF
    - expect: Dashboard balances unchanged until confirmed
  2. Click 'Change details'; change amount to 50,000; Continue.
    - expect: URL /transfer?edit=1 with name, IBAN, amount, reference prefilled
    - expect: Review Amount 50,000 HUF, Fee 200, Total 50,200
  3. Reference expectation check.
    - expect: Expected reference 'Rent' visible somewhere; OBSERVED earlier run: not shown on review/done/transactions (BUG-D, confirm intent, test.fail())

#### 3.9 Own IBAN as beneficiary is rejected (known bug, test.fail)

**File:** `tests/transfer/own-account.spec.ts`

**Steps:**
  1. From Everyday, beneficiary 'Me', IBAN HU39 9992 0265 3141 5926 5358 9797 (same account), amount 1,000, Continue.
    - expect: Expected: rejection. OBSERVED earlier run: review with Fee 200 (BUG-B). Mark test.fail()

#### 3.10 Confirm with PIN and approval; wrong or missing PIN rejected

**File:** `tests/transfer/confirm.spec.ts`

**Steps:**
  1. On the review of 100,000 HUF to Kiss Péter click 'Confirm transfer' without PIN.
    - expect: 'Wrong PIN.', stays on /transfer/review, no dialog
  2. Focus 'Confirm transfer', Shift+Tab, type a wrong 4-digit value (not GREMLIN_PIN), click 'Confirm transfer'.
    - expect: 'Wrong PIN.', no money moved
  3. Type env GREMLIN_PIN the same way and click 'Confirm transfer'.
    - expect: Dialog 'Confirm payment' with iframe 'Gremlin Secure': 'Approve this payment of 100,300 HUF', 'To Kiss Péter, HU72 9990 1017 1618 0339 8874 9892'
  4. Click 'Approve payment' in the iframe.
    - expect: URL /transfer/done, heading 'Transfer submitted'
    - expect: Reference matches /^GB-[A-Z0-9]{6}$/ (format only)
    - expect: Paid to Kiss Péter, IBAN HU72 9990 1017 1618 0339 8874 9892, Amount 100,000, Fee 300, Total 100,300 HUF
    - expect: New balance, Everyday Account 1,149,700 HUF

#### 3.11 Balance and transactions after confirmed transfer

**File:** `tests/transfer/balance-effect.spec.ts`

**Steps:**
  1. Confirm 100,000 HUF Everyday -> Kiss Péter, click 'Back to accounts', reload dashboard.
    - expect: Everyday 1,149,700 HUF (1,250,000 - 100,300); Savings 5,400,000 unchanged
    - expect: New first transaction row: today's date YYYY-MM-DD (not asserted exactly), 'Transfer to Kiss Péter', -100,300 HUF; previous 5 rows follow
  2. In a new context repeat from Savings with 1,000 HUF (fee 200).
    - expect: Savings 5,398,800 HUF; Everyday 1,250,000 unchanged
