# Gremlin Bank Test Plan

## Application Overview

Test plan for Gremlin Bank (fictional demo bank, https://gremlin.shiwa.io), explored and verified in the browser on Release 1 (footer shows "Release 1"; GREMLIN_RELEASE was empty) on 2026-10-06. Behaviour differs between releases, so re-verify before running on Release 2 or 3.

GENERAL ASSUMPTIONS
- Every scenario is independent and starts from a fresh bank state (state lives in a cookie; one browser context per test). Seed: signed in as GREMLIN_USER on /dashboard, unless a scenario says it starts signed out. A scenario never relies on another scenario having run; shared steps (fill the transfer form, enter the PIN, confirm a transfer, generate a TOTP code) are page-object actions or helpers in tests/.
- Credentials, PIN and secrets are never written here: use env values GREMLIN_USER, GREMLIN_PASSWORD, GREMLIN_PIN, GREMLIN_TOTP_USER, GREMLIN_TOTP_SECRET, GREMLIN_PUSH_USER. Texts that contain the user name are built from env (e.g. `Signed in as ${GREMLIN_USER}`).
- Fresh state (test data, the known starting state):
  - Everyday Account HU39 9992 0265 3141 5926 5358 9797, 1,250,000 HUF; Savings Account HU03 9992 0265 2718 2818 2845 9043, 5,400,000 HUF.
  - Saved payees: Kiss Péter HU72 9990 1017 1618 0339 8874 9892, Nagy Eszter HU71 9990 2025 1414 2135 6237 3099, Tóth Bence HU03 9990 3033 1732 0508 0756 8879.
  - Five seed transactions, newest first: Grocery store, Budapest -18,450 HUF; Salary, Gremlin Works Ltd. +685,000 HUF; Mobile phone bill -7,990 HUF; Card payment, bookshop -12,300 HUF; Transfer from Savings Account +50,000 HUF.
- Every expected amount after an action is computed from the fresh state with the rules below, not read from the page.
- Random values (Tip of the day, EUR/HUF rate, transfer reference GB-xxxxxx, the push sign-in number) are asserted by format only. Fixed marker codes such as "IBAN verified: GRM-..." are workshop markers, not business values.
- Dates the app computes from the current day (chart window, new transactions) are asserted relative to the day the test runs ("today", "today - 29 days"), never as hard-coded calendar dates.
- "Reaches the review page" means: click Continue, check the review table, do NOT confirm. To try the next amount, click 'Change details' or open /transfer again.
- Risk tags: [high] = money movement and the amounts that drive it (fees, limits, balances, review and confirmation) or access control (sign in, lockout, second factor, protected pages); [medium] = other data shown to the user, form validation without money movement; [low] = informational content.
- Known bugs have their own scenario marked with test.fail() (expected vs observed in a comment), so they never mask other checks.

BUSINESS RULES AND SOURCES
- R1 Limits: 10,000,000 HUF per transfer and 2,000,000 HUF per day. SOURCE: stated on /transfer ("Limits: up to 10,000,000 HUF per transfer and 2,000,000 HUF per day.") and the error messages "The maximum single transfer is 10,000,000 HUF." and "Daily limit of 2,000,000 HUF exceeded."
- R2 Amount must be a positive whole number of HUF, otherwise "Enter an amount greater than 0." Rejected: 0, -5, 10.5, 1000.00, 1e3, 1.000, abc. Spaces anywhere and leading zeros are ignored ("1 000" = 1,000, " 500 " = 500, "010000" = 10,000). Exception: a decimal comma is dropped ("10,5" = 105), see BUG-1.
- R3 Fee = 0.3% of the amount rounded half up to whole HUF, at least 200 HUF, at most 6,000 HUF: fee = min(6,000, max(200, round_half_up(0.003 x amount))). Total = amount + fee. SOURCE: business rule (Lab 2 checklist; examples 10,000 -> 200, 100,000 -> 300, 2,000,000 -> 6,000); every value in 3.3 was checked in the browser.
  - Minimum edge: 66,499 -> 200 (199.497, raised to the minimum); 66,833 -> 200 (200.499); 66,834 -> 201 (200.502) is the first fee above the minimum. Half up: 67,500 -> 203 (202.5).
  - Maximum edge: 1,999,833 -> 5,999 (5,999.499); 1,999,834 -> 6,000 (5,999.502). 0.3% never exceeds 6,000 for amounts up to the 2,000,000 daily limit, so the min(6,000, ...) cap cannot be observed with a larger amount: the daily limit rejects it first.
- R4 Funds check: the total (amount + fee) must be <= the available balance of the From account, otherwise "Insufficient funds." (1,246,261 + 3,739 = 1,250,000 reaches review, 1,246,262 is rejected.)
- R5 Daily limit: the sum of today's confirmed transfer amounts, fee excluded, over both accounts together, may not exceed 2,000,000 HUF.
- R6 IBAN must pass a 'Check IBAN' step (valid HU IBAN with correct checksum), otherwise Continue shows "Check the IBAN first." Input without spaces, in lower case or with leading/trailing spaces is accepted and reformatted to the spaced upper-case form. Filling a saved payee with 'Use' does not verify the IBAN. The status text is a role=status element: assert it with getByRole('status').
- R7 Confirmation needs the Transaction PIN (GREMLIN_PIN) and then "Approve payment" inside the "Gremlin Secure" iframe dialog. A wrong or missing PIN shows "Wrong PIN." The PIN field is a closed-shadow <gb-secure-pin>, not in the accessibility tree: focus 'Confirm transfer', press Shift+Tab, type. Implement it once as a page-object action (e.g. enterPin).
- R8 Validation order: per-transfer maximum (> 10,000,000) -> daily limit (> 2,000,000 minus today's confirmed amounts) -> insufficient funds.
- R9 Sign-in lockout: the 5th failed sign-in in the same browser session shows "Too many attempts. Wait 60 seconds." The lock belongs to the session (cookie): any username, including valid credentials, is refused in that session; a new browser context is not locked.
- R10 Beneficiary name: the input has maxlength 70; the review shows the name as entered (up to 70 characters), with trailing spaces trimmed and HTML shown as text.

KNOWN BUGS
- BUG-1 Amount "10,5" is accepted and becomes 105 HUF (fee 200, total 305) instead of being rejected like "10.5". Scenario 3.9.

## Test Scenarios

### 1. Sign in and sign out

**Seed:** `seed.spec.ts`

#### 1.1. [high] Sign in with valid user and sign out

**File:** `tests/auth/sign-in-out.spec.ts`

**Steps:**
  1. Start signed out (fresh context). Open /login.
    - expect: Heading 'Sign in to Gremlin Bank', fields Username and Password, button 'Sign in'
    - expect: Footer text matches /^Release [1-3]$/ (if GREMLIN_RELEASE is set, it is 'Release ${GREMLIN_RELEASE}')
  2. Fill Username with env GREMLIN_USER and Password with env GREMLIN_PASSWORD; click 'Sign in'.
    - expect: URL is /dashboard
    - expect: H1 'Accounts' visible
    - expect: Header shows `Signed in as ${GREMLIN_USER}`
  3. Click 'Sign out'.
    - expect: URL is /login
    - expect: Sign in form shown again, no 'Signed in as' text

#### 1.2. [high] Protected pages require a session

**File:** `tests/auth/protected-pages.spec.ts`

**Steps:**
  1. In a fresh context without signing in, open /dashboard, /transfer and /transfer/review in turn.
    - expect: Each ends on /login and no account name or balance is visible
  2. Sign in with GREMLIN_USER/GREMLIN_PASSWORD, click 'Sign out', then open /dashboard directly.
    - expect: Ends on /login; no account name or balance is visible

#### 1.3. [high] Sign in rejected for empty fields and wrong credentials

**File:** `tests/auth/sign-in-negative.spec.ts`

Data-driven: each case below is its own test in a fresh context with exactly one failed attempt, so the lockout (R9) can never trigger here.

**Steps:**
  1. Open /login and submit one of these cases, then check the result:
     a) both fields empty;
     b) Username = GREMLIN_USER, Password empty;
     c) Username = GREMLIN_USER, Password = a value that differs from GREMLIN_PASSWORD (e.g. GREMLIN_PASSWORD + 'x');
     d) Username = 'nosuchuser', Password = 'wrong-password'.
    - expect: Each case: stays on /login, alert 'Wrong username or password.', no 'Signed in as' text
    - expect: Case c) and d) show the identical message (no user enumeration)

#### 1.4. [high] Repeated failed sign-ins lock the session

**File:** `tests/auth/sign-in-lockout.spec.ts`

The lock belongs to the session (R9), so a fresh context isolates this test.

**Steps:**
  1. In a fresh context open /login and submit Username 'lockout-probe', Password 'wrong-password' 4 times.
    - expect: Each of the 4 attempts shows 'Wrong username or password.'
  2. Submit the same values a 5th time.
    - expect: Alert 'Too many attempts. Wait 60 seconds.', still on /login
  3. In the same context submit the valid GREMLIN_USER/GREMLIN_PASSWORD.
    - expect: Still on /login with 'Too many attempts. Wait 60 seconds.'; no 'Signed in as' text
  4. Open a new browser context and sign in with GREMLIN_USER/GREMLIN_PASSWORD.
    - expect: /dashboard with `Signed in as ${GREMLIN_USER}`

#### 1.5. [high] Sign in with a second factor (TOTP and push)

**File:** `tests/auth/second-factor.spec.ts`

Data-driven; each case is its own test in a fresh context. The TOTP code is generated in test code from GREMLIN_TOTP_SECRET (RFC 6238: SHA-1, 30 s step, 6 digits, base32 secret), never hard-coded.

**Steps:**
  1. Sign in as env GREMLIN_TOTP_USER with GREMLIN_PASSWORD.
    - expect: URL /mfa/totp, heading 'Two-step verification', text `Enter the 6-digit code from your authenticator app for ${GREMLIN_TOTP_USER}.`, textbox 'Authentication code', button 'Verify'
  2. Enter the generated code and click 'Verify'.
    - expect: /dashboard with `Signed in as ${GREMLIN_TOTP_USER}`
  3. (fresh context) Repeat step 1, enter 000000 and click 'Verify'.
    - expect: 'That code is not valid.', still on /mfa/totp, no 'Signed in as' text
  4. (fresh context) Sign in as env GREMLIN_PUSH_USER with GREMLIN_PASSWORD.
    - expect: URL /mfa/push, heading 'Approve sign-in on your phone', 'Your number' followed by a two-digit number (format only), status 'Waiting for approval...', link "Can't scan? Open this link on your phone:" pointing to /phone/approve/<token>
  5. Open that link in a second page of the same context ("the phone"); click the button with the number shown on the first page.
    - expect: Phone page: 'Approved. You can go back to your computer.'
    - expect: First page moves to /dashboard by itself with `Signed in as ${GREMLIN_PUSH_USER}`
  6. (fresh context) Repeat step 4, open the phone link and click a number different from the one shown.
    - expect: Phone page: 'Wrong number. Request rejected.'
    - expect: First page: 'The sign-in request was rejected. Sign in again.' with a 'Back to sign in' link; not signed in

### 2. Dashboard

**Seed:** `seed.spec.ts`

#### 2.1. [high] Accounts show names, IBANs and balances

**File:** `tests/dashboard/accounts.spec.ts`

**Steps:**
  1. From the seed state read the two account cards.
    - expect: Everyday Account, IBAN HU39 9992 0265 3141 5926 5358 9797, Balance 1,250,000 HUF
    - expect: Savings Account, IBAN HU03 9992 0265 2718 2818 2845 9043, Balance 5,400,000 HUF
  2. Click 'New transfer'.
    - expect: URL is /transfer

#### 2.2. [medium] Recent transactions list

**File:** `tests/dashboard/recent-transactions.spec.ts`

**Steps:**
  1. Read the 'Recent transactions' table (columns Date, Description, Amount).
    - expect: Exactly 5 rows in this order with these descriptions and amounts: Grocery store, Budapest -18,450 HUF; Salary, Gremlin Works Ltd. +685,000 HUF; Mobile phone bill -7,990 HUF; Card payment, bookshop -12,300 HUF; Transfer from Savings Account +50,000 HUF
    - expect: Every date is YYYY-MM-DD, not later than today, and the dates are in descending order (the exact dates are not asserted)

#### 2.3. [medium] Spending chart data table

**File:** `tests/dashboard/chart-data.spec.ts`

**Steps:**
  1. Click 'Show chart data' under 'Spending in the last 30 days'.
    - expect: The button now reads 'Hide chart data'
    - expect: A Date/Amount table with exactly 30 rows, one per day, consecutive dates in ascending order; the first row is today - 29 days and the last row is today (YYYY-MM-DD)
    - expect: Every amount matches /^\d{1,3}(,\d{3})* HUF$/ (whole, non-negative HUF); individual values are not asserted
  2. Click 'Hide chart data'.
    - expect: The table is hidden and the button reads 'Show chart data'

#### 2.4. [low] Random dashboard content is well formed

**File:** `tests/dashboard/random-content.spec.ts`

**Steps:**
  1. Read 'Tip of the day' and the 'Exchange rate' card.
    - expect: The tip text is not empty (its content is random, never asserted)
    - expect: The EUR/HUF value matches /^\d+\.\d{2}$/ (format only; no value, range or change between loads asserted)
    - expect: The note 'Indicative rate. Updated on every page load.' is visible

### 3. Domestic transfer

**Seed:** `seed.spec.ts`

#### 3.1. [medium] Required fields and IBAN check

**File:** `tests/transfer/required-fields-iban.spec.ts`

**Steps:**
  1. Open /transfer. Click 'Continue' with every field empty.
    - expect: From account defaults to Everyday Account and 'Available: 1,250,000 HUF' is shown
    - expect: Stays on /transfer with the messages 'Enter a beneficiary name.', 'Check the IBAN first.' and 'Enter an amount greater than 0.'
    - expect: No message for Reference (optional field)
  2. Beneficiary '   ' (spaces only), IBAN HU72 9990 1017 1618 0339 8874 9892 checked with 'Check IBAN', amount 1,000; click Continue.
    - expect: Stays on /transfer with 'Enter a beneficiary name.'
  3. Enter the Kiss Péter IBAN in each form and click 'Check IBAN': 'HU72 9990 1017 1618 0339 8874 9892'; 'HU72999010171618033988749892'; 'hu72 9990 1017 1618 0339 8874 9892'; '  HU72 9990 1017 1618 0339 8874 9892  '.
    - expect: Each: the status (getByRole('status')) starts with 'IBAN verified' (the marker code after it is not asserted) and the field reads 'HU72 9990 1017 1618 0339 8874 9892' (R6)
  4. Enter each of these and click 'Check IBAN': empty; 'abc'; HU73 9990 1017 1618 0339 8874 9892 (bad checksum); HU72 9990 1017 1618 0339 8874 989 (too short); HU72 9990 1017 1618 0339 8874 98921 (too long); DE89 3704 0044 0532 0130 00 (not HU).
    - expect: Each: the status reads 'Invalid IBAN'
  5. Enter a valid IBAN but do NOT click 'Check IBAN'; fill name 'Kiss Péter' and amount 1,000; click Continue.
    - expect: Stays on /transfer with 'Check the IBAN first.' (R6)
  6. For each saved payee click 'Use', fill amount 1,000 and click Continue without 'Check IBAN'.
    - expect: Beneficiary and IBAN hold the payee's data (Kiss Péter HU72 9990 1017 1618 0339 8874 9892; Nagy Eszter HU71 9990 2025 1414 2135 6237 3099; Tóth Bence HU03 9990 3033 1732 0508 0756 8879)
    - expect: Stays on /transfer with 'Check the IBAN first.' ('Use' does not verify the IBAN, R6)

#### 3.2. [high] Amount format and minimum amount

**File:** `tests/transfer/amount-validation.spec.ts`

**Steps:**
  1. Fill Kiss Péter with a checked IBAN from Everyday Account and submit each amount: 0, -5, 10.5, 1000.00, 1e3, 1.000, abc.
    - expect: Each stays on /transfer with 'Enter an amount greater than 0.' (R2)
  2. Submit amount 1.
    - expect: Reaches the review page with Amount 1 HUF, Fee 200 HUF, Total 201 HUF (smallest valid amount, R3 minimum)
  3. Submit '1 000', '010000' and ' 500 '.
    - expect: Review shows Amount 1,000 / Fee 200 / Total 1,200 HUF; Amount 10,000 / Fee 200 / Total 10,200 HUF; Amount 500 / Fee 200 / Total 700 HUF (R2)

#### 3.3. [high] Fee calculation hits the minimum and the maximum

**File:** `tests/transfer/fees.spec.ts`

Data-driven; each row is its own test in a fresh context, reaching the review page only (not confirmed). Expected values are computed from R3: fee = min(6,000, max(200, round_half_up(0.003 x amount))), total = amount + fee.

**Steps:**
  1. From Everyday Account to Kiss Péter, submit each amount and read Fee and Total on the review page.
    - expect: 1,000 -> fee 200 -> total 1,200
    - expect: 10,000 -> 200 -> 10,200
    - expect: 66,499 -> 200 -> 66,699 (0.3% = 199.497, raised to the 200 minimum)
    - expect: 66,833 -> 200 -> 67,033 (0.3% = 200.499, last amount with fee 200)
    - expect: 66,834 -> 201 -> 67,035 (0.3% = 200.502, first fee above the minimum)
    - expect: 67,500 -> 203 -> 67,703 (0.3% = 202.5, rounded half up)
    - expect: 70,000 -> 210 -> 70,210
    - expect: 99,999 -> 300 -> 100,299 (299.997)
    - expect: 100,000 -> 300 -> 100,300
    - expect: 250,000 -> 750 -> 250,750
    - expect: 1,000,000 -> 3,000 -> 1,003,000
    - expect: 1,246,200 -> 3,739 -> 1,249,939 (3,738.6)
  2. The amounts below do not fit the Everyday balance (R4), so submit them from Savings Account (5,400,000 HUF) to Kiss Péter.
    - expect: 1,900,000 -> 5,700 -> 1,905,700
    - expect: 1,999,833 -> 5,999 -> 2,005,832 (5,999.499, last fee below the maximum)
    - expect: 1,999,834 -> 6,000 -> 2,005,834 (5,999.502, maximum reached)
    - expect: 2,000,000 -> 6,000 -> 2,006,000 (maximum; also the daily limit, R1)

#### 3.4. [high] Insufficient funds and transfer limits

**File:** `tests/transfer/limits-and-balance.spec.ts`

Data-driven; each row is its own test in a fresh context, reaching the review page only (not confirmed).

**Steps:**
  1. From Everyday Account (1,250,000 HUF) to Kiss Péter submit each amount.
    - expect: 1,246,260 -> review, Fee 3,739, Total 1,249,999 HUF (just below the balance)
    - expect: 1,246,261 -> review, Fee 3,739, Total 1,250,000 HUF (exactly the balance, R4)
    - expect: 1,246,262 (total 1,250,001), 1,250,000 (total 1,253,750) and 2,000,000 (not above the daily limit, total 2,006,000) -> stays on /transfer with 'Insufficient funds.' (R4)
    - expect: 3,000,000 -> 'Daily limit of 2,000,000 HUF exceeded.' (also over the balance; the daily limit is checked first, R8)
    - expect: 10,000,001 -> 'The maximum single transfer is 10,000,000 HUF.' (also over the daily limit and the balance; checked first, R8)
  2. From Savings Account (5,400,000 HUF) to Kiss Péter submit each amount.
    - expect: 2,000,000 -> review, Fee 6,000, Total 2,006,000 HUF (exactly the daily limit, R1)
    - expect: 2,000,001 -> 'Daily limit of 2,000,000 HUF exceeded.' (R1)
    - expect: 10,000,000 -> 'Daily limit of 2,000,000 HUF exceeded.' (allowed by the single-transfer maximum, so the daily limit applies; R8)
    - expect: 10,000,001 -> 'The maximum single transfer is 10,000,000 HUF.' (R1, R8)

#### 3.5. [high] Daily limit counts confirmed transfers of the day

**File:** `tests/transfer/daily-limit.spec.ts`

**Steps:**
  1. In a fresh context: open /transfer, From Everyday Account, Kiss Péter, IBAN HU72 9990 1017 1618 0339 8874 9892 checked, amount 100,000, Continue, enter GREMLIN_PIN (page-object action), 'Confirm transfer', 'Approve payment'.
    - expect: /transfer/done shows 'New balance, Everyday Account' 1,149,700 HUF (1,250,000 - 100,300)
  2. Open /transfer, From Savings Account, Kiss Péter with a checked IBAN, amount 1,900,000, Continue. Do not confirm.
    - expect: Review page, Fee 5,700, Total 1,905,700 HUF (100,000 + 1,900,000 = 2,000,000, exactly the daily limit; fees do not count, R5)
  3. Open /transfer again, From Savings Account, amount 1,900,001, Continue.
    - expect: Stays on /transfer with 'Daily limit of 2,000,000 HUF exceeded.' (100,000 from Everyday + 1,900,001 > 2,000,000; both accounts count, R5)
  4. From Everyday Account (1,149,700 HUF), amount 1,145,900, Continue.
    - expect: Review page, Fee 3,438, Total 1,149,338 HUF (below the balance)
  5. Open /transfer again, From Everyday Account, amount 1,149,700, Continue.
    - expect: Stays on /transfer with 'Insufficient funds.' (total 1,153,149 > 1,149,700; daily total 1,249,700 is within the limit)

#### 3.6. [high] Review page shows the transfer and Change details keeps the data

**File:** `tests/transfer/review.spec.ts`

**Steps:**
  1. Fill: From Everyday Account, Beneficiary 'Kiss Péter', IBAN HU72 9990 1017 1618 0339 8874 9892 checked, amount 100,000, reference 'Rent'. Click Continue.
    - expect: URL /transfer/review, heading 'Review transfer'
    - expect: From Everyday Account; To Kiss Péter; IBAN HU72 9990 1017 1618 0339 8874 9892; Amount 100,000 HUF; Fee 300 HUF; Total 100,300 HUF
  2. Click 'Change details'.
    - expect: Back on the transfer form with Beneficiary 'Kiss Péter', the IBAN, amount 100000 and reference 'Rent' prefilled
    - expect: 'Available: 1,250,000 HUF' (nothing was debited by the review)
  3. Change the amount to 50,000 and click Continue.
    - expect: Review shows Amount 50,000 HUF, Fee 200 HUF, Total 50,200 HUF
  4. Click 'Change details', set Beneficiary to 'A <b>bold</b> name', Continue.
    - expect: The To row shows the literal text 'A <b>bold</b> name' (HTML is not interpreted, R10)
  5. Click 'Change details', set Beneficiary to a 70-character name without spaces (e.g. 'A' repeated 70 times), Continue.
    - expect: The Beneficiary input has maxlength 70 and the To row shows all 70 characters (R10)

#### 3.7. [high] Confirm a transfer with PIN and approval, wrong PIN rejected

**File:** `tests/transfer/confirm.spec.ts`

**Steps:**
  1. Fill From Everyday Account, Kiss Péter, IBAN HU72 9990 1017 1618 0339 8874 9892 checked, amount 100,000; click Continue. On the review page click 'Confirm transfer' without entering a PIN.
    - expect: Alert 'Wrong PIN.', still on /transfer/review, no payment dialog
  2. Enter a PIN that differs from GREMLIN_PIN and has the same length (page-object action enterPin, R7); click 'Confirm transfer'.
    - expect: Alert 'Wrong PIN.', still on /transfer/review, no payment dialog
  3. Enter GREMLIN_PIN with the same action; click 'Confirm transfer'.
    - expect: Dialog 'Confirm payment' with the 'Gremlin Secure' frame showing 'Approve this payment of 100,300 HUF' and 'To Kiss Péter, HU72 9990 1017 1618 0339 8874 9892'
  4. Click 'Approve payment' inside the frame.
    - expect: URL /transfer/done, heading 'Transfer submitted'
    - expect: Reference matches /^GB-[A-Z0-9]{6}$/ (format only)
    - expect: Paid to Kiss Péter, IBAN HU72 9990 1017 1618 0339 8874 9892, Amount 100,000 HUF, Fee 300 HUF, Total 100,300 HUF
    - expect: 'New balance, Everyday Account' 1,149,700 HUF (1,250,000 - 100,300)

#### 3.8. [high] Balances and transactions after a confirmed transfer

**File:** `tests/transfer/balance-effect.spec.ts`

Data-driven; each row is its own test in a fresh context. Confirm with the page-object action from 3.7, then click 'Back to accounts'.

**Steps:**
  1. Confirm a transfer of 100,000 HUF from Everyday Account to Kiss Péter (fee 300).
    - expect: Everyday Account 1,149,700 HUF (1,250,000 - 100,300); Savings Account 5,400,000 HUF
    - expect: Recent transactions has a new first row with today's date, 'Transfer to Kiss Péter' and -100,300 HUF (the total), followed by the five seed transactions
  2. Confirm a transfer of 1,000 HUF from Savings Account to Kiss Péter (fee 200).
    - expect: /transfer/done shows 'New balance, Savings Account' 5,398,800 HUF
    - expect: Savings Account 5,398,800 HUF (5,400,000 - 1,200); Everyday Account 1,250,000 HUF
    - expect: Recent transactions has a new first row with today's date, 'Transfer to Kiss Péter' and -1,200 HUF (the total)
  3. Reload the dashboard.
    - expect: The same balances and rows as after step 1 or step 2 (the state is kept)

#### 3.9. [high] Amount with a decimal comma is rejected (known bug BUG-1)

**File:** `tests/transfer/amount-decimal-comma.spec.ts`

Mark test.fail(): expected rejection (R2, whole HUF; '10.5' is rejected), observed 105 HUF.

**Steps:**
  1. From Everyday Account, Kiss Péter with a checked IBAN, amount '10,5', Continue.
    - expect: Stays on /transfer with 'Enter an amount greater than 0.' (same as '10.5')
    - expect: Observed: review page with Amount 105 HUF, Fee 200 HUF, Total 305 HUF
