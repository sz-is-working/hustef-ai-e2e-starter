import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';
import type { AccountName } from './dashboard-page';
import { ReviewPage } from './review-page';

export const KISS_PETER_IBAN = 'HU72 9990 1017 1618 0339 8874 9892';

// Transfer form (/transfer, also /transfer?edit=1 after 'Change details').
export class TransferPage {
  readonly heading: Locator;
  readonly fromAccount: Locator;
  readonly beneficiary: Locator;
  readonly iban: Locator;
  readonly checkIbanButton: Locator;
  readonly amount: Locator;
  readonly continueButton: Locator;
  readonly ibanStatus: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'New transfer' });
    this.fromAccount = page.getByRole('combobox', { name: 'From account' });
    this.beneficiary = page.getByRole('textbox', { name: 'Payee name' });
    this.iban = page.getByRole('textbox', { name: 'IBAN' });
    this.checkIbanButton = page.getByRole('button', { name: 'Check IBAN' });
    this.amount = page.getByRole('textbox', { name: 'Amount (HUF)' });
    this.continueButton = page.getByRole('button', { name: 'Review transfer' });
    this.ibanStatus = page.getByRole('status');
  }

  async goto() {
    await this.page.goto('/transfer');
    await expect(this.heading).toBeVisible();
  }

  // A validation or limit message shown on the form, e.g. 'Insufficient funds.'.
  message(text: string): Locator {
    return this.page.getByText(text);
  }

  // Shown when the payee name is empty.
  get beneficiaryRequiredMessage(): Locator {
    return this.page.getByText('Enter a payee name.');
  }

  async fillTransfer(data: { from?: AccountName; name: string; iban: string; amount: string }) {
    if (data.from) {
      await this.fromAccount.selectOption({ label: data.from });
    }
    await this.beneficiary.fill(data.name);
    await this.iban.fill(data.iban);
    await this.amount.fill(data.amount);
  }

  async checkIban() {
    await this.checkIbanButton.click();
  }

  async continue() {
    await this.continueButton.click();
  }

  // Fills Kiss Péter with a verified IBAN, without submitting.
  async fillVerifiedKissPeter(from: AccountName, amount: string) {
    await this.fillTransfer({ from, name: 'Kiss Péter', iban: KISS_PETER_IBAN, amount });
    await this.checkIban();
    await expect(this.ibanStatus).toContainText('IBAN verified');
  }

  // Fills Kiss Péter with a verified IBAN and submits; returns the review page.
  async submitToKissPeter(from: AccountName, amount: string): Promise<ReviewPage> {
    await this.fillVerifiedKissPeter(from, amount);
    await this.continue();
    return new ReviewPage(this.page);
  }

  // Changes only the amount (the rest of the form is kept) and submits again.
  async resubmitAmount(amount: string): Promise<ReviewPage> {
    await this.amount.fill(amount);
    await this.continue();
    return new ReviewPage(this.page);
  }
}
