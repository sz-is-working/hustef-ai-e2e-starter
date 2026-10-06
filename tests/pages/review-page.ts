import type { FrameLocator, Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';
import { DashboardPage } from './dashboard-page';
import { TransferPage } from './transfer-page';

// Review page (/transfer/review), the payment approval dialog and the result page (/transfer/done).
export class ReviewPage {
  readonly heading: Locator;
  readonly changeDetailsLink: Locator;
  readonly confirmButton: Locator;
  // The 'Gremlin Secure' frame (title attribute) inside the 'Confirm payment' dialog (the dialog has no accessible name).
  readonly secureFrame: FrameLocator;
  readonly approvePaymentButton: Locator;
  readonly doneHeading: Locator;
  readonly reference: Locator;
  readonly backToAccountsLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { level: 1, name: 'Review transfer' });
    this.changeDetailsLink = page.getByRole('link', { name: 'Change details' });
    this.confirmButton = page.getByRole('button', { name: 'Confirm transfer' });
    this.secureFrame = page.getByRole('dialog').getByTitle('Gremlin Secure').contentFrame();
    this.approvePaymentButton = this.secureFrame.getByRole('button', { name: 'Approve payment' });
    this.doneHeading = page.getByRole('heading', { level: 1, name: 'Transfer submitted' });
    this.reference = page.getByText(/^Reference: /);
    this.backToAccountsLink = page.getByRole('link', { name: 'Back to accounts' });
  }

  // Review table cells (row header 'Amount', 'Fee', 'Total').
  private reviewCell(rowName: 'Amount' | 'Fee' | 'Total'): Locator {
    return this.page.getByRole('row', { name: new RegExp(`^${rowName}\\b`) }).getByRole('cell');
  }
  get amount() { return this.reviewCell('Amount'); }
  get fee() { return this.reviewCell('Fee'); }
  get total() { return this.reviewCell('Total'); }

  // Texts inside the 'Gremlin Secure' approval frame.
  approvalHeading(text: string): Locator {
    return this.secureFrame.getByRole('heading', { name: text });
  }

  approvalText(text: string): Locator {
    return this.secureFrame.getByText(text);
  }

  // The result page lists term/definition pairs; the new balance is the last pair.
  get newBalanceLabel(): Locator {
    return this.page.getByRole('term').last();
  }

  get newBalance(): Locator {
    return this.page.getByRole('definition').last();
  }

  async changeDetails(): Promise<TransferPage> {
    await this.changeDetailsLink.click();
    await expect(this.page).toHaveURL(/\/transfer\?edit=1$/);
    return new TransferPage(this.page);
  }

  // The PIN field is a closed shadow root without an accessible role (plan R7):
  // it is the control right before the 'Confirm transfer' button.
  async enterPin(pin: string) {
    await this.confirmButton.focus();
    await this.page.keyboard.press('Shift+Tab');
    await this.page.keyboard.type(pin);
  }

  async confirm() {
    await this.confirmButton.click();
  }

  async approvePayment() {
    await this.approvePaymentButton.click();
  }

  async backToAccounts(): Promise<DashboardPage> {
    await this.backToAccountsLink.click();
    return new DashboardPage(this.page);
  }
}
