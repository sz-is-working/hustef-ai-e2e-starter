// spec: specs/gremlin-bank.md
// seed: seed.spec.ts

import type { Page } from '@playwright/test';
import { test, expect, env } from './fixtures';
import type { AccountName } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import type { ReviewPage } from './pages/review-page';
import { KISS_PETER_IBAN, TransferPage } from './pages/transfer-page';

function formatHuf(value: number): string {
  return `${value.toLocaleString('en-US')} HUF`;
}

// Rule R3 of the plan: fee = min(6,000, max(200, round(0.3% of amount))).
function feeFor(amount: number): number {
  return Math.min(6000, Math.max(200, Math.round(0.003 * amount)));
}

test.describe('Domestic transfer', () => {
  let transfer: TransferPage;

  test.beforeEach(async ({ page }) => {
    await new LoginPage(page).signInToDashboard();
    transfer = new TransferPage(page);
    await transfer.goto();
  });

  test('confirms a transfer and debits amount plus fee', async ({ page, gremlinRelease }) => {
    // BUG: fee on release 3: expected 300 HUF (0.3% of 100,000 HUF, min 200, max 6,000), observed 3,000 HUF. Not healed, see heal-report.json.
    test.fail(gremlinRelease === 3, 'BUG: fee for 100,000 HUF is 3,000 HUF instead of 300 HUF on release 3');
    // 3. Fill Everyday -> Kiss Péter, check the IBAN, amount 100,000; Continue
    const review = await transfer.submitToKissPeter('Everyday Account', '100000');
    await expect(page).toHaveURL(/\/transfer\/review$/);
    await expect(review.heading).toBeVisible();
    await expect(review.amount).toHaveText('100,000 HUF');
    await expect(review.fee).toHaveText('300 HUF');
    await expect(review.total).toHaveText('100,300 HUF');

    // 4. Enter the PIN, confirm and approve the payment in the 'Payment approval' frame
    await review.enterPin(env('GREMLIN_PIN'));
    await review.confirm();
    await expect(review.approvalHeading('Approve this payment of 100,300 HUF')).toBeVisible();
    await expect(review.approvalText(`To Kiss Péter, ${KISS_PETER_IBAN}`)).toBeVisible();
    await review.approvePayment();

    await expect(page).toHaveURL(/\/transfer\/done$/);
    await expect(review.doneHeading).toBeVisible();
    await expect(review.reference).toHaveText(/^Reference: GB-[A-Z0-9]{6}$/);
    await expect(review.newBalanceLabel).toHaveText('New balance, Everyday Account');
    await expect(review.newBalance).toHaveText('1,149,700 HUF');

    // 8.1 Back to accounts: balance and first transaction
    const dashboard = await review.backToAccounts();
    await expect(dashboard.accountCard('Everyday Account').getByText('1,149,700 HUF')).toBeVisible();
    const newest = dashboard.transactionRows.first();
    await expect(dashboard.transactionDescription(newest)).toHaveText('Transfer to Kiss Péter');
    await expect(dashboard.transactionAmount(newest)).toHaveText('-100,300 HUF');
  });

  test('requires beneficiary, checked IBAN and amount', async ({ page }) => {
    // 1. Continue with every field empty
    await transfer.continue();
    await expect(page).toHaveURL(/\/transfer$/);
    await expect(transfer.beneficiaryRequiredMessage).toBeVisible();
    await expect(transfer.message('Check the IBAN first.')).toBeVisible();
    await expect(transfer.message('Enter an amount greater than 0.')).toBeVisible();

    // Name and valid IBAN without 'Check IBAN', amount 0
    await transfer.fillTransfer({ name: 'Kiss Péter', iban: KISS_PETER_IBAN, amount: '0' });
    await transfer.continue();
    await expect(page).toHaveURL(/\/transfer$/);
    await expect(transfer.beneficiaryRequiredMessage).toBeHidden();
    await expect(transfer.message('Check the IBAN first.')).toBeVisible();
    await expect(transfer.message('Enter an amount greater than 0.')).toBeVisible();
  });

  test('rejects an invalid IBAN', async () => {
    // 4. Check IBANs with a bad checksum and a non-Hungarian one
    for (const iban of ['HU73 9990 1017 1618 0339 8874 9892', 'DE89 3704 0044 0532 0130 00']) {
      await test.step(`IBAN ${iban}`, async () => {
        await transfer.iban.fill(iban);
        await transfer.checkIban();
        await expect(transfer.ibanStatus).toHaveText('Invalid IBAN');
      });
    }
  });

  test('accepts a total equal to the balance and rejects one HUF more', async ({ page, gremlinRelease }) => {
    // BUG: fee on release 3: expected 3,739 HUF fee so total 1,250,000 HUF is accepted (0.3% rule), observed transfer rejected on the form (fee evidently inflated, total exceeds balance). Not healed, see heal-report.json.
    test.fail(gremlinRelease === 3, 'BUG: amount 1,246,261 HUF (total 1,250,000 HUF) is rejected instead of reaching review on release 3');
    // Plan 3.4 step 1, rule R4: amount + fee must fit the Everyday balance of 1,250,000 HUF
    const review = await transfer.submitToKissPeter('Everyday Account', '1246261');
    await expect(page).toHaveURL(/\/transfer\/review$/);
    await expect(review.fee).toHaveText('3,739 HUF');
    await expect(review.total).toHaveText('1,250,000 HUF');

    // One HUF more: total 1,250,001 HUF
    const form = await review.changeDetails();
    await form.resubmitAmount('1246262');
    await expect(page).toHaveURL(/\/transfer$/);
    await expect(form.message('Insufficient funds.')).toBeVisible();
  });

  test('rejects amounts over the daily and the single-transfer limit', async ({ page }) => {
    // Plan 3.4 step 2, rules R1 and R8: from Savings, so the balance is never the reason
    await transfer.fillVerifiedKissPeter('Savings Account', '2000001');
    await transfer.continue();
    await expect(page).toHaveURL(/\/transfer$/);
    await expect(transfer.message('Daily limit of 2,000,000 HUF exceeded.')).toBeVisible();

    await transfer.resubmitAmount('10000001');
    await expect(page).toHaveURL(/\/transfer$/);
    await expect(transfer.message('The maximum single transfer is 10,000,000 HUF.')).toBeVisible();
    await expect(transfer.message('Daily limit of 2,000,000 HUF exceeded.')).toBeHidden();
  });

  // Plan 3.3: the plan's [amount, fee, total] rows, each cross-checked against rule R3.
  async function checkFees(page: Page, from: AccountName, rows: [number, number, number][]) {
    let review: ReviewPage | undefined;
    for (const [amount, fee, total] of rows) {
      await test.step(`${from}: ${amount} -> fee ${fee} -> total ${total}`, async () => {
        // Guards the test data: a wrong row here is a mistake in the plan table, not an app bug.
        expect(fee, `plan row ${amount}: fee ${fee} contradicts rule R3`).toBe(feeFor(amount));
        expect(total, `plan row ${amount}: total ${total} is not amount + fee`).toBe(amount + fee);

        review = review
          ? await (await review.changeDetails()).resubmitAmount(String(amount))
          : await transfer.submitToKissPeter(from, String(amount));
        await expect(page).toHaveURL(/\/transfer\/review$/);
        await expect(review.amount).toHaveText(formatHuf(amount));
        await expect(review.fee).toHaveText(formatHuf(fee));
        await expect(review.total).toHaveText(formatHuf(total));
      });
    }
  }

  test('charges the 200 HUF minimum fee up to 66,833 and 0.3% above', async ({ page, gremlinRelease }) => {
    // BUG: minimum fee on release 3: expected 200 HUF for 10,000 HUF (min 200), observed 300 HUF. Not healed, see heal-report.json.
    test.fail(gremlinRelease === 3, 'BUG: fee for 10,000 HUF is 300 HUF instead of 200 HUF on release 3');
    await checkFees(page, 'Everyday Account', [
      [10000, 200, 10200],
      [66499, 200, 66699],
      [66833, 200, 67033],
      [66834, 201, 67035],
      [67500, 203, 67703],
      [100000, 300, 100300],
    ]);
  });

  test('caps the fee at 6,000 HUF', async ({ page, gremlinRelease }) => {
    // BUG: fee cap on release 3: expected 5,999 HUF for 1,999,833 HUF (max 6,000), observed 59,995 HUF. Not healed, see heal-report.json.
    test.fail(gremlinRelease === 3, 'BUG: fee for 1,999,833 HUF is 59,995 HUF instead of 5,999 HUF on release 3');
    // These amounts do not fit the Everyday balance, so they go from Savings.
    await checkFees(page, 'Savings Account', [
      [1999833, 5999, 2005832],
      [1999834, 6000, 2005834],
      [2000000, 6000, 2006000],
    ]);
  });
});
